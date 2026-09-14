import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { MyTadiranPlatform } from '../lib/platform.js';
import { requestFactoryReset } from '../lib/auth-storage.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tadiran-recovery-'));
const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
const phone = '+972500000000';
const jwt = `x.${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url')}.x`;
const tokens = { AccessToken: 'access', IdToken: jwt, RefreshToken: 'refresh' };
const response = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const instances = [];
function make(config = { phone }) {
  const dir = fs.mkdtempSync(path.join(tmp, 'case-'));
  const api = new EventEmitter();
  api.hap = { Service: {}, Characteristic: {} };
  api.user = { persistPath: () => dir };
  const logs = [];
  const log = Object.fromEntries(['info', 'warn', 'error', 'success'].map(key => [key, text => logs.push(text)]));
  const platform = new MyTadiranPlatform(log, config, api);
  instances.push({ platform, api });
  return { platform, api, logs, dir };
}
try {
  // Exercise actual Cognito classification AND disk persistence across restarts.
  const { platform, dir, logs } = make({ phone, otp: '123456' });
  platform.writeAuthState({ otpSession: 'stale' });
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls++;
    if (calls === 1) {
      assert.equal(body.Session, 'stale');
      return response({ __type: 'NotAuthorizedException', message: 'Invalid session for the user.' }, 400);
    }
    assert.equal(body.AuthFlow, 'CUSTOM_AUTH');
    return response({ Session: 'fresh-session' });
  };
  assert.equal(await platform.authenticate(), false);
  assert.equal(calls, 2);
  assert.equal(platform.readAuthState().otpSession, 'fresh-session');
  const restarted = new MyTadiranPlatform(platform.log, { phone, otp: '654321' }, platform.api);
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.Session, 'fresh-session');
    assert.equal(body.ChallengeResponses.ANSWER, '654321');
    return response({ AuthenticationResult: tokens });
  };
  assert.equal(await restarted.authenticate(), true);
  assert.equal(restarted.readAuthState().refreshToken, 'refresh');
  assert.equal(restarted.readAuthState().otpSession, undefined);
  assert.ok(logs.every(line => !line.includes(phone)));

  // A saved login ignores any old OTP and does not start a new SMS challenge.
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.AuthFlow, 'REFRESH_TOKEN_AUTH');
    return response({ AuthenticationResult: { AccessToken: 'access', IdToken: jwt } });
  };
  assert.equal(await restarted.authenticate(), true);

  // A genuinely rejected refresh token still falls back to SMS.
  calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (calls === 1) return response({ __type: 'NotAuthorizedException', message: 'Refresh Token has expired' }, 400);
    assert.equal(JSON.parse(options.body).AuthFlow, 'CUSTOM_AUTH');
    return response({ Session: 'replacement' });
  };
  assert.equal(await restarted.authenticate(), false);
  assert.equal(restarted.readAuthState().otpSession, 'replacement');
  assert.equal(restarted.client.refreshToken, null);

  // Wrong OTP is handled locally, without unbounded SMS attempts.
  globalThis.fetch = async () => response({ __type: 'CodeMismatchException', message: 'Wrong code' }, 400);
  assert.equal(await restarted.authenticate(), false);
  assert.equal(fs.existsSync(path.join(dir, 'my-tadiran-auth.json')), false);

  // Retry a transient saved-token startup, and recover without manual restart.
  const retry = make();
  retry.platform.writeAuthState({ refreshToken: 'saved' });
  let scheduled;
  globalThis.setTimeout = (callback, ms) => {
    scheduled = { callback, ms };
    return originalTimeout(() => {}, 60000);
  };
  globalThis.fetch = async () => response({ __type: 'TooManyRequestsException', message: 'Busy' }, 400);
  await retry.platform.start();
  assert.equal(scheduled.ms, 30000);
  assert.equal(retry.platform.readAuthState().refreshToken, 'saved');
  clearTimeout(retry.platform.retryTimer);
  await retry.platform.start();
  assert.equal(scheduled.ms, 60000);
  clearTimeout(retry.platform.retryTimer);
  retry.platform.retryTimer = null;
  globalThis.setTimeout = originalTimeout;
  globalThis.fetch = async url => url.includes('cognito')
    ? response({ AuthenticationResult: { AccessToken: 'access', IdToken: jwt } })
    : response([]);
  scheduled.callback();
  for (let i = 0; i < 20 && !retry.platform.pollTimer; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(retry.platform.pollTimer);
  assert.equal(retry.platform.retryDelay, 30);
  retry.api.emit('shutdown');
  assert.equal(retry.platform.pollTimer, null);

  // SMS-stage timeouts must not produce automatic SMS/OTP retries.
  const otp = make();
  globalThis.fetch = async () => { throw new DOMException('timed out', 'TimeoutError'); };
  await otp.platform.start();
  assert.equal(otp.platform.retryTimer, null);

  // Polling releases its lock after a network error, allowing the next poll.
  retry.platform.stopped = false;
  await retry.platform.refreshDevices();
  assert.equal(retry.platform.polling, false);
  globalThis.fetch = async () => response([]);
  await retry.platform.refreshDevices();
  assert.equal(retry.platform.polling, false);

  // Reset markers and filesystem errors are handled without escaping promises.
  requestFactoryReset(retry.dir);
  retry.platform.writeAuthState({ refreshToken: 'must-not-reappear' });
  assert.equal(fs.existsSync(retry.platform.authFile), false);
  await retry.platform.refreshDevices();
  assert.equal(retry.platform.client.refreshToken, null);
  retry.platform.factoryResetPending = () => { throw new Error('simulated filesystem error'); };
  await assert.doesNotReject(() => retry.platform.refreshDevices());
  assert.equal(retry.platform.polling, false);

  const empty = make({});
  assert.equal(empty.api.listenerCount('didFinishLaunching'), 0);
  assert.equal(empty.platform.pollTimer, null);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
  for (const { api, platform } of instances) {
    api.emit('shutdown');
    if (platform.retryTimer) clearTimeout(platform.retryTimer);
    if (platform.pollTimer) clearInterval(platform.pollTimer);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('authentication, startup retry, reset and polling recovery tests passed');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TadiranAuthError } from '../lib/api.js';
import { MyTadiranPlatform, normalizePollInterval } from '../lib/platform.js';

assert.equal(normalizePollInterval(undefined), 30);
assert.equal(normalizePollInterval(null), 30);
assert.equal(normalizePollInterval(''), 30);
assert.equal(normalizePollInterval('not-a-number'), 30);
assert.equal(normalizePollInterval(5), 15);
assert.equal(normalizePollInterval(30.6), 31);
assert.equal(normalizePollInterval(999), 300);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'my-tadiran-reliability-'));
const authFile = path.join(tmp, 'my-tadiran-auth.json');
const authState = {
  phone: '+972500000000',
  refreshToken: 'keep-this-token',
};

const log = {
  info: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
};
const api = {
  hap: { Service: {}, Characteristic: {} },
  user: { persistPath: () => tmp },
  on: () => {},
};

try {
  fs.writeFileSync(authFile, JSON.stringify(authState));
  const platform = new MyTadiranPlatform(log, { phone: authState.phone }, api);
  platform.client.refresh = async () => {
    throw new TadiranAuthError('TooManyRequestsException: retry later');
  };

  await assert.rejects(
    () => platform.authenticate(),
    error => error instanceof TadiranAuthError && /TooManyRequestsException/.test(error.message),
  );
  assert.equal(fs.existsSync(authFile), true, 'transient Cognito errors must not delete the saved login');
  assert.deepEqual(JSON.parse(fs.readFileSync(authFile, 'utf8')), authState);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('platform reliability tests passed');

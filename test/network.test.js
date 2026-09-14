import assert from 'node:assert/strict';
import { TadiranAPI } from '../lib/api.js';
import { DEFAULT_REQUEST_TIMEOUT } from '../lib/constants.js';

const originalFetch = globalThis.fetch;
const keepAlive = setInterval(() => {}, 1000);
const client = new TadiranAPI({}, { requestTimeoutMs: 15 });
client.tokenExpiry = () => 9999999999;
const abortPromise = signal => new Promise((_, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});
try {
  assert.equal(new TadiranAPI({}).requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT);
  assert.equal(new TadiranAPI({}, { requestTimeoutMs: 1.5 }).requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT);
  for (const bodyStalls of [false, true]) {
    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      if (!bodyStalls) return abortPromise(options.signal);
      return { ok: true, status: 200, text: () => abortPromise(options.signal) };
    };
    await assert.rejects(() => client.cognito('InitiateAuth', {}), { name: 'TimeoutError' });
    await assert.rejects(() => client.getDevices(), { name: 'TimeoutError' });
    await assert.rejects(() => client.updateDeviceShadow('device', { power: true }), { name: 'TimeoutError' });
  }
  let requests = 0;
  let refreshes = 0;
  client.refresh = async () => { refreshes++; };
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.ok(url.endsWith('/a%2Fb/shadow/update/'));
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers['x-manufacturer-name'], 'TUYA');
    assert.deepEqual(JSON.parse(options.body), [{ name: 'power', value: true }, { name: 'mode', value: 'COOL' }]);
    const status = requests === 1 ? 401 : 200;
    return { status, ok: status === 200, text: async () => '{}' };
  };
  await client.updateDeviceShadow('a/b', { power: true, mode: 'COOL' });
  assert.equal(requests, 2);
  assert.equal(refreshes, 1);
} finally {
  globalThis.fetch = originalFetch;
  clearInterval(keepAlive);
}
console.log('request/body timeout and authenticated command retry tests passed');

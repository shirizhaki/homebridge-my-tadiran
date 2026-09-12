import assert from 'node:assert/strict';
import { MyTadiranPlatform } from '../lib/platform.js';
import { TadiranInvalidSession } from '../lib/api.js';

const warnings = [];
const writes = [];
let requestedPhone = null;

const log = {
  info: () => {},
  warn: message => warnings.push(message),
  error: () => {},
  success: () => {},
};

const api = {
  hap: { Service: {}, Characteristic: {} },
  user: { persistPath: () => '/tmp/homebridge-my-tadiran-auth-test' },
  on: () => {},
};

const platform = new MyTadiranPlatform(log, {
  phone: '+972500000000',
  otp: '123456',
}, api);

platform.readAuthState = () => ({ otpSession: 'stale-session' });
platform.writeAuthState = data => writes.push(data);
platform.client.verifyOtp = async () => {
  throw new TadiranInvalidSession('NotAuthorizedException: Invalid session for the user.');
};
platform.client.initiateOtp = async phone => {
  requestedPhone = phone;
  return 'fresh-session';
};

const authenticated = await platform.authenticate();

assert.equal(authenticated, false);
assert.equal(requestedPhone, '+972500000000');
assert.deepEqual(writes.at(-1), { otpSession: 'fresh-session' });
assert.ok(warnings.some(line => line.includes('fresh SMS code was sent')));
assert.ok(warnings.every(line => !line.includes('+972500000000')));

console.log('auth invalid-session recovery test passed');

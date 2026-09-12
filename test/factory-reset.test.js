import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  authFilePath,
  factoryResetFilePath,
  requestFactoryReset,
} from '../lib/auth-storage.js';
import { MyTadiranPlatform } from '../lib/platform.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'my-tadiran-reset-'));
const warnings = [];
const log = {
  info: () => {},
  warn: message => warnings.push(message),
  error: () => {},
  success: () => {},
};
const api = {
  hap: { Service: {}, Characteristic: {} },
  user: { persistPath: () => tmp },
  on: () => {},
};

try {
  const authFile = authFilePath(tmp);
  fs.writeFileSync(authFile, JSON.stringify({
    phone: '+972500000000',
    refreshToken: 'secret-refresh-token',
  }));

  requestFactoryReset(tmp);
  assert.equal(fs.existsSync(factoryResetFilePath(tmp)), true, 'factory reset marker should be written');
  assert.equal(fs.existsSync(authFile), false, 'saved authentication should be removed immediately');

  // Simulate a still-running child bridge trying to restore the token after the
  // UI reset. The reset marker must remain authoritative until next startup.
  fs.writeFileSync(authFile, JSON.stringify({
    phone: '+972500000000',
    refreshToken: 'restored-by-old-process',
  }));

  const platform = new MyTadiranPlatform(log, {
    name: 'My Tadiran',
    phone: '+972',
  }, api);

  assert.equal(fs.existsSync(factoryResetFilePath(tmp)), false, 'startup should consume reset marker');
  assert.equal(fs.existsSync(authFile), false, 'startup should delete any auth recreated after reset');
  assert.equal(platform.client.refreshToken, null);
  assert.ok(warnings.some(line => line.includes('factory reset completed')));
  assert.ok(warnings.some(line => line.includes('No My Tadiran phone number configured')));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('factory reset persistence tests passed');

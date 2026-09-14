import path from 'node:path';
import fs from 'node:fs';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { requestFactoryReset, authFilePath, isFactoryResetPending } from '../lib/auth-storage.js';
import { normalizePhone } from '../lib/phone.js';

class MyTadiranUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/factory-reset', this.handleFactoryReset.bind(this));
    this.onRequest('/auth-status', this.handleAuthStatus.bind(this));
    this.ready();
  }

  async handleAuthStatus(payload = {}) {
    try {
      const persistPath = path.join(this.homebridgeStoragePath, 'persist');
      const phone = normalizePhone(payload.phone, payload.countryCode || '+972');
      if (!phone || isFactoryResetPending(persistPath)) return { hasSavedLogin: false };
      const auth = JSON.parse(fs.readFileSync(authFilePath(persistPath), 'utf8'));
      return { hasSavedLogin: auth.phone === phone && typeof auth.refreshToken === 'string' && auth.refreshToken.length > 0 && !auth.otpSession };
    } catch {
      // A missing, unreadable or incomplete file is not evidence of success.
      return { hasSavedLogin: false };
    }
  }

  async handleFactoryReset() {
    try {
      const persistPath = path.join(this.homebridgeStoragePath, 'persist');
      requestFactoryReset(persistPath);
      return { ok: true };
    } catch (error) {
      throw new RequestError('Could not reset My Tadiran authentication data.', {
        message: error?.message || String(error),
      });
    }
  }
}

(() => new MyTadiranUiServer())();

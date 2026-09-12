import path from 'node:path';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { requestFactoryReset } from '../lib/auth-storage.js';

class MyTadiranUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/factory-reset', this.handleFactoryReset.bind(this));
    this.ready();
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

'use strict';

const fs = require('fs');
const path = require('path');
const { TadiranAPI, TadiranAuthError, TadiranInvalidOTP } = require('./api');
const { TadiranAccessory } = require('./accessory');
const { PLUGIN_NAME, PLATFORM_NAME, DEFAULT_POLL_INTERVAL } = require('./constants');
const { normalizePhone, maskPhone } = require('./phone');

class MyTadiranPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.cachedAccessories = new Map();
    this.handlers = new Map();
    this.client = new TadiranAPI(log);
    this.pollTimer = null;
    this.polling = false;

    this.pollInterval = Math.max(15, Number(this.config.pollInterval || DEFAULT_POLL_INTERVAL));
    this.rawPhone = String(this.config.phone || '').trim();
    this.countryCode = String(this.config.countryCode || '+972').trim() || '+972';
    this.phone = normalizePhone(this.rawPhone, this.countryCode);
    this.otp = String(this.config.otp || '').trim();

    this.authFile = path.join(this.api.user.persistPath(), 'my-tadiran-auth.json');

    if (!this.rawPhone || this.rawPhone === '+972') {
      this.log.warn('No My Tadiran phone number configured yet. Open Homebridge UI → Plugins → My Tadiran → Settings and complete the phone number.');
      return;
    }

    if (!this.phone) {
      this.log.error('The configured My Tadiran phone number is not valid. You can enter an Israeli number as 0501234567, 501234567, or +972501234567.');
      return;
    }

    this.api.on('didFinishLaunching', () => this.start());
    this.api.on('shutdown', () => {
      if (this.pollTimer) clearInterval(this.pollTimer);
    });
  }

  configureAccessory(accessory) {
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  readAuthState() {
    try {
      if (!fs.existsSync(this.authFile)) return {};
      const parsed = JSON.parse(fs.readFileSync(this.authFile, 'utf8'));
      return parsed.phone === this.phone ? parsed : {};
    } catch (error) {
      this.log.warn(`Could not read saved My Tadiran authentication: ${error.message}`);
      return {};
    }
  }

  writeAuthState(data) {
    try {
      fs.mkdirSync(path.dirname(this.authFile), { recursive: true });
      fs.writeFileSync(this.authFile, JSON.stringify({ ...data, phone: this.phone }, null, 2), { mode: 0o600 });
    } catch (error) {
      this.log.error(`Could not save My Tadiran authentication: ${error.message}`);
    }
  }

  async authenticate() {
    const saved = this.readAuthState();

    if (saved.refreshToken) {
      this.client.refreshToken = saved.refreshToken;
      this.client.orgId = saved.orgId || null;
      try {
        await this.client.refresh();
        if (this.client.refreshToken !== saved.refreshToken || this.client.orgId !== saved.orgId) {
          this.writeAuthState({ refreshToken: this.client.refreshToken, orgId: this.client.orgId });
        }
        return true;
      } catch (error) {
        if (!(error instanceof TadiranAuthError)) throw error;
        this.log.warn(`Saved My Tadiran login is no longer valid: ${error.message}`);
        try { fs.unlinkSync(this.authFile); } catch {}
      }
    }

    if (saved.otpSession) {
      if (!this.otp) {
        this.log.warn('My Tadiran SMS was already sent. Enter the code in the plugin setting “One-time SMS code (OTP)” and save/restart Homebridge.');
        return false;
      }
      try {
        await this.client.verifyOtp(this.phone, saved.otpSession, this.otp);
        this.writeAuthState({ refreshToken: this.client.refreshToken, orgId: this.client.orgId });
        this.log.success('My Tadiran authentication completed. The refresh token was saved locally; the OTP field is no longer needed.');
        return true;
      } catch (error) {
        if (error instanceof TadiranInvalidOTP) {
          // Discard the expired Cognito challenge session so the next restart
          // can request a fresh SMS without asking the user to find/delete
          // Homebridge persistence files manually.
          try { fs.unlinkSync(this.authFile); } catch {}
          this.log.error('The My Tadiran SMS code is invalid or expired. Clear the OTP field and restart Homebridge to request a fresh SMS code.');
          return false;
        }
        throw error;
      }
    }

    const session = await this.client.initiateOtp(this.phone);
    this.writeAuthState({ otpSession: session });
    this.log.warn(`My Tadiran sent an SMS code to ${maskPhone(this.phone)}. Enter it in “One-time SMS code (OTP)” in the plugin settings and save/restart Homebridge.`);
    return false;
  }

  async start() {
    try {
      if (!(await this.authenticate())) return;
      await this.refreshDevices(true);
      this.pollTimer = setInterval(() => this.refreshDevices(false), this.pollInterval * 1000);
      this.pollTimer.unref?.();
    } catch (error) {
      this.log.error(`My Tadiran startup failed: ${error.stack || error.message}`);
    }
  }

  normalizeConfigurations(cfg = {}) {
    const boolFields = new Set(['power', 'online', 'light', 'turbo', 'mute', 'swing_ud', 'swing_lr']);
    const out = { ...cfg };
    for (const key of boolFields) {
      if (key in out) {
        const value = out[key];
        out[key] = typeof value === 'string' ? ['true', '1', 'yes'].includes(value.trim().toLowerCase()) : Boolean(value);
      }
    }
    return out;
  }

  async refreshDevices(initial = false) {
    if (this.polling) return;
    this.polling = true;
    try {
      const devices = await this.client.getDevices();
      const seen = new Set();

      for (const raw of devices) {
        const device = { ...raw, configurations: this.normalizeConfigurations(raw.configurations || {}) };
        const deviceId = String(device.device_id);
        const uuid = this.api.hap.uuid.generate(`my-tadiran:${deviceId}`);
        seen.add(uuid);

        let accessory = this.cachedAccessories.get(uuid);
        if (!accessory) {
          accessory = new this.api.platformAccessory(device.name || 'Tadiran AC', uuid);
          accessory.context.deviceId = deviceId;
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.cachedAccessories.set(uuid, accessory);
          this.log.info(`Added Tadiran AC: ${device.name || deviceId}`);
        }

        let handler = this.handlers.get(uuid);
        if (!handler) {
          handler = new TadiranAccessory(this, accessory, device);
          this.handlers.set(uuid, handler);
        } else {
          handler.updateFromCloud(device);
        }
      }

      if (initial) {
        const stale = [...this.cachedAccessories.entries()].filter(([uuid]) => !seen.has(uuid));
        for (const [uuid, accessory] of stale) {
          this.log.warn(`Removing cached Tadiran accessory no longer returned by the account: ${accessory.displayName}`);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.cachedAccessories.delete(uuid);
          this.handlers.delete(uuid);
        }
      }

      // Persist a rotated refresh token if Cognito ever returns one.
      const auth = this.readAuthState();
      if (this.client.refreshToken && this.client.refreshToken !== auth.refreshToken) {
        this.writeAuthState({ refreshToken: this.client.refreshToken, orgId: this.client.orgId });
      }
    } catch (error) {
      this.log.error(`My Tadiran refresh failed: ${error.message}`);
    } finally {
      this.polling = false;
    }
  }
}

module.exports = { MyTadiranPlatform };

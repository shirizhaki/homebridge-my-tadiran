import { TEMP_MIN, TEMP_MAX } from './constants.js';

const PENDING_MAX_DISAGREEMENTS = 3;
const BATCH_WINDOW_MS = 200;

export function normalizeTemp(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) > 60 ? n / 10 : n;
}

export class TadiranAccessory {
  constructor(platform, accessory, device) {
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.deviceId = String(device.device_id);
    this.displayName = device.name || accessory.displayName || 'Tadiran AC';
    this.pending = new Map(); // key -> { value, disagreements }
    this.batch = {};
    this.batchTimer = null;
    this.batchPromise = null;

    const { Service, Characteristic } = platform;
    this.Service = Service;
    this.Characteristic = Characteristic;

    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'Tadiran')
      .setCharacteristic(Characteristic.Model, device.description || device.model_id || 'My Tadiran AC')
      .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

    this.service = accessory.getService(Service.HeaterCooler)
      || accessory.addService(Service.HeaterCooler, device.name || 'Tadiran AC');

    // HomeKit has no native HeaterCooler target states for DRY or FAN-only.
    // They can optionally be exposed as separate switch services. Both are
    // disabled by default. Remove cached services when their option is off so
    // changing the setting in Homebridge UI takes effect after one restart.
    this.drySwitch = this.configureModeSwitch(
      'dry-mode',
      'Dry Mode',
      Boolean(platform.config.exposeDryMode),
      'DRY',
    );
    this.fanOnlySwitch = this.configureModeSwitch(
      'fan-only',
      'Fan Only',
      Boolean(platform.config.exposeFanOnly),
      'FAN',
    );
    this.fanSpeedService = this.configureFanSpeedService(
      Boolean(platform.config.exposeFanSpeedControl),
    );

    this.configureCharacteristics();
    this.updateFromCloud(device);
  }

  configureModeSwitch(subtype, displayName, enabled, mode) {
    const existing = this.accessory.services.find(
      service => service.UUID === this.Service.Switch.UUID && service.subtype === subtype,
    );

    if (!enabled) {
      if (existing) this.accessory.removeService(existing);
      return null;
    }

    const service = existing || this.accessory.addService(this.Service.Switch, displayName, subtype);
    // Make the default service name deterministic. Home users can still rename
    // the tile in the Home app without affecting the plugin configuration.
    service.displayName = displayName;
    service.setCharacteristic(this.Characteristic.Name, displayName);
    service.getCharacteristic(this.Characteristic.On)
      .onGet(() => Boolean(this.config.power) && String(this.config.mode || '').toUpperCase() === mode)
      .onSet(async value => {
        if (value) {
          await this.send({ power: true, mode });
        } else if (String(this.config.mode || '').toUpperCase() === mode) {
          await this.send({ power: false });
        }
      });

    return service;
  }

  configureFanSpeedService(enabled) {
    const FanService = this.Service.Fanv2;
    if (!FanService) {
      if (enabled) this.platform.log.warn(`${this.displayName}: HomeKit Fanv2 service is unavailable on this Homebridge/HAP version.`);
      return null;
    }

    const existing = this.accessory.services.find(
      service => service.UUID === FanService.UUID && service.subtype === 'fan-speed',
    );

    if (!enabled) {
      if (existing) this.accessory.removeService(existing);
      return null;
    }

    const displayName = `${this.displayName} Fan Speed`;
    const service = existing || this.accessory.addService(FanService, displayName, 'fan-speed');
    service.displayName = displayName;
    service.setCharacteristic(this.Characteristic.Name, displayName);

    service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => this.config.power ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE)
      .onSet(async value => this.send({ power: value === this.Characteristic.Active.ACTIVE }));

    service.getCharacteristic(this.Characteristic.RotationSpeed)
      .setProps({ minValue: 25, maxValue: 100, minStep: 25 })
      .onGet(() => this.fanPercent(this.config.wind_speed))
      .onSet(async value => this.setFanPercent(Number(value)));

    return service;
  }

  formatUpdates(updates) {
    return Object.entries(updates)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
  }

  get config() {
    const base = this.device.configurations || {};
    if (!this.pending.size) return base;
    const merged = { ...base };
    for (const [key, state] of this.pending.entries()) merged[key] = state.value;
    return merged;
  }

  configureCharacteristics() {
    const C = this.Characteristic;

    this.service.getCharacteristic(C.Active)
      .onGet(() => this.config.power ? C.Active.ACTIVE : C.Active.INACTIVE)
      .onSet(async value => this.send({ power: value === C.Active.ACTIVE }));

    this.service.getCharacteristic(C.CurrentTemperature)
      .setProps({ minValue: -50, maxValue: 100, minStep: 0.1 })
      .onGet(() => normalizeTemp(this.config.temp_current) ?? 20);

    this.service.getCharacteristic(C.CurrentHeaterCoolerState)
      .onGet(() => this.currentState());

    this.service.getCharacteristic(C.TargetHeaterCoolerState)
      .setProps({ validValues: [C.TargetHeaterCoolerState.AUTO, C.TargetHeaterCoolerState.HEAT, C.TargetHeaterCoolerState.COOL] })
      .onGet(() => this.targetState())
      .onSet(async value => {
        const mode = value === C.TargetHeaterCoolerState.HEAT ? 'HEAT'
          : value === C.TargetHeaterCoolerState.COOL ? 'COOL' : 'AUTO';
        await this.send({ power: true, mode });
      });

    this.service.getCharacteristic(C.CoolingThresholdTemperature)
      .setProps({ minValue: TEMP_MIN, maxValue: TEMP_MAX, minStep: 1 })
      .onGet(() => normalizeTemp(this.config.temp_set) ?? 24)
      .onSet(async value => this.setTemperature(value));

    this.service.getCharacteristic(C.HeatingThresholdTemperature)
      .setProps({ minValue: TEMP_MIN, maxValue: TEMP_MAX, minStep: 1 })
      .onGet(() => normalizeTemp(this.config.temp_set) ?? 24)
      .onSet(async value => this.setTemperature(value));

    this.service.getCharacteristic(C.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 25 })
      .onGet(() => this.fanPercent(this.config.wind_speed))
      .onSet(async value => this.setFanPercent(Number(value)));
  }

  currentState() {
    const C = this.Characteristic.CurrentHeaterCoolerState;
    if (!this.config.power) return C.INACTIVE;
    const mode = String(this.config.mode || '').toUpperCase();
    if (mode === 'HEAT') return C.HEATING;
    if (mode === 'COOL') return C.COOLING;
    return C.IDLE;
  }

  targetState() {
    const C = this.Characteristic.TargetHeaterCoolerState;
    const mode = String(this.config.mode || '').toUpperCase();
    if (mode === 'HEAT') return C.HEAT;
    if (mode === 'COOL') return C.COOL;
    return C.AUTO;
  }

  fanPercent(wind) {
    switch (String(wind || '').toUpperCase()) {
      case 'LOW': return 25;
      case 'MEDIUM': return 50;
      case 'HIGH': return 100;
      case 'AUTO':
      default: return 75;
    }
  }

  async setFanPercent(value) {
    let wind = 'AUTO';
    if (value <= 25) wind = 'LOW';
    else if (value <= 50) wind = 'MEDIUM';
    else if (value >= 90) wind = 'HIGH';
    await this.send({ wind_speed: wind });
  }

  async setTemperature(value) {
    if (String(this.config.mode || '').toUpperCase() === 'AUTO') {
      throw new Error('My Tadiran does not accept target-temperature changes in AUTO mode');
    }
    const temp = Math.max(TEMP_MIN, Math.min(TEMP_MAX, Math.round(Number(value))));
    await this.send({ temp_set: temp });
  }

  async send(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.pending.set(key, { value, disagreements: 0 });
      this.batch[key] = value;
    }
    this.pushState();

    if (!this.batchTimer) {
      this.batchPromise = new Promise((resolve, reject) => {
        this.batchTimer = setTimeout(async () => {
          const payload = this.batch;
          this.batch = {};
          // Mark the batch as detached before the network call. A new HomeKit
          // change arriving while this PUT is in flight gets its own batch
          // instead of being stranded in the old buffer.
          this.batchTimer = null;
          this.batchPromise = null;
          try {
            this.platform.debug(`${this.displayName}: sending command (${this.formatUpdates(payload)})`);
            await this.platform.client.updateDeviceShadow(this.deviceId, payload);
            this.platform.debug(`${this.displayName}: cloud accepted command (${this.formatUpdates(payload)})`);
            resolve();
          } catch (error) {
            for (const key of Object.keys(payload)) this.pending.delete(key);
            this.pushState();
            this.platform.log.error(`${this.displayName}: command failed (${this.formatUpdates(payload)}): ${error.message}`);
            reject(error);
          }
        }, BATCH_WINDOW_MS);
      });
    }
    const promise = this.batchPromise;
    return promise;
  }

  updateFromCloud(device) {
    this.device = device;
    const base = device.configurations || {};

    for (const [key, pending] of [...this.pending.entries()]) {
      if (base[key] === pending.value) {
        this.platform.debug(`${this.displayName}: cloud confirmed ${key}=${String(pending.value)}`);
        this.pending.delete(key);
      } else {
        pending.disagreements += 1;
        if (pending.disagreements >= PENDING_MAX_DISAGREEMENTS) {
          this.platform.debug(
            `${this.displayName}: cloud did not confirm ${key}=${String(pending.value)} after ${PENDING_MAX_DISAGREEMENTS} polls; using reported value ${String(base[key])}`,
          );
          this.pending.delete(key);
        } else {
          this.pending.set(key, pending);
        }
      }
    }

    this.pushState();
  }

  pushState() {
    const C = this.Characteristic;
    const cfg = this.config;
    const current = normalizeTemp(cfg.temp_current);
    const target = normalizeTemp(cfg.temp_set);

    this.service.updateCharacteristic(C.Active, cfg.power ? C.Active.ACTIVE : C.Active.INACTIVE);
    if (current !== null) this.service.updateCharacteristic(C.CurrentTemperature, current);
    this.service.updateCharacteristic(C.CurrentHeaterCoolerState, this.currentState());
    this.service.updateCharacteristic(C.TargetHeaterCoolerState, this.targetState());
    if (target !== null) {
      this.service.updateCharacteristic(C.CoolingThresholdTemperature, target);
      this.service.updateCharacteristic(C.HeatingThresholdTemperature, target);
    }
    this.service.updateCharacteristic(C.RotationSpeed, this.fanPercent(cfg.wind_speed));
    if (this.fanSpeedService) {
      this.fanSpeedService.updateCharacteristic(C.Active, cfg.power ? C.Active.ACTIVE : C.Active.INACTIVE);
      this.fanSpeedService.updateCharacteristic(C.RotationSpeed, this.fanPercent(cfg.wind_speed));
    }
    if (this.drySwitch) {
      this.drySwitch.updateCharacteristic(
        C.On,
        Boolean(cfg.power) && String(cfg.mode || '').toUpperCase() === 'DRY',
      );
    }
    if (this.fanOnlySwitch) {
      this.fanOnlySwitch.updateCharacteristic(
        C.On,
        Boolean(cfg.power) && String(cfg.mode || '').toUpperCase() === 'FAN',
      );
    }
  }
}


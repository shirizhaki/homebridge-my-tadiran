import assert from 'node:assert/strict';
import { TadiranAccessory } from '../lib/accessory.js';

class MockCharacteristic {
  constructor() {
    this.value = undefined;
    this.getter = null;
    this.setter = null;
    this.props = {};
  }
  setProps(props) { this.props = props; return this; }
  onGet(fn) { this.getter = fn; return this; }
  onSet(fn) { this.setter = fn; return this; }
}

class MockService {
  constructor(type, displayName, subtype) {
    this.UUID = type.UUID;
    this.displayName = displayName;
    this.subtype = subtype;
    this.characteristics = new Map();
  }
  getCharacteristic(key) {
    if (!this.characteristics.has(key)) this.characteristics.set(key, new MockCharacteristic());
    return this.characteristics.get(key);
  }
  setCharacteristic(key, value) {
    this.getCharacteristic(key).value = value;
    return this;
  }
  updateCharacteristic(key, value) {
    this.getCharacteristic(key).value = value;
    return this;
  }
}

function serviceType(uuid) {
  class Type {}
  Type.UUID = uuid;
  return Type;
}

const Service = {
  AccessoryInformation: serviceType('accessory-info'),
  HeaterCooler: serviceType('heater-cooler'),
  Switch: serviceType('switch'),
  Fanv2: serviceType('fan-v2'),
};

const Active = { ACTIVE: 1, INACTIVE: 0 };
const CurrentHeaterCoolerState = { INACTIVE: 0, IDLE: 1, HEATING: 2, COOLING: 3 };
const TargetHeaterCoolerState = { AUTO: 0, HEAT: 1, COOL: 2 };
const Characteristic = {
  Manufacturer: Symbol('Manufacturer'),
  Model: Symbol('Model'),
  SerialNumber: Symbol('SerialNumber'),
  Name: Symbol('Name'),
  On: Symbol('On'),
  Active,
  CurrentTemperature: Symbol('CurrentTemperature'),
  CurrentHeaterCoolerState,
  TargetHeaterCoolerState,
  CoolingThresholdTemperature: Symbol('CoolingThresholdTemperature'),
  HeatingThresholdTemperature: Symbol('HeatingThresholdTemperature'),
  RotationSpeed: Symbol('RotationSpeed'),
};

class MockAccessory {
  constructor(name) {
    this.displayName = name;
    this.services = [new MockService(Service.AccessoryInformation, name)];
  }
  getService(type) {
    return this.services.find(service => service.UUID === type.UUID) || null;
  }
  addService(type, displayName, subtype) {
    const service = new MockService(type, displayName, subtype);
    this.services.push(service);
    return service;
  }
  removeService(service) {
    this.services = this.services.filter(candidate => candidate !== service);
  }
}

const infoLogs = [];
const errors = [];
const calls = [];
const platform = {
  Service,
  Characteristic,
  config: { exposeFanSpeedControl: true, debugLogs: true },
  log: {
    info: message => infoLogs.push(message),
    warn: () => {},
    error: message => errors.push(message),
  },
  debug(message) {
    if (this.config.debugLogs) this.log.info(`[debug] ${message}`);
  },
  client: {
    async updateDeviceShadow(deviceId, payload) {
      calls.push({ deviceId, payload });
    },
  },
};

const accessory = new MockAccessory('Kitchen');
const device = {
  device_id: 'device-test',
  name: 'Kitchen',
  configurations: {
    power: true,
    mode: 'COOL',
    temp_current: 24,
    temp_set: 23,
    wind_speed: 'AUTO',
  },
};

const handler = new TadiranAccessory(platform, accessory, device);
assert.ok(handler.fanSpeedService, 'Fan Speed service should be created when enabled');
assert.equal(handler.fanSpeedService.subtype, 'fan-speed');
assert.equal(handler.fanSpeedService.getCharacteristic(Characteristic.RotationSpeed).value, 75);

await handler.setFanPercent(100);
assert.deepEqual(calls.at(-1), { deviceId: 'device-test', payload: { wind_speed: 'HIGH' } });
assert.ok(infoLogs.some(line => line.includes('sending command (wind_speed=HIGH)')));
assert.ok(infoLogs.some(line => line.includes('cloud accepted command (wind_speed=HIGH)')));

handler.updateFromCloud({
  ...device,
  configurations: { ...device.configurations, wind_speed: 'HIGH' },
});
assert.ok(infoLogs.some(line => line.includes('cloud confirmed wind_speed=HIGH')));
assert.equal(handler.fanSpeedService.getCharacteristic(Characteristic.RotationSpeed).value, 100);

handler.configureFanSpeedService(false);
assert.equal(accessory.services.some(service => service.subtype === 'fan-speed'), false);
assert.deepEqual(errors, []);

console.log('accessory optional fan/debug tests passed');

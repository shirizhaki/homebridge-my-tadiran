'use strict';

const { MyTadiranPlatform } = require('./lib/platform');

const PLUGIN_NAME = 'homebridge-my-tadiran';
const PLATFORM_NAME = 'MyTadiran';

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, MyTadiranPlatform);
};

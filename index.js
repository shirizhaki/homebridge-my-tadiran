import { MyTadiranPlatform } from './lib/platform.js';

const PLUGIN_NAME = 'homebridge-my-tadiran';
const PLATFORM_NAME = 'MyTadiran';

export default (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, MyTadiranPlatform);
};

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fork } from 'node:child_process';
import { once } from 'node:events';

const html = fs.readFileSync(new URL('../homebridge-ui/public/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../homebridge-ui/public/settings.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../homebridge-ui/public/settings.css', import.meta.url), 'utf8');
const schema = JSON.parse(fs.readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8'));
assert.equal(schema.customUi, true);
assert.equal(schema.pluginType, 'platform');
assert.equal(schema.pluginAlias, 'MyTadiran');
assert.match(html, /src="settings\.js\?v=0\.1\.7-ui3"/);
assert.match(html, /href="settings\.css\?v=0\.1\.7-ui3"/);
assert.equal((html.match(/role="switch"/g) || []).length, 4);
assert.ok(html.indexOf('id="factory-reset"') > html.indexOf('id="setup-guide"') && html.indexOf('id="factory-reset"') < html.indexOf('id="controls-heading"'), 'reset belongs at the end of the account section');
assert.doesNotMatch(html, /CLIMATE, CONNECTED|Make it yours|Your air conditioning|id="name"/);
assert.match(html, /Built by Shir Izhaki, based on the API research of/);
assert.doesNotMatch(html, /No analytics or tracking|Use the phone number from the My Tadiran app|Additional controls for your Apple Home accessories|Cloud refresh and logging|class="td-step"/);
assert.doesNotMatch(script, /showSchemaForm\(/);
assert.match(css, /data-theme="dark"/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /focus-visible/);
assert.doesNotMatch(html + css, /(?:src|href)="https?:\/\/(?!github.com)|@import|url\(https?:/);

const clone = value => JSON.parse(JSON.stringify(value));
const bridge = { username: 'AA:BB:CC:DD:EE:FF', port: 12345 };
const initial = [{ platform: 'MyTadiran', name: 'Kitchen', phone: '+972500000000', otp: '001234', pollInterval: 30,
  exposeDryMode: true, exposeFanOnly: false, exposeFanSpeedControl: true, debugLogs: true,
  _bridge: bridge, _autostart: false, futureOption: { keep: true } }, { platform: 'MyTadiran', name: 'Other block' }];

async function frontend(options = {}) {
  const elements = {};
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    assert.ok(!elements[tag[1]], `duplicate id ${tag[1]}`);
    let value = '';
    elements[tag[1]] = {
      get value() { return value; }, set value(next) { value = String(next); },
      checked: false, hidden: /\bhidden\b/.test(tag[0]), disabled: /\bdisabled\b/.test(tag[0]),
      dataset: {}, attributes: {}, events: {}, textContent: '',
      setAttribute(key, next) { this.attributes[key] = next; },
      addEventListener(event, fn) { this.events[event] = fn; },
    };
  }
  for (const key of Object.keys(schema.schema.properties)) assert.ok(elements[key], `missing setting ${key}`);
  const calls = [];
  const events = {};
  let config = clone(options.config ?? initial);
  let saveEnabled = false;
  const homebridge = {
    plugin: { installedVersion: '0.1.7' },
    addEventListener: (event, fn) => { events[event] = fn; },
    hideSchemaForm: () => calls.push('hide-form'),
    disableSaveButton: () => { saveEnabled = false; },
    enableSaveButton: () => { saveEnabled = true; },
    userCurrentLightingMode: async () => {
      if (options.failTheme) throw new Error('theme unavailable');
      return options.theme ?? 'light';
    },
    showSpinner: () => calls.push('spinner'),
    hideSpinner: () => calls.push('hide-spinner'),
    request: async (endpoint, payload) => {
      if (endpoint === '/auth-status') {
        calls.push('auth-status');
        assert.equal(payload.phone, config[0]?.phone);
        if (options.failStatus) throw new Error('status unavailable');
        return { hasSavedLogin: options.savedLogin === true };
      }
      assert.equal(endpoint, '/factory-reset');
      calls.push('request');
      if (options.failRequest) throw new Error('simulated request failure');
    },
    getPluginConfig: async () => {
      calls.push('get');
      if (options.failLoad) throw new Error('simulated load failure');
      return clone(config);
    },
    updatePluginConfig: async next => {
      calls.push('update');
      assert.equal(saveEnabled, false, 'Save must be disabled while updating');
      if (options.updateHook) await options.updateHook();
      if (options.failUpdate) throw new Error('simulated update failure');
      config = clone(next);
    },
    savePluginConfig: async () => {
      calls.push('save');
      if (options.failSave) throw new Error('simulated save failure');
    },
    closeSettings: () => calls.push('close'),
    toast: { success: () => calls.push('success'), error: () => calls.push('error') },
  };
  vm.runInNewContext(script, {
    homebridge, document: { getElementById: id => { assert.ok(elements[id], `unknown id ${id}`); return elements[id]; } },
    window: { confirm: () => options.confirm !== false, matchMedia: () => ({ matches: Boolean(options.osDark) }) },
  });
  await events.ready();
  return { elements, calls, options, get config() { return config; }, get saveEnabled() { return saveEnabled; },
    async edit(key, value) {
      const input = elements[key];
      if (typeof value === 'boolean') { input.checked = value; return input.events.change(); }
      input.value = value;
      return input.events.input();
    },
    reset: () => elements['factory-reset'].events.click(),
  };
}

// Without evidence of a completed login, preserve pending codes and settings.
const ui = await frontend();
assert.deepEqual(ui.config, initial);
assert.deepEqual(ui.calls, ['hide-form', 'get', 'auth-status']);
assert.equal(ui.elements.otp.value, '001234');
assert.equal(ui.elements.exposeDryMode.checked, true);
assert.equal(ui.elements.exposeFanOnly.checked, false);
assert.equal(ui.elements['plugin-version'].textContent, 'v0.1.7');
assert.equal(ui.saveEnabled, true);
for (const [key, value] of Object.entries({ exposeDryMode: false, exposeFanOnly: true, exposeFanSpeedControl: false, debugLogs: false,
  pollInterval: '45', phone: '0500000000', otp: '' })) {
  await ui.edit(key, value);
  assert.equal(ui.config[0][key], key === 'pollInterval' ? 45 : value);
  assert.deepEqual(ui.config[0]._bridge, bridge);
  assert.deepEqual(ui.config[0].futureOption, { keep: true });
  assert.equal(ui.config[0]._autostart, false);
  assert.equal(ui.config[0].name, 'Kitchen', 'existing names are preserved but not editable');
  assert.deepEqual(ui.config[1], initial[1]);
  assert.equal(ui.saveEnabled, true);
}
assert.ok(!ui.calls.includes('save'), 'normal edits only stage changes for the Homebridge Save button');
assert.ok(!ui.calls.includes('request'), 'normal edits must not touch auth');
for (const value of ['', '14', '301', '30.5', 'bad']) {
  const previous = clone(ui.config);
  await ui.edit('pollInterval', value);
  assert.equal(ui.saveEnabled, false);
  assert.equal(ui.elements['poll-error'].hidden, false);
  assert.deepEqual(ui.config, previous);
}
await ui.edit('pollInterval', '300');
assert.equal(ui.saveEnabled, true);
await ui.edit('phone', '   ');
assert.equal(ui.saveEnabled, false);
await ui.edit('phone', '0500000000');
assert.equal(ui.saveEnabled, true);

const minimal = await frontend({ config: [{ platform: 'MyTadiran', phone: '0500000000', _bridge: bridge }] });
await minimal.edit('debugLogs', true);
assert.deepEqual(minimal.config[0], { platform: 'MyTadiran', phone: '0500000000', _bridge: bridge, debugLogs: true });
const fresh = await frontend({ config: [] });
assert.equal(fresh.config[0].phone, '+972');
assert.equal(fresh.config[0].platform, 'MyTadiran');
assert.equal(fresh.config[0].exposeDryMode, false);
assert.equal(fresh.elements['setup-guide'].open, true);
assert.ok(!fresh.calls.includes('save'));
assert.equal(fresh.config[0].name, 'My Tadiran');

// Migrate a stale code from older releases, but never clear a code while the
// login is pending, belongs to a different phone, or its state is unknown.
const connected = await frontend({ savedLogin: true });
const expectedClean = clone(initial);
delete expectedClean[0].otp;
assert.deepEqual(connected.config, expectedClean);
assert.equal(connected.elements.otp.value, '');
assert.equal(connected.calls.filter(call => call === 'save').length, 1);
assert.ok(!connected.calls.includes('request'));
const reopened = await frontend({ savedLogin: true, config: connected.config });
assert.ok(!reopened.calls.includes('update'));
assert.ok(!reopened.calls.includes('save'), 'cleanup must not repeatedly save');
const statusFailed = await frontend({ failStatus: true });
assert.deepEqual(statusFailed.config, initial);
assert.equal(statusFailed.elements.otp.value, '001234');
for (const failure of [{ failUpdate: true }, { failSave: true }]) {
  const cleanupFailed = await frontend({ savedLogin: true, ...failure });
  assert.equal(cleanupFailed.saveEnabled, false);
  assert.equal(cleanupFailed.elements['settings-fields'].disabled, true);
  assert.equal(cleanupFailed.elements['load-error'].hidden, false);
  assert.ok(!cleanupFailed.calls.includes('request'));
}

for (const options of [{ theme: 'dark' }, { failTheme: true, osDark: true }]) {
  const dark = await frontend(options);
  assert.equal(dark.elements['tadiran-settings'].dataset.theme, 'dark');
  assert.equal(dark.elements['settings-fields'].disabled, false);
}
const unavailable = await frontend({ failLoad: true });
assert.equal(unavailable.saveEnabled, false);
assert.equal(unavailable.elements['load-error'].hidden, false);
assert.equal(unavailable.elements['factory-reset'].disabled, true);
await unavailable.reset();
assert.ok(!unavailable.calls.includes('request'));

const failed = await frontend({ failUpdate: true });
await failed.edit('pollInterval', '90');
assert.equal(failed.saveEnabled, false);
assert.equal(failed.elements['retry-update'].hidden, false);
failed.options.failUpdate = false;
await failed.elements['retry-update'].events.click();
assert.equal(failed.saveEnabled, true);
assert.equal(failed.config[0].pollInterval, 90);

// Out-of-order input and a late update acknowledgment must not enable Save
// prematurely or win over a newer value (including a newer invalid input).
const race = await frontend();
let release;
race.options.updateHook = () => new Promise(resolve => { release = resolve; });
const first = race.edit('pollInterval', '60');
await Promise.resolve();
const second = race.edit('pollInterval', '90');
assert.equal(race.saveEnabled, false);
race.options.updateHook = undefined;
release();
await Promise.all([first, second]);
assert.equal(race.config[0].pollInterval, 90);
assert.equal(race.saveEnabled, true);
race.options.updateHook = () => new Promise(resolve => { release = resolve; });
const pending = race.edit('pollInterval', '60');
await Promise.resolve();
const invalid = race.edit('pollInterval', '');
release();
await Promise.all([pending, invalid]);
assert.equal(race.saveEnabled, false);
assert.equal(race.elements['poll-error'].hidden, false);

const cancelled = await frontend({ confirm: false });
await cancelled.reset();
assert.deepEqual(cancelled.calls, ['hide-form', 'get', 'auth-status']);
for (const options of [{}, { failRequest: true }, { failSave: true }, { failUpdate: true }]) {
  const reset = await frontend(options);
  await reset.reset();
  assert.equal(reset.calls.at(-1), 'hide-spinner');
  if (Object.keys(options).length) {
    assert.ok(reset.calls.includes('error'));
    assert.ok(!reset.calls.includes('close'));
    assert.equal(reset.elements['factory-reset'].disabled, false);
    assert.equal(reset.saveEnabled, false);
    if (!options.failRequest) {
      assert.equal(reset.elements['settings-fields'].disabled, false, 'reset retry button must remain reachable inside account fieldset');
      assert.equal(reset.elements.phone.disabled, true);
      assert.match(reset.elements['reset-error'].textContent, /login was cleared/);
      // Reset can be retried after a partial failure, without stale form saves.
      reset.options.failSave = reset.options.failUpdate = false;
      await reset.reset();
      assert.ok(reset.calls.includes('success'));
    }
  } else {
    assert.deepEqual(reset.config[0]._bridge, bridge);
    assert.equal(reset.config[0].phone, undefined);
    assert.equal(reset.config[0].otp, undefined);
    const expectedReset = clone(initial);
    delete expectedReset[0].phone;
    delete expectedReset[0].otp;
    assert.deepEqual(reset.config, expectedReset, 'reset must preserve every non-authentication setting');
    assert.deepEqual(reset.config[1], initial[1]);
    assert.ok(reset.calls.indexOf('request') < reset.calls.indexOf('update'));
    assert.ok(reset.calls.indexOf('update') < reset.calls.indexOf('save'));
    assert.ok(reset.calls.includes('success'));
  }
}

// A reset waits for a pending edit so stale options cannot restore cleared data.
const resetRace = await frontend();
resetRace.options.updateHook = () => new Promise(resolve => { release = resolve; });
const editing = resetRace.edit('pollInterval', '120');
await Promise.resolve();
const resetting = resetRace.reset();
resetRace.options.updateHook = undefined;
release();
await Promise.all([editing, resetting]);
assert.equal(resetRace.config[0].name, 'Kitchen');
assert.equal(resetRace.config[0].pollInterval, 120);
assert.equal(resetRace.config[0].otp, undefined);
assert.ok(resetRace.calls.includes('success'));
const legacyConfig = clone(initial);
Object.assign(legacyConfig[0], { countryCode: '+972', accessToken: 'test-access', idToken: 'test-id', refreshToken: 'test-refresh', otpSession: 'test-session', orgId: 'test-org' });
const legacy = await frontend({ config: legacyConfig });
await legacy.reset();
for (const key of ['phone', 'otp', 'countryCode', 'accessToken', 'idToken', 'refreshToken', 'otpSession', 'orgId']) assert.ok(!(key in legacy.config[0]));
assert.equal(legacy.config[0].debugLogs, true);

// Execute the actual UI server and installed plugin-ui-utils over Node IPC.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tadiran-ui-'));
const persist = path.join(tmp, 'persist');
fs.mkdirSync(persist);
const auth = path.join(persist, 'my-tadiran-auth.json');
fs.writeFileSync(auth, '{}');
const child = fork(new URL('../homebridge-ui/server.js', import.meta.url), [], {
  env: { ...process.env, HOMEBRIDGE_STORAGE_PATH: tmp }, silent: true,
});
const signal = AbortSignal.timeout(10000);
try {
  const [ready] = await once(child, 'message', { signal });
  assert.equal(ready.action, 'ready');
  async function authStatus(phone = '0500000000', countryCode) {
    const response = once(child, 'message', { signal });
    child.send({ action: 'request', requestId: 'status', path: '/auth-status', body: { phone, countryCode } });
    const [message] = await response;
    assert.equal(message.payload.success, true);
    assert.deepEqual(Object.keys(message.payload.data), ['hasSavedLogin'], 'never return any login details to the browser');
    return message.payload.data.hasSavedLogin;
  }
  assert.equal(await authStatus(), false);
  const savedAuth = { phone: '+972500000000', refreshToken: 'test-token', orgId: 'test-org' };
  fs.writeFileSync(auth, JSON.stringify(savedAuth));
  assert.equal(await authStatus(), true, 'same phone in a local format matches');
  assert.equal(await authStatus('+972500000000'), true);
  assert.equal(await authStatus('+972510000000'), false, 'never clear a new account code using another account token');
  assert.equal(await authStatus(''), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(auth)), savedAuth, 'status must not change auth storage');
  fs.writeFileSync(auth, JSON.stringify({ ...savedAuth, otpSession: 'pending' }));
  assert.equal(await authStatus(), false, 'pending verification must retain its code');
  fs.writeFileSync(auth, '{broken');
  assert.equal(await authStatus(), false);
  fs.writeFileSync(auth, JSON.stringify(savedAuth));
  fs.writeFileSync(path.join(persist, 'my-tadiran-factory-reset.json'), '{}');
  assert.equal(await authStatus(), false, 'a reset marker overrides a leftover token');
  fs.writeFileSync(path.join(persist, 'my-tadiran-reauth-request.json'), '{}');
  const nextMessage = once(child, 'message', { signal });
  child.send({ action: 'request', requestId: 'test', path: '/factory-reset' });
  const [message] = await nextMessage;
  assert.equal(message.payload.success, true);
  assert.equal(message.payload.data.ok, true);
  assert.equal(fs.existsSync(auth), false);
  assert.equal(fs.existsSync(path.join(persist, 'my-tadiran-reauth-request.json')), false);
  assert.equal(fs.existsSync(path.join(persist, 'my-tadiran-factory-reset.json')), true);
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'close');
    child.kill();
    await closed;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('UI settings, validation, preservation, update races, reset and real UI server IPC tests passed');

(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const root = byId('tadiran-settings');
  const fields = byId('settings-fields');
  const resetButton = byId('factory-reset');
  const status = byId('save-status');
  const retryButton = byId('retry-update');
  const defaults = {
    phone: '+972', pollInterval: 30,
    exposeDryMode: false, exposeFanOnly: false,
    exposeFanSpeedControl: false, debugLogs: false,
  };
  const keys = [...Object.keys(defaults), 'otp'];
  const toggles = keys.filter(key => typeof defaults[key] === 'boolean');
  let blocks = [];
  let loaded = false;
  let resetting = false;
  let resetIncomplete = false;
  let revision = 0;
  let updates = Promise.resolve();

  function validate() {
    const phoneValid = byId('phone').value.trim().length > 0;
    const rawInterval = byId('pollInterval').value.trim();
    const interval = Number(rawInterval);
    const pollValid = rawInterval !== '' && Number.isInteger(interval) && interval >= 15 && interval <= 300;
    byId('phone').setAttribute('aria-invalid', String(!phoneValid));
    byId('phone-error').hidden = phoneValid;
    byId('pollInterval').setAttribute('aria-invalid', String(!pollValid));
    byId('poll-error').hidden = pollValid;
    return phoneValid && pollValid;
  }

  function readForm() {
    // Preserve Homebridge-owned metadata, unknown options and any other blocks.
    const current = { ...(blocks[0] || { platform: 'MyTadiran', name: 'My Tadiran' }) };
    for (const key of keys) {
      const input = byId(key);
      const value = toggles.includes(key) ? input.checked
        : key === 'pollInterval' ? Number(input.value) : input.value;
      // Missing defaults need not be written when editing an unrelated field.
      if (!blocks.length || key in current || value !== (defaults[key] ?? '')) current[key] = value;
    }
    return [current, ...blocks.slice(1)];
  }

  function stageChanges() {
    if (!loaded || resetting || resetIncomplete) return updates;
    const thisRevision = ++revision;
    homebridge.disableSaveButton();
    retryButton.hidden = true;
    if (!validate()) {
      status.textContent = 'Check the highlighted fields before saving.';
      return updates;
    }
    const next = readForm();
    status.textContent = 'Preparing changes…';
    // Serialize updates so older requests cannot overwrite newer input. Keep
    // Homebridge's Save disabled until the latest update is acknowledged.
    updates = updates.then(async () => {
      if (resetting || thisRevision !== revision) return;
      try {
        await homebridge.updatePluginConfig(next);
        blocks = next;
        if (!resetting && thisRevision === revision) {
          homebridge.enableSaveButton();
          status.textContent = 'Changes ready. Click Save below, then restart Homebridge to apply.';
        }
      } catch {
        if (!resetting && thisRevision === revision) {
          homebridge.disableSaveButton();
          status.textContent = 'Could not prepare your changes. Retry before saving.';
          retryButton.hidden = false;
        }
      }
    });
    return updates;
  }

  byId('settings-form').addEventListener('submit', event => event.preventDefault());
  for (const key of keys) byId(key).addEventListener(toggles.includes(key) ? 'change' : 'input', stageChanges);
  retryButton.addEventListener('click', stageChanges);

  homebridge.addEventListener('ready', async () => {
    homebridge.hideSchemaForm();
    homebridge.disableSaveButton();
    root.dataset.theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    try {
      const mode = await homebridge.userCurrentLightingMode();
      if (mode === 'dark' || mode === 'light') root.dataset.theme = mode;
    } catch { /* Theme lookup failure must not prevent settings loading. */ }
    if (homebridge.plugin?.installedVersion) {
      byId('plugin-version').textContent = `v${homebridge.plugin.installedVersion}`;
      byId('plugin-version').hidden = false;
    }
    try {
      blocks = await homebridge.getPluginConfig();
      // A saved token for this exact phone proves setup previously completed.
      // Use the official UI save API; never rewrite config.json from a child
      // bridge or expose tokens to the browser. Pending OTP sessions are kept.
      let savedLogin = false;
      try {
        const auth = await homebridge.request('/auth-status', {
          phone: blocks[0]?.phone, countryCode: blocks[0]?.countryCode,
        });
        savedLogin = auth?.hasSavedLogin === true;
      } catch { /* No positive evidence: leave the pending/unknown code alone. */ }
      if (savedLogin && blocks[0] && Object.hasOwn(blocks[0], 'otp')) {
        const cleaned = { ...blocks[0] };
        delete cleaned.otp;
        blocks = [cleaned, ...blocks.slice(1)];
        await homebridge.updatePluginConfig(blocks);
        await homebridge.savePluginConfig();
      }
      const current = blocks[0] || {};
      for (const key of keys) {
        if (toggles.includes(key)) byId(key).checked = Boolean(current[key] ?? defaults[key]);
        else byId(key).value = current[key] ?? defaults[key] ?? '';
      }
      byId('setup-guide').open = !current.phone || current.phone === '+972';
      loaded = true;
      fields.disabled = false;
      resetButton.disabled = false;
      // Other than removing a used OTP above, existing settings are read-only.
      // A fresh install needs a staged platform block for Homebridge's Save.
      if (!blocks.length) await stageChanges();
      else if (validate()) {
        homebridge.enableSaveButton();
        status.textContent = 'After making changes, click Save below and restart Homebridge.';
      } else status.textContent = 'Check the highlighted fields before saving.';
    } catch {
      byId('load-error').hidden = false;
      status.textContent = 'Settings are unavailable. Close and reopen this window.';
      homebridge.disableSaveButton();
    }
  });

  resetButton.addEventListener('click', async () => {
    if (!loaded || resetting) return;
    const confirmed = window.confirm(
      'Reset the Tadiran connection?\n\nThis removes all saved Tadiran login details, including your phone number and SMS code. Plugin preferences and Apple Home pairing are kept.\n\nRestart Homebridge after resetting, then link your account again.'
    );
    if (!confirmed) return;
    resetting = true;
    ++revision;
    fields.disabled = true;
    resetButton.disabled = true;
    retryButton.hidden = true;
    byId('reset-error').hidden = true;
    homebridge.disableSaveButton();
    homebridge.showSpinner();
    let authReset = resetIncomplete;
    let resetAttempted = false;
    try {
      await updates;
      const latest = await homebridge.getPluginConfig();
      const current = latest[0] || {};
      const resetConfig = { ...current, platform: current.platform || 'MyTadiran' };
      for (const key of ['phone', 'otp', 'countryCode', 'refreshToken', 'accessToken', 'idToken', 'otpSession', 'orgId']) delete resetConfig[key];
      // Keep the existing marker/auth-first protocol so a running child bridge
      // cannot recreate the deleted login token before Homebridge restarts.
      resetAttempted = true;
      await homebridge.request('/factory-reset');
      authReset = true;
      await homebridge.updatePluginConfig([resetConfig, ...latest.slice(1)]);
      await homebridge.savePluginConfig();
      homebridge.toast.success(
        'Connection reset. Restart Homebridge, then enter your phone number to connect again.',
        'Tadiran connection reset'
      );
      homebridge.closeSettings();
    } catch {
      resetIncomplete = authReset || resetAttempted;
      const message = authReset
        ? 'The saved login was cleared, but settings could not be saved. Retry the reset to finish, then restart Homebridge.'
        : resetAttempted
          ? 'The reset could not be confirmed. The saved login may have been affected. Retry the reset to finish, then restart Homebridge.'
          : 'Settings could not be read, so the reset was not started. Close and reopen this window to try again.';
      byId('reset-error').textContent = message;
      byId('reset-error').hidden = false;
      status.textContent = 'Reset incomplete. Review the message below.';
      homebridge.toast.error(message, 'My Tadiran');
      resetting = false;
      fields.disabled = false;
      for (const key of keys) byId(key).disabled = resetIncomplete;
      resetButton.disabled = false;
      // Do not enable Save with stale or partially reset data.
    } finally {
      homebridge.hideSpinner();
    }
  });
})();

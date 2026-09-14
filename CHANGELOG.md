# Changelog

## 0.1.7 — Reliability and refreshed settings

- Replace the mixed custom/schema screen with one responsive settings UI: accessible toggle switches, light/dark styling, grouped account/HomeKit/preferences sections, and concise labels. Do not expose the plugin name as an editable field.
- Place **Reset connection** at the bottom of the account section. Clear authentication details while preserving optional controls, polling, logging, other preferences and child-bridge pairing.
- Keep the native Homebridge Save workflow. Edits preserve child-bridge metadata, unknown options, and additional configuration blocks.
- Clear used OTPs from active configuration when settings are reopened and local saved-login state matches the configured phone. Keep pending codes and fail conservatively on unreadable status. No cloud calls or token disclosure are added.
- Validate form input, serialize rapid edits, and prevent saving stale values while updates are pending or have failed. Explain partial reset failures and allow retrying them.
- Add a 15-second timeout to Cognito and My Tadiran cloud requests so a stalled connection cannot leave polling or a HomeKit command pending indefinitely.
- Preserve the saved refresh token when Cognito returns a transient service, rate-limit, or network error; only an explicit authorization failure now starts a new SMS login.
- Retry transient saved-token startup failures automatically after 30 seconds, with exponential backoff capped at 300 seconds. Never automatically retry the SMS/OTP setup steps after network failures.
- Cancel startup retries on shutdown and avoid writing authentication state while a factory reset is pending.
- Catch reset/poll filesystem failures inside the plugin instead of allowing an unhandled exception.
- Bound repeated Cognito custom-auth challenges to five requests instead of allowing an unexpected response sequence to loop indefinitely.
- Validate and clamp the polling interval to 15–300 seconds, falling back to 30 seconds for malformed manual configuration values.
- Use `npm ci` in GitHub Actions for deterministic dependency installation.
- Add regression coverage for transient authentication failures, request timeout signals, Cognito challenge limits, and polling interval validation.
- Exercise the full invalid-session-to-fresh-SMS login recovery, stalled response bodies, HomeKit control mappings and failed-command rollback. Test UI field mappings, validation, update/reset races, config preservation, and the real UI server over IPC.
- Add tests for stale-code cleanup, pending and mismatched accounts, unreadable status, and connection-only reset preservation.

## 0.1.6 — Recover invalid Cognito OTP sessions

- Treat AWS Cognito `NotAuthorizedException: Invalid session for the user` during SMS verification as a recoverable expired login session.
- Automatically request and persist a fresh SMS challenge when Cognito invalidates the previous OTP session, instead of leaving Homebridge stuck on the stale session.
- Keep ordinary wrong/expired OTP handling unchanged.
- Add regression tests for Cognito error classification and invalid-session recovery.
- Add a one-click **Factory reset** action in the Homebridge settings UI. It clears the saved Tadiran authentication state and resets the plugin configuration, including phone number and OTP, without SSH.
- Preserve the Homebridge child-bridge identity during factory reset so users do not have to pair the child bridge with Apple Home again.
- Add a persistent reset marker so a still-running child bridge cannot recreate the deleted refresh-token file before Homebridge is restarted.

## 0.1.5 — Debug logging and optional Fan Speed service

- Added an opt-in **Enable debug logs** setting for command send, cloud acceptance, and cloud-state confirmation/reconciliation messages.
- Added an opt-in separate HomeKit `Fanv2` service with a speed slider for Low / Medium / Auto / High.
- The optional Fan Speed service mirrors AC power and is removed from the cached accessory again when disabled.
- Command failures now produce a concise normal error log even when debug logging is off.
- Debug output intentionally avoids authentication tokens, OTP codes, and full phone numbers.
- Fixed the optimistic-state timeout so it expires after the documented three disagreeing polling cycles.
- Retained the native ESM / Homebridge 2 compatibility work validated in 0.1.4.

## 0.1.4 — Homebridge 2 / verification readiness

- Migrated the runtime to native ESM, matching current Homebridge plugin guidance.
- Declared the currently supported Node.js 22/24 runtime range used by Homebridge 2.x.
- Added GitHub Actions CI on Node.js 22 and 24.
- Kept authentication state in Homebridge persistent storage; upgrading does not require a new SMS login under normal conditions.
- No user-facing configuration changes from 0.1.3.

All notable changes to this project will be documented here.

## 0.1.3 - 2026-09-11

- Make first-time setup friendlier for non-technical users.
- Pre-fill `+972` in the Homebridge UI for Israeli My Tadiran accounts.
- Accept and normalize `050...`, `50...`, `972...`, and `+972...` phone-number formats.
- Preserve backward compatibility with existing full international phone-number configurations and saved refresh tokens.
- Mask phone numbers in Homebridge logs instead of printing the full number.
- Add a prominent `CONTRIBUTORS.md` and npm contributor metadata for Raz Luvaton (`@rluvaton`).
- Expand upstream attribution and add a transparent note about OpenAI ChatGPT development assistance.
- Add phone-number normalization tests.
- Improve expired/invalid OTP recovery by automatically discarding the expired challenge session.
- Add npm/Homebridge plugin-discovery metadata and public package publishing metadata.
- Add a GitHub issue form with explicit secret-redaction guidance and a SECURITY.md.
- Add README badges and explain the difference between Homebridge search availability and the optional Verified by Homebridge program.

## 0.1.2 - 2026-09-11

- Add opt-in Homebridge UI toggles for exposing Dry Mode and Fan Only as separate HomeKit switches.
- Keep both extra mode switches disabled by default.
- Remove cached optional switch services automatically when their setting is turned off.
- Give optional services deterministic default names: `Dry Mode` and `Fan Only`.

## 0.1.1 - 2026-09-11

- Remove the extra Dry and Fan-only switch services from HomeKit.
- Automatically clean up those legacy switch services when upgrading from 0.1.0.
- Prepare the package for a public GitHub/npm release.
- Expand documentation and upstream attribution.
- Confirm first real-world My Tadiran authentication and HomeKit device discovery.

## 0.1.0 - 2026-09-11

- Initial implementation.
- My Tadiran SMS OTP authentication through AWS Cognito.
- Refresh-token persistence.
- Automatic account device discovery.
- HomeKit HeaterCooler support for power, Cool/Heat/Auto, temperatures, and fan speed.
- Polling, optimistic state reconciliation, and command batching.

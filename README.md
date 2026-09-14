# Homebridge My Tadiran

[![npm version](https://img.shields.io/npm/v/homebridge-my-tadiran.svg)](https://www.npmjs.com/package/homebridge-my-tadiran) [![npm downloads](https://img.shields.io/npm/dt/homebridge-my-tadiran.svg)](https://www.npmjs.com/package/homebridge-my-tadiran) [![CI](https://github.com/shirizhaki/homebridge-my-tadiran/actions/workflows/ci.yml/badge.svg)](https://github.com/shirizhaki/homebridge-my-tadiran/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Unofficial Homebridge platform plugin for **Tadiran air conditioners paired with the My Tadiran mobile app**.

It connects directly to Tadiran's cloud API and exposes each AC as a native Apple Home / HomeKit Heater & Cooler accessory. **Home Assistant and Tuya credentials are not required.**

> [!IMPORTANT]
> ## Credit where it is due
> This project is built on the foundational reverse-engineering and Home Assistant integration work of **[Raz Luvaton (@rluvaton)](https://github.com/rluvaton)** in **[`rluvaton/ha-my-tadiran`](https://github.com/rluvaton/ha-my-tadiran)**.
>
> His project established the My Tadiran authentication flow, AWS Cognito details, cloud endpoints, organization handling, climate field mappings, and cloud-shadow behavior that made this Homebridge port possible. Please visit and support the upstream project.
>
> Full attribution is preserved in [CONTRIBUTORS.md](CONTRIBUTORS.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Features

- Automatic discovery of AC units in your My Tadiran account
- Native HomeKit Heater/Cooler accessory
- Power on/off
- Cool / Heat / Auto modes
- Target temperature: 16–30 °C
- Current room temperature
- Fan speed: Low / Medium / Auto / High
- Optional Dry Mode and Fan Only switches, **hidden by default**
- Optional separate Fan Speed HomeKit service, **hidden by default**
- Optional plugin-specific debug logging for command troubleshooting
- Responsive settings UI with accessible toggle switches, light/dark styling, and connection reset in the account section
- SMS verification for first-time login
- Persistent Cognito refresh token, so plugin updates normally **do not require another SMS**
- **Reset connection** button for clearing Tadiran login details while keeping plugin preferences and Homebridge pairing
- Configurable cloud polling, 30 seconds by default
- Bounded cloud requests, with a 15-second timeout for stalled connections
- Optimistic state handling for Tadiran cloud-shadow lag
- Command batching for rapid HomeKit changes
- Homebridge child-bridge compatible

## Quick setup

The plugin settings are designed so you do not need to know how Tadiran's API works.

1. Install the plugin and open **Homebridge UI → Plugins → My Tadiran → Settings**.
2. Enter the phone number registered with the My Tadiran app.
   - For Israeli accounts, the field starts with **`+972`**. Just add the rest of the number.
   - `0501234567`, `501234567`, `972501234567`, and `+972501234567` are all accepted and normalized automatically.
3. **Save and restart Homebridge.** Tadiran will send an SMS verification code.
4. Enter the code in **SMS verification code**.
5. **Save and restart again.**
6. The plugin saves a refresh token in Homebridge's persistent storage and discovers your AC units automatically.
7. After login succeeds, the used SMS code is automatically removed from active configuration the next time you open the settings. The UI checks local saved-login state for the same phone number; pending or unconfirmed codes are left alone.

To link the account again, use **Reset connection** at the bottom of **Tadiran account**. It clears the saved login and removes phone number, OTP and legacy authentication fields from active plugin configuration. Polling, optional controls, debug logging, other preferences and Homebridge child-bridge pairing are preserved. Restart Homebridge after the reset, then enter your phone number and complete the SMS verification flow.

If the plugin runs as a **child bridge**, pair that child bridge with Apple Home using its Homebridge QR code.

## Optional HomeKit controls

Apple's standard HomeKit `HeaterCooler` service provides Auto, Heat, and Cool target modes, but no native Dry or Fan-only target state.

To keep Apple Home clean, both extra modes are hidden by default. If you want them, enable either option in the Homebridge plugin settings:

- **Dry mode**
- **Fan only**

Each enabled mode appears as a separate HomeKit switch on the AC accessory. If you disable the option again, the plugin removes the cached switch service after the next Homebridge restart.

You can also enable **Fan speed control**. This adds a HomeKit `Fanv2` service with a speed slider mapped as Low 25%, Medium 50%, Auto 75%, and High 100%. Its power button mirrors the AC power. The normal fan-speed characteristic on the Heater/Cooler service remains in place, so this option is only for people who want easier access to fan speed as a separate Home tile/service.

## What is intentionally not exposed

### Swing

Swing is currently not exposed. The upstream Home Assistant work documents `swing_ud` and `swing_lr` cloud fields, but on tested Tadiran models these may be phantom fields for hardware without motorized louvers, and the official My Tadiran app may hide them as well.

## Requirements

- Homebridge 1.8+ or Homebridge 2.x
- Node.js 22 or 24
- An active My Tadiran account
- At least one AC already paired with the **My Tadiran** app
- Internet access from Homebridge; this integration is currently cloud-only

## Installation

### Homebridge UI / npm

Search for **My Tadiran** in **Homebridge UI → Plugins** and install it from there. Homebridge discovers public plugins through npm; this package declares the required `homebridge-plugin` keyword and HAP transport support.

You can also install it directly from npm:

```bash
npm install -g homebridge-my-tadiran
```

### Install directly from GitHub

```bash
npm install --save github:shirizhaki/homebridge-my-tadiran
```

### Docker

If `/homebridge` is your persistent Homebridge volume, install the plugin inside the container so it lands in that volume. The Compose service name may differ; for example:

```bash
docker compose exec homebridge npm install --save github:shirizhaki/homebridge-my-tadiran
```

Then restart the Homebridge service.

### Homebridge search and “Verified” status

Publishing `homebridge-my-tadiran` to the public npm registry makes it discoverable from the Homebridge plugin search because the package name and metadata follow Homebridge plugin conventions and include the `homebridge-plugin` keyword.

The green **Verified by Homebridge** badge is a separate review program. It is **not required** for users to find or install the plugin. After the initial public release has been tested by more users, the project can be submitted to the Homebridge team for verification.

## Example configuration

Normally you should use the Homebridge UI rather than editing JSON manually.

```json
{
  "platform": "MyTadiran",
  "name": "My Tadiran",
  "phone": "+972501234567",
  "pollInterval": 30,
  "exposeDryMode": false,
  "exposeFanOnly": false,
  "exposeFanSpeedControl": false,
  "debugLogs": false
}
```

During the initial SMS verification only:

```json
{
  "otp": "123456"
}
```

## HomeKit mapping

| My Tadiran | HomeKit |
| --- | --- |
| Power | Active |
| Cool | Target state: Cool |
| Heat | Target state: Heat |
| Auto | Target state: Auto |
| Current temperature | Current Temperature |
| Target temperature | Cooling / Heating Threshold Temperature |
| Low fan | Rotation Speed 25% |
| Medium fan | Rotation Speed 50% |
| Auto fan | Rotation Speed 75% |
| High fan | Rotation Speed 100% |
| Dry | Optional separate switch |
| Fan only | Optional separate switch |
| Fan speed service | Optional separate `Fanv2` service |

Tadiran does not accept target-temperature changes while the AC is in Auto mode. The official My Tadiran app similarly hides that control in Auto.

## Cloud state and command lag

Tadiran's cloud shadow can report stale values for a while after a command. The AC may act on a change quickly while the cloud's `reported` state still contains the previous value.

To prevent Apple Home from immediately snapping back to stale data, the plugin keeps a newly commanded value optimistically for up to three polling cycles. With the default 30-second interval, that is roughly 90 seconds. If the cloud still disagrees after that, the plugin returns to the cloud-reported state.

Rapid HomeKit updates are batched into one cloud request where possible.

## Debug logging

Enable **Debug logging** in the Homebridge plugin settings when troubleshooting commands. The option is off by default. When enabled, the plugin logs a concise command lifecycle, for example:

```text
[My Tadiran] [debug] Kitchen: sending command (temp_set=25)
[My Tadiran] [debug] Kitchen: cloud accepted command (temp_set=25)
[My Tadiran] [debug] Kitchen: cloud confirmed temp_set=25
```

If the Tadiran cloud does not confirm the desired value within the optimistic-state window, the debug log also notes that the plugin is returning to the cloud-reported value. Authentication tokens, OTP codes, and full phone numbers are never intentionally included in debug output.

## Authentication, updates, and local storage

The first login uses Tadiran's AWS Cognito `CUSTOM_AUTH` flow with the My Tadiran phone number and SMS verification code.

After verification, the refresh token is stored under Homebridge's **persistent data directory** as:

```text
my-tadiran-auth.json
```

The file is written with mode `0600` where supported. It is **not stored inside the plugin package or `node_modules`**, so updating or reinstalling the plugin normally does not remove the login. Docker users should make sure the Homebridge data directory itself is on a persistent volume.

The plugin does not intentionally log authentication tokens. Phone numbers are masked in normal plugin logs. Once a saved refresh token is available for the configured phone, reopening the settings removes the old OTP from active configuration using Homebridge's configuration API. This also cleans up codes left by earlier plugin versions. Pending verification codes, mismatched accounts and unreadable authentication state are not treated as a completed login. The UI status endpoint returns only a boolean, never tokens or session details, and makes no cloud requests.

If Cognito explicitly rejects the saved refresh token, the plugin falls back to the SMS verification flow again. Temporary Cognito service, rate-limit, timeout, and network errors do not delete the saved login.

If a saved-token refresh fails temporarily at startup, the plugin retries after 30 seconds, doubling the delay on repeated failures up to five minutes. Normal polling resumes after recovery. SMS sending and OTP verification are not automatically retried after network failures: check the logs and complete setup manually to avoid duplicate SMS requests.

Each HTTP request has a 15-second timeout (including reading its response). A multi-step login or a command requiring token refresh can take longer overall. A timed-out command might already have reached the cloud; check the next reported state before issuing it again. Version 0.1.7 refreshes the settings screen without adding or changing HomeKit controls.

The settings screen follows Homebridge's light/dark mode and uses its normal **Save** button. Opening existing settings contacts no Tadiran service; its only automatic configuration change is removal of a used OTP as described above. Ordinary edits are staged until you save and preserve child-bridge metadata and unrecognized options. The plugin name is not offered as an editable setting; existing names are preserved. Connection reset requires confirmation and takes effect immediately.

**Reset connection** removes the plugin's saved authentication file (including tokens and pending SMS session), legacy reconnect state, and authentication fields in active configuration. It preserves all other settings and writes a reset marker to stop a running child bridge from restoring the deleted login. Restart Homebridge after resetting before linking again. The disconnected configuration is valid, and the plugin waits for a phone number before starting.

## Compatibility

The plugin has been validated against a real My Tadiran account with Homebridge 2.4.0 for authentication, device discovery, HomeKit exposure, and control. Broader testing across Tadiran model families is still needed.

The upstream Home Assistant integration has primarily been tested with a Tadiran ducted inverter system. Other Tadiran families may expose different mode strings or configuration fields.

If your AC is discovered but behaves incorrectly, please open a GitHub issue and include:

- Homebridge version
- Node.js version
- Tadiran model, if known
- Relevant Homebridge logs with personal data removed
- What you expected to happen and what actually happened

> [!CAUTION]
> Never post your SMS code, refresh token, access token, ID token, full phone number, or other account secrets in a GitHub issue.

## Troubleshooting

### I entered only my Israeli mobile number. Do I need to convert it to +972 myself?

No. `050...`, `50...`, `972...`, and `+972...` formats are normalized automatically. New configurations are pre-filled with `+972` for convenience.

### The plugin sent an SMS but does not discover the AC

Complete the SMS verification step and restart Homebridge once more. Make sure the number is the same one used by the My Tadiran app.

### Invalid or expired SMS code

Clear the code field and request a new login code. SMS codes are short-lived.

If Tadiran/Cognito reports `Invalid session for the user` while the SMS code is being verified, the plugin treats that as a stale OTP session, requests a fresh SMS challenge automatically, and asks you to enter the newly sent code. No manual deletion of Homebridge persistence files is required.

### Apple Home shows an old value after a change

This can be normal Tadiran cloud-shadow lag. The plugin masks stale values optimistically for up to three poll cycles before trusting the cloud again.

### The AC appears in My Tadiran but not in Apple Home

Check the Homebridge log for `Added Tadiran AC:`. If My Tadiran is running as a Homebridge child bridge, make sure that child bridge has been paired with Apple Home.

## Attribution and contributors

The primary upstream contributor is **[Raz Luvaton (@rluvaton)](https://github.com/rluvaton)**, author of [`ha-my-tadiran`](https://github.com/rluvaton/ha-my-tadiran). His reverse-engineering and Home Assistant work is the technical foundation of this port.

The upstream project established and documented, among other things:

- My Tadiran's AWS Cognito SMS authentication flow
- Refresh-token authentication
- Tadiran cloud API endpoints
- Organization/tenant handling
- Device and climate-field mappings
- Desired vs. reported cloud-shadow state
- The optimistic state strategy needed for delayed acknowledgements

`ha-my-tadiran` is MIT licensed, Copyright © 2026 Raz Luvaton. Its license notice is preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for explicit contributor roles. Raz is also listed in the npm package's `contributors` metadata. GitHub's automatic contributor graph is commit-based, so this project does not create fake/co-authored commits merely to change that graph; the upstream contribution is credited explicitly and prominently instead.

### Development transparency

The initial Homebridge implementation, documentation, and code review were developed with assistance from **OpenAI ChatGPT** and then validated against a real My Tadiran installation. This disclosure is provided for transparency; project behavior should be judged by the code, tests, and real-world validation like any other open-source project.

This Homebridge project is a separate, unofficial implementation and is not affiliated with Tadiran, Tuya, Apple, AWS, Homebridge, or the upstream Home Assistant project.

## License

MIT. See [LICENSE](LICENSE).

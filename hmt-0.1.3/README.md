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
- SMS verification for first-time login
- Persistent Cognito refresh token, so plugin updates normally **do not require another SMS**
- Configurable cloud polling, 30 seconds by default
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
7. After login succeeds, the SMS code field may be cleared.

If the plugin runs as a **child bridge**, pair that child bridge with Apple Home using its Homebridge QR code.

## Optional Dry and Fan-only controls

Apple's standard HomeKit `HeaterCooler` service provides Auto, Heat, and Cool target modes, but no native Dry or Fan-only target state.

To keep Apple Home clean, both extra modes are hidden by default. If you want them, enable either option in the Homebridge plugin settings:

- **Expose Dry Mode switch**
- **Expose Fan Only switch**

Each enabled mode appears as a separate HomeKit switch on the AC accessory. If you disable the option again, the plugin removes the cached switch service after the next Homebridge restart.

## What is intentionally not exposed

### Swing

Swing is currently not exposed. The upstream Home Assistant work documents `swing_ud` and `swing_lr` cloud fields, but on tested Tadiran models these may be phantom fields for hardware without motorized louvers, and the official My Tadiran app may hide them as well.

## Requirements

- Homebridge 1.8+ or Homebridge 2.x
- Node.js 18.20.4 or newer (Homebridge 2.x itself currently requires a supported Node.js 22/24 release)
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
  "exposeFanOnly": false
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

Tadiran does not accept target-temperature changes while the AC is in Auto mode. The official My Tadiran app similarly hides that control in Auto.

## Cloud state and command lag

Tadiran's cloud shadow can report stale values for a while after a command. The AC may act on a change quickly while the cloud's `reported` state still contains the previous value.

To prevent Apple Home from immediately snapping back to stale data, the plugin keeps a newly commanded value optimistically for up to three polling cycles. With the default 30-second interval, that is roughly 90 seconds. If the cloud still disagrees after that, the plugin returns to the cloud-reported state.

Rapid HomeKit updates are batched into one cloud request where possible.

## Authentication, updates, and local storage

The first login uses Tadiran's AWS Cognito `CUSTOM_AUTH` flow with the My Tadiran phone number and SMS verification code.

After verification, the refresh token is stored under Homebridge's **persistent data directory** as:

```text
my-tadiran-auth.json
```

The file is written with mode `0600` where supported. It is **not stored inside the plugin package or `node_modules`**, so updating or reinstalling the plugin normally does not remove the login. Docker users should make sure the Homebridge data directory itself is on a persistent volume.

The plugin does not intentionally log authentication tokens. Phone numbers are masked in normal plugin logs.

If Cognito invalidates the saved refresh token, the plugin falls back to the SMS verification flow again.

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

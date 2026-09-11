# Changelog

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

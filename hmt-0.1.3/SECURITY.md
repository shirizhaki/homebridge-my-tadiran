# Security

## Sensitive data

Do not include any of the following in public GitHub issues, screenshots, or logs:

- SMS verification codes (OTP)
- Cognito refresh, access, or ID tokens
- full phone numbers
- passwords or unrelated Homebridge secrets
- private device/account identifiers unless a maintainer specifically asks for a redacted diagnostic value

The plugin stores its My Tadiran refresh token in the Homebridge persistent storage directory rather than inside the npm package or `node_modules`. On platforms that support POSIX file modes, the authentication file is written with mode `0600`.

## Reporting a security issue

For issues that would expose credentials or private account information, do not open a public issue containing the secret. Open a minimal issue describing the affected component without the sensitive value so a private exchange can be arranged if necessary.

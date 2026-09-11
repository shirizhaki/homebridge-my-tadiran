import {
  COGNITO_URL,
  COGNITO_CLIENT_ID,
  TADIRAN_BASE_URL,
  ORG_ID_IL,
  ORG_ID_EU,
} from './constants.js';

export class TadiranAuthError extends Error {}
export class TadiranInvalidOTP extends TadiranAuthError {}
export class TadiranAPIError extends Error {}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) throw new Error('Invalid JWT');
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export class TadiranAPI {
  constructor(log) {
    this.log = log;
    this.accessToken = null;
    this.idToken = null;
    this.refreshToken = null;
    this.orgId = null;
  }

  async cognito(target, body) {
    const response = await fetch(COGNITO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) {
      const type = data.__type || 'Unknown';
      const message = data.message || text || `HTTP ${response.status}`;
      if (String(type).includes('CodeMismatch') || String(type).includes('ExpiredCode')) {
        throw new TadiranInvalidOTP(`${type}: ${message}`);
      }
      throw new TadiranAuthError(`${type}: ${message}`);
    }
    return data;
  }

  async initiateOtp(phone) {
    const data = await this.cognito('InitiateAuth', {
      ClientId: COGNITO_CLIENT_ID,
      AuthFlow: 'CUSTOM_AUTH',
      AuthParameters: { USERNAME: phone },
    });
    if (!data.Session) throw new TadiranAuthError('Cognito did not return an OTP session');
    return data.Session;
  }

  async verifyOtp(phone, session, otp) {
    let data = await this.cognito('RespondToAuthChallenge', {
      ClientId: COGNITO_CLIENT_ID,
      ChallengeName: 'CUSTOM_CHALLENGE',
      Session: session,
      ChallengeResponses: { USERNAME: phone, ANSWER: otp },
    });

    // Some accounts can return another challenge. Reuse the same OTP, matching
    // the behavior of the HA integration this plugin is based on.
    while (data.ChallengeName && !data.AuthenticationResult) {
      data = await this.cognito('RespondToAuthChallenge', {
        ClientId: COGNITO_CLIENT_ID,
        ChallengeName: data.ChallengeName,
        Session: data.Session,
        ChallengeResponses: { USERNAME: phone, ANSWER: otp },
      });
    }

    if (!data.AuthenticationResult) throw new TadiranAuthError('No AuthenticationResult in Cognito response');
    this.storeTokens(data.AuthenticationResult);
  }

  async refresh() {
    if (!this.refreshToken) throw new TadiranAuthError('No refresh token available');
    const data = await this.cognito('InitiateAuth', {
      ClientId: COGNITO_CLIENT_ID,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: this.refreshToken },
    });
    if (!data.AuthenticationResult) throw new TadiranAuthError('Refresh failed: no AuthenticationResult');
    this.storeTokens(data.AuthenticationResult);
  }

  storeTokens(auth) {
    this.accessToken = auth.AccessToken;
    this.idToken = auth.IdToken;
    if (auth.RefreshToken) this.refreshToken = auth.RefreshToken;
    this.deriveOrgId();
  }

  deriveOrgId() {
    if (!this.idToken) return;
    const claims = decodeJwtPayload(this.idToken);
    const email = claims.email || '';
    const match = String(email).match(/tenant-[a-f0-9-]{36}/i);
    if (match) {
      this.orgId = match[0];
      return;
    }
    this.orgId = claims['custom:region'] === 'il' || !claims['custom:region'] ? ORG_ID_IL : ORG_ID_EU;
  }

  tokenExpiry() {
    try { return Number(decodeJwtPayload(this.idToken).exp || 0); } catch { return 0; }
  }

  headers(extra = {}) {
    return {
      Authorization: `Bearer ${this.accessToken || ''}`,
      idtoken: this.idToken || '',
      organizationid: this.orgId || '',
      ...extra,
    };
  }

  async request(method, path, body, extraHeaders = {}) {
    if (this.tokenExpiry() - Math.floor(Date.now() / 1000) < 60) await this.refresh();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${TADIRAN_BASE_URL}${path}`, {
        method,
        headers: this.headers(body !== undefined ? { 'Content-Type': 'application/json', ...extraHeaders } : extraHeaders),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401 && attempt === 0) {
        await this.refresh();
        continue;
      }

      const text = await response.text();
      if (!response.ok) throw new TadiranAPIError(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
      if (!text) return null;
      try { return JSON.parse(text); } catch { return text; }
    }
    throw new TadiranAPIError(`${method} ${path}: retry exhausted`);
  }

  async getDevices() {
    const data = await this.request('GET', '/tadiran-mobile-app/api/v1/devices/');
    if (!Array.isArray(data)) throw new TadiranAPIError('Device list response was not an array');
    return data;
  }

  async updateDeviceShadow(deviceId, updates) {
    const body = Object.entries(updates).map(([name, value]) => ({ name, value }));
    return this.request(
      'PUT',
      `/mobile-app/api/v1/devices/${encodeURIComponent(deviceId)}/shadow/update/`,
      body,
      { 'x-manufacturer-name': 'TUYA' },
    );
  }
}


import assert from 'node:assert/strict';
import {
  TadiranAPI,
  TadiranAuthError,
  TadiranInvalidOTP,
  TadiranInvalidSession,
  TadiranNotAuthorized,
} from '../lib/api.js';

const originalFetch = globalThis.fetch;

function mockCognitoError(type, message) {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    async text() {
      return JSON.stringify({ __type: type, message });
    },
  });
}

try {
  const client = new TadiranAPI({});

  mockCognitoError('NotAuthorizedException', 'Invalid session for the user.');
  await assert.rejects(
    () => client.verifyOtp('+972500000000', 'stale-session', '123456'),
    error => error instanceof TadiranInvalidSession && /Invalid session/i.test(error.message),
  );

  mockCognitoError('CodeMismatchException', 'Incorrect username or password.');
  await assert.rejects(
    () => client.verifyOtp('+972500000000', 'session', '000000'),
    error => error instanceof TadiranInvalidOTP,
  );

  mockCognitoError('NotAuthorizedException', 'User is disabled.');
  await assert.rejects(
    () => client.cognito('RespondToAuthChallenge', {}),
    error => error instanceof TadiranNotAuthorized
      && error instanceof TadiranAuthError
      && !(error instanceof TadiranInvalidOTP)
      && !(error instanceof TadiranInvalidSession),
  );

  let receivedSignal = null;
  globalThis.fetch = async (_url, options) => {
    receivedSignal = options.signal;
    return {
      ok: true,
      status: 200,
      async text() { return '{}'; },
    };
  };
  await client.cognito('InitiateAuth', {});
  assert.ok(receivedSignal instanceof AbortSignal, 'Cognito requests should include a timeout signal');

  let challengeCalls = 0;
  globalThis.fetch = async () => {
    challengeCalls += 1;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ ChallengeName: 'CUSTOM_CHALLENGE', Session: `session-${challengeCalls}` });
      },
    };
  };
  await assert.rejects(
    () => client.verifyOtp('+972500000000', 'session', '123456'),
    error => error instanceof TadiranAuthError && /challenge limit/i.test(error.message),
  );
  assert.equal(challengeCalls, 5, 'Cognito challenge retries should be bounded');
  for (const successAt of [1, 2, 5]) {
    challengeCalls = 0;
    globalThis.fetch = async () => {
      challengeCalls++;
      const body = challengeCalls === successAt
        ? { AuthenticationResult: { AccessToken: 'access', IdToken: `x.${Buffer.from('{"exp":9999999999}').toString('base64url')}.x`, RefreshToken: 'refresh' } }
        : { ChallengeName: 'CUSTOM_CHALLENGE', Session: `session-${challengeCalls}` };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
    await client.verifyOtp('+972500000000', 'session', '123456');
    assert.equal(challengeCalls, successAt);
    assert.equal(client.refreshToken, 'refresh');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('api Cognito error classification tests passed');

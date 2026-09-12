import assert from 'node:assert/strict';
import { TadiranAPI, TadiranAuthError, TadiranInvalidOTP, TadiranInvalidSession } from '../lib/api.js';

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
    error => error instanceof TadiranAuthError
      && !(error instanceof TadiranInvalidOTP)
      && !(error instanceof TadiranInvalidSession),
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('api Cognito error classification tests passed');

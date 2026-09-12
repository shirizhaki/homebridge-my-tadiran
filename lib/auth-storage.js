import fs from 'node:fs';
import path from 'node:path';

export const AUTH_FILENAME = 'my-tadiran-auth.json';
export const FACTORY_RESET_FILENAME = 'my-tadiran-factory-reset.json';
export const LEGACY_REAUTH_FILENAME = 'my-tadiran-reauth-request.json';

export function authFilePath(persistPath) {
  return path.join(persistPath, AUTH_FILENAME);
}

export function factoryResetFilePath(persistPath) {
  return path.join(persistPath, FACTORY_RESET_FILENAME);
}

export function removeFileIfPresent(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function clearSavedAuthentication(persistPath) {
  const removed = removeFileIfPresent(authFilePath(persistPath));
  // Clean up the marker used by the unreleased reconnect-toggle prototype too.
  removeFileIfPresent(path.join(persistPath, LEGACY_REAUTH_FILENAME));
  return removed;
}

export function requestFactoryReset(persistPath) {
  fs.mkdirSync(persistPath, { recursive: true });
  fs.writeFileSync(
    factoryResetFilePath(persistPath),
    JSON.stringify({ requestedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
  clearSavedAuthentication(persistPath);
}

export function consumeFactoryReset(persistPath) {
  const marker = factoryResetFilePath(persistPath);
  if (!fs.existsSync(marker)) return false;
  clearSavedAuthentication(persistPath);
  removeFileIfPresent(marker);
  return true;
}

export function isFactoryResetPending(persistPath) {
  return fs.existsSync(factoryResetFilePath(persistPath));
}

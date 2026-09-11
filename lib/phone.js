function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Normalize a phone number for My Tadiran / Cognito.
 *
 * - Full international numbers such as +972501234567 are preserved.
 * - Israeli local numbers such as 0501234567 become +972501234567.
 * - With the default +972 prefix, entering only 501234567 also works.
 * - For non-Israeli users, entering a full international number beginning
 *   with + remains the safest option.
 */
export function normalizePhone(value, defaultCountryCode = '+972') {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // Explicit international format always wins over the configured/default
  // prefix. Allow spaces, dashes and parentheses for user friendliness.
  if (raw.startsWith('+')) {
    const digits = cleanDigits(raw);
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = cleanDigits(raw);
  if (!digits) return null;

  const countryDigits = cleanDigits(defaultCountryCode);
  if (!countryDigits) return null;

  let national = digits;

  // The plugin is primarily intended for Tadiran's Israeli service. Israeli
  // domestic numbers have a leading trunk 0 which is omitted in E.164.
  if (countryDigits === '972' && national.startsWith('0')) {
    national = national.slice(1);
  }

  // If the user pasted 972... without a leading +, do not duplicate it.
  if (national.startsWith(countryDigits) && national.length > countryDigits.length + 6) {
    const full = `+${national}`;
    return full.length >= 9 && full.length <= 16 ? full : null;
  }

  const fullDigits = `${countryDigits}${national}`;
  if (fullDigits.length < 8 || fullDigits.length > 15) return null;
  return `+${fullDigits}`;
}

export function maskPhone(phone) {
  const normalized = String(phone || '');
  const digits = cleanDigits(normalized);
  if (digits.length <= 4) return '***';
  const tail = digits.slice(-3);
  const country = normalized.startsWith('+972') ? '+972' : normalized.startsWith('+') ? '+' : '';
  return `${country}••••••${tail}`;
}


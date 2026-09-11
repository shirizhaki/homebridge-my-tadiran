'use strict';

const assert = require('assert');
const { normalizePhone, maskPhone } = require('../lib/phone');

assert.strictEqual(normalizePhone('0501234567'), '+972501234567');
assert.strictEqual(normalizePhone('501234567'), '+972501234567');
assert.strictEqual(normalizePhone('+972 50-123-4567'), '+972501234567');
assert.strictEqual(normalizePhone('972501234567'), '+972501234567');
assert.strictEqual(normalizePhone('+44 7700 900123'), '+447700900123');
assert.strictEqual(normalizePhone(''), null);
assert.strictEqual(normalizePhone('+972'), null);
assert.strictEqual(maskPhone('+972501234567'), '+972••••••567');

console.log('phone normalization tests passed');

import assert from 'node:assert/strict';
import test from 'node:test';
// Node's built-in type-strip test runner requires the explicit TypeScript suffix.
// @ts-expect-error The application tsconfig intentionally keeps allowImportingTsExtensions disabled.
import { normalizeDateOnly } from '../src/lib/date-only.ts';

test('keeps PostgreSQL date-only strings unchanged', () => {
  assert.equal(normalizeDateOnly('2026-10-05'), '2026-10-05');
});

test('uses local calendar fields instead of UTC slicing', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Asia/Shanghai';
  try {
    assert.equal(
      normalizeDateOnly(new Date('2026-10-04T16:00:00.000Z')),
      '2026-10-05',
    );
    assert.equal(
      normalizeDateOnly('2026-10-04T16:00:00.000Z'),
      '2026-10-05',
    );
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('returns invalid non-date values without inventing a date', () => {
  assert.equal(normalizeDateOnly('not-a-date'), 'not-a-date');
  assert.equal(normalizeDateOnly(null), '');
});

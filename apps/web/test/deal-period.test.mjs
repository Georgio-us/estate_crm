import assert from 'node:assert/strict';
import test from 'node:test';
import { dateInTimezone, matchesDealPeriod, periodBounds, shiftDate } from '../src/lib/deal-period.ts';

test('presets cover N calendar days including today, through month and year boundaries', () => {
  for (const days of [7, 14, 28, 30, 90]) {
    const bounds = periodBounds({ kind: 'days', days }, '2026-01-04');
    assert.equal((Date.parse(bounds.to) - Date.parse(bounds.from)) / 86400000 + 1, days);
    assert.equal(matchesDealPeriod(`${bounds.from}T12:00:00Z`, { kind: 'days', days }, bounds.to, 'UTC'), true);
    assert.equal(matchesDealPeriod(`${shiftDate(bounds.from, -1)}T23:59:59Z`, { kind: 'days', days }, bounds.to, 'UTC'), false);
  }
});
test('range includes both calendar days in workspace timezone, not browser timezone', () => {
  const period = { kind: 'range', from: '2026-10-14', to: '2026-10-14' };
  assert.equal(matchesDealPeriod('2026-10-13T21:00:00Z', period, '2026-10-14', 'Europe/Kyiv'), true);
  assert.equal(matchesDealPeriod('2026-10-14T20:59:59Z', period, '2026-10-14', 'Europe/Kyiv'), true);
  assert.equal(matchesDealPeriod('2026-10-14T21:00:00Z', period, '2026-10-14', 'Europe/Kyiv'), false);
});
test('DST calendar ranges keep both ends without relying on 24-hour days', () => {
  const period = { kind: 'days', days: 7 };
  assert.deepEqual(periodBounds(period, '2026-10-26'), { from: '2026-10-20', to: '2026-10-26' });
  assert.equal(dateInTimezone('2026-10-25T22:30:00Z', 'Europe/Kyiv'), '2026-10-26');
  assert.equal(matchesDealPeriod('2026-10-26T21:59:59Z', period, '2026-10-26', 'Europe/Kyiv'), true);
  assert.equal(matchesDealPeriod('2026-10-26T22:00:00Z', period, '2026-10-26', 'Europe/Kyiv'), false);
});
test('unbounded includes old records and leap day arithmetic works', () => {
  assert.equal(matchesDealPeriod('2000-01-01T00:00:00Z', {kind: 'all'}, '2026-10-14', 'UTC'), true);
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(matchesDealPeriod(undefined, {kind: 'days', days: 7}, '2026-10-14', 'UTC'), false);
});

// Run: npm run check
import assert from 'node:assert/strict'
import { addDays, byDue, dueLabel } from '../src/lib/dates.ts'

assert.equal(addDays('2026-02-28', 1), '2026-03-01')
assert.equal(addDays('2026-01-01', -1), '2025-12-31')
assert.equal(dueLabel('2026-10-08', '2026-10-08'), 'Today')
assert.equal(dueLabel('2026-10-09', '2026-10-08'), 'Tomorrow')
assert.equal(dueLabel('2026-10-07', '2026-10-08'), 'Yesterday')

const t = (due_date: string | null, sort_order: number) => ({ due_date, sort_order })
const sorted = [t(null, 1), t('2026-10-09', 3), t('2026-10-08', 5), t('2026-10-09', 2)].sort(byDue)
assert.deepEqual(sorted, [t('2026-10-08', 5), t('2026-10-09', 2), t('2026-10-09', 3), t(null, 1)])

console.log('ok')

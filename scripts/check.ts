// Run: npm run check
import assert from 'node:assert/strict'
import { addDays, byDue, dueGroup, dueLabel } from '../src/lib/dates.ts'
import { hits, inkHeight, outlinePath, roundPoints, simplify, type Point, type Stroke } from '../src/lib/ink.ts'

assert.equal(addDays('2026-02-28', 1), '2026-03-01')
assert.equal(addDays('2026-01-01', -1), '2025-12-31')
assert.equal(dueLabel('2026-10-08', '2026-10-08'), 'Today')
assert.equal(dueLabel('2026-10-09', '2026-10-08'), 'Tomorrow')
assert.equal(dueLabel('2026-10-07', '2026-10-08'), 'Yesterday')

const t = (due_date: string | null, sort_order: number) => ({ due_date, sort_order })
const sorted = [t(null, 1), t('2026-10-09', 3), t('2026-10-08', 5), t('2026-10-09', 2)].sort(byDue)
assert.deepEqual(sorted, [t('2026-10-08', 5), t('2026-10-09', 2), t('2026-10-09', 3), t(null, 1)])

assert.equal(dueGroup(null, '2026-10-08'), 'No date')
assert.equal(dueGroup('2026-10-07', '2026-10-08'), 'Overdue')
assert.equal(dueGroup('2026-10-08', '2026-10-08'), 'Today')
assert.equal(dueGroup('2026-10-09', '2026-10-08'), 'Upcoming')

// Ink: a straight line collapses to its endpoints; a corner survives; pressure rides along.
const line: Point[] = [[0, 0, 0.5], [10, 0.1, 0.6], [20, 0, 0.7], [30, 0, 0.8]]
assert.deepEqual(simplify(line), [[0, 0, 0.5], [30, 0, 0.8]])
const corner: Point[] = [[0, 0, 0.5], [10, 0, 0.5], [20, 0, 0.5], [20, 10, 0.5], [20, 20, 0.5]]
assert.deepEqual(simplify(corner), [[0, 0, 0.5], [20, 0, 0.5], [20, 20, 0.5]])
assert.deepEqual(roundPoints([[1.234, 5.678, 0.4567]]), [[1.2, 5.7, 0.46]])

const s: Stroke = { id: 'a', tool: 'pen', color: 'ink', size: 4, points: [[100, 100, 0.5], [200, 100, 0.5]] }
assert.equal(hits(s, 150, 105, 5), true) // 5 away, reach is 5 + 2
assert.equal(hits(s, 150, 120, 5), false)
assert.equal(hits(s, 250, 100, 5), false) // past the end
assert.equal(inkHeight([]), 1200)
assert.equal(inkHeight([{ ...s, points: [[0, 1500, 0.5]] }]), 1900)
assert.match(outlinePath(s.points, 'pen', 4), /^M [\d.-]+ [\d.-]+ Q .* Z$/)

console.log('ok')

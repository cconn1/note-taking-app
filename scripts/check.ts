// Run: npm run check
import assert from 'node:assert/strict'
import { addDays, addMonths, byDue, dueGroup, dueLabel, monthDays, nextWeekday, weekend } from '../src/lib/dates.ts'
import { hits, inkHeight, outlinePath, roundPoints, simplify, type Point, type Stroke } from '../src/lib/ink.ts'
import { project, rubberband } from '../src/lib/spring.ts'

assert.equal(addDays('2026-02-28', 1), '2026-03-01')
assert.equal(addDays('2026-01-01', -1), '2025-12-31')
assert.equal(dueLabel('2026-10-08', '2026-10-08'), 'Today')
assert.equal(dueLabel('2026-10-09', '2026-10-08'), 'Tomorrow')
assert.equal(dueLabel('2026-10-07', '2026-10-08'), 'Yesterday')

const t = (due_date: string | null, sort_order: number) => ({ due_date, sort_order })
const sorted = [t(null, 1), t('2026-10-09', 3), t('2026-10-08', 5), t('2026-10-09', 2)].sort(byDue)
assert.deepEqual(sorted, [t('2026-10-08', 5), t('2026-10-09', 2), t('2026-10-09', 3), t(null, 1)])

// Date picker: 2026-10-27 is a Tuesday.
assert.equal(nextWeekday('2026-10-27', 1), '2026-11-02') // next Monday
assert.equal(nextWeekday('2026-11-02', 1), '2026-11-09') // strictly after
assert.equal(weekend('2026-10-27'), '2026-10-31')
assert.equal(weekend('2026-11-01'), '2026-11-01') // already Sunday
assert.equal(addMonths('2026-12', 1), '2027-01')
assert.equal(addMonths('2026-01', -1), '2025-12')
const oct = monthDays('2026-10') // Oct 1 2026 is a Thursday
assert.equal(oct.length, 4 + 31)
assert.equal(oct[4], '2026-10-01')
assert.equal(oct.at(-1), '2026-10-31')
assert.equal(monthDays('2028-02').filter(Boolean).length, 29) // leap year

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

// Gestures: a flick projects forward in its direction; rubber-banding resists more the further you pull.
assert.equal(project(0), 0)
assert.ok(project(1000) > 400 && project(-1000) < -400)
assert.ok(rubberband(100, 300) < 100 && rubberband(200, 300) - rubberband(100, 300) < rubberband(100, 300))
assert.equal(rubberband(-50, 300), -rubberband(50, 300))

console.log('ok')

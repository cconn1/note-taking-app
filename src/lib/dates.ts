// Plain YYYY-MM-DD strings in the device's local time zone. They sort and compare as strings.

const iso = (d: Date) => d.toLocaleDateString('en-CA') // en-CA formats as YYYY-MM-DD
const parse = (day: string) => new Date(day + 'T00:00')

export const today = () => iso(new Date())

export function addDays(day: string, n: number) {
  const d = parse(day)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export const formatDate = (day: string) =>
  parse(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

export const longDate = (day: string) =>
  parse(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export function dueLabel(due: string, now = today()) {
  if (due === now) return 'Today'
  if (due === addDays(now, 1)) return 'Tomorrow'
  if (due === addDays(now, -1)) return 'Yesterday'
  return parse(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Open tasks: earliest due date first, undated last, then in the order they were added.
export const byDue = (a: { due_date: string | null; sort_order: number }, b: { due_date: string | null; sort_order: number }) =>
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.sort_order - b.sort_order

export type DueGroup = 'Overdue' | 'Today' | 'Upcoming' | 'No date'
export const DUE_GROUPS: DueGroup[] = ['Overdue', 'Today', 'Upcoming', 'No date']

export function dueGroup(due: string | null, now = today()): DueGroup {
  if (!due) return 'No date'
  return due < now ? 'Overdue' : due === now ? 'Today' : 'Upcoming'
}

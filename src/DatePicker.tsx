import { useId, useRef, useState, type ReactNode } from 'react'
import { addDays, addMonths, monthDays, nextWeekday, today, weekend } from './lib/dates'
import { menuClass, showAnchored } from './lib/popover'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const short = (day: string) => new Date(day + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' })
const full = (day: string) => new Date(day + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

// Pick a due date from a glass menu: one-tap choices (like Reminders), then a month calendar.
// Replaces the native date picker, which can't be styled; lives in the popover top layer like ListPicker.
export default function DatePicker({
  value,
  onChange,
  className,
  label = 'Due date',
  children,
}: {
  value: string | null
  onChange: (day: string | null) => void
  className?: string
  label?: string
  /** The trigger's face (e.g. the due chip). */
  children: ReactNode
}) {
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const now = today()
  const [month, setMonth] = useState((value ?? now).slice(0, 7))

  function show() {
    if (!menu.current || !btn.current) return
    setMonth((value ?? today()).slice(0, 7))
    showAnchored(menu.current, btn.current)
    menu.current.querySelector<HTMLElement>('button')?.focus()
  }

  function pick(day: string | null) {
    menu.current?.hidePopover()
    btn.current?.focus()
    if (day !== value) onChange(day)
  }

  const quick: [string, string | null][] = [
    ['Today', now],
    ['Tomorrow', addDays(now, 1)],
    ['This weekend', weekend(now)],
    ['Next week', nextWeekday(now, 1)],
  ]
  const nav = 'press grid size-10 place-items-center rounded-full text-accent-text hover:bg-black/5 dark:hover:bg-white/8'

  return (
    <>
      <button ref={btn} type="button" onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-label={label} className={className}>
        {children}
      </button>
      <div ref={menu} id={id} popover="auto" role="dialog" aria-label={label} onToggle={(e) => setOpen(e.newState === 'open')} className={`${menuClass} max-h-[85dvh] w-76`}>
        {/* One-tap choices, two by two to keep the menu short. */}
        <div className="grid grid-cols-2 gap-1">
          {quick.map(([name, day]) => (
            <button
              key={name}
              type="button"
              onClick={() => pick(day)}
              className={`press flex flex-col items-start rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${day === value ? 'bg-accent text-white' : 'bg-black/5 hover:bg-black/8 dark:bg-white/8 dark:hover:bg-white/12'}`}
            >
              <span className="text-sm font-semibold">{name}</span>
              <span className={`text-xs ${day === value ? 'text-white/80' : 'text-neutral-500'}`}>{day && short(day)}</span>
            </button>
          ))}
        </div>

        <div className="mt-1 flex items-center pl-3">
          <span className="flex-1 font-semibold">
            {new Date(month + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          {value && (
            <button type="button" onClick={() => pick(null)} className="press h-10 rounded-full px-3 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
              No date
            </button>
          )}
          <span className="flex">
            <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month" className={nav}>
              ‹
            </button>
            <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month" className={nav}>
              ›
            </button>
          </span>
        </div>
        <div className="grid grid-cols-7 px-1 pb-1 text-center">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="pb-1 text-xs font-semibold text-neutral-500">
              {d}
            </span>
          ))}
          {monthDays(month).map((day, i) =>
            day ? (
              <button
                key={day}
                type="button"
                onClick={() => pick(day)}
                aria-label={full(day)}
                aria-pressed={day === value}
                className={`press mx-auto grid size-10 place-items-center rounded-full text-sm ${
                  day === value
                    ? 'bg-accent font-semibold text-white'
                    : day === now
                      ? 'font-semibold text-accent-text ring-1 ring-accent/50'
                      : 'hover:bg-black/5 dark:hover:bg-white/8'
                }`}
              >
                {Number(day.slice(8))}
              </button>
            ) : (
              <span key={`blank${i}`} />
            ),
          )}
        </div>
      </div>
    </>
  )
}

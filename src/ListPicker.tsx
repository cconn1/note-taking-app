import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLists } from './lib/lists'
import { itemClass, menuClass, showAnchored } from './lib/popover'

const NONE = { id: '', name: 'No list', color: '' }

// Pick a list from a glass menu (a native <select> can't be styled). The menu lives in the popover
// top layer, so a task row's overflow or the Quick Add dialog can't clip it; it grows out of the trigger.
export default function ListPicker({
  value,
  onChange,
  className,
  children,
}: {
  value: string | null
  onChange: (id: string | null) => void
  className?: string
  /** The trigger's face (e.g. the list chip). */
  children: ReactNode
}) {
  const lists = useLists()
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  function show() {
    if (!menu.current || !btn.current) return
    showAnchored(menu.current, btn.current)
    menu.current.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  }

  function pick(next: string) {
    menu.current?.hidePopover()
    btn.current?.focus()
    if (next !== (value ?? '')) onChange(next || null)
  }

  // Arrow keys move between items (Escape and outside taps are handled by the popover itself).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitemradio]')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <>
      <button ref={btn} type="button" onClick={show} aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label="List" className={className}>
        {children}
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        onToggle={(e) => setOpen(e.newState === 'open')}
        onKeyDown={onKeyDown}
        className={`${menuClass} max-h-[60dvh] min-w-48`}
      >
        {[NONE, ...lists].map((l) => {
          const on = l.id === (value ?? '')
          return (
            <button
              key={l.id}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              onClick={() => pick(l.id)}
              className={itemClass}
            >
              <span
                style={{ backgroundColor: l.color || undefined }}
                // A faint outline keeps dark list colors visible on dark glass.
                className={`size-3.5 shrink-0 rounded-full ${l.color ? 'ring-1 ring-black/10 dark:ring-white/25' : 'border-2 border-neutral-300 dark:border-neutral-600'}`}
              />
              <span className="flex-1 truncate">{l.name}</span>
              {on && (
                <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-accent-text" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

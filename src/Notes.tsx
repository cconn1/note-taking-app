import { useEffect, useRef, useState } from 'react'
import Ink from './Ink'
import type { Stroke } from './lib/ink'
import type { Page } from './lib/supabase'
import { useSyncedField, type SaveStatus } from './useSyncedField'

type Tab = 'typed' | 'ink'
const TAB_KEY = 'sitrep-notes-tab'
const STATUS: Record<SaveStatus, string> = { saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Not saved' }

// Strokes are never edited in place, so comparing ids is enough to tell two versions apart.
const sameInk = (a: Stroke[], b: Stroke[]) => a.length === b.length && a.every((s, i) => s.id === b[i].id)

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'ink' ? 'ink' : 'typed'
  } catch {
    return 'typed'
  }
}

// A session's notes: typed (Scribble-friendly) and handwritten, each autosaved with its own
// conflict check. Both stay loaded while you switch tabs, so nothing unsaved is lost.
export default function Notes({ pageId, page }: { pageId: string; page: Page }) {
  const typed = useSyncedField(pageId, 'notes', { value: page.notes, ts: page.notes_updated_at }, Object.is)
  const ink = useSyncedField(pageId, 'ink', { value: page.ink, ts: page.ink_updated_at }, sameInk)
  // Remembered per device: the iPad can open on Handwriting, the PC on Typed.
  const [tab, setTab] = useState<Tab>(readTab)
  // Full screen: notes cover everything except the floating + (which sits above, z-40).
  const [full, setFull] = useState(false)

  function pick(t: Tab) {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // Private mode: the choice just won't stick.
    }
  }

  // A checkmark flashes next to "Saved" right after a save lands.
  const status = (tab === 'typed' ? typed : ink).status
  const [justSaved, setJustSaved] = useState(false)
  const prevStatus = useRef(status)
  useEffect(() => {
    const was = prevStatus.current
    prevStatus.current = status
    const flash = was === 'saving' && status === 'saved'
    setJustSaved(flash)
    if (!flash) return
    const t = setTimeout(() => setJustSaved(false), 1500)
    return () => clearTimeout(t)
  }, [status])

  // One prompt for both kinds of notes.
  const conflicted = [typed.conflict && 'typed notes', ink.conflict && 'handwriting'].filter(Boolean)
  const reload = () => (typed.reload(), ink.reload())
  const keepMine = () => {
    if (typed.conflict) typed.keepMine()
    if (ink.conflict) ink.keepMine()
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => pick(t)}
      aria-pressed={tab === t}
      className={`press h-8 rounded-full px-4 text-sm font-semibold ${tab === t ? 'bg-surface text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100' : 'text-neutral-500'}`}
    >
      {label}
    </button>
  )

  return (
    <section
      className={
        full
          ? 'fixed inset-0 z-[35] flex flex-col bg-canvas px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 md:px-8'
          : ''
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex rounded-full bg-black/6 p-1 dark:bg-white/10">
          {tabBtn('typed', 'Typed')}
          {tabBtn('ink', 'Handwriting')}
        </div>
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1 text-xs text-neutral-400" aria-live="polite">
            <svg
              viewBox="0 0 12 12"
              className={`size-3 text-green-600 transition-[opacity,scale] duration-300 ease-[var(--ease-spring)] motion-reduce:transition-none dark:text-green-400 ${justSaved ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M2.5 6.5l2.2 2.2 4.8-5.2" />
            </svg>
            {STATUS[status]}
          </span>
          <button
            onClick={() => setFull(!full)}
            aria-label={full ? 'Exit full screen' : 'Full screen notes'}
            className="press grid size-10 place-items-center rounded-full text-neutral-500 hover:bg-black/5 dark:hover:bg-white/8"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {full ? <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" /> : <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />}
            </svg>
          </button>
        </div>
      </div>

      {conflicted.length > 0 && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="flex-1">Changed on another device: {conflicted.join(' and ')}.</span>
          <button onClick={reload} className="h-9 rounded-md px-3 font-medium hover:bg-amber-100 dark:hover:bg-amber-900">
            Reload theirs
          </button>
          <button onClick={keepMine} className="h-9 rounded-md bg-amber-600 px-3 font-medium text-white hover:bg-amber-700">
            Keep mine
          </button>
        </div>
      )}

      <textarea
        value={typed.value}
        onChange={(e) => typed.change(e.target.value)}
        onBlur={() => typed.save()}
        onKeyDown={(e) => e.key === 'Escape' && full && setFull(false)}
        placeholder="Type notes…"
        hidden={tab !== 'typed'}
        className={`${full ? 'flex-1 pb-24' : 'min-h-[calc(100dvh-13rem)]'} surface w-full resize-none p-5 text-base leading-relaxed outline-none field-sizing-content focus:ring-2 focus:ring-accent/40`}
      />

      <div hidden={tab !== 'ink'} className={`surface ${full ? 'min-h-0 flex-1 overflow-y-auto pb-24' : ''}`}>
        <Ink strokes={ink.value} onChange={ink.change} />
      </div>
    </section>
  )
}

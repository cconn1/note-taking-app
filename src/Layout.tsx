import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import DatePicker from './DatePicker'
import ListPicker from './ListPicker'
import { refresh, showError, useLoad, type Toast } from './lib/app'
import { dueLabel } from './lib/dates'
import { LIST_COLORS, ListsContext, readListTab, type List } from './lib/lists'
import { project, rubberband, spring, velocityTracker } from './lib/spring'
import { supabase } from './lib/supabase'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

const NAV = [
  { to: '/', label: 'Today', end: true, icon: icon('M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z') },
  { to: '/sessions', label: 'Sessions', end: false, icon: icon('M5 4h14v16H5zM9 8h6M9 12h6M9 16h3') },
  { to: '/search', label: 'Search', end: false, icon: icon('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.6-4.6') },
]

const SidebarIcon = () => (
  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
    <path d="M7.5 3.5v13" />
  </svg>
)

// How far (px) to pull down before letting go refreshes.
const PULL = 70
// Pull indicator arc: circumference of the r=9 circle.
const ARC = 2 * Math.PI * 9

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// Quick Add motion. Phones: a bottom sheet, x = px dragged down (0 = open, closed = its height).
// iPad/desktop: a popover scaling from its trigger, x = 0..100 (0 = open). Lives in refs: it changes every frame.
type Sheet = {
  mode: 'sheet' | 'pop'
  x: number
  closed: number
  stop: () => void
  dragged: boolean
  drag: { id: number; grab: number; captured: boolean; vt: ReturnType<typeof velocityTracker> } | null
}

function renderSheet(el: HTMLDialogElement, s: Sheet, x: number) {
  s.x = x
  const p = Math.min(1, Math.max(0, 1 - x / s.closed)) // 1 = fully open
  if (s.mode === 'sheet') el.style.transform = `translateY(${x}px)`
  else {
    el.style.transform = `scale(${0.4 + 0.6 * p})`
    el.style.opacity = String(p)
    el.style.filter = p < 1 ? `blur(${(1 - p) * 8}px)` : ''
  }
  el.style.setProperty('--sheet-p', String(p)) // backdrop dims with it
}

function animateSheet(el: HTMLDialogElement, s: Sheet, to: number, velocity = 0, onDone?: () => void) {
  s.stop()
  s.stop = spring(s.x, to, { velocity, response: 0.35, damping: 1, onUpdate: (x) => renderSheet(el, s, x), onDone })
}

export default function Layout({ email }: { email?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // On a session page, Quick Add files tasks into that session.
  const pageId = useMatch('/sessions/:id')?.params.id
  // The sidebar starts hidden on session pages (room for notes) and shown elsewhere.
  // A toggle only lasts until you navigate to another screen.
  const [sidebarPref, setSidebarPref] = useState<{ path: string; open: boolean } | null>(null)
  const sidebarOpen = sidebarPref?.path === pathname ? sidebarPref.open : !pageId
  const toggleSidebar = () => setSidebarPref({ path: pathname, open: !sidebarOpen })
  const [error, setError] = useState<string | null>(null)
  const [errorOut, setErrorOut] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [toastOut, setToastOut] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const addBtn = useRef<HTMLButtonElement>(null)
  const fab = useRef<HTMLButtonElement>(null)
  const sheet = useRef<Sheet>({ mode: 'sheet', x: 0, closed: 1, stop: () => {}, dragged: false, drag: null })
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [listId, setListId] = useState('')
  const [lists, setLists] = useState<List[]>([])
  const pickedList = lists.find((l) => l.id === listId)

  const loadLists = useCallback(async () => {
    const { data, error } = await supabase.from('lists').select('id, name, color').order('created_at')
    if (error) return showError(`Couldn't load lists: ${error.message}`)
    // A picked color wins; otherwise colors go by creation order (so adding a list doesn't reshuffle them). Display is A–Z.
    setLists(
      data
        .map((l, i) => ({ ...l, color: l.color ?? LIST_COLORS[i % LIST_COLORS.length] }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    )
  }, [])
  useLoad(loadLists)

  // Pull down from the top to refresh (fingers only; the installed app has no browser pull-to-refresh).
  const [pull, setPull] = useState(0)
  const [spinning, setSpinning] = useState(false)
  useEffect(() => {
    let start: { x: number; y: number } | null = null
    let dist = 0
    let stop = () => {}
    let timer = 0
    const set = (x: number) => {
      dist = x
      setPull(x)
    }
    const settle = (to: number, onDone?: () => void) => (stop = spring(dist, to, { onUpdate: set, onDone }))
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0] as Touch & { touchType?: string }
      // Not for the Pencil, the ink canvas in finger-draw mode, or a touch that starts below the top of the page.
      start =
        e.touches.length === 1 && window.scrollY <= 0 && t.touchType !== 'stylus' && getComputedStyle(e.target as Element).touchAction !== 'none'
          ? { x: t.clientX, y: t.clientY }
          : null
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const dy = e.touches[0].clientY - start.y
      const dx = Math.abs(e.touches[0].clientX - start.x)
      if (window.scrollY > 0 || dy < 0 || dx > dy) {
        start = null
        return settle(0)
      }
      stop()
      clearTimeout(timer)
      setSpinning(false)
      // Resistance grows the further you pull, like the native rubber band.
      set(rubberband(dy, window.innerHeight))
    }
    const onEnd = () => {
      if (!start) return
      start = null
      if (dist < PULL) return settle(0)
      refresh()
      setSpinning(true)
      settle(PULL)
      timer = setTimeout(() => {
        setSpinning(false)
        settle(0)
      }, 600)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      stop()
      clearTimeout(timer)
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const openQuickAdd = useCallback(
    (trigger?: HTMLElement) => {
      // Default to the list tab last picked on Home.
      const tab = readListTab()
      setListId(lists.some((l) => l.id === tab) ? tab : '')
      const el = dialog.current
      if (!el || el.open) return
      const s = sheet.current
      s.stop()
      el.removeAttribute('style')
      s.mode = matchMedia('(min-width: 48rem)').matches ? 'pop' : 'sheet'
      el.showModal()
      if (s.mode === 'sheet') s.closed = el.offsetHeight
      else {
        // Grow out of whatever opened it (the n shortcut uses whichever Add button is on screen).
        const t = trigger ?? [addBtn.current, fab.current].find((b) => b?.checkVisibility({ visibilityProperty: true }))
        const r = el.getBoundingClientRect()
        const o = t?.getBoundingClientRect()
        if (o) el.style.transformOrigin = `${o.left + o.width / 2 - r.left}px ${o.top + o.height / 2 - r.top}px`
        s.closed = 100
      }
      renderSheet(el, s, s.closed)
      animateSheet(el, s, 0)
    },
    [lists],
  )

  // Leave along the path it came in on, then actually close.
  function closeSheet(velocity = 0) {
    const el = dialog.current
    if (!el?.open) return
    const s = sheet.current
    if (reduceMotion()) {
      s.stop()
      el.style.transition = 'opacity 200ms ease'
      el.style.opacity = '0'
      el.style.setProperty('--sheet-p', '0')
      const timer = setTimeout(() => el.close(), 200)
      s.stop = () => clearTimeout(timer)
      return
    }
    animateSheet(el, s, s.closed, velocity, () => el.close())
  }

  // Phone sheet: drag down to dismiss, from the handle, header or background (not from the fields).
  function onSheetDown(e: PointerEvent<HTMLDialogElement>) {
    const s = sheet.current
    s.dragged = false
    const el = e.currentTarget
    if (s.mode !== 'sheet' || !e.isPrimary || (e.target as Element).closest('input, select, textarea, button')) return
    if (e.clientY < el.getBoundingClientRect().top) return // the backdrop
    s.drag = { id: e.pointerId, grab: e.clientY - s.x, captured: false, vt: velocityTracker() }
  }
  function onSheetMove(e: PointerEvent<HTMLDialogElement>) {
    const s = sheet.current
    const d = s.drag
    if (!d || e.pointerId !== d.id) return
    if (!d.captured) {
      // A little hysteresis so a tap on the header stays a tap.
      if (Math.abs(e.clientY - d.grab - s.x) < 8) return
      e.currentTarget.setPointerCapture(e.pointerId)
      d.captured = true
      s.stop() // catch it mid-flight
      d.grab = e.clientY - s.x
    }
    const y = e.clientY - d.grab
    // Track 1:1 downward; resist progressively upward.
    const x = y < 0 ? rubberband(y, s.closed) : y
    d.vt.add(x)
    renderSheet(e.currentTarget, s, x)
  }
  function onSheetUp(e: PointerEvent<HTMLDialogElement>) {
    const s = sheet.current
    const d = s.drag
    if (!d || e.pointerId !== d.id) return
    s.drag = null
    if (!d.captured) return
    s.dragged = true // the click that follows isn't a tap outside
    const v = d.vt.get()
    // Decide by where the flick is heading, then hand its velocity to the spring.
    if (s.x + project(v) > s.closed / 2) closeSheet(v)
    else animateSheet(e.currentTarget, s, 0, v)
  }

  useEffect(() => {
    const onError = (e: Event) => {
      setError((e as CustomEvent<string>).detail)
      setErrorOut(false)
    }
    const onToast = (e: Event) => {
      setToast((e as CustomEvent<Toast>).detail)
      setToastOut(false)
    }
    // Desktop shortcuts: n = new task, / = search. Ignored while typing in a field.
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || dialog.current?.open) return
      if (e.key === 'n') {
        e.preventDefault()
        openQuickAdd()
      } else if (e.key === '/') {
        e.preventDefault()
        navigate('/search')
      }
    }
    window.addEventListener('app-error', onError)
    window.addEventListener('app-toast', onToast)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('app-error', onError)
      window.removeEventListener('app-toast', onToast)
      window.removeEventListener('keydown', onKey)
    }
  }, [navigate, openQuickAdd])

  // Toasts leave after 5 seconds; a new one restarts the clock.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToastOut(true), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  async function quickAdd(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    const { error } = await supabase
      .from('tasks')
      .insert({ text: t, due_date: due || null, page_id: pageId ?? null, list_id: listId || null })
    if (error) return showError(`Couldn't add task: ${error.message}`)
    setText('')
    setDue('')
    closeSheet()
    refresh()
  }

  const signOut = () => supabase.auth.signOut()
  const sideLink = ({ isActive }: { isActive: boolean }) =>
    `press flex h-11 items-center gap-2.5 rounded-xl px-3 font-medium [&_svg]:size-5 ${isActive ? 'bg-accent/12 text-accent-text' : 'text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/8'}`

  return (
    <ListsContext.Provider value={lists}>
      <div className="min-h-dvh md:flex">
        {(pull > 0 || spinning) && (
          <div
            aria-hidden
            style={{ transform: `translateY(${pull}px)`, opacity: Math.min(1, pull / PULL) }}
            className={`glass fixed top-[env(safe-area-inset-top)] left-1/2 z-50 -mt-8 -ml-5 grid size-10 place-items-center rounded-full ${pull >= PULL || spinning ? 'text-accent-text' : 'text-neutral-400'}`}
          >
            {/* The arc draws in as you pull; once it's a refresh, it spins. */}
            <svg viewBox="0 0 24 24" className={`size-5 -rotate-90 ${spinning ? 'animate-spin motion-reduce:animate-none' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle
                cx="12"
                cy="12"
                r="9"
                strokeDasharray={spinning ? `${ARC * 0.7} ${ARC}` : ARC}
                strokeDashoffset={spinning ? 0 : ARC * (1 - Math.min(1, pull / PULL))}
              />
            </svg>
          </div>
        )}

        {/* Scroll edge effect (phones): content softens under the status bar and the floating tab bar. */}
        <div aria-hidden className="scroll-edge scroll-edge-top md:hidden" />
        <div aria-hidden className="scroll-edge scroll-edge-bottom md:hidden" />

        {/* iPad / desktop */}
        {/* Floating glass sidebar, inset from the window edge like iPadOS 26. Hiding slides it off the left edge. */}
        <nav
          inert={!sidebarOpen}
          className={`glass sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-56 shrink-0 flex-col gap-1 rounded-[1.75rem] p-3 transition-[margin,translate,opacity,visibility] duration-500 ease-(--ease-spring) motion-reduce:transition-[opacity,visibility] motion-reduce:duration-200 md:flex ${sidebarOpen ? '' : 'invisible -ml-56 -translate-x-6 opacity-0'}`}
        >
          <div className="flex items-center justify-between py-1.5 pl-3">
            <span className="text-lg font-bold tracking-[0.18em] text-accent-text">SITREP</span>
            <button onClick={toggleSidebar} aria-label="Hide sidebar" className="press grid size-10 place-items-center rounded-full text-neutral-500 hover:bg-black/5 dark:hover:bg-white/8">
              <SidebarIcon />
            </button>
          </div>
          <button
            ref={addBtn}
            onClick={(e) => openQuickAdd(e.currentTarget)}
            className="press mb-2 flex h-11 items-center justify-between rounded-full bg-accent px-4 font-medium text-white shadow-sm hover:bg-accent-hover"
          >
            + Add task
            <kbd className="rounded bg-white/20 px-1.5 text-xs pointer-coarse:hidden">N</kbd>
          </button>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={sideLink}>
              {n.icon}
              <span className="flex-1">{n.label}</span>
              {n.to === '/search' && <kbd className="text-xs text-neutral-400 pointer-coarse:hidden">/</kbd>}
            </NavLink>
          ))}
          <div className="mt-auto px-3 pt-3 text-sm">
            <div className="truncate text-neutral-500">{email}</div>
            <button onClick={signOut} className="h-10 font-medium text-accent-text hover:underline">
              Sign out
            </button>
          </div>
        </nav>

        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            aria-label="Show sidebar"
            className="glass press fixed top-3 left-3 z-30 hidden size-11 place-items-center rounded-full text-neutral-600 md:grid dark:text-neutral-300"
          >
            <SidebarIcon />
          </button>
        )}

        <main
          className={`min-w-0 flex-1 pb-36 transition-[padding] duration-500 ease-(--ease-spring) md:pb-0 ${sidebarOpen ? '' : 'md:pl-14'}`}
        >
          <Outlet />
        </main>

        {/* Floating Add button: always on a phone (above the bottom bar); on iPad/desktop only on session pages. */}
        <button
          ref={fab}
          onClick={(e) => openQuickAdd(e.currentTarget)}
          aria-label={pageId ? 'Add action item' : 'Add task'}
          // Accent-tinted glass: solid color sits on the material, with a bright top edge catching light.
          className={`press fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 grid size-15 place-items-center rounded-full bg-accent/90 text-3xl leading-none text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_8px_24px_rgb(0_0_0/0.25)] backdrop-blur-xl hover:bg-accent-hover ${pageId ? 'md:right-6 md:bottom-6' : 'md:hidden'}`}
        >
          +
        </button>
        {/* Phone tab bar: a floating glass capsule; content scrolls underneath. */}
        <nav className="glass fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-22 z-30 flex h-15 rounded-full p-1 md:hidden">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `press flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-semibold tracking-wide ${isActive ? 'bg-accent/12 text-accent-text' : 'text-neutral-600 dark:text-neutral-400'}`
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Phones: a bottom sheet you can drag down. iPad/desktop: a centered card that grows from its trigger. */}
        <dialog
          ref={dialog}
          onClick={(e) => {
            // Tap outside to close (but not the click that ends a drag).
            if (e.target === dialog.current && !sheet.current.dragged) closeSheet()
          }}
          onCancel={(e) => {
            // Escape: animate out instead of vanishing.
            e.preventDefault()
            closeSheet()
          }}
          onClose={(e) => {
            sheet.current.stop()
            e.currentTarget.removeAttribute('style')
          }}
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          className="sheet glass m-auto w-[min(32rem,calc(100%-2rem))] rounded-[1.75rem] p-0 text-inherit backdrop:bg-black/30 max-md:mb-0 max-md:w-full max-md:max-w-full max-md:touch-none max-md:rounded-b-none max-md:border-b-0"
        >
          <form onSubmit={quickAdd} className="flex flex-col gap-3 p-5 max-md:pt-2 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div aria-hidden className="mx-auto mb-1 h-1.5 w-9 rounded-full bg-neutral-400/50 md:hidden" />
            <label htmlFor="quick-add" className="text-lg font-semibold tracking-tight">
              {pageId ? 'Add action item to this session' : 'Add task'}
            </label>
            <input
              id="quick-add"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs doing?"
              enterKeyHint="done"
              className="h-12 w-full rounded-xl bg-black/5 px-4 text-base outline-none focus:ring-2 focus:ring-accent/40 dark:bg-white/8"
            />
            <div className="flex flex-wrap items-center gap-3">
              <DatePicker
                value={due || null}
                onChange={(d) => setDue(d ?? '')}
                label="Due date (optional)"
                className="press flex h-11 items-center gap-2 rounded-full bg-black/5 px-4 text-sm text-neutral-700 dark:bg-white/8 dark:text-neutral-300"
              >
                <svg viewBox="0 0 20 20" className="size-4 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <rect x="3" y="4.5" width="14" height="12" rx="2" />
                  <path d="M3 8.5h14M7 3v3M13 3v3" />
                </svg>
                {due ? dueLabel(due) : 'Due date'}
              </DatePicker>
              {lists.length > 0 && (
                <ListPicker
                  value={listId}
                  onChange={(id) => setListId(id ?? '')}
                  className="press flex h-11 min-w-0 items-center gap-2 rounded-full bg-black/5 px-4 text-sm text-neutral-700 dark:bg-white/8 dark:text-neutral-300"
                >
                  <span
                    style={{ backgroundColor: pickedList?.color }}
                    className={`size-2.5 shrink-0 rounded-full ${pickedList ? '' : 'border-2 border-neutral-400'}`}
                  />
                  <span className="truncate">{pickedList?.name ?? 'No list'}</span>
                  <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="m6 8 4 4 4-4" />
                  </svg>
                </ListPicker>
              )}
              <button type="button" onClick={() => closeSheet()} className="press ml-auto h-11 rounded-full px-4 font-medium text-neutral-600 dark:text-neutral-300">
                Cancel
              </button>
              <button className="press h-11 rounded-full bg-accent px-5 font-semibold text-white hover:bg-accent-hover">Add</button>
            </div>
          </form>
        </dialog>

        {toast && (
          <div
            role="status"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && toastOut) setToast(null)
            }}
            className={`glass fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-full py-1.5 pr-2 pl-5 text-sm font-medium md:bottom-6 ${toastOut ? 'toast-out' : 'toast-in'}`}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo?.()
                  setToastOut(true)
                }}
                className="press h-10 rounded-full px-4 font-semibold text-accent-text hover:bg-accent/10"
              >
                Undo
              </button>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && errorOut) setError(null)
            }}
            className={`fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 pl-4 text-sm text-red-800 shadow-xl dark:border-red-900 dark:bg-red-950 dark:text-red-200 ${errorOut ? 'banner-out' : 'banner-in'}`}
          >
            <span className="flex-1">{error}</span>
            <button onClick={() => setErrorOut(true)} aria-label="Dismiss" className="-m-2.5 size-11 shrink-0 text-lg leading-none">
              ×
            </button>
          </div>
        )}
      </div>
    </ListsContext.Provider>
  )
}

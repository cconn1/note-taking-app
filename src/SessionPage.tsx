import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import Notes from './Notes'
import TaskItem from './TaskItem'
import { refresh, showError, showToast, useLoad } from './lib/app'
import { byDue } from './lib/dates'
import { PAGE_TYPES, supabase, type Page, type PageType, type Task } from './lib/supabase'

const meta =
  'h-9 rounded-full bg-surface px-3 text-sm font-medium text-neutral-600 shadow-sm outline-none focus:ring-2 focus:ring-accent/40 dark:text-neutral-300'

// "Thu, Oct 8", with the year only when it isn't this year.
function friendlyDate(day: string) {
  const d = new Date(day + 'T00:00')
  const year = d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year })
}

const bone = 'animate-pulse bg-black/5 motion-reduce:animate-none dark:bg-white/8'

// Same shape as the page (date pill + title, action items, notes tabs + card), so nothing jumps when it loads.
function Skeleton() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-3 md:px-8 md:py-5" aria-busy="true" aria-label="Loading session">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`${bone} h-9 w-28 rounded-full`} />
        <div className={`${bone} h-8 w-full max-w-72 rounded-xl`} />
      </div>
      <div className={`${bone} h-12 rounded-[1.25rem]`} />
      <div className={`${bone} h-10 w-56 rounded-full`} />
      <div className={`${bone} h-[calc(100dvh-13rem)] rounded-[1.25rem]`} />
    </div>
  )
}

export default function SessionPage() {
  const id = useParams().id!
  const navigate = useNavigate()
  const location = useLocation()
  const [page, setPage] = useState<Page | null>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [showDone, setShowDone] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)

  // Close the ••• menu on a tap outside it or Escape.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenu(false)
      menuButton.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      supabase.from('pages').select('id, title, date, type, notes, notes_updated_at, ink, ink_updated_at, updated_at').eq('id', id).maybeSingle(),
      supabase.from('tasks').select('*').eq('page_id', id),
    ])
    if (p.error || t.error) return showError(`Couldn't load session: ${(p.error ?? t.error)!.message}`)
    setPage(p.data)
    setTasks(t.data)
  }, [id])
  useLoad(load)

  async function updatePage(patch: Partial<Page>) {
    setPage((p) => p && { ...p, ...patch })
    const { error } = await supabase.from('pages').update(patch).eq('id', id)
    if (error) showError(`Couldn't save session: ${error.message}`)
  }

  async function deletePage() {
    setMenu(false)
    // Snapshot the row and which tasks belonged to it, so Undo can put everything back.
    const [p, t] = await Promise.all([
      supabase.from('pages').select('id, title, date, type, notes, ink, created_at').eq('id', id).single(),
      supabase.from('tasks').select('id').eq('page_id', id),
    ])
    if (p.error || t.error) return showError(`Couldn't delete session: ${(p.error ?? t.error)!.message}`)
    const taskIds = t.data.map((x) => x.id)
    // Its tasks are kept, just no longer tied to a session (foreign key: on delete set null).
    const { error } = await supabase.from('pages').delete().eq('id', id)
    if (error) return showError(`Couldn't delete session: ${error.message}`)
    navigate('/', { replace: true })
    showToast({
      message: 'Session deleted',
      undo: async () => {
        const { error } = await supabase.from('pages').insert(p.data)
        if (error) return showError(`Couldn't restore session: ${error.message}`)
        if (taskIds.length) {
          const { error } = await supabase.from('tasks').update({ page_id: id }).in('id', taskIds)
          if (error) showError(`Couldn't restore action items: ${error.message}`)
        }
        refresh()
        navigate(`/sessions/${id}`)
      },
    })
  }

  const replace = (t: Task) => setTasks((ts) => ts.map((x) => (x.id === t.id ? t : x)))
  // Deleting a parent deletes its subtasks too.
  const drop = (taskId: string) => setTasks((ts) => ts.filter((x) => x.id !== taskId && x.parent_id !== taskId))

  if (page === undefined) return <Skeleton />
  if (page === null)
    return (
      <div className="p-8 text-center text-neutral-500">
        This session no longer exists.{' '}
        <Link to="/" className="text-accent-text underline">
          Go Home
        </Link>
      </div>
    )

  const open = tasks.filter((t) => !t.completed_at && !t.parent_id).sort(byDue)
  const subtasksOf = (id: string) => tasks.filter((t) => t.parent_id === id).sort((a, b) => a.sort_order - b.sort_order)
  const done = tasks.filter((t) => t.completed_at && !t.parent_id).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))

  return (
    // Fades in over the skeleton's place on first render (@starting-style).
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-3 transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none md:px-8 md:py-5">
      {/* One compact row: date, title, type, •••. On a phone: date, type and ••• on top, title below. */}
      <header className="flex flex-wrap items-center gap-x-1 gap-y-0">
        <button
          // Back to wherever you came from (Home, Sessions or Search); Home if opened directly.
          onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
          aria-label="Back"
          className="press glass mr-1 grid size-10 place-items-center rounded-full text-2xl leading-none text-accent-text md:hidden"
        >
          ‹
        </button>
        {/* Friendly label over an invisible native picker, like the due chip on tasks. */}
        <label className={`${meta} relative flex shrink-0 cursor-pointer items-center focus-within:ring-2 focus-within:ring-accent/40`}>
          {friendlyDate(page.date)}
          <input
            type="date"
            aria-label="Date"
            value={page.date}
            onChange={(e) => e.target.value && updatePage({ date: e.target.value })}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker()
              } catch {
                // Older browsers open the picker on tap anyway.
              }
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:basis-48 sm:items-center">
          <textarea
            key={page.title}
            // Width follows the text (field-sizing), so the type sits right after the name;
            // a long title wraps instead of being cut off.
            rows={1}
            defaultValue={page.title}
            aria-label="Session title"
            placeholder="Untitled"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault() // titles are one line; Enter saves
              e.currentTarget.blur()
            }}
            onBlur={(e) => e.target.value !== page.title && updatePage({ title: e.target.value.trim() })}
            className="order-last w-full max-w-full min-w-0 basis-full resize-none rounded-xl bg-transparent px-1.5 py-1 text-2xl leading-8 font-bold tracking-[-0.02em] outline-none field-sizing-content sm:order-none sm:w-auto sm:basis-auto hover:bg-black/4 focus:bg-surface focus:ring-2 focus:ring-accent/40 dark:hover:bg-white/6"
          />
          <select
            aria-label="Type"
            value={page.type}
            onChange={(e) => updatePage({ type: e.target.value as PageType })}
            className={`${meta} shrink-0`}
          >
            {PAGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div ref={menuRef} className="relative ml-auto sm:ml-0">
          <button
            ref={menuButton}
            onClick={() => setMenu(!menu)}
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menu}
            className="press grid size-11 place-items-center rounded-full text-neutral-500 hover:bg-black/5 dark:hover:bg-white/8"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <circle cx="4" cy="10" r="1.6" />
              <circle cx="10" cy="10" r="1.6" />
              <circle cx="16" cy="10" r="1.6" />
            </svg>
          </button>
          {menu && (
            // Grows out of the button's corner.
            <div
              role="menu"
              className="glass absolute top-full right-0 z-20 mt-1 min-w-52 origin-top-right rounded-2xl p-1 transition-[opacity,scale] duration-200 ease-[var(--ease-spring)] starting:scale-90 starting:opacity-0 motion-reduce:transition-none"
            >
              <button
                role="menuitem"
                autoFocus
                onClick={deletePage}
                className="press flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-medium text-red-600 outline-none hover:bg-black/5 focus-visible:bg-black/5 dark:text-red-400 dark:hover:bg-white/8 dark:focus-visible:bg-white/8"
              >
                <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10M9 9v4M11 9v4" />
                </svg>
                Delete session
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Action items dropdown. Add new ones with the + button. */}
      {/* Open/close animates its height where supported (interpolate-size); elsewhere it snaps. */}
      <details className="group surface overflow-hidden [interpolate-size:allow-keywords] details-content:h-0 details-content:overflow-hidden details-content:transition-[height,content-visibility] details-content:transition-discrete details-content:duration-300 details-content:ease-[var(--ease-spring)] open:details-content:h-auto motion-reduce:details-content:transition-none">
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 font-medium select-none [&::-webkit-details-marker]:hidden">
          <span className="text-neutral-400 transition-transform duration-300 ease-[var(--ease-spring)] group-open:rotate-90">▸</span>
          Action items
          <span className="ml-auto rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-semibold text-accent-text">{open.length} open</span>
        </summary>
        <div className="border-t border-separator px-1 pb-1">
          {open.length === 0 && <p className="px-2 py-3 text-sm text-neutral-500">No open action items. Tap + to add one.</p>}
          <ul className="divide-y divide-separator">
            {open.map((t) => (
              <TaskItem key={t.id} task={t} subtasks={subtasksOf(t.id)} onChange={replace} onDelete={drop} />
            ))}
          </ul>
          {done.length > 0 && (
            <>
              <button onClick={() => setShowDone(!showDone)} className="h-10 px-3 text-sm font-medium text-accent-text hover:underline">
                {showDone ? 'Hide' : 'Show'} completed ({done.length})
              </button>
              {showDone && (
                <ul className="divide-y divide-separator">
                  {done.map((t) => (
                    <TaskItem key={t.id} task={t} subtasks={subtasksOf(t.id)} onChange={replace} onDelete={drop} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </details>

      <Notes key={id} pageId={id} page={page} />
    </div>
  )
}

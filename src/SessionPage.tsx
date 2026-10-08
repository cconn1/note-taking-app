import { useCallback, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import Notes from './Notes'
import TaskItem from './TaskItem'
import { showError, useLoad } from './lib/app'
import { byDue } from './lib/dates'
import { PAGE_TYPES, supabase, type Page, type PageType, type Task } from './lib/supabase'

const meta =
  'h-9 rounded-lg border border-transparent bg-transparent px-1.5 text-sm text-neutral-600 outline-none hover:border-neutral-200 focus:border-accent dark:text-neutral-400 dark:hover:border-neutral-800'

export default function SessionPage() {
  const id = useParams().id!
  const navigate = useNavigate()
  const location = useLocation()
  const [page, setPage] = useState<Page | null>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [showDone, setShowDone] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      supabase.from('pages').select('id, title, date, type, notes, notes_updated_at, updated_at').eq('id', id).maybeSingle(),
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
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    // Its tasks move to the Inbox (foreign key: on delete set null).
    const { error } = await supabase.from('pages').delete().eq('id', id)
    if (error) return showError(`Couldn't delete session: ${error.message}`)
    navigate('/', { replace: true })
  }

  const replace = (t: Task) => setTasks((ts) => ts.map((x) => (x.id === t.id ? t : x)))
  const drop = (taskId: string) => setTasks((ts) => ts.filter((x) => x.id !== taskId))

  if (page === undefined) return null
  if (page === null)
    return (
      <div className="p-8 text-center text-neutral-500">
        This session no longer exists.{' '}
        <Link to="/" className="text-accent-text underline">
          Go Home
        </Link>
      </div>
    )

  const open = tasks.filter((t) => !t.completed_at).sort(byDue)
  const done = tasks.filter((t) => t.completed_at).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-3 md:px-8 md:py-5">
      {/* One compact row: date, title, type, delete. Wraps on a phone. */}
      <header className="flex flex-wrap items-center gap-x-1 gap-y-0">
        <button
          // Back to wherever you came from (Home, Sessions or Search); Home if opened directly.
          onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
          aria-label="Back"
          className="-ml-2 grid size-10 place-items-center text-2xl text-neutral-500 md:hidden"
        >
          ‹
        </button>
        <input
          type="date"
          aria-label="Date"
          value={page.date}
          onChange={(e) => e.target.value && updatePage({ date: e.target.value })}
          className={meta}
        />
        <input
          key={page.title}
          defaultValue={page.title}
          aria-label="Session title"
          placeholder="Untitled"
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => e.target.value !== page.title && updatePage({ title: e.target.value.trim() })}
          className="min-w-0 flex-1 basis-48 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xl font-semibold tracking-tight outline-none hover:border-neutral-200 focus:border-accent dark:hover:border-neutral-800"
        />
        <select
          aria-label="Type"
          value={page.type}
          onChange={(e) => updatePage({ type: e.target.value as PageType })}
          className={meta}
        >
          {PAGE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={deletePage}
          className={`h-9 rounded-lg px-2 text-sm ${confirmDelete ? 'bg-red-600 font-medium text-white' : 'text-neutral-400 hover:text-red-600'}`}
        >
          {confirmDelete ? 'Tap again to delete' : 'Delete'}
        </button>
      </header>

      {/* Action items dropdown. Add new ones with the + button. */}
      <details className="group rounded-xl border border-neutral-200 dark:border-neutral-800">
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 font-medium select-none [&::-webkit-details-marker]:hidden">
          <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
          Action items
          <span className="text-sm font-normal text-neutral-500">{open.length} open</span>
        </summary>
        <div className="border-t border-neutral-200 px-2 pb-1 dark:border-neutral-800">
          {open.length === 0 && <p className="px-2 py-3 text-sm text-neutral-500">No open action items. Tap + to add one.</p>}
          <ul>
            {open.map((t) => (
              <TaskItem key={t.id} task={t} onChange={replace} onDelete={drop} />
            ))}
          </ul>
          {done.length > 0 && (
            <>
              <button onClick={() => setShowDone(!showDone)} className="h-10 px-2 text-sm text-neutral-500 hover:underline">
                {showDone ? 'Hide' : 'Show'} completed ({done.length})
              </button>
              {showDone && (
                <ul>
                  {done.map((t) => (
                    <TaskItem key={t.id} task={t} onChange={replace} onDelete={drop} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </details>

      <Notes key={id} pageId={id} server={page} />
    </div>
  )
}

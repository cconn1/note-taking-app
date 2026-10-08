import { useCallback, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import Notes from './Notes'
import TaskItem from './TaskItem'
import { showError, useLoad } from './lib/app'
import { byDue } from './lib/dates'
import { PAGE_TYPES, supabase, type Page, type PageType, type Task } from './lib/supabase'

const meta =
  'h-10 rounded-lg border border-transparent bg-transparent px-2 text-sm text-neutral-600 outline-none hover:border-neutral-200 focus:border-accent dark:text-neutral-400 dark:hover:border-neutral-800'

export default function SessionPage() {
  const id = useParams().id!
  const navigate = useNavigate()
  const location = useLocation()
  const [page, setPage] = useState<Page | null>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
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

  async function addTask(e: FormEvent) {
    e.preventDefault()
    const text = newTask.trim()
    if (!text) return
    setNewTask('')
    const { data, error } = await supabase.from('tasks').insert({ text, page_id: id }).select().single()
    if (error) {
      setNewTask(text)
      return showError(`Couldn't add task: ${error.message}`)
    }
    setTasks((ts) => [...ts, data])
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
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-6 md:px-8 md:py-10">
      <header>
        <button
          // Back to wherever you came from (Home, Sessions or Search); Home if opened directly.
          onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
          className="mb-2 inline-flex h-10 items-center text-sm text-neutral-500 md:hidden"
        >
          ‹ Back
        </button>
        <input
          key={page.title}
          defaultValue={page.title}
          aria-label="Session title"
          placeholder="Untitled"
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => e.target.value !== page.title && updatePage({ title: e.target.value.trim() })}
          className="-mx-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-3xl font-semibold tracking-tight outline-none hover:border-neutral-200 focus:border-accent dark:hover:border-neutral-800"
        />
        <div className="-mx-2 mt-1 flex flex-wrap items-center gap-1">
          <input
            type="date"
            aria-label="Date"
            value={page.date}
            onChange={(e) => e.target.value && updatePage({ date: e.target.value })}
            className={meta}
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
            className={`ml-auto h-10 rounded-lg px-3 text-sm ${confirmDelete ? 'bg-red-600 font-medium text-white' : 'text-neutral-400 hover:text-red-600'}`}
          >
            {confirmDelete ? 'Tap again to delete' : 'Delete session'}
          </button>
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">Action Items</h2>
        <form onSubmit={addTask}>
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add an action item and press Enter"
            enterKeyHint="done"
            className="h-12 w-full rounded-lg border border-neutral-200 bg-transparent px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-800"
          />
        </form>
        <ul className="mt-2">
          {open.map((t) => (
            <TaskItem key={t.id} task={t} onChange={replace} onDelete={drop} />
          ))}
        </ul>
        {done.length > 0 && (
          <>
            <button onClick={() => setShowDone(!showDone)} className="mt-2 h-10 text-sm text-neutral-500 hover:underline">
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
      </section>

      <Notes key={id} pageId={id} server={page} />
    </div>
  )
}

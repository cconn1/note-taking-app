import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { NewSession } from './Sessions'
import TaskItem from './TaskItem'
import { showError, useLoad } from './lib/app'
import { byDue, DUE_GROUPS, dueGroup, formatDate, longDate, today } from './lib/dates'
import { supabase, type Page, type Task, type TaskWithPage } from './lib/supabase'

type Recent = Pick<Page, 'id' | 'title' | 'date' | 'type'>

const heading = 'text-sm font-semibold tracking-wide text-neutral-500 uppercase'

export default function Home() {
  const [tasks, setTasks] = useState<TaskWithPage[]>()
  const [recent, setRecent] = useState<Recent[]>()
  const [creating, setCreating] = useState(false)
  const [newTask, setNewTask] = useState('')

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from('tasks').select('*, pages(id, title)').is('completed_at', null),
      supabase.from('pages').select('id, title, date, type').order('updated_at', { ascending: false }).limit(6),
    ])
    if (t.error || p.error) return showError(`Couldn't load: ${(t.error ?? p.error)!.message}`)
    setTasks(t.data as TaskWithPage[])
    setRecent(p.data)
  }, [])
  useLoad(load)

  async function addInbox(e: FormEvent) {
    e.preventDefault()
    const text = newTask.trim()
    if (!text) return
    setNewTask('')
    const { data, error } = await supabase.from('tasks').insert({ text }).select('*, pages(id, title)').single()
    if (error) {
      setNewTask(text)
      return showError(`Couldn't add task: ${error.message}`)
    }
    setTasks((ts) => [...(ts ?? []), data as TaskWithPage])
  }

  // Merge so the joined session survives an update (TaskItem returns the bare row).
  const replace = (t: Task) => setTasks((ts) => ts?.map((x) => (x.id === t.id ? { ...x, ...t } : x)))
  const drop = (id: string) => setTasks((ts) => ts?.filter((x) => x.id !== id))

  const now = today()
  const open = (tasks ?? []).filter((t) => !t.completed_at).sort(byDue)
  const openCount = (pageId: string) => open.filter((t) => t.page_id === pageId).length

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500">Today</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{longDate(now)}</h1>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="h-12 rounded-lg bg-accent px-5 font-medium text-white shadow-sm hover:bg-accent-hover"
          >
            + New Session
          </button>
        )}
      </header>

      {creating && <NewSession onCancel={() => setCreating(false)} />}

      <div className="grid gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-8">
        {/* To Do */}
        <section>
          <h2 className={`${heading} mb-2`}>To Do</h2>
          <form onSubmit={addInbox}>
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add to Inbox and press Enter"
              enterKeyHint="done"
              className="h-12 w-full rounded-lg border border-neutral-200 bg-transparent px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-800"
            />
          </form>

          {tasks && open.length === 0 && (
            <p className="py-12 text-center text-neutral-500">All caught up.</p>
          )}

          {DUE_GROUPS.map((group) => {
            const items = open.filter((t) => dueGroup(t.due_date, now) === group)
            if (!items.length) return null
            const overdue = group === 'Overdue'
            return (
              <div key={group} className={`mt-6 ${overdue ? '-mx-3 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950/40' : ''}`}>
                <h3 className={`text-sm font-medium ${overdue ? 'text-red-700 dark:text-red-300' : 'text-neutral-500'}`}>
                  {group} <span className="font-normal opacity-70">{items.length}</span>
                </h3>
                <ul>
                  {items.map((t) => (
                    <TaskItem key={t.id} task={t} source={t.pages} onChange={replace} onDelete={drop} />
                  ))}
                </ul>
              </div>
            )
          })}
        </section>

        {/* Recent Sessions */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className={heading}>Recent Sessions</h2>
            <Link to="/sessions" className="text-sm font-medium text-accent-text hover:underline">
              View all
            </Link>
          </div>

          {recent?.length === 0 && !creating && (
            <button
              onClick={() => setCreating(true)}
              className="w-full rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 hover:border-accent hover:text-accent-text dark:border-neutral-700"
            >
              Start your first session
            </button>
          )}

          <ul className="flex flex-col gap-2">
            {recent?.map((p) => {
              const count = openCount(p.id)
              return (
                <li key={p.id}>
                  <Link
                    to={`/sessions/${p.id}`}
                    className="block rounded-xl border border-neutral-200 p-4 transition-colors hover:border-accent/50 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{p.title || 'Untitled'}</span>
                      {count > 0 && (
                        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-text">
                          {count} open
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-neutral-500">
                      {formatDate(p.date)} · {p.type}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <button onClick={() => supabase.auth.signOut()} className="mt-12 h-11 text-sm text-neutral-500 md:hidden">
        Sign out
      </button>
    </div>
  )
}

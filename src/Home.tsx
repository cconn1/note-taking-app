import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { NewSession } from './Sessions'
import TaskItem from './TaskItem'
import { refresh, showError, useLoad } from './lib/app'
import { LIST_TAB_KEY, readListTab, useLists } from './lib/lists'
import { byDue, DUE_GROUPS, dueGroup, formatDate, longDate, today } from './lib/dates'
import { supabase, type Page, type Task, type TaskWithPage } from './lib/supabase'

type Recent = Pick<Page, 'id' | 'title' | 'date' | 'type'>

const heading = 'text-sm font-semibold tracking-wide text-neutral-500 uppercase'

export default function Home() {
  const [tasks, setTasks] = useState<TaskWithPage[]>()
  const [recent, setRecent] = useState<Recent[]>()
  const [creating, setCreating] = useState(false)
  const lists = useLists()
  // 'all' or a list id; remembered per device (Quick Add defaults to it too).
  const [tab, setTab] = useState(readListTab)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  // Merge so the joined session survives an update (TaskItem returns the bare row).
  const replace = (t: Task) => setTasks((ts) => ts?.map((x) => (x.id === t.id ? { ...x, ...t } : x)))
  const drop = (id: string) => setTasks((ts) => ts?.filter((x) => x.id !== id))

  const activeList = lists.find((l) => l.id === tab) // undefined = All (or a deleted list)

  function pickTab(t: string) {
    setTab(t)
    setEditing(false)
    try {
      localStorage.setItem(LIST_TAB_KEY, t)
    } catch {
      // Private mode: the tab just won't stick.
    }
  }

  async function createList(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = (new FormData(e.currentTarget).get('name') as string).trim()
    setAdding(false)
    if (!name) return
    const { data, error } = await supabase.from('lists').insert({ name }).select('id').single()
    if (error) return showError(error.code === '23505' ? `You already have a list called "${name}".` : `Couldn't create list: ${error.message}`)
    pickTab(data.id)
    refresh()
  }

  async function renameList(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = (new FormData(e.currentTarget).get('name') as string).trim()
    if (!activeList || !name) return
    const { error } = await supabase.from('lists').update({ name }).eq('id', activeList.id)
    if (error) return showError(error.code === '23505' ? `You already have a list called "${name}".` : `Couldn't rename list: ${error.message}`)
    setEditing(false)
    refresh()
  }

  async function deleteList() {
    if (!activeList) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    // Its tasks stay; they just lose the label (foreign key: on delete set null).
    const { error } = await supabase.from('lists').delete().eq('id', activeList.id)
    if (error) return showError(`Couldn't delete list: ${error.message}`)
    pickTab('all')
    refresh()
  }

  const now = today()
  const open = (tasks ?? []).filter((t) => !t.completed_at).sort(byDue)
  const openCount = (pageId: string) => open.filter((t) => t.page_id === pageId).length
  const shown = activeList ? open.filter((t) => t.list_id === activeList.id) : open
  const chip = (on: boolean) =>
    `h-9 rounded-full px-3.5 text-sm font-medium ${on ? 'bg-accent text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'}`
  const small =
    'h-9 rounded-lg border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-accent dark:border-neutral-700'

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

          {/* List tabs */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <button onClick={() => pickTab('all')} aria-pressed={!activeList} className={chip(!activeList)}>
              All
            </button>
            {lists.map((l) => (
              <button key={l.id} onClick={() => pickTab(l.id)} aria-pressed={activeList?.id === l.id} className={chip(activeList?.id === l.id)}>
                {l.name}
              </button>
            ))}
            {adding ? (
              <form onSubmit={createList}>
                <input
                  name="name"
                  autoFocus
                  maxLength={40}
                  placeholder="List name"
                  enterKeyHint="done"
                  onBlur={(e) => !e.target.value.trim() && setAdding(false)}
                  className={`${small} w-36`}
                />
              </form>
            ) : (
              <button onClick={() => setAdding(true)} aria-label="New list" className={chip(false)}>
                +
              </button>
            )}
            {activeList && !editing && (
              <button onClick={() => setEditing(true)} className="h-9 px-2 text-sm text-neutral-500 hover:underline">
                Edit
              </button>
            )}
          </div>

          {editing && activeList && (
            <form key={activeList.id} onSubmit={renameList} className="mb-2 flex flex-wrap items-center gap-2">
              <input name="name" defaultValue={activeList.name} maxLength={40} aria-label="List name" className={`${small} w-44`} />
              <button className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover">Save</button>
              <button
                type="button"
                onClick={deleteList}
                className={`h-9 rounded-lg px-3 text-sm ${confirmDelete ? 'bg-red-600 font-medium text-white' : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'}`}
              >
                {confirmDelete ? 'Tap again to delete' : 'Delete list'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="h-9 px-2 text-sm text-neutral-500">
                Cancel
              </button>
            </form>
          )}

          {tasks && shown.length === 0 && (
            <p className="py-12 text-center text-neutral-500">{activeList ? `Nothing in ${activeList.name}.` : 'All caught up.'}</p>
          )}

          <div>
            {DUE_GROUPS.map((group) => {
              const items = shown.filter((t) => dueGroup(t.due_date, now) === group)
              if (!items.length) return null
              const overdue = group === 'Overdue'
              return (
                <div key={group} className={`mt-6 first-of-type:mt-2 ${overdue ? '-mx-3 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950/40' : ''}`}>
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
          </div>
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

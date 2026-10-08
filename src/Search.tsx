import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import TaskItem from './TaskItem'
import { showError } from './lib/app'
import { formatDate } from './lib/dates'
import { supabase, type Page, type Task, type TaskWithPage } from './lib/supabase'

type PageHit = Pick<Page, 'id' | 'title' | 'date' | 'type' | 'notes'>

// ilike treats % and _ as wildcards; escape them so they match literally.
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`

// ~100 characters of the notes around the first match, with the match highlighted.
function Snippet({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return null
  const start = Math.max(0, i - 40)
  return (
    <p className="mt-1 text-sm text-neutral-500">
      {start > 0 && '…'}
      {text.slice(start, i)}
      <mark className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-800">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, i + q.length + 60)}
      {i + q.length + 60 < text.length && '…'}
    </p>
  )
}

export default function Search() {
  const [params, setParams] = useSearchParams()
  // The input owns the text; the URL copy (?q=) is just so Back returns to these results.
  // Binding the input to the URL directly drops keystrokes when typing fast.
  const [q, setQ] = useState(params.get('q') ?? '')
  const [results, setResults] = useState<{ q: string; pages: PageHit[]; tasks: TaskWithPage[] }>()

  useEffect(() => {
    setParams(q ? { q } : {}, { replace: true })
    const term = q.trim()
    if (!term) return
    // Wait for a pause in typing.
    const timer = setTimeout(async () => {
      const p = pattern(term)
      const cols = 'id, title, date, type, notes'
      const [byTitle, byNotes, tasks] = await Promise.all([
        supabase.from('pages').select(cols).ilike('title', p).order('date', { ascending: false }).limit(25),
        supabase.from('pages').select(cols).ilike('notes', p).order('date', { ascending: false }).limit(25),
        supabase.from('tasks').select('*, pages(id, title)').ilike('text', p).order('created_at', { ascending: false }).limit(50),
      ])
      const error = byTitle.error ?? byNotes.error ?? tasks.error
      if (error) return showError(`Search failed: ${error.message}`)
      const titled = byTitle.data ?? []
      const pages = [...titled, ...(byNotes.data ?? []).filter((n) => !titled.some((t) => t.id === n.id))]
      setResults({ q: term, pages, tasks: (tasks.data ?? []) as TaskWithPage[] })
    }, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setParams changes identity on every navigation
  }, [q])

  const replace = (t: Task) =>
    setResults((r) => r && { ...r, tasks: r.tasks.map((x) => (x.id === t.id ? { ...x, ...t } : x)) })
  const drop = (id: string) => setResults((r) => r && { ...r, tasks: r.tasks.filter((x) => x.id !== id) })

  const shown = q.trim() && results?.q === q.trim() ? results : undefined

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <input
        autoFocus
        type="search"
        enterKeyHint="search"
        aria-label="Search"
        placeholder="Search sessions, notes and tasks"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-12 w-full rounded-lg border border-neutral-300 bg-transparent px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-700"
      />

      {shown && shown.pages.length + shown.tasks.length === 0 && (
        <p className="py-12 text-center text-neutral-500">Nothing matches “{shown.q}”.</p>
      )}

      {shown && shown.pages.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">Sessions</h2>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {shown.pages.map((p) => (
              <li key={p.id}>
                <Link to={`/sessions/${p.id}`} className="-mx-3 block rounded-lg px-3 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <span className="font-medium">{p.title || 'Untitled'}</span>
                  <span className="ml-2 text-sm text-neutral-500">
                    {formatDate(p.date)} · {p.type}
                  </span>
                  <Snippet text={p.notes} q={shown.q} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown && shown.tasks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">Tasks</h2>
          <ul>
            {shown.tasks.map((t) => (
              <TaskItem key={t.id} task={t} source={t.pages} onChange={replace} onDelete={drop} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

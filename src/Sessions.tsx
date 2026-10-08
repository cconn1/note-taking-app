import { useCallback, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { showError, useLoad } from './lib/app'
import { formatDate, today } from './lib/dates'
import { PAGE_TYPES, supabase, type Page, type PageType } from './lib/supabase'

type Row = Pick<Page, 'id' | 'title' | 'date' | 'type'>

export default function Sessions() {
  const [pages, setPages] = useState<Row[]>()
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('pages')
      .select('id, title, date, type')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return showError(`Couldn't load sessions: ${error.message}`)
    setPages(data)
  }, [])
  useLoad(load)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="h-11 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover"
          >
            + New Session
          </button>
        )}
      </header>

      {creating && <NewSession onCancel={() => setCreating(false)} />}

      <input
        type="search"
        aria-label="Filter sessions"
        placeholder="Filter by title or type"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-4 h-11 w-full rounded-lg border border-neutral-200 bg-transparent px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-800"
      />

      {pages?.length === 0 && !creating && (
        <p className="py-16 text-center text-neutral-500">No sessions yet. Start your first one.</p>
      )}

      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {pages
          ?.filter((p) => `${p.title} ${p.type}`.toLowerCase().includes(filter.trim().toLowerCase()))
          .map((p) => (
          <li key={p.id}>
            <Link
              to={`/sessions/${p.id}`}
              className="-mx-3 flex min-h-14 flex-col justify-center rounded-lg px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <span className="font-medium">{p.title || 'Untitled'}</span>
              <span className="text-sm text-neutral-500">
                {formatDate(p.date)} · {p.type}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

const field =
  'h-11 rounded-lg border border-neutral-300 bg-transparent px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-700'

export function NewSession({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today())
  const [type, setType] = useState<PageType>('Staff Meeting')
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase
      .from('pages')
      .insert({ title: title.trim() || type, date, type })
      .select('id')
      .single()
    setBusy(false)
    if (error) return showError(`Couldn't create session: ${error.message}`)
    navigate(`/sessions/${data.id}`)
  }

  return (
    <form onSubmit={create} className="mb-6 flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <input
        autoFocus
        placeholder={`Title (defaults to "${type}")`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={field}
      />
      <div className="flex flex-wrap gap-3">
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <select value={type} onChange={(e) => setType(e.target.value as PageType)} className={field}>
          {PAGE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-3">
        <button
          disabled={busy}
          className="h-11 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Create
        </button>
        <button type="button" onClick={onCancel} className="h-11 px-4 text-neutral-600 dark:text-neutral-400">
          Cancel
        </button>
      </div>
    </form>
  )
}

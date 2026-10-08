import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { refresh, showError } from './lib/app'
import { supabase } from './lib/supabase'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/sessions', label: 'Sessions', end: false },
  { to: '/search', label: 'Search', end: false },
]

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function Layout({ email }: { email?: string }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [due, setDue] = useState('')

  const openQuickAdd = () => dialog.current?.showModal()

  useEffect(() => {
    const onError = (e: Event) => setError((e as CustomEvent<string>).detail)
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
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('app-error', onError)
      window.removeEventListener('keydown', onKey)
    }
  }, [navigate])

  async function quickAdd(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    const { error } = await supabase.from('tasks').insert({ text: t, due_date: due || null })
    if (error) return showError(`Couldn't add task: ${error.message}`)
    setText('')
    setDue('')
    dialog.current?.close()
    refresh()
  }

  const signOut = () => supabase.auth.signOut()
  const sideLink = ({ isActive }: { isActive: boolean }) =>
    `flex h-11 items-center rounded-lg px-3 font-medium ${isActive ? 'bg-neutral-100 text-accent-text dark:bg-neutral-900' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900'}`

  return (
    <div className="min-h-dvh md:flex">
      {/* iPad / desktop */}
      <nav className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-1 border-r border-neutral-200 p-3 md:flex dark:border-neutral-800">
        <div className="px-3 py-3 text-lg font-semibold tracking-tight">Lists</div>
        <button
          onClick={openQuickAdd}
          className="mb-2 flex h-11 items-center justify-between rounded-lg bg-accent px-3 font-medium text-white hover:bg-accent-hover"
        >
          + Add task
          <kbd className="rounded bg-white/20 px-1.5 text-xs pointer-coarse:hidden">N</kbd>
        </button>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={sideLink}>
            <span className="flex-1">{n.label}</span>
            {n.to === '/search' && <kbd className="text-xs text-neutral-400 pointer-coarse:hidden">/</kbd>}
          </NavLink>
        ))}
        <div className="mt-auto border-t border-neutral-200 px-3 pt-3 text-sm dark:border-neutral-800">
          <div className="truncate text-neutral-500">{email}</div>
          <button onClick={signOut} className="h-10 text-neutral-600 hover:underline dark:text-neutral-400">
            Sign out
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 pb-36 md:pb-0">
        <Outlet />
      </main>

      {/* Phone: floating Add button above the bottom bar */}
      <button
        onClick={openQuickAdd}
        aria-label="Add task"
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] grid size-14 place-items-center rounded-full bg-accent text-3xl leading-none text-white shadow-lg hover:bg-accent-hover md:hidden"
      >
        +
      </button>
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-neutral-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-950/90">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex h-14 flex-1 items-center justify-center text-sm font-medium ${isActive ? 'text-accent-text' : 'text-neutral-500'}`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <dialog
        ref={dialog}
        onClick={(e) => e.target === dialog.current && dialog.current.close()} // tap outside to close
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border border-neutral-200 bg-white p-0 text-inherit shadow-2xl backdrop:bg-black/40 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <form onSubmit={quickAdd} className="flex flex-col gap-3 p-4">
          <label htmlFor="quick-add" className="text-sm font-medium text-neutral-500">
            Add to Inbox
          </label>
          <input
            id="quick-add"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs doing?"
            enterKeyHint="done"
            className="h-12 w-full rounded-lg border border-neutral-300 bg-transparent px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-700"
          />
          <div className="flex items-center gap-3">
            <input
              type="date"
              aria-label="Due date (optional)"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-11 rounded-lg border border-neutral-300 bg-transparent px-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
            />
            <button type="button" onClick={() => dialog.current?.close()} className="ml-auto h-11 px-3 text-neutral-500">
              Cancel
            </button>
            <button className="h-11 rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover">Add</button>
          </div>
        </form>
      </dialog>

      {error && (
        <div
          role="alert"
          className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="-m-1 size-8 shrink-0 text-lg leading-none">
            ×
          </button>
        </div>
      )}
    </div>
  )
}

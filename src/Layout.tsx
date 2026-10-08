import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { refresh, showError, type Toast } from './lib/app'
import { supabase } from './lib/supabase'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/sessions', label: 'Sessions', end: false },
  { to: '/search', label: 'Search', end: false },
]

const SidebarIcon = () => (
  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
    <path d="M7.5 3.5v13" />
  </svg>
)

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function Layout({ email }: { email?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // On a session page, Quick Add files tasks into that session instead of the Inbox.
  const pageId = useMatch('/sessions/:id')?.params.id
  // The sidebar starts hidden on session pages (room for notes) and shown elsewhere.
  // A toggle only lasts until you navigate to another screen.
  const [sidebarPref, setSidebarPref] = useState<{ path: string; open: boolean } | null>(null)
  const sidebarOpen = sidebarPref?.path === pathname ? sidebarPref.open : !pageId
  const toggleSidebar = () => setSidebarPref({ path: pathname, open: !sidebarOpen })
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [due, setDue] = useState('')

  const openQuickAdd = () => dialog.current?.showModal()

  useEffect(() => {
    const onError = (e: Event) => setError((e as CustomEvent<string>).detail)
    const onToast = (e: Event) => setToast((e as CustomEvent<Toast>).detail)
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
  }, [navigate])

  // Toasts disappear after 5 seconds; a new one restarts the clock.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  async function quickAdd(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    const { error } = await supabase.from('tasks').insert({ text: t, due_date: due || null, page_id: pageId ?? null })
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
      <nav
        className={`sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-1 border-r border-neutral-200 p-3 dark:border-neutral-800 ${sidebarOpen ? 'md:flex' : ''}`}
      >
        <div className="flex items-center justify-between py-1.5 pl-3">
          <span className="text-lg font-semibold tracking-tight">SITREP</span>
          <button onClick={toggleSidebar} aria-label="Hide sidebar" className="grid size-10 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900">
            <SidebarIcon />
          </button>
        </div>
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

      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          aria-label="Show sidebar"
          className="fixed top-3 left-3 z-30 hidden size-10 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:grid dark:hover:bg-neutral-900"
        >
          <SidebarIcon />
        </button>
      )}

      <main className={`min-w-0 flex-1 pb-36 md:pb-0 ${sidebarOpen ? '' : 'md:pl-12'}`}>
        <Outlet />
      </main>

      {/* Floating Add button: always on a phone (above the bottom bar); on iPad/desktop only on session pages. */}
      <button
        onClick={openQuickAdd}
        aria-label={pageId ? 'Add action item' : 'Add task'}
        className={`fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-accent text-3xl leading-none text-white shadow-lg hover:bg-accent-hover ${pageId ? 'md:right-6 md:bottom-6' : 'md:hidden'}`}
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
            {pageId ? 'Add action item to this session' : 'Add to Inbox'}
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

      {toast && (
        <div
          role="status"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 right-20 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg md:right-4 md:bottom-6 dark:bg-neutral-100 dark:text-neutral-900"
        >
          <span className="flex-1">{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.()
                setToast(null)
              }}
              className="-my-1 h-10 px-2 font-semibold text-tan dark:text-accent"
            >
              Undo
            </button>
          )}
        </div>
      )}

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

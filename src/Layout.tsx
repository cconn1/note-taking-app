import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { supabase } from './lib/supabase'

const NAV = [{ to: '/sessions', label: 'Sessions' }]

export default function Layout({ email }: { email?: string }) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onError = (e: Event) => setError((e as CustomEvent<string>).detail)
    window.addEventListener('app-error', onError)
    return () => window.removeEventListener('app-error', onError)
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <div className="min-h-dvh md:flex">
      {/* iPad / desktop */}
      <nav className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-neutral-200 p-3 md:flex dark:border-neutral-800">
        <div className="px-3 py-3 text-lg font-semibold tracking-tight">Lists</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `flex h-11 items-center rounded-lg px-3 font-medium ${isActive ? 'bg-neutral-100 text-accent-text dark:bg-neutral-900' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900'}`
            }
          >
            {n.label}
          </NavLink>
        ))}
        <div className="mt-auto border-t border-neutral-200 px-3 pt-3 text-sm dark:border-neutral-800">
          <div className="truncate text-neutral-500">{email}</div>
          <button onClick={signOut} className="h-10 text-neutral-600 hover:underline dark:text-neutral-400">
            Sign out
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>

      {/* Phone */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-neutral-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-950/90">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `flex h-14 flex-1 items-center justify-center text-sm font-medium ${isActive ? 'text-accent-text' : 'text-neutral-500'}`
            }
          >
            {n.label}
          </NavLink>
        ))}
        <button onClick={signOut} className="flex h-14 flex-1 items-center justify-center text-sm text-neutral-500">
          Sign out
        </button>
      </nav>

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

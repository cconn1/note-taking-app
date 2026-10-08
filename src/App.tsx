import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import Login from './Login'
import { supabase } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login />

  // Placeholder until Phase 2.
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Lists</h1>
      <p className="text-neutral-600 dark:text-neutral-400">Signed in as {session.user.email}</p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="h-12 rounded-lg border border-neutral-300 px-4 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Sign out
      </button>
    </main>
  )
}

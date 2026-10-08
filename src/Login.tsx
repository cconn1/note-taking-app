import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

const input =
  'h-12 w-full rounded-lg border border-neutral-300 bg-transparent px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-700'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message) // success: App's onAuthStateChange takes over
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Lists</h1>

      <form onSubmit={signIn} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm text-neutral-600 dark:text-neutral-400">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <label htmlFor="password" className="text-sm text-neutral-600 dark:text-neutral-400">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <button
          disabled={busy}
          className="mt-2 h-12 w-full rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </main>
  )
}

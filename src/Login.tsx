import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

const input =
  'h-12 w-full rounded-lg border border-neutral-300 bg-transparent px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-700'
const button =
  'h-12 w-full rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover disabled:opacity-50'

export default function Login({ linkError }: { linkError: string | null }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(linkError)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin + location.pathname },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
    setBusy(false)
    if (error) setError(error.message) // success: App's onAuthStateChange takes over
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Lists</h1>

      {!sent ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm text-neutral-600 dark:text-neutral-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          <button disabled={busy} className={button}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <label htmlFor="code" className="text-sm text-neutral-600 dark:text-neutral-400">
            Enter the code sent to {email}, or tap the link in the email.
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={`${input} text-center text-xl tracking-[0.4em]`}
          />
          <button disabled={busy} className={button}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => (setSent(false), setCode(''), setError(null))}
            className="h-12 text-sm text-neutral-600 hover:underline dark:text-neutral-400"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </main>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

async function boot() {
  const { supabase } = await import('./lib/supabase')
  const { default: App } = await import('./App')

  // A sign-in link lands on #access_token=… (or #error=… if expired). Let supabase-js read it,
  // then strip it before the router ever sees the hash.
  const params = new URLSearchParams(location.hash.slice(1))
  await supabase.auth.initialize()
  if (params.has('access_token') || params.has('error')) {
    history.replaceState(null, '', location.pathname + location.search)
  }

  root.render(
    <StrictMode>
      <App linkError={params.get('error_description')} />
    </StrictMode>,
  )
}

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  root.render(
    <p className="p-6">
      Missing <code>VITE_SUPABASE_URL</code> or <code>VITE_SUPABASE_ANON_KEY</code>. Copy{' '}
      <code>.env.example</code> to <code>.env.local</code>, fill it in, and restart <code>npm run dev</code>.
    </p>,
  )
} else {
  boot()
}

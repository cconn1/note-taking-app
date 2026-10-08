import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  root.render(
    <p className="p-6">
      Missing <code>VITE_SUPABASE_URL</code> or <code>VITE_SUPABASE_ANON_KEY</code>. Copy{' '}
      <code>.env.example</code> to <code>.env.local</code>, fill it in, and restart <code>npm run dev</code>.
    </p>,
  )
} else {
  // Imported only after the env check, because creating the Supabase client throws without them.
  import('./App').then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}

// Installable app + instant startup. Production only, so local dev always serves fresh files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
}

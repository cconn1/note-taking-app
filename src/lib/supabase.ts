import { createClient } from '@supabase/supabase-js'

// Default implicit flow: a sign-in link works even when opened in a different browser or device.
// main.tsx checks the env vars before this module loads.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

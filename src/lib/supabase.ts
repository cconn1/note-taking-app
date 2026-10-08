import { createClient } from '@supabase/supabase-js'

// main.tsx checks the env vars before this module loads.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

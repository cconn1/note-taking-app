import { createClient } from '@supabase/supabase-js'
import type { Stroke } from './ink'

// main.tsx checks the env vars before this module loads.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

export const PAGE_TYPES = ['Staff Meeting', 'Daily', 'Other'] as const
export type PageType = (typeof PAGE_TYPES)[number]

// "Session" in the UI.
export type Page = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  type: PageType
  notes: string
  notes_updated_at: string
  ink: Stroke[]
  ink_updated_at: string
  updated_at: string
}

export type Task = {
  id: string
  page_id: string | null // null = Inbox
  text: string
  due_date: string | null
  sort_order: number
  created_at: string
  completed_at: string | null
}

// A task with its session, from select('*, pages(id, title)').
export type TaskWithPage = Task & { pages: { id: string; title: string } | null }

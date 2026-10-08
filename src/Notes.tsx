import { useEffect, useRef, useState } from 'react'
import { showError } from './lib/app'
import { supabase } from './lib/supabase'

type Server = { notes: string; notes_updated_at: string }

// Typed notes with autosave. A save only succeeds if notes_updated_at still matches the version this
// device last saw; otherwise another device saved first and the user picks Reload theirs / Keep mine.
export default function Notes({ pageId, server }: { pageId: string; server: Server }) {
  const [text, setText] = useState(server.notes)
  const [conflict, setConflict] = useState<Server | null>(null)
  const [status, setStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved')
  // Refs, because saves run from timers and event listeners that would otherwise see stale state.
  const s = useRef({ text: server.notes, base: server.notes_updated_at, dirty: false, saving: false, again: false, conflict: false, timer: 0 }).current

  function raise(row: Server) {
    s.conflict = true
    setConflict(row)
    setStatus('unsaved')
  }

  async function save(force = false) {
    clearTimeout(s.timer)
    if (s.saving) {
      s.again = true
      return
    }
    if (!force && (!s.dirty || s.conflict)) return

    s.saving = true
    setStatus('saving')
    const sent = s.text
    let q = supabase.from('pages').update({ notes: sent }).eq('id', pageId)
    if (!force) q = q.eq('notes_updated_at', s.base)
    const { data, error } = await q.select('notes_updated_at')
    s.saving = false

    if (error) {
      setStatus('error')
      return showError(`Couldn't save notes: ${error.message}`)
    }
    if (data.length) {
      s.base = data[0].notes_updated_at
      s.conflict = false
      setConflict(null)
    } else {
      // No row matched: another device saved first (or the session was deleted).
      const { data: row } = await supabase.from('pages').select('notes, notes_updated_at').eq('id', pageId).maybeSingle()
      if (!row) return
      if (row.notes !== sent) return raise(row)
      s.base = row.notes_updated_at
    }
    if (s.text === sent) {
      s.dirty = false
      setStatus('saved')
    }
    if (s.again || s.dirty) {
      s.again = false
      save()
    }
  }

  function change(value: string) {
    s.text = value
    s.dirty = true
    setText(value)
    setStatus('unsaved')
    clearTimeout(s.timer)
    s.timer = window.setTimeout(save, 1000)
  }

  // A refetch (app opened / refocused) brought a version this device hasn't seen.
  useEffect(() => {
    if (server.notes_updated_at === s.base) return
    if (!s.dirty || server.notes === s.text) {
      s.base = server.notes_updated_at
      s.text = server.notes
      s.dirty = false
      setText(server.notes)
      setStatus('saved')
    } else {
      raise(server)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s is a stable ref; only a new server version matters
  }, [server])

  // Save immediately when the app is backgrounded or the user leaves the page.
  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      save()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, [])

  function reload() {
    if (!conflict) return
    Object.assign(s, { text: conflict.notes, base: conflict.notes_updated_at, dirty: false, conflict: false })
    setText(conflict.notes)
    setConflict(null)
    setStatus('saved')
  }

  function keepMine() {
    s.conflict = false
    setConflict(null)
    save(true)
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">Notes</h2>
        <span className="text-xs text-neutral-400" aria-live="polite">
          {{ saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Not saved' }[status]}
        </span>
      </div>

      {conflict && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="flex-1">These notes were changed on another device.</span>
          <button onClick={reload} className="h-9 rounded-md px-3 font-medium hover:bg-amber-100 dark:hover:bg-amber-900">
            Reload theirs
          </button>
          <button onClick={keepMine} className="h-9 rounded-md bg-amber-600 px-3 font-medium text-white hover:bg-amber-700">
            Keep mine
          </button>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => change(e.target.value)}
        onBlur={() => save()}
        placeholder="Type notes…"
        className="min-h-[calc(100dvh-13rem)] w-full resize-none rounded-lg border border-neutral-200 bg-transparent p-4 text-base leading-relaxed outline-none field-sizing-content focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-800"
      />
    </section>
  )
}

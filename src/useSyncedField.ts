import { useEffect, useRef, useState } from 'react'
import { showError } from './lib/app'
import { supabase } from './lib/supabase'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'
type Version<T> = { value: T; ts: string }

// One autosaved column of a session (typed notes or ink). A save only succeeds if
// <column>_updated_at still matches the version this device last saw; otherwise another
// device saved first and `conflict` is set so the user can pick Reload theirs / Keep mine.
// Saves ~1s after the last change, and immediately when the app is backgrounded or the page closes.
export function useSyncedField<T>(
  pageId: string,
  column: 'notes' | 'ink',
  server: Version<T>,
  same: (a: T, b: T) => boolean,
) {
  const tsColumn = `${column}_updated_at`
  const [value, setValue] = useState(server.value)
  const [conflict, setConflict] = useState<Version<T> | null>(null)
  const [status, setStatus] = useState<SaveStatus>('saved')
  // Refs, because saves run from timers and event listeners that would otherwise see stale state.
  const s = useRef({ value: server.value, base: server.ts, dirty: false, saving: false, again: false, conflict: false, timer: 0 }).current

  function raise(row: Version<T>) {
    s.conflict = true
    setConflict(row)
    setStatus('unsaved')
  }

  async function fetchRow(): Promise<Version<T> | null> {
    const { data } = await supabase.from('pages').select(`${column}, ${tsColumn}`).eq('id', pageId).maybeSingle()
    const row = data as Record<string, unknown> | null
    return row && { value: row[column] as T, ts: row[tsColumn] as string }
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
    const sent = s.value
    let q = supabase.from('pages').update({ [column]: sent }).eq('id', pageId)
    if (!force) q = q.eq(tsColumn, s.base)
    const { data, error } = await q.select(tsColumn)
    s.saving = false

    if (error) {
      setStatus('error')
      return showError(`Couldn't save ${column === 'ink' ? 'handwriting' : 'notes'}: ${error.message}`)
    }
    const rows = data as unknown as Record<string, string>[]
    if (rows.length) {
      s.base = rows[0][tsColumn]
      s.conflict = false
      setConflict(null)
    } else {
      // No row matched: another device saved first (or the session was deleted).
      const row = await fetchRow()
      if (!row) return
      if (!same(row.value, sent)) return raise(row)
      s.base = row.ts
    }
    if (s.value === sent) {
      s.dirty = false
      setStatus('saved')
    }
    if (s.again || s.dirty) {
      s.again = false
      save()
    }
  }

  function change(next: T) {
    s.value = next
    s.dirty = true
    setValue(next)
    setStatus('unsaved')
    clearTimeout(s.timer)
    s.timer = window.setTimeout(save, 1000)
  }

  // A refetch (app opened / refocused) brought a version this device hasn't seen.
  useEffect(() => {
    if (server.ts === s.base) return
    if (!s.dirty || same(server.value, s.value)) {
      Object.assign(s, { value: server.value, base: server.ts, dirty: false })
      setValue(server.value)
      setStatus('saved')
    } else {
      raise(server)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s is a stable ref; only a new server version matters
  }, [server.ts, server.value])

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
    Object.assign(s, { value: conflict.value, base: conflict.ts, dirty: false, conflict: false })
    setValue(conflict.value)
    setConflict(null)
    setStatus('saved')
  }

  function keepMine() {
    s.conflict = false
    setConflict(null)
    save(true)
  }

  return { value, change, save, status, conflict, reload, keepMine }
}

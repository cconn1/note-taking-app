import { useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { refresh, showError, showToast } from './lib/app'
import { dueLabel, today } from './lib/dates'
import { useLists } from './lib/lists'
import { supabase, type Task } from './lib/supabase'

// Faint on touch screens, hidden until hover with a mouse.
const subtle = 'opacity-50 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100 focus:opacity-100'

export default function TaskItem({
  task,
  onChange,
  onDelete,
  source,
}: {
  task: Task
  onChange: (t: Task) => void
  onDelete: (id: string) => void
  /** The task's session, shown as a link. Omit on the session's own page; null = not from a session. */
  source?: { id: string; title: string } | null
}) {
  const [checked, setChecked] = useState(!!task.completed_at)
  const lists = useLists()
  const list = lists.find((l) => l.id === task.list_id)
  // Swipe left to delete (finger only; the Pencil writes and the mouse has the × button).
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const swipe = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null)

  async function update(patch: Partial<Task>, delay = 0) {
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', task.id).select().single()
    if (error) {
      setChecked(!!task.completed_at)
      return showError(`Couldn't save task: ${error.message}`)
    }
    // The delay lets the check-off animation play before the task moves out of the list.
    setTimeout(() => onChange(data), delay)
  }

  function toggle() {
    setChecked(!checked)
    update({ completed_at: checked ? null : new Date().toISOString() }, 450)
  }

  async function remove() {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) {
      setDx(0)
      return showError(`Couldn't delete task: ${error.message}`)
    }
    onDelete(task.id)
    // Only the task's own columns (not a joined session) so Undo can put the same row back.
    const { id, page_id, list_id, text, due_date, sort_order, created_at, completed_at } = task
    showToast({
      message: 'Task deleted',
      undo: async () => {
        const { error } = await supabase.from('tasks').insert({ id, page_id, list_id, text, due_date, sort_order, created_at, completed_at })
        if (error) return showError(`Couldn't restore task: ${error.message}`)
        refresh()
      },
    })
  }

  function onPointerDown(e: PointerEvent<HTMLLIElement>) {
    if (e.pointerType === 'touch') swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false }
  }

  function onPointerMove(e: PointerEvent<HTMLLIElement>) {
    const s = swipe.current
    if (!s || e.pointerId !== s.id) return
    const mx = e.clientX - s.x
    if (!s.active) {
      // Decide once: mostly vertical = the page scrolls; leftward = swipe.
      if (Math.abs(e.clientY - s.y) > 10) swipe.current = null
      else if (mx < -10) {
        s.active = true
        setDragging(true) // touch pointers are implicitly captured, so moves keep arriving here
      }
      return
    }
    setDx(Math.min(0, mx))
  }

  function onPointerEnd(e: PointerEvent<HTMLLIElement>) {
    const s = swipe.current
    swipe.current = null
    if (!s?.active) return
    setDragging(false)
    const width = e.currentTarget.offsetWidth
    // Measure from the release point, not the last rendered dx, so a fast flick still counts.
    if (e.type === 'pointerup' && e.clientX - s.x < -width * 0.35) {
      setDx(-width) // slide the rest of the way out, then delete
      setTimeout(remove, 200)
    } else setDx(0)
  }

  const overdue = !checked && task.due_date && task.due_date < today()

  return (
    <li
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className="relative touch-pan-y overflow-hidden"
    >
      {dx < 0 && (
        <div
          style={{ width: -dx }}
          className={`absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden rounded-lg bg-red-600 pr-4 text-sm font-medium text-white ${dragging ? '' : 'transition-[width] duration-200'}`}
        >
          Delete
        </div>
      )}
      <div
        style={{ transform: `translateX(${dx}px)` }}
        className={`group flex items-start gap-1 sm:items-center ${dragging ? '' : 'transition-[transform,opacity] duration-200'} ${checked !== !!task.completed_at ? 'opacity-40' : ''}`}
      >
        <button
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? 'Mark as not done' : 'Mark as done'}
          onClick={toggle}
          className="grid size-11 shrink-0 place-items-center"
        >
          <span
            className={`grid size-6 place-items-center rounded-full border-2 transition-colors duration-200 ${checked ? 'border-accent bg-accent' : 'border-neutral-300 hover:border-accent dark:border-neutral-600'}`}
          >
            <svg viewBox="0 0 16 16" className={`size-4 text-tan transition-transform duration-200 ${checked ? 'scale-100' : 'scale-0'}`}>
              {/* Lightning bolt */}
              <path d="M9.6 1 3 9.2h4.3L6.4 15 13 6.8H8.7z" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {/* Phones: text on its own line, chips underneath. Wider screens: all on one line. */}
        <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-1">
          <textarea
            key={task.text}
            defaultValue={task.text}
            aria-label="Task"
            rows={1}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault() // a task is one paragraph; Enter saves
              e.currentTarget.blur()
            }}
            onBlur={(e) => {
              const text = e.target.value.trim()
              if (!text) e.target.value = task.text
              else if (text !== task.text) update({ text })
            }}
            // Grows to fit (field-sizing), so long tasks wrap onto more lines instead of being cut off.
            className={`min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 outline-none field-sizing-content transition-colors duration-300 ${checked ? 'text-neutral-400 line-through' : ''}`}
          />

          <div className="-mt-1.5 flex flex-wrap items-center gap-1 pb-1.5 empty:hidden sm:mt-0 sm:flex-nowrap sm:pb-0">

            {source && (
              <Link
                to={`/sessions/${source.id}`}
                className="max-w-32 shrink-0 truncate rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-text hover:bg-accent/20"
              >
                {source.title || 'Untitled'}
              </Link>
            )}

            {lists.length > 0 && (
              <label
                className={`relative flex h-7 max-w-28 shrink-0 cursor-pointer sm:h-8 items-center rounded-full px-2.5 text-xs font-medium ${
                  list ? 'bg-tan/25 text-neutral-700 dark:bg-tan/15 dark:text-tan' : `text-neutral-400 ${subtle}`
                }`}
              >
                <span className="truncate">{list ? list.name : '+ List'}</span>
                <select
                  aria-label="List"
                  value={task.list_id ?? ''}
                  onChange={(e) => update({ list_id: e.target.value || null })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="">No list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label
              className={`relative flex h-7 shrink-0 cursor-pointer items-center rounded-full px-2.5 text-xs font-medium sm:h-8 ${
                task.due_date
                  ? overdue
                    ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400'
                  : `text-neutral-400 ${subtle}`
              }`}
            >
              {task.due_date ? dueLabel(task.due_date) : '+ Due'}
              <input
                type="date"
                aria-label="Due date"
                value={task.due_date ?? ''}
                onChange={(e) => update({ due_date: e.target.value || null })}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker()
                  } catch {
                    // Older browsers open the picker on tap anyway.
                  }
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        <button
          onClick={remove}
          aria-label="Delete task"
          // Touch screens swipe left to delete instead, which leaves room for the chips.
          className={`grid size-11 shrink-0 place-items-center text-xl text-neutral-400 hover:text-red-600 pointer-coarse:hidden ${subtle}`}
        >
          ×
        </button>
      </div>
    </li>
  )
}

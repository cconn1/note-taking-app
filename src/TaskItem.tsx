import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { refresh, showError, showToast } from './lib/app'
import { dueLabel, today } from './lib/dates'
import DatePicker from './DatePicker'
import ListPicker from './ListPicker'
import { useLists } from './lib/lists'
import { project, rubberband, spring, velocityTracker } from './lib/spring'
import { supabase, type Task } from './lib/supabase'

// Faint on touch screens, hidden until hover with a mouse.
const subtle = 'opacity-50 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100 focus:opacity-100'
// Swipe left: the row rests open at OPEN (Delete showing), or past FULL of its width deletes outright.
// Swipe right past COMPLETE toggles done. Release decisions use the projected (flicked) position.
const OPEN = -88
const FULL = 0.6
const COMPLETE = 88
// Apple's sheet-style curve, for the row collapsing out of the list.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const buzz = () => navigator.vibrate?.(10)

const bolt = 'M9.6 1 3 9.2h4.3L6.4 15 13 6.8H8.7z'

export default function TaskItem({
  task,
  onChange,
  onDelete,
  source,
  subtasks,
}: {
  task: Task
  onChange: (t: Task) => void
  onDelete: (id: string) => void
  /** The task's session, shown as a link. Omit on the session's own page; null = not from a session. */
  source?: { id: string; title: string } | null
  /** This task's subtasks, shown nested underneath. Omit for a subtask itself, or where nesting isn't shown (Search). */
  subtasks?: Task[]
}) {
  const [checked, setChecked] = useState(!!task.completed_at)
  const nested = !!task.parent_id
  // Subtasks start shown while any are open.
  const [expanded, setExpanded] = useState(() => !!subtasks?.some((s) => !s.completed_at))
  const [addingSub, setAddingSub] = useState(false)
  const lists = useLists()
  const list = lists.find((l) => l.id === task.list_id)
  const li = useRef<HTMLLIElement>(null)

  // Swipe (finger only; the Pencil writes and the mouse has buttons). dx is rendered; x is the live
  // on-screen value, so a grab mid-spring continues from exactly where the row is.
  const [dx, setDx] = useState(0)
  const x = useRef(0)
  const anim = useRef<(() => void) | null>(null)
  // -1 = past the full-delete line, 1 = past the complete line: the action is armed for release.
  const [armed, setArmed] = useState<-1 | 0 | 1>(0)
  const swipe = useRef<{ id: number; x: number; y: number; base: number; w: number; active: boolean; vel: ReturnType<typeof velocityTracker> } | null>(null)
  const open = dx === OPEN

  useEffect(() => () => anim.current?.(), [])

  function move(v: number) {
    x.current = v
    setDx(v)
  }

  /** Spring the row to `to`, carrying the release velocity (px/s). Bounce only after a flick. */
  function settle(to: number, velocity = 0, bounce = false, then?: () => void) {
    anim.current?.()
    let done = false
    const cancel = spring(x.current, to, {
      velocity,
      response: 0.35,
      damping: bounce ? 0.8 : 1,
      onUpdate: move,
      onDone: () => {
        done = true
        anim.current = null
        then?.()
      },
    })
    if (!done) anim.current = cancel // reduced motion finishes synchronously
  }

  /** Fold the row away (height + fade) so the list closes up smoothly instead of jumping. */
  function collapse() {
    const el = li.current
    if (!el) return null
    const frames = reduceMotion()
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ height: `${el.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }]
    return el.animate(frames, { duration: reduceMotion() ? 200 : 350, easing: EASE, fill: 'forwards' })
  }

  async function save(patch: Partial<Task>) {
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', task.id).select().single()
    if (!error) return data as Task
    setChecked(!!task.completed_at)
    showError(`Couldn't save task: ${error.message}`)
    return null
  }

  async function update(patch: Partial<Task>) {
    const t = await save(patch)
    if (t) onChange(t)
  }

  async function toggle() {
    const completing = !checked
    setChecked(completing)
    const t = await save({ completed_at: completing ? new Date().toISOString() : null })
    if (!t) return
    // A subtask stays under its parent, struck through; only top-level tasks leave the open list.
    if (!completing || nested) return onChange(t)
    // Completing a parent completes its open subtasks too.
    let openSubs = (subtasks ?? []).filter((s) => !s.completed_at).map((s) => s.id)
    if (openSubs.length) {
      const { error } = await supabase.from('tasks').update({ completed_at: t.completed_at }).in('id', openSubs)
      if (error) {
        showError(`Couldn't complete subtasks: ${error.message}`)
        openSubs = []
      }
    }
    // The task leaves the list, so offer a way back (reopens its subtasks too).
    showToast({
      message: openSubs.length ? `Completed with ${openSubs.length} subtask${openSubs.length > 1 ? 's' : ''}` : 'Task completed',
      undo: async () => {
        const { error } = await supabase.from('tasks').update({ completed_at: null }).in('id', [task.id, ...openSubs])
        if (error) return showError(`Couldn't reopen task: ${error.message}`)
        refresh()
      },
    })
    // Completing takes the task out of the open list: let the bolt pop in, fold the row, then hand off.
    await new Promise((r) => setTimeout(r, 250))
    const a = collapse()
    await a?.finished.catch(() => {})
    onChange(t)
    if (openSubs.length) refresh() // pick up the subtasks' new state
    // Lists that keep completed tasks in place (Search) still have us: open back up.
    setTimeout(() => {
      if (!a || !li.current) return
      a.reverse()
      a.finished.then(() => a.cancel(), () => {})
    }, 100)
  }

  async function remove() {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) {
      settle(0)
      return showError(`Couldn't delete task: ${error.message}`)
    }
    await collapse()?.finished.catch(() => {})
    onDelete(task.id)
    // Only the tasks' own columns (not a joined session) so Undo can put the same rows back.
    // The database deleted the subtasks with it; restore the parent first, then them.
    const row = ({ id, page_id, list_id, parent_id, text, due_date, sort_order, created_at, completed_at }: Task) =>
      ({ id, page_id, list_id, parent_id, text, due_date, sort_order, created_at, completed_at })
    const subs = (subtasks ?? []).map(row)
    showToast({
      message: subs.length ? `Task and ${subs.length} subtask${subs.length > 1 ? 's' : ''} deleted` : 'Task deleted',
      undo: async () => {
        let { error } = await supabase.from('tasks').insert(row(task))
        if (!error && subs.length) ({ error } = await supabase.from('tasks').insert(subs))
        if (error) return showError(`Couldn't restore task: ${error.message}`)
        refresh()
      },
    })
  }

  async function addSubtask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('text') as HTMLInputElement
    const text = input.value.trim()
    if (!text) return setAddingSub(false)
    // A subtask lives in its parent's session and list.
    const { error } = await supabase.from('tasks').insert({ text, parent_id: task.id, page_id: task.page_id, list_id: task.list_id })
    if (error) return showError(`Couldn't add subtask: ${error.message}`)
    input.value = '' // stay open for the next one
    setExpanded(true)
    refresh()
  }

  function onPointerDown(e: PointerEvent<HTMLLIElement>) {
    // A subtask's own row handles its swipe; don't drag the parent along.
    if (e.pointerType !== 'touch' || (e.target as Element).closest('li') !== e.currentTarget) return
    const moving = !!anim.current
    // Catch the row mid-flight: stop the spring and track on from where it is now.
    anim.current?.()
    anim.current = null
    const vel = velocityTracker()
    vel.add(e.clientX)
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: x.current, w: e.currentTarget.offsetWidth, active: moving, vel }
  }

  function onPointerMove(e: PointerEvent<HTMLLIElement>) {
    const s = swipe.current
    if (!s || e.pointerId !== s.id) return
    s.vel.add(e.clientX)
    const mx = e.clientX - s.x
    if (!s.active) {
      // Decide once: mostly vertical = the page scrolls; sideways = swipe.
      if (Math.abs(e.clientY - s.y) > 10) swipe.current = null
      else if (Math.abs(mx) > 10) s.active = true // touch pointers are implicitly captured, so moves keep arriving here
      return
    }
    // 1:1 with the finger; resist softly past the row's edge on the left and past the complete line on the right.
    const raw = s.base + mx
    move(raw < -s.w ? -s.w + rubberband(raw + s.w, s.w) : raw > COMPLETE ? COMPLETE + rubberband(raw - COMPLETE, s.w) : raw)
    const next = raw <= -s.w * FULL ? -1 : raw >= COMPLETE ? 1 : 0
    if (next !== armed) {
      if (next) buzz()
      setArmed(next)
    }
  }

  function onPointerEnd(e: PointerEvent<HTMLLIElement>) {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const wasArmed = armed
    setArmed(0)
    if (!s.active) return
    const at = x.current
    if (e.type === 'pointercancel') return settle(at < OPEN / 2 ? OPEN : 0)
    const v = s.vel.get()
    const projected = at + project(v)
    const flick = Math.abs(v) > 500
    if (at > 0) {
      // Right side: complete (or un-complete) and spring home.
      if (wasArmed === 1 || projected >= COMPLETE) {
        if (!wasArmed) buzz()
        toggle()
      }
      return settle(0, v)
    }
    // Left side. Full delete needs the row already dragged past Delete, so a stray flick can't delete.
    if (wasArmed === -1 || (at < OPEN && projected <= -s.w * FULL)) {
      if (!wasArmed) buzz()
      return settle(-s.w, v, false, remove)
    }
    const to = Math.abs(projected - OPEN) < Math.abs(projected) ? OPEN : 0
    settle(to, v, flick && to === OPEN)
  }

  const overdue = !checked && task.due_date && task.due_date < today()
  const chip = 'flex h-7 items-center rounded-full px-2.5 @xl:h-8'
  // The chips stay 28px pills but their labels reach 44px tall; negative margins keep the layout.
  const hit = 'relative -my-2 flex shrink-0 cursor-pointer items-center py-2 text-xs font-medium @xl:my-0 @xl:py-0'

  return (
    <li
      ref={li}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className="@container relative touch-pan-y overflow-hidden"
    >
      {dx > 0 && (
        // Touch-only shortcut for the checkbox, so hidden from assistive tech.
        <div aria-hidden style={{ width: dx }} className="absolute inset-y-0 left-0 flex items-center overflow-hidden bg-accent px-5 text-sm font-semibold text-tan">
          {/* Armed: the spacer opens and the label rides the row's edge (mirrors Delete). */}
          <span style={{ flexGrow: armed === 1 ? 1 : 0 }} className="transition-[flex-grow] duration-200 motion-reduce:transition-none" />
          <span className="flex shrink-0 items-center gap-1">
            <svg viewBox="0 0 16 16" className="size-4">
              <path d={bolt} fill="currentColor" />
            </svg>
            {checked ? 'Undo' : 'Done'}
          </span>
        </div>
      )}
      {dx < 0 && (
        <button
          onClick={remove}
          disabled={!open}
          style={{ width: -dx }}
          className="absolute inset-y-0 right-0 flex items-center overflow-hidden bg-red-600 px-5 text-sm font-semibold text-white"
        >
          <span style={{ flexGrow: armed === -1 ? 0 : 1 }} className="transition-[flex-grow] duration-200 motion-reduce:transition-none" />
          Delete
        </button>
      )}
      <div
        // While open, a tap anywhere on the row just closes it.
        onClickCapture={(e) => {
          if (!open) return
          e.preventDefault()
          e.stopPropagation()
          settle(0)
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        className={`group flex items-start gap-1 @xl:items-center bg-surface transition-opacity duration-300 ${checked !== !!task.completed_at ? 'opacity-40' : ''}`}
      >
        <button
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? 'Mark as not done' : 'Mark as done'}
          onClick={toggle}
          className="grid size-11 shrink-0 place-items-center"
        >
          <span
            className={`grid size-6 place-items-center rounded-full border-2 transition-[background-color,border-color,transform] duration-200 active:scale-90 ${checked ? 'border-accent bg-accent' : 'border-neutral-300 hover:border-accent dark:border-neutral-600'}`}
          >
            <svg viewBox="0 0 16 16" className={`size-4 text-tan transition-transform duration-300 ease-[var(--ease-bounce)] ${checked ? 'scale-100' : 'scale-0'}`}>
              {/* Lightning bolt */}
              <path d={bolt} fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {/* Phones: text on its own line, chips underneath. Wider screens: all on one line. */}
        <div className="flex min-w-0 flex-1 flex-col @xl:flex-row @xl:items-center @xl:gap-1">
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

          <div className="-mt-1.5 flex flex-wrap items-center gap-1 pb-1.5 empty:hidden @xl:mt-0 @xl:flex-nowrap @xl:pb-0">

            {subtasks && subtasks.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Hide' : 'Show'} subtasks`}
                className={`${hit} text-neutral-600 dark:text-neutral-400`}
              >
                <span className={`${chip} gap-1 bg-neutral-100 dark:bg-neutral-900`}>
                  <span className={`text-[0.625rem] transition-transform duration-300 ease-[var(--ease-spring)] ${expanded ? 'rotate-90' : ''}`}>▸</span>
                  {subtasks.filter((s) => s.completed_at).length}/{subtasks.length}
                </span>
              </button>
            )}

            {subtasks && (
              <button
                onClick={() => {
                  setExpanded(true)
                  setAddingSub(true)
                }}
                className={`${hit} text-neutral-400 ${subtle}`}
              >
                <span className={chip}>+ Subtask</span>
              </button>
            )}

            {source && !nested && (
              <Link
                to={`/sessions/${source.id}`}
                className="max-w-32 shrink-0 truncate rounded-full bg-accent/12 px-2.5 py-1 text-xs font-semibold text-accent-text hover:bg-accent/20"
              >
                {source.title || 'Untitled'}
              </Link>
            )}

            {lists.length > 0 && !nested && (
              <ListPicker
                value={task.list_id}
                onChange={(list_id) => update({ list_id })}
                className={`${hit} max-w-28 ${list ? 'text-white' : `text-neutral-400 ${subtle}`}`}
              >
                <span className={`${chip} min-w-0`} style={list && { backgroundColor: list.color }}>
                  <span className="truncate">{list ? list.name : '+ List'}</span>
                </span>
              </ListPicker>
            )}

            <DatePicker
              value={task.due_date}
              onChange={(due_date) => update({ due_date })}
              className={`${hit} ${task.due_date ? '' : `text-neutral-400 ${subtle}`}`}
            >
              <span
                className={`${chip} ${
                  task.due_date
                    ? overdue
                      ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400'
                    : ''
                }`}
              >
                {task.due_date ? dueLabel(task.due_date) : '+ Due'}
              </span>
            </DatePicker>
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

      {subtasks && expanded && (subtasks.length > 0 || addingSub) && (
        // Indented under the parent's text; open first, then done.
        <ul className="ml-9 divide-y divide-separator border-t border-separator">
          {[...subtasks.filter((s) => !s.completed_at), ...subtasks.filter((s) => s.completed_at)].map((s) => (
            <TaskItem key={s.id} task={s} onChange={onChange} onDelete={onDelete} />
          ))}
          {addingSub && (
            <li>
              <form onSubmit={addSubtask} className="flex items-center gap-1">
                <span className="grid size-11 shrink-0 place-items-center text-lg text-neutral-400">+</span>
                <input
                  name="text"
                  autoFocus
                  placeholder="Add subtask"
                  aria-label="New subtask"
                  enterKeyHint="done"
                  onBlur={(e) => !e.target.value.trim() && setAddingSub(false)}
                  onKeyDown={(e) => e.key === 'Escape' && setAddingSub(false)}
                  className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
                />
              </form>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

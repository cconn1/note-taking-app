import { useState } from 'react'
import { Link } from 'react-router'
import { showError } from './lib/app'
import { dueLabel, today } from './lib/dates'
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
  /** Show where the task lives: a session link, or null for Inbox. Omit to hide (on its own session page). */
  source?: { id: string; title: string } | null
}) {
  const [checked, setChecked] = useState(!!task.completed_at)

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
    if (error) return showError(`Couldn't delete task: ${error.message}`)
    onDelete(task.id)
  }

  const overdue = !checked && task.due_date && task.due_date < today()

  return (
    <li className={`group flex items-center gap-1 transition-opacity duration-300 ${checked !== !!task.completed_at ? 'opacity-40' : ''}`}>
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
          <svg viewBox="0 0 16 16" className={`size-3.5 text-white transition-transform duration-200 ${checked ? 'scale-100' : 'scale-0'}`}>
            <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <input
        key={task.text}
        defaultValue={task.text}
        aria-label="Task"
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={(e) => {
          const text = e.target.value.trim()
          if (!text) e.target.value = task.text
          else if (text !== task.text) update({ text })
        }}
        className={`h-11 min-w-0 flex-1 bg-transparent text-base outline-none transition-colors duration-300 ${checked ? 'text-neutral-400 line-through' : ''}`}
      />

      {source !== undefined &&
        (source ? (
          <Link
            to={`/sessions/${source.id}`}
            className="max-w-32 shrink-0 truncate rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-text hover:bg-accent/20"
          >
            {source.title || 'Untitled'}
          </Link>
        ) : (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs text-neutral-400">Inbox</span>
        ))}

      <label
        className={`relative flex h-8 shrink-0 cursor-pointer items-center rounded-full px-2.5 text-xs font-medium ${
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

      <button
        onClick={remove}
        aria-label="Delete task"
        className={`grid size-11 shrink-0 place-items-center text-xl text-neutral-400 hover:text-red-600 ${subtle}`}
      >
        ×
      </button>
    </li>
  )
}

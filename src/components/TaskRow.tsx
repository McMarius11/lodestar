import { useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import { commitInlineEdit } from '@/lib/editable'
import type { Feature } from '@/types'

/**
 * Inline task row used inside ModuleScope's expanded feature panels. The
 * companion `InlineAddTask` lives in the same file because the two are always
 * rendered as a unit (list + footer add row).
 */
export function TaskRow({
  featureId,
  task,
}: {
  featureId: string
  task: Feature['tasks'][number]
}) {
  const toggle = useProjectStore((s) => s.toggleTask)
  const deleteTask = useProjectStore((s) => s.deleteTask)
  const updateTask = useProjectStore((s) => s.updateTask)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.label)

  const commit = () => {
    const next = commitInlineEdit(task.label, draft)
    if (next === null) setDraft(task.label)
    else updateTask(featureId, task.id, { label: next })
    setEditing(false)
  }

  return (
    <li className="group flex items-center gap-3 py-1">
      <button
        onClick={() => toggle(featureId, task.id)}
        className={clsx(
          'w-3 h-3 border flex items-center justify-center shrink-0',
          task.done ? 'bg-success border-success' : 'border-line-strong',
        )}
      >
        {task.done && (
          <svg viewBox="0 0 10 10" width="7" height="7">
            <path
              d="M1.5 5 L4 7.5 L8.5 2"
              stroke="rgb(var(--void))"
              strokeWidth="2"
              fill="none"
            />
          </svg>
        )}
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setDraft(task.label)
              setEditing(false)
            }
          }}
          className="text-xs flex-1 min-w-0 bg-transparent outline-none border-b border-accent text-fg"
        />
      ) : (
        <span
          onDoubleClick={() => {
            setDraft(task.label)
            setEditing(true)
          }}
          title="Double-click to rename"
          className={clsx(
            'text-xs flex-1 min-w-0 truncate cursor-text',
            task.done ? 'text-fg-subtle line-through' : 'text-fg-muted',
          )}
        >
          {task.label}
        </span>
      )}
      <button
        type="button"
        onClick={() => deleteTask(featureId, task.id)}
        aria-label={`Delete task ${task.label}`}
        className="label-mono text-fg-subtle opacity-70 transition-opacity hover:opacity-100 hover:text-danger"
        title={`Delete task ${task.label}`}
      >
        DEL
      </button>
    </li>
  )
}

export function InlineAddTask({ featureId }: { featureId: string }) {
  const addTask = useProjectStore((s) => s.addTask)
  const [label, setLabel] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const v = label.trim()
        if (!v) return
        addTask(featureId, v)
        setLabel('')
      }}
      className="flex items-center gap-3 pt-2 mt-1 border-t border-line/30"
    >
      <span className="text-fg-subtle text-xs">+</span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Add task…"
        className="flex-1 bg-transparent text-xs outline-none placeholder:text-fg-subtle border-b border-transparent focus:border-accent py-1 transition-colors"
      />
    </form>
  )
}

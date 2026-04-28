import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useProjectStore } from '@/store/useProjectStore'
import { newId } from '@/lib/id'

export function MilestoneEditor({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const addMilestone = useProjectStore((s) => s.addMilestone)
  const updateMilestone = useProjectStore((s) => s.updateMilestone)
  const deleteMilestone = useProjectStore((s) => s.deleteMilestone)
  const updateFeature = useProjectStore((s) => s.updateFeature)
  const [newIdLabel, setNewIdLabel] = useState({ id: '', label: '' })
  const ref = useRef<HTMLDivElement>(null)

  const milestones = project.meta.milestones
  const usedByCount = (id: string) =>
    project.modules.reduce((n, m) => n + m.features.filter((f) => f.ms === id).length, 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const addNew = () => {
    const id = newIdLabel.id.trim() || `v${newId('').slice(0, 3)}`
    const label = newIdLabel.label.trim() || id
    if (milestones.some((m) => m.id === id)) return
    addMilestone(id, label)
    setNewIdLabel({ id: '', label: '' })
  }

  const remove = (id: string) => {
    const n = usedByCount(id)
    if (n === 0) {
      if (confirm(`Delete milestone "${id}"?`)) deleteMilestone(id)
      return
    }
    const remaining = milestones.filter((m) => m.id !== id)
    if (remaining.length === 0) {
      alert('Cannot delete the last milestone — features would be orphaned.')
      return
    }
    const target = prompt(
      `Milestone "${id}" is used by ${n} feature(s).\nReassign them to which milestone?\nAvailable: ${remaining.map((m) => m.id).join(', ')}`,
      remaining[0]!.id,
    )
    const trimmedTarget = target?.trim()
    if (!trimmedTarget || !remaining.some((m) => m.id === trimmedTarget)) return
    for (const mod of project.modules) {
      for (const f of mod.features) {
        if (f.ms === id) updateFeature(f.id, { ms: trimmedTarget })
      }
    }
    deleteMilestone(id)
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-void/70 backdrop-blur-sm"
        onClick={onClose}
        data-testid="dialog-milestone-backdrop"
      >
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="w-[min(560px,calc(100%-2rem))] bg-base border border-line-strong/60 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ms-editor-title"
          data-testid="dialog-milestone"
        >
          <div className="px-5 py-4 border-b border-line/60 flex items-baseline justify-between">
            <div>
              <div className="label-mono mb-0.5">MILESTONES</div>
              <div id="ms-editor-title" className="ser-display italic text-2xl">Roadmap anchors</div>
            </div>
            <button onClick={onClose} className="label-mono text-fg-subtle hover:text-fg">
              CLOSE · ESC
            </button>
          </div>

          <div className="p-5 space-y-1">
            {milestones.map((ms) => (
              <MilestoneRow
                key={ms.id}
                id={ms.id}
                label={ms.label}
                count={usedByCount(ms.id)}
                onRename={(patch) => updateMilestone(ms.id, patch)}
                onDelete={() => remove(ms.id)}
              />
            ))}
            {milestones.length === 0 && (
              <div className="label-mono text-fg-subtle py-4">
                No milestones yet — add one below.
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-line/60 flex items-center gap-2">
            <input
              value={newIdLabel.id}
              onChange={(e) => setNewIdLabel({ ...newIdLabel, id: e.target.value })}
              placeholder="ID e.g. v0.5"
              className="num-mono bg-transparent border border-line/60 px-2 py-1 text-sm w-28 focus:border-accent outline-none"
            />
            <input
              value={newIdLabel.label}
              onChange={(e) => setNewIdLabel({ ...newIdLabel, label: e.target.value })}
              placeholder="Label"
              className="flex-1 bg-transparent border border-line/60 px-2 py-1 text-sm focus:border-accent outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addNew()
              }}
            />
            <button onClick={addNew} className="btn-ghost !py-1 !px-3 text-sm">
              + Add
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function MilestoneRow({
  id,
  label,
  count,
  onRename,
  onDelete,
}: {
  id: string
  label: string
  count: number
  onRename: (patch: { id?: string; label?: string }) => void
  onDelete: () => void
}) {
  const [editId, setEditId] = useState(id)
  const [editLabel, setEditLabel] = useState(label)

  useEffect(() => {
    setEditId(id)
    setEditLabel(label)
  }, [id, label])

  const commit = () => {
    const patch: { id?: string; label?: string } = {}
    const nextId = editId.trim()
    const nextLabel = editLabel.trim()
    if (nextId !== editId) setEditId(nextId || id)
    if (nextLabel !== editLabel) setEditLabel(nextLabel || label)
    if (nextId && nextId !== id) patch.id = nextId
    if (nextLabel && nextLabel !== label) patch.label = nextLabel
    if (Object.keys(patch).length) onRename(patch)
  }

  return (
    <div
      className="flex items-center gap-2 py-1 hover:bg-raised/40 -mx-2 px-2"
      data-testid={`milestone-row-${id}`}
      data-milestone-id={id}
    >
      <input
        value={editId}
        onChange={(e) => setEditId(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="num-mono bg-transparent border border-transparent hover:border-line/40 focus:border-accent px-1.5 py-0.5 text-sm w-24 outline-none"
      />
      <input
        value={editLabel}
        onChange={(e) => setEditLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="flex-1 bg-transparent border border-transparent hover:border-line/40 focus:border-accent px-1.5 py-0.5 text-sm outline-none"
      />
      <span className="label-mono text-fg-subtle tabular-nums min-w-[3rem] text-right">
        {count} feat
      </span>
      <button
        onClick={onDelete}
        className="label-mono text-fg-subtle hover:text-danger px-1"
        title={`Delete ${id}`}
      >
        ×
      </button>
    </div>
  )
}

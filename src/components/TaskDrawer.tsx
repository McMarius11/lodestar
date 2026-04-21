import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { blockedBy, completion, depStatus, featureIndex, hasConflict, milestoneOrder } from '@/lib/deps'
import { StatusGlyph } from './StatusGlyph'
import { EffortBadge } from './EffortBadge'
import { ProgressBar } from './ProgressBar'
import type { Dep, DepType, Effort } from '@/types'

export function TaskDrawer() {
  const id = useProjectStore((s) => s.drawerFeatureId)
  const close = useProjectStore((s) => s.openDrawer)

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        el.blur()
        return
      }
      e.preventDefault()
      close(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, close])

  return (
    <AnimatePresence>
      {id && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-sunken z-40"
            onClick={() => close(null)}
          />
          <motion.div
            key={id}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] bg-base border-t border-line-strong/60"
          >
            <DrawerBody id={id} onClose={() => close(null)} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function DrawerBody({ id, onClose }: { id: string; onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const toggleTask = useProjectStore((s) => s.toggleTask)
  const addTask = useProjectStore((s) => s.addTask)
  const deleteTask = useProjectStore((s) => s.deleteTask)
  const updateFeature = useProjectStore((s) => s.updateFeature)
  const deleteFeature = useProjectStore((s) => s.deleteFeature)
  const addDep = useProjectStore((s) => s.addDep)
  const removeDep = useProjectStore((s) => s.removeDep)
  const updateDep = useProjectStore((s) => s.updateDep)

  const idx = featureIndex(project)
  const feat = idx.get(id)
  const [newTask, setNewTask] = useState('')

  if (!feat) {
    return (
      <div className="p-6">
        <p className="text-fg-muted">Feature not found.</p>
        <button onClick={onClose} className="btn-ghost mt-3">
          Close
        </button>
      </div>
    )
  }

  const module = project.modules.find((m) => m.features.some((f) => f.id === id))
  const { done, total, pct } = completion(feat)
  const blockers = blockedBy(project, feat)
  const conflict = hasConflict(project, feat)
  const ord = milestoneOrder(project)

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      <div className="flex items-start gap-6 px-8 pt-6 pb-5 border-b border-line/60">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 label-mono mb-2">
            <span
              className="inline-block w-2 h-2"
              style={{ background: module?.color }}
            />
            <span>{module?.label}</span>
            <span className="text-fg-subtle">/</span>
            <span className="num-mono">{feat.id}</span>
            <span className="text-fg-subtle">·</span>
            <span className="num-mono text-accent">{feat.ms}</span>
            <span className="text-fg-subtle">·</span>
            <span className="num-mono">
              W{String(feat.ganttStart).padStart(2, '0')}–W{String(feat.ganttEnd).padStart(2, '0')}
            </span>
          </div>
          <input
            value={feat.label}
            onChange={(e) => updateFeature(feat.id, { label: e.target.value })}
            className="ser-display text-3xl text-fg w-full outline-none bg-transparent"
          />
          <div className="flex items-center gap-4 mt-3">
            <EffortBadge effort={feat.effort} />
            <span className="label-mono">
              <span className="num-mono text-fg">{done}</span>
              <span className="text-fg-subtle">/</span>
              <span className="num-mono">{total}</span>
              <span className="ml-2 text-fg-subtle">tasks</span>
            </span>
            <ProgressBar value={pct} className="w-32" />
          </div>
        </div>
        <button
          onClick={onClose}
          className="label-mono text-fg-muted hover:text-fg self-start"
        >
          CLOSE
          <span className="ml-2 num-mono">ESC</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto grid grid-cols-5 gap-8 px-8 py-6 scroll-thin">
        {/* Tasks */}
        <div className="col-span-3 flex flex-col min-w-0">
          <h3 className="label-mono mb-4 flex items-center justify-between">
            <span>Tasks</span>
            <span className="text-fg-subtle">
              <span className="num-mono">{done}</span> /{' '}
              <span className="num-mono">{total}</span>
            </span>
          </h3>
          <ul>
            {feat.tasks.map((t) => (
              <li
                key={t.id}
                className="group flex items-center gap-3 py-2 border-b border-line/40"
              >
                <button
                  onClick={() => toggleTask(feat.id, t.id)}
                  className={clsx(
                    'w-4 h-4 border flex items-center justify-center transition-colors',
                    t.done
                      ? 'bg-success border-success'
                      : 'border-line-strong hover:border-fg',
                  )}
                >
                  {t.done && (
                    <svg viewBox="0 0 10 10" width="8" height="8">
                      <path
                        d="M1.5 5 L4 7.5 L8.5 2"
                        stroke="rgb(var(--void))"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                  )}
                </button>
                <span
                  className={clsx(
                    'flex-1 text-sm',
                    t.done ? 'text-fg-muted line-through' : 'text-fg',
                  )}
                >
                  {t.label}
                </span>
                <button
                  onClick={() => deleteTask(feat.id, t.id)}
                  className="label-mono text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-danger"
                >
                  DEL
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (newTask.trim()) {
                addTask(feat.id, newTask.trim())
                setNewTask('')
              }
            }}
            className="mt-3 flex items-center gap-2"
          >
            <span className="text-fg-subtle">+</span>
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add task…"
              className="flex-1 py-2 text-sm outline-none placeholder:text-fg-subtle border-b border-transparent focus:border-accent transition-colors"
            />
          </form>
        </div>

        {/* Dependencies */}
        <div className="col-span-2 flex flex-col min-w-0">
          <h3 className="label-mono mb-4 flex items-center gap-2">
            Dependencies
            {conflict && (
              <span className="text-danger label-mono flex items-center gap-1">
                <StatusGlyph kind="conflict" />
                CONFLICT
              </span>
            )}
          </h3>
          <ul>
            {feat.deps.length === 0 && (
              <li className="label-mono text-fg-subtle">— none —</li>
            )}
            {feat.deps.map((d) => {
              const target = idx.get(d.id)
              const s = depStatus(project, feat, d, idx, ord)
              return (
                <li
                  key={d.id}
                  className="py-2.5 border-b border-line/40 flex items-start gap-3 group"
                >
                  <DepStatusDot status={s} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm text-fg truncate">
                        {target?.label ?? d.id}
                      </span>
                      <span className="label-mono num-mono">
                        {target?.ms}
                      </span>
                    </div>
                    <div className="label-mono text-fg-subtle truncate mt-0.5">
                      {d.reason || '—'}
                    </div>
                  </div>
                  <select
                    value={d.type}
                    onChange={(e) =>
                      updateDep(feat.id, d.id, { type: e.target.value as DepType })
                    }
                    className="label-mono bg-transparent border border-line/60 px-1.5 py-1"
                  >
                    <option value="build">BUILD</option>
                    <option value="runtime">RUNTIME</option>
                    <option value="optional">OPTIONAL</option>
                  </select>
                  <button
                    onClick={() => removeDep(feat.id, d.id)}
                    className="label-mono text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-danger"
                  >
                    DEL
                  </button>
                </li>
              )
            })}
          </ul>
          <AddDepRow featureId={feat.id} onAdd={addDep} />
          {blockers.length > 0 && (
            <div className="mt-5 p-3 border border-warn/40 bg-warn/5">
              <div className="label-mono text-warn flex items-center gap-2 mb-1.5">
                <StatusGlyph kind="blocked" />
                Blocked by
              </div>
              <div className="flex flex-wrap gap-1.5">
                {blockers.map((b) => (
                  <span
                    key={b.id}
                    className="label-mono px-1.5 py-0.5 border border-line/60"
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-8 py-3 border-t border-line/60 bg-sunken/50">
        <button
          onClick={() => {
            if (confirm(`Delete feature "${feat.label}"?`)) {
              deleteFeature(feat.id)
              onClose()
            }
          }}
          className="label-mono text-fg-subtle hover:text-danger"
        >
          DELETE FEATURE
        </button>
        <div className="flex items-center gap-4">
          <label className="label-mono flex items-center gap-2">
            MILESTONE
            <select
              value={feat.ms}
              onChange={(e) => updateFeature(feat.id, { ms: e.target.value })}
              className="label-mono num-mono bg-transparent border border-line/60 px-1.5 py-1"
            >
              {project.meta.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </label>
          <label className="label-mono flex items-center gap-2">
            EFFORT
            <select
              value={feat.effort}
              onChange={(e) =>
                updateFeature(feat.id, { effort: e.target.value as Effort })
              }
              className="label-mono num-mono bg-transparent border border-line/60 px-1.5 py-1"
            >
              {(['S', 'M', 'L', 'XL'] as const).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="label-mono flex items-center gap-2">
            WEEKS
            <input
              type="number"
              min={0}
              value={feat.ganttStart}
              onChange={(e) =>
                updateFeature(feat.id, { ganttStart: Number(e.target.value) })
              }
              className="num-mono w-12 bg-transparent border border-line/60 px-1.5 py-1 text-center"
            />
            <span className="text-fg-subtle">–</span>
            <input
              type="number"
              min={0}
              value={feat.ganttEnd}
              onChange={(e) =>
                updateFeature(feat.id, { ganttEnd: Number(e.target.value) })
              }
              className="num-mono w-12 bg-transparent border border-line/60 px-1.5 py-1 text-center"
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function DepStatusDot({
  status,
}: {
  status: 'done' | 'conflict' | 'same' | 'open' | 'unknown'
}) {
  const map = {
    done: { color: 'bg-success', label: 'DONE' },
    conflict: { color: 'bg-danger', label: 'CONFLICT' },
    same: { color: 'bg-warn', label: 'SAME' },
    open: { color: 'bg-fg-muted', label: 'OPEN' },
    unknown: { color: 'bg-danger', label: '?' },
  } as const
  const entry = map[status]
  return (
    <div className="flex flex-col items-center gap-1 w-14 shrink-0 pt-0.5">
      <span className={clsx('w-2 h-2 rounded-full', entry.color)} />
      <span className="label-mono text-[9px]">{entry.label}</span>
    </div>
  )
}

function AddDepRow({
  featureId,
  onAdd,
}: {
  featureId: string
  onAdd: (fid: string, dep: Dep) => void
}) {
  const project = useProjectStore((s) => s.project)
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [reason, setReason] = useState('')
  const [type, setType] = useState<DepType>('build')

  const feat = project.modules.flatMap((m) => m.features).find((f) => f.id === featureId)
  const candidates = project.modules
    .flatMap((m) => m.features.map((f) => ({ ...f, mod: m.label, modColor: m.color })))
    .filter((f) => f.id !== featureId)
    .filter((f) => !feat?.deps.find((d) => d.id === f.id))

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 label-mono text-fg-muted hover:text-fg flex items-center gap-2 py-2"
      >
        + ADD DEPENDENCY
      </button>
    )
  }

  return (
    <div className="mt-2 p-3 border border-line/60 bg-sunken/50 space-y-2">
      <select
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className="w-full bg-transparent border border-line/60 px-2 py-1.5 text-sm"
      >
        <option value="">— select feature —</option>
        {candidates.map((f) => (
          <option key={f.id} value={f.id}>
            {f.mod} / {f.label} ({f.ms})
          </option>
        ))}
      </select>
      <input
        placeholder="Reason…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full border border-line/60 px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DepType)}
          className="label-mono bg-transparent border border-line/60 px-2 py-1.5"
        >
          <option value="build">BUILD</option>
          <option value="runtime">RUNTIME</option>
          <option value="optional">OPTIONAL</option>
        </select>
        <button
          disabled={!targetId}
          onClick={() => {
            if (!targetId) return
            onAdd(featureId, { id: targetId, reason, type })
            setTargetId('')
            setReason('')
            setType('build')
            setOpen(false)
          }}
          className="btn-primary label-mono disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ADD
        </button>
        <button
          onClick={() => setOpen(false)}
          className="btn-ghost label-mono"
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}

import { useRef, useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import {
  completion,
  featureStatus,
  hasConflict,
  isBlocked,
  matchesFilters,
} from '@/lib/deps'
import { StatusGlyph } from '@/components/StatusGlyph'
import { EffortBadge } from '@/components/EffortBadge'
import { ProgressBar } from '@/components/ProgressBar'
import { ModuleEditor } from '@/components/ModuleEditor'
import type { Feature, Module } from '@/types'

export function ModuleScope() {
  const project = useProjectStore((s) => s.project)
  const activeMs = useProjectStore((s) => s.activeMilestone)
  const activeStatus = useProjectStore((s) => s.activeStatus)
  const addFeature = useProjectStore((s) => s.addFeature)

  const modules = project.modules.map((m) => ({
    ...m,
    features: m.features.filter((f) =>
      matchesFilters(project, f, activeMs, activeStatus),
    ),
  }))

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="px-8 pt-8 pb-6 border-b border-line/40">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="label-mono mb-3">
              <span className="num-mono">01</span> · MODULE SCOPE
            </div>
            <h1 className="ser-display text-6xl italic leading-none">
              {project.meta.name}
            </h1>
            <p className="mt-3 text-fg-muted max-w-2xl">
              {project.meta.description}
            </p>
          </div>
          <Totals project={project} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
        {modules.map((m) => (
          <ModuleCard key={m.id} module={m} onAddFeature={() => addFeature(m.id)} />
        ))}
      </div>
    </div>
  )
}

function Totals({ project }: { project: ReturnType<typeof useProjectStore.getState>['project'] }) {
  const allFeatures = project.modules.flatMap((m) => m.features)
  const allTasks = allFeatures.flatMap((f) => f.tasks)
  const done = allTasks.filter((t) => t.done).length
  const pct = allTasks.length === 0 ? 0 : done / allTasks.length

  return (
    <div className="grid grid-cols-4 gap-0 border border-line/60 min-w-[420px]">
      <Stat label="Modules" value={project.modules.length} />
      <Stat label="Features" value={allFeatures.length} />
      <Stat label="Tasks" value={allTasks.length} />
      <Stat
        label="Done"
        value={`${Math.round(pct * 100)}%`}
        sub={`${done}/${allTasks.length}`}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="px-4 py-3 border-r last:border-r-0 border-line/60">
      <div className="label-mono">{label}</div>
      <div className="num-mono text-2xl mt-1">{value}</div>
      {sub && <div className="label-mono text-fg-subtle mt-0.5 num-mono">{sub}</div>}
    </div>
  )
}

function ModuleCard({
  module,
  onAddFeature,
}: {
  module: Module
  onAddFeature: () => void
}) {
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const project = useProjectStore((s) => s.project)
  const cursorId = useProjectStore((s) => s.cursorFeatureId)
  const [expanded, setExpanded] = useState<string | null>(null)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const [editor, setEditor] = useState<DOMRect | null>(null)

  const allTasks = module.features.flatMap((f) => f.tasks)
  const done = allTasks.filter((t) => t.done).length
  const pct = allTasks.length === 0 ? 0 : done / allTasks.length

  return (
    <div className="border-r border-b border-line/40">
      <header className="flex items-center gap-4 px-6 pt-5 pb-3 border-b border-line/40">
        <button
          ref={swatchRef}
          onClick={(e) => {
            e.stopPropagation()
            setEditor(e.currentTarget.getBoundingClientRect())
          }}
          className="w-3 h-3 shrink-0 border border-transparent hover:ring-2 hover:ring-fg-subtle/40 transition-shadow"
          style={{ background: module.color }}
          title="Edit module"
          aria-label="Edit module"
        />
        <button
          onClick={() => setEditor(swatchRef.current?.getBoundingClientRect() ?? null)}
          className="ser-display text-2xl italic flex-1 text-left hover:text-accent transition-colors"
        >
          {module.label}
        </button>
        {editor && (
          <ModuleEditor
            module={module}
            anchor={editor}
            onClose={() => setEditor(null)}
          />
        )}
        <span className="label-mono text-fg-subtle">
          <span className="num-mono">{module.features.length}</span> FEAT
        </span>
        <span className="label-mono text-fg-subtle">
          <span className="num-mono">{done}</span>/
          <span className="num-mono">{allTasks.length}</span>
        </span>
        <button
          onClick={onAddFeature}
          className="label-mono text-fg-muted hover:text-accent"
          title="Add feature"
        >
          + NEW
        </button>
      </header>
      <ProgressBar value={pct} className="!h-[1px]" />
      <ul>
        {module.features.map((f) => {
          const c = completion(f)
          const st = featureStatus(f)
          const blocked = isBlocked(project, f)
          const conflict = hasConflict(project, f)
          const isExpanded = expanded === f.id
          const isCursor = cursorId === f.id
          return (
            <li
              key={f.id}
              className={clsx(
                'border-b border-line/30 relative',
                isCursor && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-accent',
              )}
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : f.id)}
                onDoubleClick={() => openDrawer(f.id)}
                className={clsx(
                  'w-full grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-6 py-3 text-left transition-colors',
                  'hover:bg-raised/40',
                  isExpanded && 'bg-raised/30',
                  isCursor && !isExpanded && 'bg-accent/5',
                )}
              >
                <StatusGlyph
                  kind={conflict ? 'conflict' : blocked ? 'blocked' : st}
                />
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="text-fg truncate">{f.label}</span>
                  <span className="label-mono num-mono text-fg-subtle shrink-0">
                    {f.id}
                  </span>
                </div>
                <EffortBadge effort={f.effort} />
                <span className="label-mono num-mono text-accent shrink-0 w-[34px] text-right">
                  {f.ms}
                </span>
                <span className="label-mono num-mono shrink-0 w-[50px] text-right">
                  {c.done}/{c.total}
                </span>
              </button>
              {isExpanded && (
                <div className="px-6 pb-4 pl-[58px] bg-sunken/30">
                  <ul className="space-y-1">
                    {f.tasks.map((t) => (
                      <TaskRow key={t.id} featureId={f.id} task={t} />
                    ))}
                    {f.tasks.length === 0 && (
                      <li className="label-mono text-fg-subtle py-1">
                        NO TASKS YET
                      </li>
                    )}
                  </ul>
                  <InlineAddTask featureId={f.id} />
                  <button
                    onClick={() => openDrawer(f.id)}
                    className="label-mono mt-3 text-fg-muted hover:text-accent"
                  >
                    OPEN FEATURE →
                  </button>
                </div>
              )}
            </li>
          )
        })}
        {module.features.length === 0 && (
          <li className="px-6 py-6 label-mono text-fg-subtle text-center">
            NO FEATURES IN CURRENT FILTER
          </li>
        )}
      </ul>
    </div>
  )
}

function TaskRow({
  featureId,
  task,
}: {
  featureId: string
  task: Feature['tasks'][number]
}) {
  const toggle = useProjectStore((s) => s.toggleTask)
  const deleteTask = useProjectStore((s) => s.deleteTask)
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
      <span
        className={clsx(
          'text-xs flex-1 min-w-0 truncate',
          task.done ? 'text-fg-subtle line-through' : 'text-fg-muted',
        )}
      >
        {task.label}
      </span>
      <button
        onClick={() => deleteTask(featureId, task.id)}
        className="label-mono text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-danger"
        title="Delete task"
      >
        DEL
      </button>
    </li>
  )
}

function InlineAddTask({ featureId }: { featureId: string }) {
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

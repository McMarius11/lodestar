import { useRef, useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import { useFilteredFeatures } from '@/hooks/useFilteredFeatures'
import {
  completion,
  featureStatus,
  hasConflict,
  isBlocked,
} from '@/lib/deps'
import { StatusGlyph } from '@/components/StatusGlyph'
import { EffortBadge } from '@/components/EffortBadge'
import { ProgressBar } from '@/components/ProgressBar'
import { ModuleEditor } from '@/components/ModuleEditor'
import { useContextMenu } from '@/components/ContextMenu'
import { emptyAreaMenu, featureMenu, moduleMenu } from '@/lib/featureActions'
import { useFeatureActionsApi } from '@/hooks/useFeatureActionsApi'
import type { Feature, Module } from '@/types'

export function ModuleScope() {
  const { project, modules: filteredModules } = useFilteredFeatures()
  const addFeature = useProjectStore((s) => s.addFeature)
  const reorderModules = useProjectStore((s) => s.reorderModules)
  const moveFeatureToModule = useProjectStore((s) => s.moveFeatureToModule)
  const ctx = useContextMenu()
  const api = useFeatureActionsApi()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dragFeatureId, setDragFeatureId] = useState<string | null>(null)
  const [featureOverModuleId, setFeatureOverModuleId] = useState<string | null>(null)

  const featureHomeModuleId: string | null = (() => {
    if (!dragFeatureId) return null
    for (const m of project.modules) {
      if (m.features.some((f) => f.id === dragFeatureId)) return m.id
    }
    return null
  })()

  const modules = filteredModules.map(({ module: m, features }) => ({
    ...m,
    features,
  }))

  const handleDrop = (targetId: string) => {
    if (dragFeatureId) {
      if (featureHomeModuleId && featureHomeModuleId !== targetId) {
        moveFeatureToModule(dragFeatureId, targetId)
      }
      setDragFeatureId(null)
      setFeatureOverModuleId(null)
      return
    }
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setOverId(null)
      return
    }
    const ids = project.modules.map((m) => m.id)
    const fromIdx = ids.indexOf(dragId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, dragId)
    reorderModules(ids)
    setDragId(null)
    setOverId(null)
  }

  return (
    <div
      className="h-full overflow-auto scroll-thin"
      role="tabpanel"
      id="view-scope"
      aria-label="Module Scope"
      data-testid="view-scope"
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        ctx.openAt(e.clientX, e.clientY, emptyAreaMenu(api, { kind: 'scope' }))
      }}
    >
      <div
        onContextMenu={(e) => {
          e.preventDefault()
          ctx.openAt(e.clientX, e.clientY, emptyAreaMenu(api, { kind: 'scope' }))
        }}
        className="px-8 pt-8 pb-6 border-b border-line/40"
      >
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
        {modules.map((m) => {
          const featureDragActive = dragFeatureId !== null
          const isFeatureTarget =
            featureDragActive &&
            featureOverModuleId === m.id &&
            featureHomeModuleId !== m.id
          return (
            <ModuleCard
              key={m.id}
              module={m}
              onAddFeature={() => addFeature(m.id)}
              onContextFeature={(feat, e) =>
                ctx.openAt(e.clientX, e.clientY, featureMenu(api, feat))
              }
              onContextModule={(e) =>
                ctx.openAt(e.clientX, e.clientY, moduleMenu(api, m))
              }
              onContextEmpty={(e) =>
                ctx.openAt(
                  e.clientX,
                  e.clientY,
                  emptyAreaMenu(api, { kind: 'scope-module', moduleId: m.id }),
                )
              }
              dragging={dragId === m.id}
              dragOver={
                (overId === m.id && dragId !== null && dragId !== m.id) ||
                isFeatureTarget
              }
              onDragStart={() => setDragId(m.id)}
              onDragEnter={() => {
                if (dragId && dragId !== m.id) setOverId(m.id)
                if (featureDragActive && featureHomeModuleId !== m.id) {
                  setFeatureOverModuleId(m.id)
                }
              }}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
                setDragFeatureId(null)
                setFeatureOverModuleId(null)
              }}
              onDrop={() => handleDrop(m.id)}
              onFeatureDragStart={(id) => setDragFeatureId(id)}
              onFeatureDragEnd={() => {
                setDragFeatureId(null)
                setFeatureOverModuleId(null)
              }}
            />
          )
        })}
      </div>
      {ctx.menu}
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
  onContextFeature,
  onContextModule,
  onContextEmpty,
  dragging,
  dragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onFeatureDragStart,
  onFeatureDragEnd,
}: {
  module: Module
  onAddFeature: () => void
  onContextFeature: (feat: Feature, e: React.MouseEvent) => void
  onContextModule: (e: React.MouseEvent) => void
  onContextEmpty: (e: React.MouseEvent) => void
  dragging: boolean
  dragOver: boolean
  onDragStart: () => void
  onDragEnter: () => void
  onDragEnd: () => void
  onDrop: () => void
  onFeatureDragStart: (id: string) => void
  onFeatureDragEnd: () => void
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
    <div
      data-module-id={module.id}
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (dragOver || dragging) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      className={clsx(
        'border-r border-b border-line/40 transition-all',
        dragging && 'opacity-40',
        dragOver && 'bg-accent/5 ring-1 ring-accent/60 ring-inset',
      )}
    >
      <header
        onContextMenu={(e) => {
          e.preventDefault()
          onContextModule(e)
        }}
        className="flex items-center gap-4 px-6 pt-5 pb-3 border-b border-line/40"
      >
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', module.id)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          className="text-fg-subtle hover:text-fg-muted cursor-grab active:cursor-grabbing label-mono select-none -ml-2 pr-1"
          title="Drag to reorder module"
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </span>
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
              data-feature-id={f.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/lodestar-feature', f.id)
                onFeatureDragStart(f.id)
              }}
              onDragEnd={(e) => {
                e.stopPropagation()
                onFeatureDragEnd()
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onContextFeature(f, e)
              }}
              className={clsx(
                'border-b border-line/30 relative',
                isCursor && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-accent',
              )}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => openDrawer(f.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openDrawer(f.id)
                  }
                }}
                className={clsx(
                  'w-full grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-4 px-6 py-3 text-left transition-colors cursor-pointer',
                  'hover:bg-raised/40 focus:outline-none focus-visible:bg-raised/40',
                  isExpanded && 'bg-raised/30',
                  isCursor && !isExpanded && 'bg-accent/5',
                )}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded(isExpanded ? null : f.id)
                  }}
                  className={clsx(
                    'w-4 h-4 flex items-center justify-center text-fg-subtle hover:text-fg shrink-0 transition-transform',
                    isExpanded && 'rotate-90 text-fg',
                  )}
                  title={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
                  aria-label={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
                  aria-expanded={isExpanded}
                >
                  <svg viewBox="0 0 10 10" width="8" height="8">
                    <path d="M3 1 L7 5 L3 9" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  </svg>
                </button>
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
              </div>
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
          <li
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onContextEmpty(e)
            }}
            className="px-6 py-6 label-mono text-fg-subtle text-center"
          >
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
  const updateTask = useProjectStore((s) => s.updateTask)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.label)

  const commit = () => {
    const v = draft.trim()
    if (v && v !== task.label) updateTask(featureId, task.id, { label: v })
    else setDraft(task.label)
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

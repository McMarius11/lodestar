import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import {
  blockedBy,
  completion,
  featureStatus,
  hasConflict,
  isBlocked,
  matchesFilters,
} from '@/lib/deps'
import { StatusGlyph } from '@/components/StatusGlyph'
import { EffortBadge } from '@/components/EffortBadge'
import { ProgressBar } from '@/components/ProgressBar'
import type { Feature } from '@/types'

function stripMd(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

type ColId = 'backlog' | 'progress' | 'done'

const columns: { id: ColId; label: string; tag: string }[] = [
  { id: 'backlog', label: 'Backlog', tag: '01' },
  { id: 'progress', label: 'In Progress', tag: '02' },
  { id: 'done', label: 'Done', tag: '03' },
]

export function Kanban() {
  const project = useProjectStore((s) => s.project)
  const activeMs = useProjectStore((s) => s.activeMilestone)
  const activeStatus = useProjectStore((s) => s.activeStatus)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const setAllTasksDone = useProjectStore((s) => s.setAllTasksDone)
  const toggleTask = useProjectStore((s) => s.toggleTask)
  const addTask = useProjectStore((s) => s.addTask)
  const [sortBy, setSortBy] = useState<'module' | 'effort' | 'milestone'>('module')
  const [dragId, setDragId] = useState<string | null>(null)
  const [hotCol, setHotCol] = useState<ColId | null>(null)

  const withMods = useMemo(() => {
    const out: (Feature & { modColor: string; modLabel: string })[] = []
    for (const m of project.modules)
      for (const f of m.features)
        out.push({ ...f, modColor: m.color, modLabel: m.label })
    return out
  }, [project])

  const filtered = withMods.filter((f) => matchesFilters(project, f, activeMs, activeStatus))
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'module') return a.modLabel.localeCompare(b.modLabel)
    if (sortBy === 'effort') {
      const order = { XL: 0, L: 1, M: 2, S: 3 }
      return order[a.effort] - order[b.effort]
    }
    return a.ms.localeCompare(b.ms)
  })

  const buckets = {
    backlog: sorted.filter((f) => featureStatus(f) === 'backlog'),
    progress: sorted.filter((f) => featureStatus(f) === 'progress'),
    done: sorted.filter((f) => featureStatus(f) === 'done'),
  }

  const moveTo = (featureId: string, col: ColId) => {
    const feat = withMods.find((f) => f.id === featureId)
    if (!feat) return
    const current = featureStatus(feat)
    if (current === col) return
    if (col === 'done') setAllTasksDone(featureId, true)
    else if (col === 'backlog') setAllTasksDone(featureId, false)
    else {
      // progress: ensure at least one task exists & marked done, and at least one still open
      if (feat.tasks.length === 0) {
        addTask(featureId, 'Kickoff')
      } else if (current === 'backlog') {
        const first = feat.tasks[0]
        if (first) toggleTask(featureId, first.id)
      } else if (current === 'done') {
        const last = feat.tasks[feat.tasks.length - 1]
        if (last) toggleTask(featureId, last.id)
      }
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-8 pb-4 border-b border-line/40 flex items-end justify-between gap-6">
        <div>
          <div className="label-mono mb-3">
            <span className="num-mono">03</span> · KANBAN
          </div>
          <h1 className="ser-display text-6xl italic leading-none">flow</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-mono">SORT</span>
          {(['module', 'effort', 'milestone'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={clsx(
                'label-mono px-3 py-1.5 border border-line/60',
                sortBy === s ? 'bg-fg text-void' : 'text-fg-muted hover:text-fg',
              )}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 min-h-0">
        {columns.map((col, i) => {
          const list = buckets[col.id]
          const isHot = hotCol === col.id && dragId !== null
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                if (hotCol !== col.id) setHotCol(col.id)
              }}
              onDragLeave={() => {
                if (hotCol === col.id) setHotCol(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) moveTo(dragId, col.id)
                setDragId(null)
                setHotCol(null)
              }}
              className={clsx(
                'flex flex-col min-w-0 transition-colors',
                i > 0 && 'border-l border-line/60',
                isHot && 'bg-accent/5',
              )}
            >
              <header
                className={clsx(
                  'flex items-baseline gap-3 px-6 pt-5 pb-3 border-b transition-colors',
                  isHot ? 'border-accent' : 'border-line/60',
                )}
              >
                <span className="label-mono num-mono text-fg-subtle">{col.tag}</span>
                <h2 className="ser-display italic text-2xl">{col.label}</h2>
                <span className="ml-auto label-mono num-mono">
                  {list.length.toString().padStart(2, '0')}
                </span>
              </header>
              <div className="flex-1 overflow-auto scroll-thin p-4 space-y-2">
                {list.map((f) => (
                  <KanbanCard
                    key={f.id}
                    feature={f}
                    modColor={f.modColor}
                    modLabel={f.modLabel}
                    dragging={dragId === f.id}
                    onDragStart={() => setDragId(f.id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setHotCol(null)
                    }}
                    onClick={() => openDrawer(f.id)}
                  />
                ))}
                {list.length === 0 && (
                  <div
                    className={clsx(
                      'label-mono text-fg-subtle text-center py-8 border border-dashed transition-colors',
                      isHot ? 'border-accent text-accent' : 'border-line/30',
                    )}
                  >
                    {isHot ? 'DROP HERE' : 'EMPTY'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanCard({
  feature: f,
  modColor,
  modLabel,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  feature: Feature
  modColor: string
  modLabel: string
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const project = useProjectStore((s) => s.project)
  const c = completion(f)
  const blocked = isBlocked(project, f)
  const conflict = hasConflict(project, f)
  const blockers = blocked ? blockedBy(project, f) : []

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', f.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={clsx(
        'relative border bg-base transition-all',
        dragging ? 'opacity-40' : 'opacity-100',
        conflict
          ? 'border-danger/50 bg-danger/5'
          : blocked
          ? 'border-warn/40'
          : 'border-line/60 hover:border-fg-muted',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-3 cursor-grab active:cursor-grabbing"
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: modColor }}
        />
        <div className="pl-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm text-fg leading-snug">{f.label}</span>
            <EffortBadge effort={f.effort} className="shrink-0" />
          </div>
          {f.description && (
            <p
              className="mt-1.5 text-xs text-fg-muted leading-snug line-clamp-2"
              title={f.description}
            >
              {stripMd(f.description)}
            </p>
          )}
          <div className="label-mono flex items-center gap-2 mt-2">
            <span className="text-fg-muted">{modLabel}</span>
            <span className="text-fg-subtle">·</span>
            <span className="num-mono text-accent">{f.ms}</span>
            <span className="text-fg-subtle">·</span>
            <span className="num-mono">
              W{f.ganttStart}–W{f.ganttEnd}
            </span>
          </div>
          <ProgressBar value={c.pct} className="mt-2" />
          {blockers.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5">
              <StatusGlyph kind={conflict ? 'conflict' : 'blocked'} className="mt-0.5" />
              <span className="label-mono text-fg-muted">
                waits on: {blockers.map((b) => b.label).join(', ')}
              </span>
            </div>
          )}
        </div>
      </button>
    </div>
  )
}

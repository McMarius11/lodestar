import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import { useFilteredFeatures } from '@/hooks/useFilteredFeatures'
import {
  blockedBy,
  completion,
  featureStatus,
  hasConflict,
  isBlocked,
} from '@/lib/deps'
import { StatusGlyph } from '@/components/StatusGlyph'
import { EffortBadge } from '@/components/EffortBadge'
import { ProgressBar } from '@/components/ProgressBar'
import { useContextMenu } from '@/components/ContextMenu'
import { emptyAreaMenu, featureMenu } from '@/lib/featureActions'
import { useFeatureActionsApi } from '@/hooks/useFeatureActionsApi'
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
  const { project, modules: filteredModules } = useFilteredFeatures()
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const setFeatureColumn = useProjectStore((s) => s.setFeatureColumn)
  const setKanbanRank = useProjectStore((s) => s.setKanbanRank)
  const normalizeKanbanRanks = useProjectStore((s) => s.normalizeKanbanRanks)
  const [sortBy, setSortBy] = useState<'module' | 'effort' | 'milestone'>('module')
  const [dragId, setDragId] = useState<string | null>(null)
  const [hotCol, setHotCol] = useState<ColId | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null>(null)
  const ctx = useContextMenu()
  const api = useFeatureActionsApi()

  const filtered = useMemo(() => {
    const out: (Feature & { modColor: string; modLabel: string })[] = []
    for (const { module: m, features } of filteredModules)
      for (const f of features)
        out.push({ ...f, modColor: m.color, modLabel: m.label })
    return out
  }, [filteredModules])

  const tieBreak = (a: Feature & { modLabel: string }, b: Feature & { modLabel: string }) => {
    if (sortBy === 'module') return a.modLabel.localeCompare(b.modLabel)
    if (sortBy === 'effort') {
      const order = { XL: 0, L: 1, M: 2, S: 3 }
      return order[a.effort] - order[b.effort]
    }
    return a.ms.localeCompare(b.ms)
  }
  const sortBucket = (arr: (Feature & { modLabel: string; modColor: string })[]) =>
    [...arr].sort((a, b) => {
      const ar = typeof a.rank === 'number' ? a.rank : Infinity
      const br = typeof b.rank === 'number' ? b.rank : Infinity
      if (ar !== br) return ar - br
      return tieBreak(a, b)
    })

  const buckets = {
    backlog: sortBucket(filtered.filter((f) => featureStatus(f) === 'backlog')),
    progress: sortBucket(filtered.filter((f) => featureStatus(f) === 'progress')),
    done: sortBucket(filtered.filter((f) => featureStatus(f) === 'done')),
  }

  const rankBetween = (
    col: ColId,
    beforeId: string | null,
    excludeId: string,
  ): number => {
    const list = buckets[col].filter((f) => f.id !== excludeId)
    const idx = beforeId ? list.findIndex((f) => f.id === beforeId) : list.length
    const prev = idx > 0 ? list[idx - 1] : null
    const next = idx < list.length ? list[idx] : null
    const prevRank = prev && typeof prev.rank === 'number' ? prev.rank : null
    const nextRank = next && typeof next.rank === 'number' ? next.rank : null
    if (prevRank !== null && nextRank !== null) return (prevRank + nextRank) / 2
    if (prevRank !== null) return prevRank + 1
    if (nextRank !== null) return nextRank - 1
    // fallback: first ranked entry in column
    return idx + 1
  }

  const handleDrop = (col: ColId, beforeId: string | null) => {
    if (!dragId) return
    const feat = filtered.find((f) => f.id === dragId)
    if (!feat) return
    const current = featureStatus(feat)
    const newRank = rankBetween(col, beforeId, dragId)
    if (current !== col) {
      // one history step for column + rank together
      setFeatureColumn(dragId, col, newRank)
    } else {
      setKanbanRank(dragId, newRank)
    }
    // detect float-drift and renormalize
    const nextList = buckets[col]
    for (let i = 1; i < nextList.length; i++) {
      const a = nextList[i - 1].rank
      const b = nextList[i].rank
      if (typeof a === 'number' && typeof b === 'number' && Math.abs(b - a) < 0.001) {
        normalizeKanbanRanks()
        break
      }
    }
    setDragId(null)
    setHotCol(null)
    setDropBefore(null)
  }

  return (
    <div
      className="h-full flex flex-col"
      role="tabpanel"
      id="view-kanban"
      aria-label="Kanban"
      data-testid="view-kanban"
    >
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
              data-kanban-col={col.id}
              data-testid={`kanban-col-${col.id}`}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                if (hotCol !== col.id) setHotCol(col.id)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (hotCol === col.id) {
                  setHotCol(null)
                  setDropBefore(null)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(col.id, dropBefore)
              }}
              onContextMenu={(e) => {
                if (e.target !== e.currentTarget) return
                e.preventDefault()
                ctx.openAt(
                  e.clientX,
                  e.clientY,
                  emptyAreaMenu(api, { kind: 'kanban-column', col: col.id }),
                )
              }}
              className={clsx(
                'flex flex-col min-w-0 transition-colors',
                i > 0 && 'border-l border-line/60',
                isHot && 'bg-accent/5',
              )}
            >
              <header
                onContextMenu={(e) => {
                  e.preventDefault()
                  ctx.openAt(
                    e.clientX,
                    e.clientY,
                    emptyAreaMenu(api, { kind: 'kanban-column', col: col.id }),
                  )
                }}
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
                {list.map((f, idx) => {
                  const isDropBefore = isHot && dropBefore === f.id
                  const isDropAfterLast =
                    isHot && idx === list.length - 1 && dropBefore === null
                  return (
                    <div key={f.id}>
                      {isDropBefore && (
                        <div className="h-0.5 bg-accent mb-1.5 rounded" />
                      )}
                      <KanbanCard
                        feature={f}
                        modColor={f.modColor}
                        modLabel={f.modLabel}
                        dragging={dragId === f.id}
                        onDragStart={() => setDragId(f.id)}
                        onDragEnd={() => {
                          setDragId(null)
                          setHotCol(null)
                          setDropBefore(null)
                        }}
                        onDragOverCard={(e) => {
                          if (!dragId || dragId === f.id) return
                          e.preventDefault()
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          const mid = rect.top + rect.height / 2
                          const next =
                            e.clientY < mid
                              ? f.id
                              : list[idx + 1]?.id ?? null
                          if (hotCol !== col.id) setHotCol(col.id)
                          if (dropBefore !== next) setDropBefore(next)
                        }}
                        onDropCard={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleDrop(col.id, dropBefore)
                        }}
                        onClick={() => openDrawer(f.id)}
                        onContext={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          ctx.openAt(e.clientX, e.clientY, featureMenu(api, f))
                        }}
                      />
                      {isDropAfterLast && (
                        <div className="h-0.5 bg-accent mt-1.5 rounded" />
                      )}
                    </div>
                  )
                })}
                {list.length === 0 && (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      ctx.openAt(
                        e.clientX,
                        e.clientY,
                        emptyAreaMenu(api, { kind: 'kanban-column', col: col.id }),
                      )
                    }}
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
      {ctx.menu}
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
  onDragOverCard,
  onDropCard,
  onClick,
  onContext,
}: {
  feature: Feature
  modColor: string
  modLabel: string
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOverCard: (e: React.DragEvent) => void
  onDropCard: (e: React.DragEvent) => void
  onClick: () => void
  onContext: (e: React.MouseEvent) => void
}) {
  const project = useProjectStore((s) => s.project)
  const c = completion(f)
  const blocked = isBlocked(project, f)
  const conflict = hasConflict(project, f)
  const blockers = blocked ? blockedBy(project, f) : []

  return (
    <div
      data-feature-id={f.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/lodestar-feature', f.id)
        e.dataTransfer.setData('text/plain', f.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onDrop={onDropCard}
      onContextMenu={onContext}
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

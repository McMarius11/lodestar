import { useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import {
  completion,
  featureIndex,
  featureStatus,
  hasConflict,
  isBlocked,
  matchesStatus,
} from '@/lib/deps'
import { StatusGlyph } from '@/components/StatusGlyph'
import { EffortBadge } from '@/components/EffortBadge'
import { ProgressBar } from '@/components/ProgressBar'
import { useContextMenu } from '@/components/ContextMenu'
import { emptyAreaMenu, featureMenu } from '@/lib/featureActions'
import { useFeatureActionsApi } from '@/hooks/useFeatureActionsApi'
import type { Feature } from '@/types'

export function Roadmap() {
  const project = useProjectStore((s) => s.project)
  const activeMs = useProjectStore((s) => s.activeMilestone)
  const activeStatus = useProjectStore((s) => s.activeStatus)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const moveFeatureToMs = useProjectStore((s) => s.moveFeatureToMs)
  const setActiveStatus = useProjectStore((s) => s.setActiveStatus)
  const ctx = useContextMenu()
  const api = useFeatureActionsApi()
  const [dragId, setDragId] = useState<string | null>(null)
  const [hotMs, setHotMs] = useState<string | null>(null)

  const milestones =
    activeMs === 'all'
      ? project.meta.milestones
      : project.meta.milestones.filter((m) => m.id === activeMs)

  const featuresByMs = new Map<string, (Feature & { moduleColor: string; moduleLabel: string })[]>()
  for (const m of project.modules) {
    for (const f of m.features) {
      if (!matchesStatus(project, f, activeStatus)) continue
      const list = featuresByMs.get(f.ms) ?? []
      list.push({ ...f, moduleColor: m.color, moduleLabel: m.label })
      featuresByMs.set(f.ms, list)
    }
  }

  return (
    <div
      className="h-full overflow-auto scroll-thin"
      role="tabpanel"
      id="view-roadmap"
      aria-label="Roadmap"
      data-testid="view-roadmap"
    >
      <div
        onContextMenu={(e) => {
          e.preventDefault()
          ctx.openAt(e.clientX, e.clientY, emptyAreaMenu(api, { kind: 'roadmap-header' }))
        }}
        className="px-8 pt-8 pb-6 border-b border-line/40"
      >
        <div className="label-mono mb-3">
          <span className="num-mono">02</span> · ROADMAP
        </div>
        <h1 className="ser-display text-6xl italic leading-none">timeline</h1>
      </div>

      <div className="flex items-stretch min-h-[calc(100%-160px)]">
        {milestones.map((ms, i) => {
          const features = featuresByMs.get(ms.id) ?? []
          const allTasks = features.flatMap((f) => f.tasks)
          const done = allTasks.filter((t) => t.done).length
          const pct = allTasks.length === 0 ? 0 : done / allTasks.length
          const isHot = hotMs === ms.id && dragId !== null
          return (
            <div
              key={ms.id}
              data-milestone-id={ms.id}
              data-testid={`roadmap-col-${ms.id}`}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                if (hotMs !== ms.id) setHotMs(ms.id)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (hotMs === ms.id) setHotMs(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) {
                  moveFeatureToMs(dragId, ms.id)
                  if (activeStatus !== 'all') {
                    const next = useProjectStore.getState().project
                    const moved = featureIndex(next).get(dragId)
                    if (moved && !matchesStatus(next, moved, activeStatus)) {
                      setActiveStatus('all')
                    }
                  }
                }
                setDragId(null)
                setHotMs(null)
              }}
              className={clsx(
                'flex-1 min-w-[320px] border-r border-line/60 flex flex-col transition-colors',
                i === 0 && 'border-l border-line/60 ml-[-1px]',
                isHot && 'bg-accent/5',
              )}
            >
              <div
                onContextMenu={(e) => {
                  e.preventDefault()
                  ctx.openAt(
                    e.clientX,
                    e.clientY,
                    emptyAreaMenu(api, { kind: 'roadmap-column', ms: ms.id }),
                  )
                }}
                className={clsx(
                  'px-6 pt-5 pb-4 border-b transition-colors',
                  isHot ? 'border-accent' : 'border-line/60',
                )}
              >
                <div className="flex items-baseline gap-3">
                  <span className="num-mono text-accent text-lg">{ms.id}</span>
                  <span className="label-mono text-fg-muted">
                    <span className="num-mono">{features.length}</span> FEAT
                  </span>
                  <span className="ml-auto label-mono num-mono">
                    {Math.round(pct * 100)}%
                  </span>
                </div>
                <h2 className="ser-display italic text-3xl mt-1">{ms.label}</h2>
                <ProgressBar value={pct} className="mt-3" />
              </div>

              <div
                onContextMenu={(e) => {
                  if (e.target !== e.currentTarget) return
                  e.preventDefault()
                  ctx.openAt(
                    e.clientX,
                    e.clientY,
                    emptyAreaMenu(api, { kind: 'roadmap-column', ms: ms.id }),
                  )
                }}
                className="flex-1 overflow-auto scroll-thin p-4 space-y-3"
              >
                {features.map((f) => {
                  const c = completion(f)
                  const st = featureStatus(f)
                  const blocked = isBlocked(project, f)
                  const conflict = hasConflict(project, f)
                  const dragging = dragId === f.id
                  return (
                    <button
                      key={f.id}
                      data-feature-id={f.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/lodestar-feature', f.id)
                        e.dataTransfer.setData('text/plain', f.id)
                        setDragId(f.id)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setHotMs(null)
                      }}
                      onClick={() => openDrawer(f.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        ctx.openAt(e.clientX, e.clientY, featureMenu(api, f))
                      }}
                      className={clsx(
                        'w-full text-left group relative border border-line/60 bg-base p-3 hover:border-fg-muted transition-colors cursor-grab active:cursor-grabbing',
                        dragging && 'opacity-40',
                      )}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ background: f.moduleColor }}
                      />
                      <div className="flex items-start gap-3 pl-2">
                        <StatusGlyph
                          kind={conflict ? 'conflict' : blocked ? 'blocked' : st}
                          className="mt-1 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm text-fg leading-snug">
                              {f.label}
                            </span>
                            <EffortBadge
                              effort={f.effort}
                              className="shrink-0 mt-0.5"
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-2 label-mono">
                            <span className="num-mono text-fg-subtle">{f.id}</span>
                            <span className="text-fg-subtle">{f.moduleLabel}</span>
                            <span className="ml-auto num-mono">
                              {c.done}/{c.total}
                            </span>
                          </div>
                          <ProgressBar value={c.pct} className="mt-2" />
                        </div>
                      </div>
                    </button>
                  )
                })}
                {features.length === 0 && (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      ctx.openAt(
                        e.clientX,
                        e.clientY,
                        emptyAreaMenu(api, { kind: 'roadmap-column', ms: ms.id }),
                      )
                    }}
                    className="label-mono text-fg-subtle text-center py-8"
                  >
                    EMPTY
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

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import {
  blockedBy,
  completion,
  featureIndex,
  featureStatus,
  hasConflict,
  matchesFilters,
} from '@/lib/deps'
import type { Feature, Module } from '@/types'
import { EffortBadge } from '@/components/EffortBadge'

const ROW_H = 36
const HEADER_H = 64
const LABEL_W = 280
const LEFT_PAD = 0
const WEEK_W_MIN = 24
const WEEK_W_MAX = 80
const WEEK_W_DEFAULT = 44

export function Gantt() {
  const project = useProjectStore((s) => s.project)
  const activeMs = useProjectStore((s) => s.activeMilestone)
  const activeStatus = useProjectStore((s) => s.activeStatus)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const hoveredRef = useRef<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [WEEK_W, setWeekW] = useState<number>(WEEK_W_DEFAULT)
  const scrollRef = useRef<HTMLDivElement>(null)

  const modules = useMemo(
    () =>
      project.modules.map((m) => ({
        ...m,
        features: m.features.filter((f) =>
          matchesFilters(project, f, activeMs, activeStatus),
        ),
      })),
    [project, activeMs, activeStatus],
  )

  const allFeatures = modules.flatMap((m) => m.features)
  const maxWeek = Math.max(
    ...allFeatures.map((f) => f.ganttEnd),
    ...project.meta.milestones.map((_, i, arr) => (i + 1) * 5),
    20,
  )
  const weeks = maxWeek + 2
  const timelineW = weeks * WEEK_W

  type Row =
    | { kind: 'module'; module: Module; y: number }
    | { kind: 'feature'; feature: Feature; module: Module; y: number }
  const layout: Row[] = []
  let y = 0
  for (const m of modules) {
    if (m.features.length === 0) continue
    layout.push({ kind: 'module', module: m, y })
    y += ROW_H
    for (const f of m.features) {
      layout.push({ kind: 'feature', feature: f, module: m, y })
      y += ROW_H
    }
  }
  const totalH = y

  const idx = featureIndex(project)
  const featureRows = new Map<string, Row & { kind: 'feature' }>()
  for (const r of layout) if (r.kind === 'feature') featureRows.set(r.feature.id, r)

  // Build milestone bands
  const msBands = project.meta.milestones.map((ms, i) => {
    const features = allFeatures.filter((f) => f.ms === ms.id)
    if (features.length === 0) return null
    const start = Math.min(...features.map((f) => f.ganttStart))
    const end = Math.max(...features.map((f) => f.ganttEnd))
    return { ms, start, end, index: i }
  }).filter(Boolean) as { ms: { id: string; label: string }; start: number; end: number; index: number }[]

  const today = project.meta.today

  const jumpToToday = () => {
    const el = scrollRef.current
    if (!el || today === undefined) return
    const targetX = today * WEEK_W + LABEL_W - el.clientWidth / 2
    el.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' })
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el || today === undefined) return
    const targetX = today * WEEK_W + LABEL_W - el.clientWidth / 2
    el.scrollLeft = Math.max(0, targetX)
    // intentionally only runs once per mount / today-change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const zoom = (delta: number) => {
    setWeekW((w) => Math.min(WEEK_W_MAX, Math.max(WEEK_W_MIN, w + delta)))
  }

  // Ctrl+wheel zooms around the cursor instead of letting the global UI
  // zoom take over — Gantt runs its own discrete pixel-per-week scale.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY > 0 ? -8 : 8
      const rect = el.getBoundingClientRect()
      const cursorInContent = e.clientX - rect.left + el.scrollLeft
      const weekUnderCursor = (cursorInContent - LABEL_W) / WEEK_W
      setWeekW((prev) => {
        const next = Math.min(WEEK_W_MAX, Math.max(WEEK_W_MIN, prev + delta))
        if (next === prev) return prev
        requestAnimationFrame(() => {
          if (!scrollRef.current) return
          scrollRef.current.scrollLeft =
            weekUnderCursor * next + LABEL_W - (e.clientX - rect.left)
        })
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [WEEK_W])

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-8 pb-4 border-b border-line/40 flex items-end justify-between gap-6">
        <div>
          <div className="label-mono mb-3">
            <span className="num-mono">05</span> · GANTT
          </div>
          <h1 className="ser-display text-6xl italic leading-none">critical path</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="label-mono text-fg-muted">
            <span className="num-mono text-fg">W{weeks.toString().padStart(2, '0')}</span> SPAN
            {today !== undefined && (
              <span className="ml-4">
                TODAY <span className="num-mono text-accent">W{String(today).padStart(2, '0')}</span>
              </span>
            )}
          </div>
          <div className="flex items-stretch border border-line/60">
            <button
              onClick={() => zoom(-8)}
              disabled={WEEK_W <= WEEK_W_MIN}
              className="label-mono num-mono px-3 py-1.5 border-r border-line/60 text-fg-muted hover:text-fg hover:bg-raised/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom out"
            >
              −
            </button>
            <span
              className="label-mono num-mono px-3 py-1.5 border-r border-line/60 text-fg-subtle"
              title="Pixels per week"
            >
              {WEEK_W}
            </span>
            <button
              onClick={() => zoom(+8)}
              disabled={WEEK_W >= WEEK_W_MAX}
              className="label-mono num-mono px-3 py-1.5 text-fg-muted hover:text-fg hover:bg-raised/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom in"
            >
              +
            </button>
          </div>
          {today !== undefined && (
            <button
              onClick={jumpToToday}
              className="label-mono px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10 transition-colors"
              title="Scroll to today"
            >
              → TODAY
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto scroll-thin">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `${LABEL_W}px 1fr`,
            minWidth: LABEL_W + timelineW,
          }}
        >
          {/* Labels column header */}
          <div
            className="sticky top-0 z-20 border-b border-r border-line/60 bg-void"
            style={{ height: HEADER_H }}
          >
            <div className="h-full flex items-end px-6 pb-3">
              <span className="label-mono">FEATURE</span>
            </div>
          </div>

          {/* Timeline header */}
          <div
            className="sticky top-0 z-10 bg-void border-b border-line/60"
            style={{ height: HEADER_H }}
          >
            <svg
              width={timelineW}
              height={HEADER_H}
              className="block"
              style={{ minWidth: timelineW }}
            >
              {/* milestone bands */}
              {msBands.map((b) => {
                const x = b.start * WEEK_W + LEFT_PAD
                const w = (b.end - b.start) * WEEK_W
                const isActive =
                  activeMs === 'all' || activeMs === b.ms.id
                return (
                  <g key={b.ms.id}>
                    <rect
                      x={x}
                      y={0}
                      width={w}
                      height={HEADER_H - 22}
                      fill={isActive ? 'rgb(var(--raised))' : 'rgb(var(--raised) / 0.4)'}
                    />
                    <line
                      x1={x}
                      x2={x}
                      y1={0}
                      y2={HEADER_H - 22}
                      stroke="rgb(var(--line-strong))"
                      strokeOpacity="0.7"
                    />
                    <text
                      x={x + 10}
                      y={20}
                      fontFamily="Instrument Serif"
                      fontStyle="italic"
                      fontSize="18"
                      fill={isActive ? 'rgb(var(--fg))' : 'rgb(var(--fg-muted))'}
                    >
                      {b.ms.label}
                    </text>
                    <text
                      x={x + 10}
                      y={36}
                      fontFamily="Geist Mono"
                      fontSize="10"
                      fill={isActive ? 'rgb(var(--accent))' : 'rgb(var(--fg-subtle))'}
                      letterSpacing="0.12em"
                    >
                      {b.ms.id.toUpperCase()}
                    </text>
                  </g>
                )
              })}

              {/* week ticks */}
              {Array.from({ length: weeks + 1 }).map((_, i) => (
                <g key={`w-${i}`}>
                  <line
                    x1={i * WEEK_W}
                    x2={i * WEEK_W}
                    y1={HEADER_H - 22}
                    y2={HEADER_H}
                    stroke="rgb(var(--line))"
                  />
                  {i % 2 === 0 && (
                    <text
                      x={i * WEEK_W + 4}
                      y={HEADER_H - 6}
                      fontFamily="Geist Mono"
                      fontSize="10"
                      fill="rgb(var(--fg-subtle))"
                    >
                      W{i.toString().padStart(2, '0')}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>

          {/* Labels column body */}
          <div className="border-r border-line/60 relative" style={{ height: totalH }}>
            {layout.map((r) =>
              r.kind === 'module' ? (
                <div
                  key={`lm-${r.module.id}`}
                  className="absolute left-0 right-0 px-6 flex items-center border-b border-line/40 bg-sunken/60"
                  style={{ top: r.y, height: ROW_H }}
                >
                  <span
                    className="w-2 h-2 mr-3 shrink-0"
                    style={{ background: r.module.color }}
                  />
                  <span className="ser-display italic text-lg text-fg">
                    {r.module.label}
                  </span>
                  <span className="label-mono num-mono ml-auto text-fg-subtle">
                    {r.module.features.length.toString().padStart(2, '0')}
                  </span>
                </div>
              ) : (
                <button
                  key={`lf-${r.feature.id}`}
                  onClick={() => openDrawer(r.feature.id)}
                  onMouseEnter={() => {
                    hoveredRef.current = r.feature.id
                    setHovered(r.feature.id)
                  }}
                  onMouseLeave={() => {
                    if (hoveredRef.current === r.feature.id) {
                      hoveredRef.current = null
                      setHovered(null)
                    }
                  }}
                  className={clsx(
                    'absolute left-0 right-0 px-6 pl-10 flex items-center gap-3 border-b border-line/30 text-left hover:bg-raised/40 transition-colors',
                    hovered === r.feature.id && 'bg-raised/40',
                  )}
                  style={{ top: r.y, height: ROW_H }}
                >
                  <span className="text-sm truncate flex-1">{r.feature.label}</span>
                  <EffortBadge effort={r.feature.effort} className="shrink-0" />
                </button>
              ),
            )}
          </div>

          {/* Timeline body */}
          <div className="relative" style={{ height: totalH, minWidth: timelineW }}>
            <svg
              width={timelineW}
              height={totalH}
              className="absolute inset-0 block pointer-events-none"
            >
              {/* vertical week lines */}
              {Array.from({ length: weeks + 1 }).map((_, i) => (
                <line
                  key={`vg-${i}`}
                  x1={i * WEEK_W}
                  x2={i * WEEK_W}
                  y1={0}
                  y2={totalH}
                  stroke="rgb(var(--line))"
                  strokeOpacity={i % 5 === 0 ? 0.5 : 0.25}
                />
              ))}

              {/* horizontal row lines */}
              {layout.map((r, i) => (
                <line
                  key={`rl-${i}`}
                  x1={0}
                  x2={timelineW}
                  y1={r.y}
                  y2={r.y}
                  stroke="rgb(var(--line))"
                  strokeOpacity={r.kind === 'module' ? 0.4 : 0.15}
                />
              ))}

              {/* milestone band backgrounds */}
              {msBands.map((b, i) => (
                <rect
                  key={`mb-${b.ms.id}`}
                  x={b.start * WEEK_W}
                  y={0}
                  width={(b.end - b.start) * WEEK_W}
                  height={totalH}
                  fill={i % 2 === 0 ? 'rgb(var(--raised) / 0.12)' : 'transparent'}
                />
              ))}

              {/* today marker */}
              {today !== undefined && (
                <g>
                  <line
                    x1={today * WEEK_W}
                    x2={today * WEEK_W}
                    y1={0}
                    y2={totalH}
                    stroke="rgb(var(--accent))"
                    strokeWidth="1.5"
                  />
                  <circle cx={today * WEEK_W} cy={4} r="3" fill="rgb(var(--accent))" />
                </g>
              )}

              {/* bars */}
              {layout.map((r) => {
                if (r.kind !== 'feature') return null
                const f = r.feature
                const x = f.ganttStart * WEEK_W
                const w = Math.max((f.ganttEnd - f.ganttStart) * WEEK_W, 8)
                const c = completion(f)
                const st = featureStatus(f)
                const conflict = hasConflict(project, f)
                const color = r.module.color
                const isHover = hovered === f.id
                return (
                  <g key={`bar-${f.id}`} style={{ pointerEvents: 'auto' }}>
                    <rect
                      x={x}
                      y={r.y + 9}
                      width={w}
                      height={ROW_H - 18}
                      fill={color}
                      fillOpacity={st === 'done' ? 0.35 : 0.12}
                      stroke={conflict ? 'rgb(var(--danger))' : color}
                      strokeWidth={conflict ? 1.5 : 1}
                    />
                    <rect
                      x={x}
                      y={r.y + 9}
                      width={w * c.pct}
                      height={ROW_H - 18}
                      fill={color}
                      fillOpacity={0.85}
                    />
                    {isHover && (
                      <rect
                        x={x - 1}
                        y={r.y + 8}
                        width={w + 2}
                        height={ROW_H - 16}
                        fill="none"
                        stroke="rgb(var(--fg))"
                        strokeWidth="1"
                      />
                    )}
                    <text
                      x={x + 6}
                      y={r.y + ROW_H - 11}
                      fontFamily="Geist Mono"
                      fontSize="10"
                      fill="rgb(var(--fg))"
                      style={{ pointerEvents: 'none' }}
                    >
                      {f.effort}
                    </text>
                  </g>
                )
              })}

              {/* dep arrows */}
              {layout.map((r) => {
                if (r.kind !== 'feature') return null
                const f = r.feature
                return f.deps.map((d) => {
                  const target = idx.get(d.id)
                  const targetRow = featureRows.get(d.id)
                  if (!target || !targetRow) return null
                  const fromX = target.ganttEnd * WEEK_W
                  const fromY = targetRow.y + ROW_H / 2
                  const toX = f.ganttStart * WEEK_W
                  const toY = r.y + ROW_H / 2
                  const conflict = hasConflict(project, f)
                  const color =
                    conflict && d.type !== 'optional'
                      ? 'rgb(var(--danger))'
                      : d.type === 'optional'
                      ? 'rgb(var(--fg-subtle))'
                      : 'rgb(var(--fg-muted))'
                  const goingForward = toX >= fromX
                  const midX = goingForward
                    ? Math.max(fromX + 6, toX - 8)
                    : fromX + 8
                  const path = goingForward
                    ? `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX - 4} ${toY}`
                    : `M ${fromX} ${fromY} L ${fromX + 8} ${fromY} L ${fromX + 8} ${(fromY + toY) / 2} L ${toX - 8} ${(fromY + toY) / 2} L ${toX - 8} ${toY} L ${toX - 4} ${toY}`
                  const isRelevant =
                    hovered === f.id || hovered === target.id
                  return (
                    <g key={`arr-${f.id}-${d.id}`}>
                      <path
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeOpacity={isRelevant ? 1 : 0.35}
                        strokeWidth="1"
                        strokeDasharray={d.type === 'optional' ? '3 3' : undefined}
                      />
                      <path
                        d={`M ${toX - 4} ${toY} L ${toX - 8} ${toY - 3} L ${toX - 8} ${toY + 3} Z`}
                        fill={color}
                        opacity={isRelevant ? 1 : 0.5}
                      />
                    </g>
                  )
                })
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

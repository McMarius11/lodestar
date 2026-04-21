import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import { useFilteredFeatures } from '@/hooks/useFilteredFeatures'
import {
  blockedBy,
  completion,
  featureIndex,
  featureStatus,
  hasConflict,
} from '@/lib/deps'
import type { Feature } from '@/types'
import { EffortBadge } from '@/components/EffortBadge'
import { useContextMenu } from '@/components/ContextMenu'
import { featureMenu } from '@/lib/featureActions'
import { useFeatureActionsApi } from '@/hooks/useFeatureActionsApi'
import { useGanttLayout } from '@/hooks/useGanttLayout'

const ROW_H = 36
const HEADER_H = 64
const LABEL_W = 280
const LEFT_PAD = 0
const WEEK_W_MIN = 24
const WEEK_W_MAX = 80
const WEEK_W_DEFAULT = 44

export function Gantt() {
  const { project, modules: filteredModules, activeMilestone: activeMs } =
    useFilteredFeatures()
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const hoveredRef = useRef<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [WEEK_W, setWeekW] = useState<number>(WEEK_W_DEFAULT)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ctx = useContextMenu()
  const api = useFeatureActionsApi()
  const setFeatureGantt = useProjectStore((s) => s.setFeatureGantt)
  const [drag, setDrag] = useState<{
    id: string
    mode: 'move' | 'resize'
    origStart: number
    origEnd: number
    pointerX: number
    deltaWeeks: number
    snap: 'full' | 'half'
    moved: boolean
  } | null>(null)

  const modules = useMemo(
    () => filteredModules.map(({ module: m, features }) => ({ ...m, features })),
    [filteredModules],
  )

  const { rows: layout, featureRows, milestoneBands: msBands, weeks, totalH } =
    useGanttLayout(modules, project.meta.milestones, ROW_H)
  const timelineW = weeks * WEEK_W
  const idx = featureIndex(project)

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
    <div
      className="h-full flex flex-col"
      role="tabpanel"
      id="view-gantt"
      aria-label="Gantt"
      data-testid="view-gantt"
      data-gantt-zoom={WEEK_W}
      data-gantt-week-w={WEEK_W}
    >
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
                <div
                  key={`lf-${r.feature.id}`}
                  data-feature-id={r.feature.id}
                  data-gantt-label={r.feature.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-stop-row-open]')) return
                    openDrawer(r.feature.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openDrawer(r.feature.id)
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    ctx.openAt(e.clientX, e.clientY, featureMenu(api, r.feature))
                  }}
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
                    'absolute left-0 right-0 px-6 pl-10 flex items-center gap-3 border-b border-line/30 text-left hover:bg-raised/40 transition-colors cursor-pointer focus:outline-none focus-visible:bg-raised/40',
                    hovered === r.feature.id && 'bg-raised/40',
                  )}
                  style={{ top: r.y, height: ROW_H }}
                >
                  <span className="text-sm truncate flex-1">{r.feature.label}</span>
                  <MsPickerPill feature={r.feature} />
                  <EffortBadge effort={r.feature.effort} className="shrink-0" />
                </div>
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
                const isDragging = drag?.id === f.id
                // While dragging, apply delta to the rendered position
                const snap = drag?.snap === 'half' ? 0.5 : 1
                const snapped =
                  drag && isDragging
                    ? Math.round(drag.deltaWeeks / snap) * snap
                    : 0
                const displayStart =
                  isDragging && drag?.mode === 'move'
                    ? drag.origStart + snapped
                    : f.ganttStart
                const displayEnd =
                  isDragging && drag?.mode === 'move'
                    ? drag.origEnd + snapped
                    : isDragging && drag?.mode === 'resize'
                    ? Math.max(drag.origStart + 1, drag.origEnd + snapped)
                    : f.ganttEnd
                const x = displayStart * WEEK_W
                const w = Math.max((displayEnd - displayStart) * WEEK_W, 8)
                const c = completion(f)
                const st = featureStatus(f)
                const conflict = hasConflict(project, f)
                const color = r.module.color
                const isHover = hovered === f.id
                const onBarPointerDown = (mode: 'move' | 'resize') => (
                  e: React.PointerEvent,
                ) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  setDrag({
                    id: f.id,
                    mode,
                    origStart: f.ganttStart,
                    origEnd: f.ganttEnd,
                    pointerX: e.clientX,
                    deltaWeeks: 0,
                    snap: e.shiftKey ? 'half' : 'full',
                    moved: false,
                  })
                }
                return (
                  <g
                    key={`bar-${f.id}`}
                    data-feature-id={f.id}
                    data-gantt-bar={f.id}
                    style={{ pointerEvents: 'auto' }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      ctx.openAt(e.clientX, e.clientY, featureMenu(api, f))
                    }}
                    onPointerMove={(e) => {
                      if (!drag || drag.id !== f.id) return
                      const dx = e.clientX - drag.pointerX
                      const deltaWeeks = dx / WEEK_W
                      const moved = Math.abs(dx) > 4
                      const snap: 'full' | 'half' = e.shiftKey ? 'half' : 'full'
                      if (
                        deltaWeeks !== drag.deltaWeeks ||
                        moved !== drag.moved ||
                        snap !== drag.snap
                      ) {
                        setDrag({ ...drag, deltaWeeks, moved, snap })
                      }
                    }}
                    onPointerUp={(e) => {
                      if (!drag || drag.id !== f.id) {
                        return
                      }
                      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
                      if (!drag.moved) {
                        openDrawer(f.id)
                      } else {
                        const s = drag.snap === 'half' ? 0.5 : 1
                        const snappedDelta = Math.round(drag.deltaWeeks / s) * s
                        if (drag.mode === 'move') {
                          setFeatureGantt(f.id, {
                            start: drag.origStart + snappedDelta,
                            end: drag.origEnd + snappedDelta,
                          })
                        } else {
                          const newEnd = Math.max(
                            drag.origStart + 1,
                            drag.origEnd + snappedDelta,
                          )
                          setFeatureGantt(f.id, {
                            start: drag.origStart,
                            end: newEnd,
                          })
                        }
                      }
                      setDrag(null)
                    }}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <rect
                      x={x}
                      y={r.y + 9}
                      width={w}
                      height={ROW_H - 18}
                      fill={color}
                      fillOpacity={
                        isDragging ? 0.3 : st === 'done' ? 0.35 : 0.12
                      }
                      stroke={conflict ? 'rgb(var(--danger))' : color}
                      strokeWidth={conflict ? 1.5 : 1}
                      onPointerDown={onBarPointerDown('move')}
                      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    />
                    <rect
                      x={x}
                      y={r.y + 9}
                      width={w * c.pct}
                      height={ROW_H - 18}
                      fill={color}
                      fillOpacity={isDragging ? 0.5 : 0.85}
                      style={{ pointerEvents: 'none' }}
                    />
                    {/* right-edge resize handle */}
                    <rect
                      x={x + w - 4}
                      y={r.y + 9}
                      width={4}
                      height={ROW_H - 18}
                      fill="transparent"
                      data-gantt-resize={f.id}
                      onPointerDown={onBarPointerDown('resize')}
                      style={{ cursor: 'ew-resize' }}
                    />
                    {isHover && !isDragging && (
                      <rect
                        x={x + w - 4}
                        y={r.y + 9}
                        width={4}
                        height={ROW_H - 18}
                        fill="rgb(var(--fg))"
                        fillOpacity={0.25}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {isHover && (
                      <rect
                        x={x - 1}
                        y={r.y + 8}
                        width={w + 2}
                        height={ROW_H - 16}
                        fill="none"
                        stroke="rgb(var(--fg))"
                        strokeWidth="1"
                        style={{ pointerEvents: 'none' }}
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
                    {isDragging && drag.moved && (
                      <text
                        x={x + w / 2}
                        y={r.y + 6}
                        textAnchor="middle"
                        fontFamily="Geist Mono"
                        fontSize="10"
                        fill="rgb(var(--accent))"
                        style={{ pointerEvents: 'none' }}
                      >
                        W{displayStart.toString().padStart(2, '0')}–W
                        {displayEnd.toString().padStart(2, '0')}
                      </text>
                    )}
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
      {ctx.menu}
    </div>
  )
}

function MsPickerPill({ feature }: { feature: Feature }) {
  const project = useProjectStore((s) => s.project)
  const moveFeatureToMs = useProjectStore((s) => s.moveFeatureToMs)
  const ctx = useContextMenu()
  return (
    <>
      <button
        data-stop-row-open
        onClick={(e) => {
          e.stopPropagation()
          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
          ctx.openAt(
            r.left,
            r.bottom + 4,
            project.meta.milestones.map((ms) => ({
              kind: 'action' as const,
              label: `${ms.id} — ${ms.label}`,
              disabled: ms.id === feature.ms,
              run: () => moveFeatureToMs(feature.id, ms.id),
            })),
          )
        }}
        title="Change milestone"
        className="label-mono num-mono text-accent shrink-0 px-1.5 py-0.5 border border-line/40 hover:border-accent/70 hover:bg-accent/5 transition-colors"
      >
        {feature.ms}
      </button>
      {ctx.menu}
    </>
  )
}

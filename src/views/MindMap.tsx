import { useCallback, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import {
  featureIndex,
  featureStatus,
  hasConflict,
  isBlocked,
  matchesFilters,
} from '@/lib/deps'
import type { Feature, Module } from '@/types'

type Point = { x: number; y: number }

const W = 1400
const H = 900
const CX = W / 2
const CY = H / 2

export function MindMap() {
  const project = useProjectStore((s) => s.project)
  const activeMs = useProjectStore((s) => s.activeMilestone)
  const activeStatus = useProjectStore((s) => s.activeStatus)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const [hover, setHover] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [panning, setPanning] = useState(false)
  const panRef = useRef(false)
  const pointerStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const resetView = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // SVG coordinates under the cursor should stay put across the zoom.
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      // Convert viewport px to SVG user coords (W × H viewBox).
      const sx = (cx / rect.width) * W
      const sy = (cy / rect.height) * H
      const delta = -e.deltaY * 0.0015
      const next = Math.min(3, Math.max(0.3, scale * Math.exp(delta)))
      // point = tx + scale*svgPt  →  keep svgPt under cursor stable
      const svgPtX = (sx - tx) / scale
      const svgPtY = (sy - ty) / scale
      setTx(sx - svgPtX * next)
      setTy(sy - svgPtY * next)
      setScale(next)
    },
    [scale, tx, ty],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      panRef.current = true
      setPanning(true)
      pointerStart.current = { x: e.clientX, y: e.clientY, tx, ty }
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [tx, ty],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panRef.current || !pointerStart.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = W / rect.width
    const scaleY = H / rect.height
    const dx = (e.clientX - pointerStart.current.x) * scaleX
    const dy = (e.clientY - pointerStart.current.y) * scaleY
    setTx(pointerStart.current.tx + dx)
    setTy(pointerStart.current.ty + dy)
  }, [])

  const onPointerUp = useCallback(() => {
    panRef.current = false
    setPanning(false)
    pointerStart.current = null
  }, [])

  const modules = project.modules
    .map((m) => ({
      ...m,
      features: m.features.filter((f) =>
        matchesFilters(project, f, activeMs, activeStatus),
      ),
    }))
    .filter(
      (m) =>
        m.features.length > 0 || (activeMs === 'all' && activeStatus === 'all'),
    )

  const layout = useMemo(() => {
    const modCount = Math.max(modules.length, 1)
    const modRadius = modCount <= 4 ? 210 : modCount <= 6 ? 240 : 270
    const featRadius = modCount <= 4 ? 160 : modCount <= 6 ? 140 : 120
    // Each module gets a sector of the circle; features spread within ~60% of it
    const sectorSize = (Math.PI * 2) / modCount
    const spreadBudget = sectorSize * 0.6
    const modPoints: { mod: Module; center: Point; features: { feat: Feature; point: Point }[] }[] = []
    modules.forEach((m, i) => {
      const angle = (i / modCount) * Math.PI * 2 - Math.PI / 2
      const center = {
        x: CX + Math.cos(angle) * modRadius,
        y: CY + Math.sin(angle) * modRadius,
      }
      const fCount = m.features.length
      const step =
        fCount <= 1 ? 0 : Math.min(0.26, spreadBudget / Math.max(fCount - 1, 1))
      const features = m.features.map((f, j) => {
        const subAngle = angle + (j - (fCount - 1) / 2) * step
        return {
          feat: f,
          point: {
            x: center.x + Math.cos(subAngle) * featRadius,
            y: center.y + Math.sin(subAngle) * featRadius,
          },
        }
      })
      modPoints.push({ mod: m, center, features })
    })
    return modPoints
  }, [modules])

  const idx = featureIndex(project)
  const depLines: { from: Point; to: Point; conflict: boolean }[] = []
  for (const mp of layout) {
    for (const fp of mp.features) {
      for (const d of fp.feat.deps) {
        const target = idx.get(d.id)
        if (!target) continue
        const targetPoint = layout
          .flatMap((x) => x.features)
          .find((x) => x.feat.id === target.id)?.point
        if (!targetPoint) continue
        depLines.push({
          from: targetPoint,
          to: fp.point,
          conflict: hasConflict(project, fp.feat),
        })
      }
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-8 pb-4 border-b border-line/40">
        <div className="label-mono mb-3">
          <span className="num-mono">04</span> · MIND MAP
        </div>
        <h1 className="ser-display text-6xl italic leading-none">constellation</h1>
      </div>

      <div
        className="flex-1 min-h-0 grain relative overflow-hidden"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={resetView}
        style={{ touchAction: 'none', cursor: panning ? 'grabbing' : 'grab' }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          <defs>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.12" />
              <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* center glow */}
          <circle cx={CX} cy={CY} r="200" fill="url(#centerGlow)" />

          {/* module spokes */}
          {layout.map((mp) => (
            <line
              key={`spoke-${mp.mod.id}`}
              x1={CX}
              y1={CY}
              x2={mp.center.x}
              y2={mp.center.y}
              stroke="rgb(var(--line))"
              strokeOpacity="0.5"
              strokeDasharray="2 3"
            />
          ))}

          {/* feature spokes */}
          {layout.map((mp) =>
            mp.features.map((fp) => (
              <line
                key={`fs-${fp.feat.id}`}
                x1={mp.center.x}
                y1={mp.center.y}
                x2={fp.point.x}
                y2={fp.point.y}
                stroke={mp.mod.color}
                strokeOpacity="0.3"
              />
            )),
          )}

          {/* dep lines */}
          {depLines.map((l, i) => (
            <line
              key={`dep-${i}`}
              x1={l.from.x}
              y1={l.from.y}
              x2={l.to.x}
              y2={l.to.y}
              stroke={l.conflict ? 'rgb(var(--danger))' : 'rgb(var(--fg-subtle))'}
              strokeOpacity={l.conflict ? 0.5 : 0.18}
              strokeWidth={l.conflict ? 1.2 : 0.6}
              strokeDasharray="4 4"
            />
          ))}

          {/* center */}
          <g>
            <circle cx={CX} cy={CY} r="52" fill="rgb(var(--void))" stroke="rgb(var(--accent))" strokeWidth="1.5" />
            <text
              x={CX}
              y={CY + 6}
              textAnchor="middle"
              fontFamily="Instrument Serif"
              fontStyle="italic"
              fontSize="22"
              fill="rgb(var(--fg))"
            >
              {project.meta.name}
            </text>
          </g>

          {/* module nodes */}
          {layout.map((mp) => (
            <g key={`mod-${mp.mod.id}`}>
              <circle
                cx={mp.center.x}
                cy={mp.center.y}
                r="30"
                fill="rgb(var(--base))"
                stroke={mp.mod.color}
                strokeWidth="1.5"
              />
              <text
                x={mp.center.x}
                y={mp.center.y + 4}
                textAnchor="middle"
                fontFamily="Geist"
                fontSize="12"
                fontWeight="500"
                fill="rgb(var(--fg))"
              >
                {mp.mod.label}
              </text>
            </g>
          ))}

          {/* feature nodes */}
          {layout.map((mp) =>
            mp.features.map((fp) => {
              const st = featureStatus(fp.feat)
              const conflict = hasConflict(project, fp.feat)
              const blocked = isBlocked(project, fp.feat)
              const fill =
                st === 'done'
                  ? 'rgb(var(--success))'
                  : st === 'progress'
                  ? 'rgb(var(--accent))'
                  : 'rgb(var(--void))'
              const stroke = conflict
                ? 'rgb(var(--danger))'
                : blocked
                ? 'rgb(var(--warn))'
                : mp.mod.color
              const isHover = hover === fp.feat.id
              return (
                <g
                  key={`feat-${fp.feat.id}`}
                  onMouseEnter={() => setHover(fp.feat.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => openDrawer(fp.feat.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    cx={fp.point.x}
                    cy={fp.point.y}
                    r={isHover ? 8 : 5}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isHover ? 2 : 1}
                  />
                  {isHover && (
                    <text
                      x={fp.point.x}
                      y={fp.point.y + 22}
                      textAnchor="middle"
                      fontFamily="Geist"
                      fontSize="11"
                      fill="rgb(var(--fg))"
                    >
                      {fp.feat.label}
                    </text>
                  )}
                </g>
              )
            }),
          )}
          </g>
        </svg>

        {/* legend */}
        <div className="absolute bottom-6 left-6 flex items-center gap-5 label-mono bg-base/80 border border-line/60 px-4 py-2.5 backdrop-blur">
          <LegendDot color="bg-success" label="done" />
          <LegendDot color="bg-accent" label="progress" />
          <LegendDot color="bg-void border border-line-strong" label="backlog" />
          <LegendDot color="bg-warn" label="blocked" />
          <LegendDot color="bg-danger" label="conflict" />
        </div>

        {/* zoom controls */}
        <div className="absolute bottom-6 right-6 flex items-center gap-2 label-mono bg-base/80 border border-line/60 px-3 py-2 backdrop-blur">
          <span className="num-mono text-fg-subtle">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={resetView}
            className="text-fg-muted hover:text-fg"
            title="Reset view (double-click)"
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}

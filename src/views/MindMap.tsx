import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { useFilteredFeatures } from '@/hooks/useFilteredFeatures'
import {
  featureIndex,
  featureStatus,
  hasConflict,
  isBlocked,
} from '@/lib/deps'
import type { Dep, Feature } from '@/types'
import { useContextMenu } from '@/components/ContextMenu'
import { emptyAreaMenu, featureMenu } from '@/lib/featureActions'
import { useFeatureActionsApi } from '@/hooks/useFeatureActionsApi'
import { useMindmapLayout, type Point } from '@/hooks/useMindmapLayout'

const W = 1400
const H = 900
const CX = W / 2
const CY = H / 2

export function MindMap() {
  const { project, modules: filteredModules, activeMilestone: activeMs, activeStatus } =
    useFilteredFeatures()
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const overrides = useProjectStore((s) => s.mindmapOverrides)
  const setOverride = useProjectStore((s) => s.setMindmapOverride)
  const resetOverrides = useProjectStore((s) => s.resetMindmapOverrides)
  const pinPositions = useProjectStore((s) => s.pinMindmapPositions)
  const clearPositions = useProjectStore((s) => s.clearMindmapPositions)
  const pinned = project.meta.mindmapPositions
  const [hover, setHover] = useState<string | null>(null)
  const ctx = useContextMenu()
  const api = useFeatureActionsApi()
  const [nodeDrag, setNodeDrag] = useState<{
    id: string
    pointerX: number
    pointerY: number
    origX: number
    origY: number
    dx: number
    dy: number
    moved: boolean
  } | null>(null)
  const [connect, setConnect] = useState<{
    fromId: string
    fromX: number
    fromY: number
    x: number
    y: number
  } | null>(null)
  const openDepEditor = useProjectStore((s) => s.openDepEditor)
  const removeDep = useProjectStore((s) => s.removeDep)

  const svgRef = useRef<SVGSVGElement>(null)
  const featPointMapRef = useRef<Map<string, Point>>(new Map())
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [panning, setPanning] = useState(false)
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('lodestar:mindmap-hint-seen')) return
    setShowHint(true)
    const t = window.setTimeout(() => {
      setShowHint(false)
      localStorage.setItem('lodestar:mindmap-hint-seen', '1')
    }, 6000)
    return () => window.clearTimeout(t)
  }, [])
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

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }
      const rect = svg.getBoundingClientRect()
      const svgX = ((clientX - rect.left) / rect.width) * W
      const svgY = ((clientY - rect.top) / rect.height) * H
      return { x: (svgX - tx) / scale, y: (svgY - ty) / scale }
    },
    [tx, ty, scale],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      if (nodeDrag || connect) return
      // only pan on empty background, not on nodes (nodes handle their own pointerdown)
      panRef.current = true
      setPanning(true)
      pointerStart.current = { x: e.clientX, y: e.clientY, tx, ty }
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [tx, ty, nodeDrag, connect],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (connect) {
        const p = clientToWorld(e.clientX, e.clientY)
        if (p.x !== connect.x || p.y !== connect.y) {
          setConnect({ ...connect, x: p.x, y: p.y })
        }
        return
      }
      if (nodeDrag) {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const clientDx = e.clientX - nodeDrag.pointerX
        const clientDy = e.clientY - nodeDrag.pointerY
        const dx = (clientDx * W) / rect.width / scale
        const dy = (clientDy * H) / rect.height / scale
        const moved = Math.hypot(clientDx, clientDy) > 3
        if (dx !== nodeDrag.dx || dy !== nodeDrag.dy || moved !== nodeDrag.moved) {
          setNodeDrag({ ...nodeDrag, dx, dy, moved })
        }
        return
      }
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
    },
    [nodeDrag, connect, clientToWorld, scale],
  )

  const hitTestFeature = useCallback(
    (worldX: number, worldY: number, excludeId: string): string | null => {
      let bestId: string | null = null
      let bestDist = Infinity
      featPointMapRef.current.forEach((p, id) => {
        if (id === excludeId) return
        const d = Math.hypot(p.x - worldX, p.y - worldY)
        if (d > 18) return
        if (d < bestDist) {
          bestDist = d
          bestId = id
        }
      })
      return bestId
    },
    [],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (connect) {
        const hitId = hitTestFeature(connect.x, connect.y, connect.fromId)
        ;(e.target as Element).releasePointerCapture?.(e.pointerId)
        if (hitId) {
          openDepEditor(connect.fromId, hitId, {
            x: e.clientX - 150,
            y: e.clientY + 10,
          })
        }
        setConnect(null)
        return
      }
      if (nodeDrag) {
        if (nodeDrag.moved) {
          setOverride(nodeDrag.id, {
            x: nodeDrag.origX + nodeDrag.dx,
            y: nodeDrag.origY + nodeDrag.dy,
          })
        } else {
          openDrawer(nodeDrag.id)
        }
        setNodeDrag(null)
        ;(e.target as Element).releasePointerCapture?.(e.pointerId)
        return
      }
      panRef.current = false
      setPanning(false)
      pointerStart.current = null
    },
    [nodeDrag, connect, hitTestFeature, openDepEditor, setOverride, openDrawer],
  )

  const modules = filteredModules
    .map(({ module: m, features }) => ({ ...m, features }))
    .filter(
      (m) =>
        m.features.length > 0 || (activeMs === 'all' && activeStatus === 'all'),
    )

  const layout = useMindmapLayout(modules, { width: W, height: H })

  const idx = featureIndex(project)

  const resolvePoint = (featId: string, autoPoint: Point): Point => {
    if (nodeDrag && nodeDrag.id === featId) {
      return {
        x: nodeDrag.origX + nodeDrag.dx,
        y: nodeDrag.origY + nodeDrag.dy,
      }
    }
    const ov = overrides[featId]
    if (ov) return ov
    const pin = pinned?.[featId]
    if (pin) return pin
    return autoPoint
  }

  const featPointMap = new Map<string, Point>()
  for (const mp of layout) {
    for (const fp of mp.features) {
      featPointMap.set(fp.feat.id, resolvePoint(fp.feat.id, fp.point))
    }
  }
  featPointMapRef.current = featPointMap

  type DepLine = {
    from: Point
    to: Point
    conflict: boolean
    sourceFeatureId: string
    depId: string
    reason: string
    type: Dep['type']
  }
  const depLines: DepLine[] = []
  for (const mp of layout) {
    for (const fp of mp.features) {
      const fromPoint = featPointMap.get(fp.feat.id)
      if (!fromPoint) continue
      for (const d of fp.feat.deps) {
        const target = idx.get(d.id)
        if (!target) continue
        const targetPoint = featPointMap.get(target.id)
        if (!targetPoint) continue
        depLines.push({
          from: targetPoint,
          to: fromPoint,
          conflict: hasConflict(project, fp.feat),
          sourceFeatureId: fp.feat.id,
          depId: d.id,
          reason: d.reason,
          type: d.type,
        })
      }
    }
  }

  return (
    <div
      className="h-full flex flex-col"
      role="tabpanel"
      id="view-mindmap"
      aria-label="Mind Map"
      data-testid="view-mindmap"
    >
      <div className="px-8 pt-8 pb-4 border-b border-line/40">
        <div className="label-mono mb-3">
          <span className="num-mono">04</span> · MIND MAP
        </div>
        <h1 className="ser-display text-6xl italic leading-none">constellation</h1>
      </div>

      <div
        className="flex-1 min-h-0 grain relative overflow-hidden"
        data-testid="mindmap-canvas"
        data-mindmap-zoom={scale.toFixed(3)}
        data-mindmap-pan-x={tx.toFixed(1)}
        data-mindmap-pan-y={ty.toFixed(1)}
        data-mindmap-panning={panning ? 'true' : 'false'}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={resetView}
        onContextMenu={(e) => {
          e.preventDefault()
          ctx.openAt(e.clientX, e.clientY, emptyAreaMenu(api, { kind: 'mindmap-empty' }))
        }}
        style={{
          touchAction: 'none',
          cursor: connect ? 'crosshair' : panning ? 'grabbing' : 'grab',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full select-none"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Mind map constellation"
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
            mp.features.map((fp) => {
              const p = featPointMap.get(fp.feat.id) ?? fp.point
              return (
                <line
                  key={`fs-${fp.feat.id}`}
                  x1={mp.center.x}
                  y1={mp.center.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={mp.mod.color}
                  strokeOpacity="0.3"
                />
              )
            }),
          )}

          {/* dep lines */}
          {depLines.map((l, i) => (
            <g key={`dep-${i}`}>
              <line
                x1={l.from.x}
                y1={l.from.y}
                x2={l.to.x}
                y2={l.to.y}
                stroke={l.conflict ? 'rgb(var(--danger))' : 'rgb(var(--fg-subtle))'}
                strokeOpacity={l.conflict ? 0.5 : 0.18}
                strokeWidth={l.conflict ? 1.2 : 0.6}
                strokeDasharray="4 4"
                style={{ pointerEvents: 'none' }}
              />
              {/* invisible thicker hit line for right-click */}
              <line
                x1={l.from.x}
                y1={l.from.y}
                x2={l.to.x}
                y2={l.to.y}
                stroke="transparent"
                strokeWidth={12}
                style={{ pointerEvents: 'stroke', cursor: 'context-menu' }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  ctx.openAt(e.clientX, e.clientY, [
                    {
                      kind: 'label',
                      label: `${l.sourceFeatureId} → ${l.depId} (${l.type})`,
                    },
                    ...(l.reason
                      ? ([{ kind: 'label', label: l.reason }] as const)
                      : []),
                    { kind: 'separator' },
                    {
                      kind: 'action',
                      label: 'Remove dependency',
                      danger: true,
                      run: () => removeDep(l.sourceFeatureId, l.depId),
                    },
                  ])
                }}
              />
            </g>
          ))}

          {/* live connect line while shift-dragging */}
          {connect && (
            <g style={{ pointerEvents: 'none' }}>
              <line
                x1={connect.fromX}
                y1={connect.fromY}
                x2={connect.x}
                y2={connect.y}
                stroke="rgb(var(--accent))"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <circle
                cx={connect.x}
                cy={connect.y}
                r={4}
                fill="rgb(var(--accent))"
                fillOpacity={0.8}
              />
            </g>
          )}

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
            <g
              key={`mod-${mp.mod.id}`}
              data-module-id={mp.mod.id}
              data-mindmap-module={mp.mod.id}
            >
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
              const p = featPointMap.get(fp.feat.id) ?? fp.point
              const isDragging = nodeDrag?.id === fp.feat.id
              const basePoint =
                overrides[fp.feat.id] ?? pinned?.[fp.feat.id] ?? fp.point
              return (
                <g
                  key={`feat-${fp.feat.id}`}
                  data-feature-id={fp.feat.id}
                  data-mindmap-node={fp.feat.id}
                  data-mindmap-x={p.x.toFixed(1)}
                  data-mindmap-y={p.y.toFixed(1)}
                  onMouseEnter={() => setHover(fp.feat.id)}
                  onMouseLeave={() => setHover(null)}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    ;(e.target as Element).setPointerCapture?.(e.pointerId)
                    if (e.shiftKey) {
                      setConnect({
                        fromId: fp.feat.id,
                        fromX: p.x,
                        fromY: p.y,
                        x: p.x,
                        y: p.y,
                      })
                      return
                    }
                    setNodeDrag({
                      id: fp.feat.id,
                      pointerX: e.clientX,
                      pointerY: e.clientY,
                      origX: basePoint.x,
                      origY: basePoint.y,
                      dx: 0,
                      dy: 0,
                      moved: false,
                    })
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    ctx.openAt(e.clientX, e.clientY, featureMenu(api, fp.feat))
                  }}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHover || isDragging ? 8 : 5}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isHover || isDragging ? 2 : 1}
                    strokeDasharray={
                      overrides[fp.feat.id]
                        ? '2 2'
                        : pinned?.[fp.feat.id]
                        ? '1 2'
                        : undefined
                    }
                  />
                  {(isHover || isDragging) && (
                    <text
                      x={p.x}
                      y={p.y + 22}
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

        {showHint && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 label-mono bg-base/95 border border-accent/60 px-4 py-2.5 backdrop-blur animate-pulse pointer-events-none">
            <span className="text-accent">▸</span>
            <span className="ml-2 text-fg">Wheel zoom · Drag pan · Drag nodes · Shift+drag to connect · Right-click for menu</span>
          </div>
        )}

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
          {Object.keys(overrides).length > 0 && (
            <>
              <span className="text-fg-subtle">·</span>
              <button
                onClick={pinPositions}
                className="text-fg-muted hover:text-accent"
                title="Save these positions with the project"
              >
                PIN
              </button>
              <button
                onClick={resetOverrides}
                className="text-fg-muted hover:text-fg"
                title="Discard position changes"
              >
                CLEAR
              </button>
            </>
          )}
          {Object.keys(overrides).length === 0 && pinned && Object.keys(pinned).length > 0 && (
            <>
              <span className="text-fg-subtle">·</span>
              <button
                onClick={clearPositions}
                className="text-fg-muted hover:text-danger"
                title="Remove saved positions (back to auto-layout)"
              >
                UNPIN
              </button>
            </>
          )}
        </div>
      </div>
      {ctx.menu}
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

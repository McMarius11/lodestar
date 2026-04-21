import { useMemo } from 'react'
import type { Feature, Milestone, Module } from '@/types'

export type GanttRow =
  | { kind: 'module'; module: Module; y: number }
  | { kind: 'feature'; feature: Feature; module: Module; y: number }

export type MilestoneBand = {
  ms: Milestone
  start: number
  end: number
  index: number
}

export type GanttLayout = {
  rows: GanttRow[]
  featureRows: Map<string, GanttRow & { kind: 'feature' }>
  milestoneBands: MilestoneBand[]
  weeks: number
  totalH: number
}

/**
 * Row-by-row geometry for the Gantt chart.
 *
 * Stacks modules with their features, skipping empty modules. Derives the
 * visible time span from the latest feature end plus a small tail, so the
 * viewport always has room to grow. Milestone bands are computed from the
 * feature bounds inside each milestone so they hug the work rather than
 * guessing a range.
 *
 * Pure — depends only on the filtered modules, not on UI state like drag
 * gestures or hover.
 */
export function useGanttLayout(
  modules: Module[],
  milestones: Milestone[],
  rowHeight: number,
): GanttLayout {
  return useMemo(() => {
    const rows: GanttRow[] = []
    let y = 0
    for (const m of modules) {
      if (m.features.length === 0) continue
      rows.push({ kind: 'module', module: m, y })
      y += rowHeight
      for (const f of m.features) {
        rows.push({ kind: 'feature', feature: f, module: m, y })
        y += rowHeight
      }
    }

    const featureRows = new Map<string, GanttRow & { kind: 'feature' }>()
    for (const r of rows) if (r.kind === 'feature') featureRows.set(r.feature.id, r)

    const allFeatures = modules.flatMap((m) => m.features)
    const maxWeek = Math.max(
      ...allFeatures.map((f) => f.ganttEnd),
      ...milestones.map((_, i) => (i + 1) * 5),
      20,
    )
    const weeks = maxWeek + 2

    const milestoneBands: MilestoneBand[] = []
    milestones.forEach((ms, i) => {
      const features = allFeatures.filter((f) => f.ms === ms.id)
      if (features.length === 0) return
      const start = Math.min(...features.map((f) => f.ganttStart))
      const end = Math.max(...features.map((f) => f.ganttEnd))
      milestoneBands.push({ ms, start, end, index: i })
    })

    return { rows, featureRows, milestoneBands, weeks, totalH: y }
  }, [modules, milestones, rowHeight])
}

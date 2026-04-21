import { useMemo } from 'react'
import type { Feature, Module } from '@/types'

export type Point = { x: number; y: number }

export type MindmapModulePoint = {
  mod: Module
  center: Point
  features: { feat: Feature; point: Point }[]
}

/**
 * Radial layout for the MindMap view.
 *
 * Each module takes a sector of the circle around the canvas center. Features
 * spread across ~60% of their module's sector so the sector edges breathe.
 * Radius sizes scale inversely with module count so dense projects stay
 * readable without tuning.
 *
 * Pure function of `modules` + canvas size — no React state, no store.
 */
export function useMindmapLayout(
  modules: Module[],
  canvas: { width: number; height: number },
): MindmapModulePoint[] {
  return useMemo(() => {
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const modCount = Math.max(modules.length, 1)
    const modRadius = modCount <= 4 ? 210 : modCount <= 6 ? 240 : 270
    const featRadius = modCount <= 4 ? 160 : modCount <= 6 ? 140 : 120
    const sectorSize = (Math.PI * 2) / modCount
    const spreadBudget = sectorSize * 0.6
    return modules.map((m, i) => {
      const angle = (i / modCount) * Math.PI * 2 - Math.PI / 2
      const center: Point = {
        x: cx + Math.cos(angle) * modRadius,
        y: cy + Math.sin(angle) * modRadius,
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
          } satisfies Point,
        }
      })
      return { mod: m, center, features }
    })
  }, [modules, canvas.width, canvas.height])
}

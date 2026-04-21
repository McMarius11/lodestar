import type { Feature, Project } from '@/types'
import { depStatus, effortWeeks, featureIndex, findCycles, milestoneOrder } from './deps'

export type Issue = {
  severity: 'error' | 'warn' | 'info'
  kind:
    | 'unknown-dep'
    | 'dep-conflict'
    | 'dep-cycle'
    | 'gantt-invalid'
    | 'gantt-effort-mismatch'
    | 'orphan-milestone'
  featureId?: string
  moduleId?: string
  message: string
  detail?: string
}

export function validate(project: Project): Issue[] {
  const issues: Issue[] = []
  const idx = featureIndex(project)
  const ord = milestoneOrder(project)
  const msIds = new Set(project.meta.milestones.map((m) => m.id))

  for (const m of project.modules) {
    for (const f of m.features) {
      for (const d of f.deps) {
        if (!idx.has(d.id)) {
          issues.push({
            severity: 'error',
            kind: 'unknown-dep',
            featureId: f.id,
            moduleId: m.id,
            message: `${f.label} → unbekannte Dep "${d.id}"`,
          })
          continue
        }
        const s = depStatus(project, f, d, idx, ord)
        if (s === 'conflict' && d.type !== 'optional') {
          const target = idx.get(d.id)!
          issues.push({
            severity: 'warn',
            kind: 'dep-conflict',
            featureId: f.id,
            moduleId: m.id,
            message: `${f.label} (${f.ms}) braucht ${target.label} (${target.ms})`,
            detail: d.reason,
          })
        }
      }
      if (f.ganttEnd <= f.ganttStart) {
        issues.push({
          severity: 'error',
          kind: 'gantt-invalid',
          featureId: f.id,
          moduleId: m.id,
          message: `${f.label} — Gantt-Ende ≤ Start (W${f.ganttStart}–W${f.ganttEnd})`,
        })
      }
      const span = f.ganttEnd - f.ganttStart
      const expected = effortWeeks[f.effort]
      if (span > 0 && Math.abs(span - expected) >= 2) {
        issues.push({
          severity: 'info',
          kind: 'gantt-effort-mismatch',
          featureId: f.id,
          moduleId: m.id,
          message: `${f.label} — Effort ${f.effort} ≈ ${expected}w, Gantt ${span}w`,
        })
      }
      if (!msIds.has(f.ms)) {
        issues.push({
          severity: 'error',
          kind: 'orphan-milestone',
          featureId: f.id,
          moduleId: m.id,
          message: `${f.label} — Milestone "${f.ms}" existiert nicht`,
        })
      }
    }
  }

  const { cycles } = findCycles(project)
  for (const c of cycles) {
    const labels = c.map((id) => idx.get(id)?.label ?? id)
    issues.push({
      severity: 'error',
      kind: 'dep-cycle',
      message: `Dep-Zyklus: ${labels.join(' → ')}`,
    })
  }

  return issues
}

export function countBySeverity(issues: Issue[]): {
  error: number
  warn: number
  info: number
} {
  return issues.reduce(
    (acc, i) => ({ ...acc, [i.severity]: acc[i.severity] + 1 }),
    { error: 0, warn: 0, info: 0 },
  )
}

export function issuesForFeature(issues: Issue[], featureId: string): Issue[] {
  return issues.filter((i) => i.featureId === featureId)
}

export type { Feature }

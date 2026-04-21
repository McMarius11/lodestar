import type {
  Dep,
  DepStatus,
  Feature,
  FeatureStatus,
  Project,
} from '@/types'

export function featureStatus(f: Feature): FeatureStatus {
  if (f.tasks.length === 0) return 'backlog'
  const done = f.tasks.filter((t) => t.done).length
  if (done === 0) return 'backlog'
  if (done === f.tasks.length) return 'done'
  return 'progress'
}

export function completion(f: Feature): { done: number; total: number; pct: number } {
  const total = f.tasks.length
  const done = f.tasks.filter((t) => t.done).length
  return { done, total, pct: total === 0 ? 0 : done / total }
}

export function featureIndex(project: Project): Map<string, Feature> {
  const out = new Map<string, Feature>()
  for (const m of project.modules) for (const f of m.features) out.set(f.id, f)
  return out
}

export function moduleOf(project: Project, featureId: string): string | null {
  for (const m of project.modules) {
    if (m.features.some((f) => f.id === featureId)) return m.id
  }
  return null
}

export function milestoneOrder(project: Project): Map<string, number> {
  const out = new Map<string, number>()
  project.meta.milestones.forEach((ms, i) => out.set(ms.id, i))
  return out
}

export function depStatus(
  project: Project,
  feat: Feature,
  dep: Dep,
  index?: Map<string, Feature>,
  order?: Map<string, number>,
): DepStatus {
  const idx = index ?? featureIndex(project)
  const ord = order ?? milestoneOrder(project)
  const target = idx.get(dep.id)
  if (!target) return 'unknown'
  if (featureStatus(target) === 'done') return 'done'
  const featMs = ord.get(feat.ms) ?? -1
  const depMs = ord.get(target.ms) ?? -1
  if (depMs > featMs) return 'conflict'
  if (depMs === featMs) return 'same'
  return 'open'
}

export function isBlocked(project: Project, feat: Feature): boolean {
  const idx = featureIndex(project)
  const ord = milestoneOrder(project)
  return feat.deps.some((d) => {
    if (d.type === 'optional') return false
    const s = depStatus(project, feat, d, idx, ord)
    return s === 'conflict' || s === 'open'
  })
}

export function blockedBy(project: Project, feat: Feature): Feature[] {
  const idx = featureIndex(project)
  const ord = milestoneOrder(project)
  const out: Feature[] = []
  for (const d of feat.deps) {
    if (d.type === 'optional') continue
    const s = depStatus(project, feat, d, idx, ord)
    if (s === 'conflict' || s === 'open') {
      const t = idx.get(d.id)
      if (t) out.push(t)
    }
  }
  return out
}

export function hasConflict(project: Project, feat: Feature): boolean {
  const idx = featureIndex(project)
  const ord = milestoneOrder(project)
  return feat.deps.some((d) => depStatus(project, feat, d, idx, ord) === 'conflict')
}

export type CycleResult = { cycles: string[][] }

export function findCycles(project: Project): CycleResult {
  const idx = featureIndex(project)
  const cycles: string[][] = []
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []

  for (const id of idx.keys()) color.set(id, WHITE)

  function visit(id: string) {
    color.set(id, GRAY)
    stack.push(id)
    const f = idx.get(id)!
    for (const d of f.deps) {
      const c = color.get(d.id)
      if (c === undefined) continue
      if (c === GRAY) {
        const from = stack.indexOf(d.id)
        cycles.push(stack.slice(from).concat(d.id))
      } else if (c === WHITE) {
        visit(d.id)
      }
    }
    stack.pop()
    color.set(id, BLACK)
  }

  for (const id of idx.keys()) {
    if (color.get(id) === WHITE) visit(id)
  }
  return { cycles }
}

export const effortWeeks: Record<Feature['effort'], number> = {
  S: 1,
  M: 2,
  L: 3,
  XL: 5,
}

export type StatusFilter = 'all' | 'ready' | 'blocked' | 'conflict'

export function matchesStatus(
  project: Project,
  feat: Feature,
  status: StatusFilter,
): boolean {
  if (status === 'all') return true
  const conflict = hasConflict(project, feat)
  const blocked = isBlocked(project, feat)
  if (status === 'conflict') return conflict
  if (status === 'blocked') return blocked && !conflict
  if (status === 'ready') return !blocked && !conflict && featureStatus(feat) !== 'done'
  return true
}

export function matchesFilters(
  project: Project,
  feat: Feature,
  milestone: string | 'all',
  status: StatusFilter,
): boolean {
  if (milestone !== 'all' && feat.ms !== milestone) return false
  return matchesStatus(project, feat, status)
}

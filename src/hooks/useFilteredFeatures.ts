import { useMemo } from 'react'
import type { Feature, Module, Project } from '@/types'
import { matchesFilters, type StatusFilter } from '@/lib/deps'
import { useProjectStore } from '@/store/useProjectStore'

/**
 * One place that applies the global Milestone + Status filters to the project.
 *
 * Every view that renders features should use this hook instead of reading
 * `activeMilestone` / `activeStatus` and filtering inline. Keeps filter
 * semantics consistent across views and avoids drift if filtering rules change.
 *
 * Returned shape:
 *   - `modules` — original modules in original order, each with its features
 *     already filtered (empty module groups are preserved).
 *   - `features` — flat list of all filtered features, sorted by module order.
 *   - `project` / `activeMilestone` / `activeStatus` — for views that still
 *     need the underlying state without a second subscription.
 */
export type FilteredModule = { module: Module; features: Feature[] }

export type FilteredFeatures = {
  project: Project
  modules: FilteredModule[]
  features: Feature[]
  activeMilestone: string | 'all'
  activeStatus: StatusFilter
}

export function useFilteredFeatures(): FilteredFeatures {
  const project = useProjectStore((s) => s.project)
  const activeMilestone = useProjectStore((s) => s.activeMilestone)
  const activeStatus = useProjectStore((s) => s.activeStatus)

  return useMemo(() => {
    const modules: FilteredModule[] = project.modules.map((m) => ({
      module: m,
      features: m.features.filter((f) =>
        matchesFilters(project, f, activeMilestone, activeStatus),
      ),
    }))
    const features = modules.flatMap((x) => x.features)
    return { project, modules, features, activeMilestone, activeStatus }
  }, [project, activeMilestone, activeStatus])
}

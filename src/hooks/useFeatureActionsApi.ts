import { useProjectStore } from '@/store/useProjectStore'
import type { FeatureActionsApi } from '@/lib/featureActions'

/**
 * Bridges the store to the menu-factory functions in `lib/featureActions.ts`.
 *
 * The factories are pure — they take a plain `Api` object and return a list of
 * menu items. Keeping them pure means the factories can be tested without
 * mounting React, and the store shape is not leaked into every view.
 *
 * This hook is the one place where the store is subscribed for menu use.
 */
export function useFeatureActionsApi(): FeatureActionsApi {
  const project = useProjectStore((s) => s.project)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const cloneFeature = useProjectStore((s) => s.cloneFeature)
  const deleteFeature = useProjectStore((s) => s.deleteFeature)
  const moveFeatureToModule = useProjectStore((s) => s.moveFeatureToModule)
  const moveFeatureToMs = useProjectStore((s) => s.moveFeatureToMs)
  const setFeatureColumn = useProjectStore((s) => s.setFeatureColumn)
  const addTask = useProjectStore((s) => s.addTask)
  const toggleTask = useProjectStore((s) => s.toggleTask)
  const updateFeature = useProjectStore((s) => s.updateFeature)
  const addFeature = useProjectStore((s) => s.addFeature)
  const cloneModule = useProjectStore((s) => s.cloneModule)
  const deleteModule = useProjectStore((s) => s.deleteModule)
  const updateModule = useProjectStore((s) => s.updateModule)
  const addModule = useProjectStore((s) => s.addModule)
  const toggleMilestoneEditor = useProjectStore((s) => s.toggleMilestoneEditor)
  const addDep = useProjectStore((s) => s.addDep)
  const removeDep = useProjectStore((s) => s.removeDep)
  const openDepEditor = useProjectStore((s) => s.openDepEditor)
  return {
    project,
    openDrawer,
    cloneFeature,
    deleteFeature,
    moveFeatureToModule,
    moveFeatureToMs,
    setFeatureColumn,
    addTask,
    toggleTask,
    updateFeature,
    addFeature,
    cloneModule,
    deleteModule,
    updateModule,
    addModule,
    toggleMilestoneEditor,
    addDep,
    removeDep,
    openDepEditor,
  }
}

import { useEffect, useMemo } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { matchesFilters } from '@/lib/deps'
import type { ViewId } from '@/types'

const viewMap: Record<string, ViewId> = {
  '1': 'scope',
  '2': 'roadmap',
  '3': 'kanban',
  '4': 'mindmap',
  '5': 'gantt',
  '6': 'validate',
}

function isTypingIn(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

export function useKeyboardNav() {
  const project = useProjectStore((s) => s.project)
  const activeMs = useProjectStore((s) => s.activeMilestone)
  const activeStatus = useProjectStore((s) => s.activeStatus)
  const activeView = useProjectStore((s) => s.activeView)
  const setActiveView = useProjectStore((s) => s.setActiveView)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const drawerId = useProjectStore((s) => s.drawerFeatureId)
  const depEditorOpen = useProjectStore((s) => s.depEditor !== null)
  const paletteOpen = useProjectStore((s) => s.paletteOpen)
  const helpOpen = useProjectStore((s) => s.helpOpen)
  const msEditorOpen = useProjectStore((s) => s.msEditorOpen)
  const metaEditorOpen = useProjectStore((s) => s.metaEditorOpen)
  const togglePalette = useProjectStore((s) => s.togglePalette)
  const toggleHelp = useProjectStore((s) => s.toggleHelp)
  const toggleTask = useProjectStore((s) => s.toggleTask)
  const addFeature = useProjectStore((s) => s.addFeature)
  const cloneFeature = useProjectStore((s) => s.cloneFeature)
  const updateFeature = useProjectStore((s) => s.updateFeature)
  const cursorId = useProjectStore((s) => s.cursorFeatureId)
  const setCursorId = useProjectStore((s) => s.setCursorFeature)
  const modalOpen =
    drawerId !== null || msEditorOpen || metaEditorOpen || depEditorOpen

  const visibleIds = useMemo(() => {
    const ids: string[] = []
    for (const m of project.modules) {
      for (const f of m.features) {
        if (matchesFilters(project, f, activeMs, activeStatus)) ids.push(f.id)
      }
    }
    return ids
  }, [project, activeMs, activeStatus])

  useEffect(() => {
    if (!cursorId || !visibleIds.includes(cursorId)) {
      setCursorId(visibleIds[0] ?? null)
    }
  }, [visibleIds, cursorId, setCursorId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paletteOpen || helpOpen) return
      if (isTypingIn(e.target)) return
      if (modalOpen) return

      // View switching 1..6
      const mapped = viewMap[e.key]
      if (mapped) {
        e.preventDefault()
        setActiveView(mapped)
        return
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        toggleHelp(true)
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        togglePalette(true)
        return
      }

      // Feature navigation (only while drawer closed)
      if (!drawerId) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          if (visibleIds.length === 0) return
          e.preventDefault()
          const i = cursorId ? visibleIds.indexOf(cursorId) : -1
          const next = visibleIds[Math.min(i + 1, visibleIds.length - 1)] ?? visibleIds[0]
          if (next) setCursorId(next)
          return
        }
        if (e.key === 'k' || e.key === 'ArrowUp') {
          if (visibleIds.length === 0) return
          e.preventDefault()
          const i = cursorId ? visibleIds.indexOf(cursorId) : 0
          const next = visibleIds[Math.max(i - 1, 0)] ?? visibleIds[0]
          if (next) setCursorId(next)
          return
        }
        if (e.key === 'Enter' && cursorId) {
          e.preventDefault()
          openDrawer(cursorId)
          return
        }
        if (e.key === ' ' && cursorId) {
          // toggle first task of focused feature
          const feat = project.modules.flatMap((m) => m.features).find((f) => f.id === cursorId)
          const first = feat?.tasks[0]
          if (first) {
            e.preventDefault()
            toggleTask(cursorId, first.id)
          }
          return
        }
        if (e.key === 'n') {
          const firstMod = project.modules[0]
          if (!firstMod) return
          e.preventDefault()
          const id = addFeature(firstMod.id, { label: 'New Feature' })
          openDrawer(id)
          return
        }
        if (e.key === 'F2' && cursorId) {
          const feat = project.modules
            .flatMap((m) => m.features)
            .find((f) => f.id === cursorId)
          if (!feat) return
          e.preventDefault()
          const next = prompt('Rename feature', feat.label)
          if (next && next.trim() && next.trim() !== feat.label) {
            updateFeature(feat.id, { label: next.trim() })
          }
          return
        }
        if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D') && cursorId) {
          e.preventDefault()
          const id = cloneFeature(cursorId)
          if (id) {
            setCursorId(id)
            openDrawer(id)
          }
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    activeView,
    cursorId,
    visibleIds,
    modalOpen,
    drawerId,
    depEditorOpen,
    paletteOpen,
    helpOpen,
    msEditorOpen,
    metaEditorOpen,
    project,
    setActiveView,
    openDrawer,
    togglePalette,
    toggleHelp,
    toggleTask,
    addFeature,
    cloneFeature,
    updateFeature,
    setCursorId,
  ])
}

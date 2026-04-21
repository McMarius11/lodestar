import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Dep, Feature, Module, Project, Task, ViewId } from '@/types'
import {
  exportProject,
  importProject,
  importProjectFromText,
  loadProject,
  saveProject,
  subscribeExternalChange,
} from '@/lib/persistence'
import { CURRENT_SCHEMA_VERSION, migrate } from '@/schema'
import { sampleProject } from '@/data/sample'
import { lodestarRoadmap } from '@/data/lodestarRoadmap'
import { newId, slugId } from '@/lib/id'
import { featureStatus } from '@/lib/deps'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type StatusFilter = 'all' | 'ready' | 'blocked' | 'conflict'

type State = {
  project: Project
  loaded: boolean
  source: 'disk' | 'localStorage' | 'sample' | 'none' | null
  externalChangePending: boolean
  activeView: ViewId
  activeMilestone: string | 'all'
  activeStatus: StatusFilter
  cursorFeatureId: string | null
  drawerFeatureId: string | null
  paletteOpen: boolean
  helpOpen: boolean
  msEditorOpen: boolean
  metaEditorOpen: boolean
  saveStatus: SaveStatus
  savedAt: number | null
  history: Project[]
  future: Project[]
  mindmapOverrides: Record<string, { x: number; y: number }>
}

type Actions = {
  init: () => Promise<void>
  setActiveView: (v: ViewId) => void
  setActiveMilestone: (ms: string | 'all') => void
  setActiveStatus: (s: StatusFilter) => void
  setCursorFeature: (id: string | null) => void
  openDrawer: (id: string | null) => void
  togglePalette: (open?: boolean) => void
  toggleHelp: (open?: boolean) => void
  toggleMilestoneEditor: (open?: boolean) => void
  toggleMetaEditor: (open?: boolean) => void
  setAllTasksDone: (featureId: string, done: boolean) => void

  toggleTask: (featureId: string, taskId: string) => void
  addTask: (featureId: string, label: string) => void
  updateTask: (featureId: string, taskId: string, patch: Partial<Task>) => void
  deleteTask: (featureId: string, taskId: string) => void

  addFeature: (moduleId: string, partial?: Partial<Feature>) => string
  updateFeature: (featureId: string, patch: Partial<Feature>) => void
  deleteFeature: (featureId: string) => void
  cloneFeature: (featureId: string) => string | null
  moveFeatureToModule: (featureId: string, targetModuleId: string) => void
  moveFeatureToMs: (featureId: string, ms: string) => void
  reorderFeatureInModule: (featureId: string, targetIndex: number) => void
  setFeatureGantt: (featureId: string, range: { start: number; end: number }) => void
  setKanbanRank: (featureId: string, rank: number) => void
  normalizeKanbanRanks: () => void

  addDep: (featureId: string, dep: Dep) => void
  updateDep: (featureId: string, depId: string, patch: Partial<Dep>) => void
  removeDep: (featureId: string, depId: string) => void

  addModule: (partial?: Partial<Module>) => string
  updateModule: (moduleId: string, patch: Partial<Module>) => void
  deleteModule: (moduleId: string) => void
  reorderModules: (ids: string[]) => void
  cloneModule: (moduleId: string) => string | null

  setMindmapOverride: (featureId: string, point: { x: number; y: number } | null) => void
  resetMindmapOverrides: () => void
  pinMindmapPositions: () => void
  clearMindmapPositions: () => void
  closeCurrentProject: () => void

  updateMeta: (patch: Partial<Project['meta']>) => void
  addMilestone: (id: string, label: string) => void
  updateMilestone: (id: string, patch: { id?: string; label?: string }) => void
  deleteMilestone: (id: string) => void

  undo: () => void
  redo: () => void

  exportFile: () => Promise<void>
  importFile: () => Promise<void>
  importFromText: (text: string) => boolean
  loadSample: () => void
  loadLodestarRoadmap: () => void
  startEmptyProject: (name: string) => void
  reloadFromDisk: () => Promise<void>
  dismissExternalChange: () => void

  _pushHistory: () => void
  _persist: () => void
}

const HISTORY_LIMIT = 50
let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useProjectStore = create<State & Actions>()(
  immer((set, get) => ({
    project: {
      meta: {
        name: '',
        description: '',
        version: '0.0.0',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        milestones: [],
      },
      modules: [],
    },
    loaded: false,
    source: null,
    externalChangePending: false,
    activeView: 'scope',
    activeMilestone: 'all',
    activeStatus: 'all',
    cursorFeatureId: null,
    drawerFeatureId: null,
    paletteOpen: false,
    helpOpen: false,
    msEditorOpen: false,
    metaEditorOpen: false,
    saveStatus: 'idle',
    savedAt: null,
    history: [],
    future: [],
    mindmapOverrides: {},

    init: async () => {
      const loaded = await loadProject()
      set((s) => {
        if (loaded.status === 'ok') {
          s.project = loaded.project
          s.source = loaded.source
        } else {
          s.source = 'none'
        }
        s.loaded = true
      })
      subscribeExternalChange(async () => {
        const st = get()
        const userEditing =
          st.drawerFeatureId !== null || st.paletteOpen || isInputFocused()
        if (userEditing) {
          set((s) => void (s.externalChangePending = true))
          return
        }
        await get().reloadFromDisk()
      })
    },

    reloadFromDisk: async () => {
      const loaded = await loadProject()
      if (loaded.status !== 'ok') return
      set((s) => {
        s.project = loaded.project
        s.source = loaded.source
        s.saveStatus = 'saved'
        s.savedAt = Date.now()
        s.externalChangePending = false
      })
    },

    dismissExternalChange: () => {
      set((s) => void (s.externalChangePending = false))
      get()._persist()
    },

    importFromText: (text) => {
      const p = importProjectFromText(text)
      if (!p) return false
      get()._pushHistory()
      set((s) => {
        s.project = p
        s.source = 'disk'
      })
      get()._persist()
      return true
    },

    loadSample: () => {
      const p = migrate(sampleProject)
      get()._pushHistory()
      set((s) => {
        s.project = p
        s.source = 'disk'
      })
      get()._persist()
    },

    loadLodestarRoadmap: () => {
      const p = migrate(lodestarRoadmap)
      get()._pushHistory()
      set((s) => {
        s.project = p
        s.source = 'disk'
      })
      get()._persist()
    },

    startEmptyProject: (name) => {
      const empty: Project = {
        meta: {
          name: name || 'Untitled Project',
          description: '',
          version: '0.1.0',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          milestones: [{ id: 'v0.1', label: 'v0.1' }],
        },
        modules: [],
      }
      get()._pushHistory()
      set((s) => {
        s.project = empty
        s.source = 'disk'
      })
      get()._persist()
    },

    closeCurrentProject: () => {
      set((s) => {
        s.project = {
          meta: {
            name: '',
            description: '',
            version: '0.0.0',
            schemaVersion: CURRENT_SCHEMA_VERSION,
            milestones: [],
          },
          modules: [],
        }
        s.source = 'none'
        s.history = []
        s.future = []
        s.drawerFeatureId = null
        s.paletteOpen = false
        s.cursorFeatureId = null
        s.mindmapOverrides = {}
      })
    },

    setActiveView: (v) => set((s) => void (s.activeView = v)),
    setActiveMilestone: (ms) => set((s) => void (s.activeMilestone = ms)),
    setActiveStatus: (st) => set((s) => void (s.activeStatus = st)),
    setCursorFeature: (id) => set((s) => void (s.cursorFeatureId = id)),
    openDrawer: (id) => set((s) => void (s.drawerFeatureId = id)),
    togglePalette: (open) =>
      set((s) => void (s.paletteOpen = open ?? !s.paletteOpen)),
    toggleHelp: (open) =>
      set((s) => void (s.helpOpen = open ?? !s.helpOpen)),
    toggleMilestoneEditor: (open) =>
      set((s) => void (s.msEditorOpen = open ?? !s.msEditorOpen)),
    toggleMetaEditor: (open) =>
      set((s) => void (s.metaEditorOpen = open ?? !s.metaEditorOpen)),

    setAllTasksDone: (featureId, done) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            if (done && f.tasks.length === 0) {
              f.tasks.push({ id: newId('t'), label: 'Done', done: true })
            } else {
              for (const t of f.tasks) t.done = done
            }
            break
          }
        }
      })
      get()._persist()
    },

    toggleTask: (featureId, taskId) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            const t = f.tasks.find((x) => x.id === taskId)
            if (t) t.done = !t.done
            break
          }
        }
      })
      get()._persist()
    },

    addTask: (featureId, label) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            f.tasks.push({ id: newId('t'), label, done: false })
            break
          }
        }
      })
      get()._persist()
    },

    updateTask: (featureId, taskId, patch) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            const t = f.tasks.find((x) => x.id === taskId)
            if (t) Object.assign(t, patch)
            break
          }
        }
      })
      get()._persist()
    },

    deleteTask: (featureId, taskId) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            f.tasks = f.tasks.filter((x) => x.id !== taskId)
            break
          }
        }
      })
      get()._persist()
    },

    addFeature: (moduleId, partial) => {
      const id = partial?.id ?? slugId(partial?.label ?? 'feature')
      get()._pushHistory()
      set((s) => {
        const m = s.project.modules.find((x) => x.id === moduleId)
        if (!m) return
        m.features.push({
          id,
          label: partial?.label ?? 'New Feature',
          description: partial?.description,
          effort: partial?.effort ?? 'M',
          ms: partial?.ms ?? s.project.meta.milestones[0]?.id ?? 'v0.1',
          ganttStart: partial?.ganttStart ?? 0,
          ganttEnd: partial?.ganttEnd ?? 2,
          deps: partial?.deps ?? [],
          tasks: partial?.tasks ?? [],
          rank: partial?.rank,
        })
      })
      get()._persist()
      return id
    },

    cloneFeature: (featureId) => {
      const project = get().project
      let sourceModuleId: string | null = null
      let sourceFeature: Feature | null = null
      let sourceIndex = -1
      for (const m of project.modules) {
        const idx = m.features.findIndex((f) => f.id === featureId)
        if (idx >= 0) {
          sourceModuleId = m.id
          sourceFeature = m.features[idx]
          sourceIndex = idx
          break
        }
      }
      if (!sourceFeature || !sourceModuleId) return null
      const newFeatureId = slugId(`${sourceFeature.label} copy`)
      const clone: Feature = {
        ...JSON.parse(JSON.stringify(sourceFeature)),
        id: newFeatureId,
        label: `${sourceFeature.label} (copy)`,
        tasks: sourceFeature.tasks.map((t) => ({ ...t, id: newId('t') })),
        rank: undefined,
      }
      get()._pushHistory()
      set((s) => {
        const m = s.project.modules.find((x) => x.id === sourceModuleId)
        if (!m) return
        m.features.splice(sourceIndex + 1, 0, clone)
      })
      get()._persist()
      return newFeatureId
    },

    moveFeatureToModule: (featureId, targetModuleId) => {
      const project = get().project
      const target = project.modules.find((m) => m.id === targetModuleId)
      if (!target) return
      let source: Module | null = null
      let feat: Feature | null = null
      for (const m of project.modules) {
        const f = m.features.find((x) => x.id === featureId)
        if (f) {
          source = m
          feat = f
          break
        }
      }
      if (!source || !feat || source.id === targetModuleId) return
      get()._pushHistory()
      set((s) => {
        const src = s.project.modules.find((m) => m.id === source!.id)
        const tgt = s.project.modules.find((m) => m.id === targetModuleId)
        if (!src || !tgt) return
        const moved = src.features.find((f) => f.id === featureId)
        if (!moved) return
        src.features = src.features.filter((f) => f.id !== featureId)
        tgt.features.push(moved)
      })
      get()._persist()
    },

    moveFeatureToMs: (featureId, ms) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            f.ms = ms
            break
          }
        }
      })
      get()._persist()
    },

    reorderFeatureInModule: (featureId, targetIndex) => {
      const project = get().project
      let modId: string | null = null
      let sourceIndex = -1
      for (const m of project.modules) {
        const idx = m.features.findIndex((f) => f.id === featureId)
        if (idx >= 0) {
          modId = m.id
          sourceIndex = idx
          break
        }
      }
      if (!modId || sourceIndex < 0) return
      get()._pushHistory()
      set((s) => {
        const m = s.project.modules.find((x) => x.id === modId)
        if (!m) return
        const [moved] = m.features.splice(sourceIndex, 1)
        if (!moved) return
        const clamped = Math.max(0, Math.min(targetIndex, m.features.length))
        m.features.splice(clamped, 0, moved)
      })
      get()._persist()
    },

    setFeatureGantt: (featureId, { start, end }) => {
      if (end <= start) end = start + 1
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            f.ganttStart = Math.max(0, Math.round(start))
            f.ganttEnd = Math.max(f.ganttStart + 1, Math.round(end))
            break
          }
        }
      })
      get()._persist()
    },

    setKanbanRank: (featureId, rank) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            f.rank = rank
            break
          }
        }
      })
      get()._persist()
    },

    normalizeKanbanRanks: () => {
      const project = get().project
      const byStatus: Record<string, Feature[]> = { backlog: [], progress: [], done: [] }
      for (const m of project.modules) {
        for (const f of m.features) {
          const st = featureStatus(f)
          byStatus[st].push(f)
        }
      }
      for (const key of Object.keys(byStatus)) {
        byStatus[key].sort((a, b) => {
          const ar = a.rank ?? Number.POSITIVE_INFINITY
          const br = b.rank ?? Number.POSITIVE_INFINITY
          return ar - br
        })
      }
      set((s) => {
        for (const key of Object.keys(byStatus)) {
          byStatus[key].forEach((ref, i) => {
            for (const m of s.project.modules) {
              const f = m.features.find((x) => x.id === ref.id)
              if (f) {
                f.rank = i + 1
                break
              }
            }
          })
        }
      })
      get()._persist()
    },

    updateFeature: (featureId, patch) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            Object.assign(f, patch)
            break
          }
        }
      })
      get()._persist()
    },

    deleteFeature: (featureId) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          m.features = m.features.filter((x) => x.id !== featureId)
          for (const f of m.features) {
            f.deps = f.deps.filter((d) => d.id !== featureId)
          }
        }
        if (s.drawerFeatureId === featureId) s.drawerFeatureId = null
      })
      get()._persist()
    },

    addDep: (featureId, dep) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            if (!f.deps.find((d) => d.id === dep.id)) f.deps.push(dep)
            break
          }
        }
      })
      get()._persist()
    },

    updateDep: (featureId, depId, patch) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            const d = f.deps.find((x) => x.id === depId)
            if (d) Object.assign(d, patch)
            break
          }
        }
      })
      get()._persist()
    },

    removeDep: (featureId, depId) => {
      get()._pushHistory()
      set((s) => {
        for (const m of s.project.modules) {
          const f = m.features.find((x) => x.id === featureId)
          if (f) {
            f.deps = f.deps.filter((d) => d.id !== depId)
            break
          }
        }
      })
      get()._persist()
    },

    addModule: (partial) => {
      const id = partial?.id ?? slugId(partial?.label ?? 'module')
      get()._pushHistory()
      set((s) => {
        s.project.modules.push({
          id,
          label: partial?.label ?? 'New Module',
          color: partial?.color ?? '#8A867A',
          features: partial?.features ?? [],
        })
      })
      get()._persist()
      return id
    },

    updateModule: (moduleId, patch) => {
      get()._pushHistory()
      set((s) => {
        const m = s.project.modules.find((x) => x.id === moduleId)
        if (m) Object.assign(m, patch)
      })
      get()._persist()
    },

    deleteModule: (moduleId) => {
      get()._pushHistory()
      set((s) => {
        const removed = s.project.modules.find((m) => m.id === moduleId)
        const removedIds = new Set((removed?.features ?? []).map((f) => f.id))
        s.project.modules = s.project.modules.filter((m) => m.id !== moduleId)
        for (const m of s.project.modules) {
          for (const f of m.features) {
            f.deps = f.deps.filter((d) => !removedIds.has(d.id))
          }
        }
      })
      get()._persist()
    },

    reorderModules: (ids) => {
      const current = get().project.modules
      const byId = new Map(current.map((m) => [m.id, m]))
      const next: Module[] = []
      for (const id of ids) {
        const m = byId.get(id)
        if (m) next.push(m)
      }
      for (const m of current) {
        if (!ids.includes(m.id)) next.push(m)
      }
      if (next.length !== current.length) return
      get()._pushHistory()
      set((s) => void (s.project.modules = next))
      get()._persist()
    },

    cloneModule: (moduleId) => {
      const project = get().project
      const idx = project.modules.findIndex((m) => m.id === moduleId)
      if (idx < 0) return null
      const source = project.modules[idx]
      const newModId = slugId(`${source.label} copy`)
      const clone: Module = {
        id: newModId,
        label: `${source.label} (copy)`,
        color: source.color,
        features: source.features.map((f) => ({
          ...JSON.parse(JSON.stringify(f)),
          id: slugId(`${f.label} copy`),
          tasks: f.tasks.map((t) => ({ ...t, id: newId('t') })),
          deps: [],
          rank: undefined,
        })),
      }
      get()._pushHistory()
      set((s) => {
        s.project.modules.splice(idx + 1, 0, clone)
      })
      get()._persist()
      return newModId
    },

    setMindmapOverride: (featureId, point) => {
      set((s) => {
        if (point === null) delete s.mindmapOverrides[featureId]
        else s.mindmapOverrides[featureId] = point
      })
    },

    resetMindmapOverrides: () => {
      set((s) => void (s.mindmapOverrides = {}))
    },

    pinMindmapPositions: () => {
      const { mindmapOverrides, project } = get()
      if (Object.keys(mindmapOverrides).length === 0) return
      const existing = project.meta.mindmapPositions ?? {}
      const merged: Record<string, { x: number; y: number }> = { ...existing }
      for (const [k, v] of Object.entries(mindmapOverrides)) merged[k] = v
      get()._pushHistory()
      set((s) => {
        s.project.meta.mindmapPositions = merged
        s.mindmapOverrides = {}
      })
      get()._persist()
    },

    clearMindmapPositions: () => {
      get()._pushHistory()
      set((s) => {
        delete s.project.meta.mindmapPositions
        s.mindmapOverrides = {}
      })
      get()._persist()
    },

    updateMeta: (patch) => {
      get()._pushHistory()
      set((s) => void Object.assign(s.project.meta, patch))
      get()._persist()
    },

    addMilestone: (id, label) => {
      get()._pushHistory()
      set((s) => {
        if (!s.project.meta.milestones.find((m) => m.id === id)) {
          s.project.meta.milestones.push({ id, label })
        }
      })
      get()._persist()
    },

    updateMilestone: (id, patch) => {
      get()._pushHistory()
      set((s) => {
        const ms = s.project.meta.milestones.find((m) => m.id === id)
        if (!ms) return
        const oldId = ms.id
        if (patch.label !== undefined) ms.label = patch.label
        if (patch.id !== undefined && patch.id !== oldId) {
          ms.id = patch.id
          for (const m of s.project.modules) {
            for (const f of m.features) {
              if (f.ms === oldId) f.ms = patch.id
            }
          }
          if (s.activeMilestone === oldId) s.activeMilestone = patch.id
        }
      })
      get()._persist()
    },

    deleteMilestone: (id) => {
      get()._pushHistory()
      set((s) => {
        s.project.meta.milestones = s.project.meta.milestones.filter((m) => m.id !== id)
      })
      get()._persist()
    },

    undo: () => {
      const { history, project } = get()
      if (history.length === 0) return
      const prev = history[history.length - 1]
      set((s) => {
        s.future.push(JSON.parse(JSON.stringify(project)))
        s.project = prev
        s.history = s.history.slice(0, -1)
      })
      get()._persist()
    },

    redo: () => {
      const { future, project } = get()
      if (future.length === 0) return
      const next = future[future.length - 1]
      set((s) => {
        s.history.push(JSON.parse(JSON.stringify(project)))
        s.project = next
        s.future = s.future.slice(0, -1)
      })
      get()._persist()
    },

    exportFile: async () => {
      await exportProject(get().project)
    },

    importFile: async () => {
      const imported = await importProject()
      if (!imported) return
      get()._pushHistory()
      set((s) => {
        s.project = imported
        s.source = 'disk'
      })
      get()._persist()
    },

    _pushHistory: () => {
      const snapshot = JSON.parse(JSON.stringify(get().project)) as Project
      set((s) => {
        s.history.push(snapshot)
        if (s.history.length > HISTORY_LIMIT) s.history.shift()
        s.future = []
      })
    },

    _persist: () => {
      if (get().source === 'none') return
      set((s) => void (s.saveStatus = 'saving'))
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(async () => {
        try {
          await saveProject(get().project)
          set((s) => {
            s.saveStatus = 'saved'
            s.savedAt = Date.now()
          })
        } catch (err) {
          console.error('Save failed', err)
          set((s) => void (s.saveStatus = 'error'))
        }
      }, 400)
    },
  })),
)

function isInputFocused(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  )
}

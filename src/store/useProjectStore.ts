import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Dep, Feature, Module, Project, Task, ViewId } from '@/types'
import {
  exportProject,
  importProject,
  loadProject,
  saveProject,
  subscribeExternalChange,
} from '@/lib/persistence'
import { newId, slugId } from '@/lib/id'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type StatusFilter = 'all' | 'ready' | 'blocked' | 'conflict'

type State = {
  project: Project
  loaded: boolean
  source: 'disk' | 'localStorage' | 'sample' | null
  activeView: ViewId
  activeMilestone: string | 'all'
  activeStatus: StatusFilter
  cursorFeatureId: string | null
  drawerFeatureId: string | null
  paletteOpen: boolean
  helpOpen: boolean
  saveStatus: SaveStatus
  savedAt: number | null
  history: Project[]
  future: Project[]
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
  setAllTasksDone: (featureId: string, done: boolean) => void

  toggleTask: (featureId: string, taskId: string) => void
  addTask: (featureId: string, label: string) => void
  updateTask: (featureId: string, taskId: string, patch: Partial<Task>) => void
  deleteTask: (featureId: string, taskId: string) => void

  addFeature: (moduleId: string, partial?: Partial<Feature>) => string
  updateFeature: (featureId: string, patch: Partial<Feature>) => void
  deleteFeature: (featureId: string) => void

  addDep: (featureId: string, dep: Dep) => void
  updateDep: (featureId: string, depId: string, patch: Partial<Dep>) => void
  removeDep: (featureId: string, depId: string) => void

  addModule: (partial?: Partial<Module>) => string
  updateModule: (moduleId: string, patch: Partial<Module>) => void
  deleteModule: (moduleId: string) => void

  updateMeta: (patch: Partial<Project['meta']>) => void
  addMilestone: (id: string, label: string) => void
  updateMilestone: (id: string, patch: { id?: string; label?: string }) => void
  deleteMilestone: (id: string) => void

  undo: () => void
  redo: () => void

  exportFile: () => Promise<void>
  importFile: () => Promise<void>

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
        schemaVersion: 1,
        milestones: [],
      },
      modules: [],
    },
    loaded: false,
    source: null,
    activeView: 'scope',
    activeMilestone: 'all',
    activeStatus: 'all',
    cursorFeatureId: null,
    drawerFeatureId: null,
    paletteOpen: false,
    helpOpen: false,
    saveStatus: 'idle',
    savedAt: null,
    history: [],
    future: [],

    init: async () => {
      const { project, source } = await loadProject()
      set((s) => {
        s.project = project
        s.loaded = true
        s.source = source
      })
      subscribeExternalChange(async () => {
        const { project: p } = await loadProject()
        set((s) => {
          s.project = p
          s.saveStatus = 'saved'
          s.savedAt = Date.now()
        })
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
          effort: partial?.effort ?? 'M',
          ms: partial?.ms ?? s.project.meta.milestones[0]?.id ?? 'v0.1',
          ganttStart: partial?.ganttStart ?? 0,
          ganttEnd: partial?.ganttEnd ?? 2,
          deps: partial?.deps ?? [],
          tasks: partial?.tasks ?? [],
        })
      })
      get()._persist()
      return id
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
      set((s) => void (s.project = imported))
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

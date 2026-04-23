import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Dep, Feature, Module, Project, Task, ViewId } from '@/types'
import {
  exportProject,
  importProject,
  importProjectFromText,
  loadProject,
  loadProjectFromPath,
  saveProject,
  subscribeExternalChange,
} from '@/lib/persistence'
import { CURRENT_SCHEMA_VERSION, migrate } from '@/schema'
import { sampleProject } from '@/data/sample'
import { lodestarRoadmap } from '@/data/lodestarRoadmap'
import { newId, slugId } from '@/lib/id'
import { featureStatus, findFeature, moduleOf } from '@/lib/deps'
import {
  loadRecents,
  saveRecents,
  upsertRecent,
  removeRecent,
  type Recent,
} from '@/lib/recentFiles'
import {
  clearLastSession,
  loadLastSession,
  saveLastSession,
  type LastSession,
} from '@/lib/lastSession'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export type StatusFilter = 'all' | 'ready' | 'blocked' | 'conflict'

type State = {
  project: Project
  loaded: boolean
  source: 'disk' | 'localStorage' | 'sample' | 'none' | null
  /**
   * Filesystem path of the currently-open project (Electron only).
   * `null` means "no specific file" — saves go to the canonical default slot
   * (data/project.json in dev, userData/data/project.json packaged) or to
   * localStorage in the browser build.
   */
  currentPath: string | null
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
  depEditor: {
    fromId: string
    toId: string
    anchor: { x: number; y: number }
  } | null
}

type Actions = {
  init: () => Promise<void>
  openLastSession: () => Promise<boolean>
  openDefaultProject: () => Promise<boolean>
  openProjectFromPath: (path: string) => Promise<boolean>
  openProjectFromDialog: () => Promise<boolean>
  openProjectFromText: (text: string, opts?: { name?: string; path?: string }) => boolean
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
  setFeatureColumn: (featureId: string, col: 'backlog' | 'progress' | 'done', rank?: number) => void

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

  openDepEditor: (fromId: string, toId: string, anchor: { x: number; y: number }) => void
  closeDepEditor: () => void

  updateMeta: (patch: Partial<Project['meta']>) => void
  addMilestone: (id: string, label: string) => void
  updateMilestone: (id: string, patch: { id?: string; label?: string }) => void
  deleteMilestone: (id: string) => void

  undo: () => void
  redo: () => void

  exportFile: () => Promise<void>
  importFile: () => Promise<void>
  loadSample: () => void
  loadLodestarRoadmap: () => void
  startEmptyProject: (name: string) => void
  reloadFromDisk: () => Promise<void>
  dismissExternalChange: () => void

  recents: () => Recent[]
  forgetRecent: (predicate: (r: Recent) => boolean) => void
  lastSession: () => LastSession | null

  _pushHistory: () => void
  _persist: () => void
}

const HISTORY_LIMIT = 50
let saveTimer: ReturnType<typeof setTimeout> | null = null

function resetProjectSessionState(state: State): void {
  state.externalChangePending = false
  state.activeView = 'scope'
  state.activeMilestone = 'all'
  state.activeStatus = 'all'
  state.cursorFeatureId = null
  state.drawerFeatureId = null
  state.paletteOpen = false
  state.helpOpen = false
  state.msEditorOpen = false
  state.metaEditorOpen = false
  state.history = []
  state.future = []
  state.mindmapOverrides = {}
  state.depEditor = null
}

function clearPendingSaveTimer(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
}

function basenameOf(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}

/**
 * A project at `path` just became active. Update the recent-files list and
 * the last-session pointer so the Welcome screen can offer "Continue" next
 * boot. Called by every action that opens a named file.
 */
function rememberOpened(path: string): void {
  const now = Date.now()
  saveLastSession({ path, when: now })
  saveRecents(
    upsertRecent(loadRecents(), {
      name: basenameOf(path),
      path,
      when: now,
    }),
  )
}

/**
 * Browser-mode / pathless opens: the project lives in the default slot.
 * Still worth leaving a breadcrumb so the Welcome screen can offer Continue
 * on the next visit, and the recent-files list gets a named entry.
 */
function markDefaultSlotOpened(name?: string): void {
  const now = Date.now()
  saveLastSession({ path: null, when: now })
  if (name) {
    saveRecents(upsertRecent(loadRecents(), { name, when: now }))
  }
}

export const useProjectStore = create<State & Actions>()(
  immer((set, get) => {
    // commit = push-undo → mutate → debounced-persist.
    // Use for every data-level mutation. UI-only state (flags, filters, cursor)
    // uses `set` directly so it stays out of the undo history.
    const commit = (mutator: Parameters<typeof set>[0]) => {
      get()._pushHistory()
      set(mutator)
      get()._persist()
    }
    return {
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
    currentPath: null,
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
    depEditor: null,

    /**
     * Boot-time setup only. We intentionally do NOT auto-load a project —
     * the Welcome screen lets the user decide which file to open. External
     * change subscription is wired once here; the watcher inside electron
     * main.ts latches onto whichever path the next load/save operates on.
     */
    init: async () => {
      set((s) => {
        s.loaded = true
        s.source = 'none'
      })
      subscribeExternalChange(async () => {
        const st = get()
        const userEditing =
          st.drawerFeatureId !== null || st.paletteOpen || isInputFocused()
        const hasUnsavedLocalChanges =
          st.saveStatus === 'saving' ||
          st.saveStatus === 'error' ||
          st.externalChangePending
        if (userEditing || hasUnsavedLocalChanges) {
          clearPendingSaveTimer()
          set((s) => {
            s.externalChangePending = true
            s.saveStatus = 'conflict'
          })
          return
        }
        await get().reloadFromDisk()
      })
    },

    openLastSession: async () => {
      const last = loadLastSession()
      if (last?.path) return get().openProjectFromPath(last.path)
      // No remembered path (browser build, or first-ever Electron boot that
      // somehow wrote an unpathed entry) — fall back to the canonical slot.
      return get().openDefaultProject()
    },

    openDefaultProject: async () => {
      const loaded = await loadProject()
      if (loaded.status !== 'ok') return false
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
        s.project = loaded.project
        s.source = loaded.source
        s.currentPath = null
        s.saveStatus = 'saved'
        s.savedAt = Date.now()
      })
      markDefaultSlotOpened(loaded.project.meta.name)
      return true
    },

    openProjectFromPath: async (path) => {
      const loaded = await loadProjectFromPath(path)
      if (loaded.status !== 'ok') {
        if (loaded.status === 'empty') {
          saveRecents(removeRecent(loadRecents(), (r) => r.path === path))
          const last = loadLastSession()
          if (last?.path === path) clearLastSession()
        }
        return false
      }
      const resolvedPath = loaded.path ?? path
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
        s.project = loaded.project
        s.source = 'disk'
        s.currentPath = resolvedPath
        s.saveStatus = 'saved'
        s.savedAt = Date.now()
      })
      rememberOpened(resolvedPath)
      return true
    },

    openProjectFromDialog: async () => {
      const res = await importProject()
      if (!res) return false
      const path = res.path
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
        s.project = res.project
        s.source = 'disk'
        s.currentPath = path ?? null
        s.saveStatus = 'saved'
        s.savedAt = Date.now()
      })
      if (path) rememberOpened(path)
      else markDefaultSlotOpened(res.project.meta.name)
      return true
    },

    openProjectFromText: (text, opts) => {
      const p = importProjectFromText(text)
      if (!p) return false
      const path = opts?.path
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
        s.project = p
        s.source = 'disk'
        s.currentPath = path ?? null
      })
      get()._persist()
      if (path) rememberOpened(path)
      else markDefaultSlotOpened(opts?.name ?? p.meta.name)
      return true
    },

    reloadFromDisk: async () => {
      const { currentPath } = get()
      const loaded = currentPath
        ? await loadProjectFromPath(currentPath)
        : await loadProject()
      if (loaded.status !== 'ok') return
      clearPendingSaveTimer()
      set((s) => {
        s.project = loaded.project
        s.source = loaded.source
        s.saveStatus = 'saved'
        s.savedAt = Date.now()
        s.externalChangePending = false
      })
    },

    dismissExternalChange: () => {
      clearPendingSaveTimer()
      set((s) => void (s.externalChangePending = false))
      get()._persist()
    },

    loadSample: () => {
      const p = migrate(sampleProject)
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
        s.project = p
        s.source = 'disk'
        s.currentPath = null
      })
      get()._persist()
      markDefaultSlotOpened(p.meta.name)
    },

    loadLodestarRoadmap: () => {
      const p = migrate(lodestarRoadmap)
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
        s.project = p
        s.source = 'disk'
        s.currentPath = null
      })
      get()._persist()
      markDefaultSlotOpened(p.meta.name)
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
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
        s.project = empty
        s.source = 'disk'
        s.currentPath = null
      })
      get()._persist()
      markDefaultSlotOpened(empty.meta.name)
    },

    closeCurrentProject: () => {
      clearPendingSaveTimer()
      set((s) => {
        resetProjectSessionState(s)
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
        s.currentPath = null
        s.saveStatus = 'idle'
        s.savedAt = null
      })
      clearLastSession()
    },

    recents: () => loadRecents(),
    forgetRecent: (predicate) => {
      saveRecents(removeRecent(loadRecents(), predicate))
    },
    lastSession: () => loadLastSession(),

    // ———————————————————————————————————————————————————————
    // UI state (filters, overlays, cursor). These are not undoable.
    // ———————————————————————————————————————————————————————
    openDepEditor: (fromId, toId, anchor) =>
      set((s) => {
        s.depEditor = { fromId, toId, anchor }
      }),
    closeDepEditor: () => set((s) => void (s.depEditor = null)),

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

    // ———————————————————————————————————————————————————————
    // Tasks (per feature). All go through commit() for undo + persist.
    // ———————————————————————————————————————————————————————
    setAllTasksDone: (featureId, done) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        if (done && f.tasks.length === 0) {
          f.tasks.push({ id: newId('t'), label: 'Done', done: true })
        } else {
          for (const t of f.tasks) t.done = done
        }
      })
    },

    toggleTask: (featureId, taskId) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        const t = f.tasks.find((x) => x.id === taskId)
        if (t) t.done = !t.done
      })
    },

    addTask: (featureId, label) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        f.tasks.push({ id: newId('t'), label, done: false })
      })
    },

    updateTask: (featureId, taskId, patch) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        const t = f.tasks.find((x) => x.id === taskId)
        if (t) Object.assign(t, patch)
      })
    },

    deleteTask: (featureId, taskId) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        f.tasks = f.tasks.filter((x) => x.id !== taskId)
      })
    },

    // ———————————————————————————————————————————————————————
    // Features: CRUD, move, rank, gantt range.
    // ———————————————————————————————————————————————————————
    addFeature: (moduleId, partial) => {
      const id = partial?.id ?? slugId(partial?.label ?? 'feature')
      commit((s) => {
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
      commit((s) => {
        const m = s.project.modules.find((x) => x.id === sourceModuleId)
        if (!m) return
        m.features.splice(sourceIndex + 1, 0, clone)
      })
      return newFeatureId
    },

    moveFeatureToModule: (featureId, targetModuleId) => {
      const project = get().project
      const target = project.modules.find((m) => m.id === targetModuleId)
      if (!target) return
      const sourceModuleId = moduleOf(project, featureId)
      if (!sourceModuleId || sourceModuleId === targetModuleId) return
      commit((s) => {
        const src = s.project.modules.find((m) => m.id === sourceModuleId)
        const tgt = s.project.modules.find((m) => m.id === targetModuleId)
        if (!src || !tgt) return
        const moved = src.features.find((f) => f.id === featureId)
        if (!moved) return
        src.features = src.features.filter((f) => f.id !== featureId)
        tgt.features.push(moved)
      })
    },

    moveFeatureToMs: (featureId, ms) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (f) f.ms = ms
      })
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
      commit((s) => {
        const m = s.project.modules.find((x) => x.id === modId)
        if (!m) return
        const [moved] = m.features.splice(sourceIndex, 1)
        if (!moved) return
        const clamped = Math.max(0, Math.min(targetIndex, m.features.length))
        m.features.splice(clamped, 0, moved)
      })
    },

    setFeatureGantt: (featureId, { start, end }) => {
      if (end <= start) end = start + 1
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        f.ganttStart = Math.max(0, Math.round(start))
        f.ganttEnd = Math.max(f.ganttStart + 1, Math.round(end))
      })
    },

    setKanbanRank: (featureId, rank) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (f) f.rank = rank
      })
    },

    setFeatureColumn: (featureId, col, rank) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        if (col === 'done') {
          if (f.tasks.length === 0) {
            f.tasks.push({ id: newId('t'), label: 'Done', done: true })
          } else {
            for (const t of f.tasks) t.done = true
          }
        } else if (col === 'backlog') {
          // 0 tasks already means backlog; otherwise open everything
          if (f.tasks.length > 0) {
            for (const t of f.tasks) t.done = false
          }
        } else {
          // progress: need at least 1 done AND at least 1 open
          if (f.tasks.length === 0) {
            f.tasks.push({ id: newId('t'), label: 'Kickoff', done: true })
            f.tasks.push({ id: newId('t'), label: 'Next step', done: false })
          } else if (f.tasks.length === 1) {
            f.tasks[0].done = true
            f.tasks.push({ id: newId('t'), label: 'Next step', done: false })
          } else {
            const doneCount = f.tasks.filter((t) => t.done).length
            if (doneCount === 0) f.tasks[0].done = true
            else if (doneCount === f.tasks.length)
              f.tasks[f.tasks.length - 1].done = false
          }
        }
        if (typeof rank === 'number') f.rank = rank
      })
    },

    normalizeKanbanRanks: () => {
      const project = get().project
      const byStatus: Record<string, Feature[]> = { backlog: [], progress: [], done: [] }
      for (const m of project.modules) {
        for (const f of m.features) {
          byStatus[featureStatus(f)].push(f)
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
            const f = findFeature(s.project, ref.id)
            if (f) f.rank = i + 1
          })
        }
      })
      get()._persist()
    },

    updateFeature: (featureId, patch) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (f) Object.assign(f, patch)
      })
    },

    deleteFeature: (featureId) => {
      commit((s) => {
        for (const m of s.project.modules) {
          m.features = m.features.filter((x) => x.id !== featureId)
          for (const f of m.features) {
            f.deps = f.deps.filter((d) => d.id !== featureId)
          }
        }
        if (s.drawerFeatureId === featureId) s.drawerFeatureId = null
      })
    },

    // ———————————————————————————————————————————————————————
    // Dependencies: add/update/remove on a feature.
    // ———————————————————————————————————————————————————————
    addDep: (featureId, dep) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        if (!f.deps.find((d) => d.id === dep.id)) f.deps.push(dep)
      })
    },

    updateDep: (featureId, depId, patch) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (!f) return
        const d = f.deps.find((x) => x.id === depId)
        if (d) Object.assign(d, patch)
      })
    },

    removeDep: (featureId, depId) => {
      commit((s) => {
        const f = findFeature(s.project, featureId)
        if (f) f.deps = f.deps.filter((d) => d.id !== depId)
      })
    },

    // ———————————————————————————————————————————————————————
    // Modules: CRUD + reorder + clone.
    // ———————————————————————————————————————————————————————
    addModule: (partial) => {
      const id = partial?.id ?? slugId(partial?.label ?? 'module')
      commit((s) => {
        s.project.modules.push({
          id,
          label: partial?.label ?? 'New Module',
          color: partial?.color ?? '#8A867A',
          features: partial?.features ?? [],
        })
      })
      return id
    },

    updateModule: (moduleId, patch) => {
      commit((s) => {
        const m = s.project.modules.find((x) => x.id === moduleId)
        if (m) Object.assign(m, patch)
      })
    },

    deleteModule: (moduleId) => {
      commit((s) => {
        const removed = s.project.modules.find((m) => m.id === moduleId)
        const removedIds = new Set((removed?.features ?? []).map((f) => f.id))
        s.project.modules = s.project.modules.filter((m) => m.id !== moduleId)
        for (const m of s.project.modules) {
          for (const f of m.features) {
            f.deps = f.deps.filter((d) => !removedIds.has(d.id))
          }
        }
      })
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
      commit((s) => void (s.project.modules = next))
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
      commit((s) => {
        s.project.modules.splice(idx + 1, 0, clone)
      })
      return newModId
    },

    // ———————————————————————————————————————————————————————
    // MindMap positions: session overrides (volatile) + pinned (persisted).
    // ———————————————————————————————————————————————————————
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
      commit((s) => {
        s.project.meta.mindmapPositions = merged
        s.mindmapOverrides = {}
      })
    },

    clearMindmapPositions: () => {
      commit((s) => {
        delete s.project.meta.mindmapPositions
        s.mindmapOverrides = {}
      })
    },

    // ———————————————————————————————————————————————————————
    // Project meta + milestones.
    // ———————————————————————————————————————————————————————
    updateMeta: (patch) => {
      commit((s) => void Object.assign(s.project.meta, patch))
    },

    addMilestone: (id, label) => {
      commit((s) => {
        if (!s.project.meta.milestones.find((m) => m.id === id)) {
          s.project.meta.milestones.push({ id, label })
        }
      })
    },

    updateMilestone: (id, patch) => {
      commit((s) => {
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
    },

    deleteMilestone: (id) => {
      commit((s) => {
        s.project.meta.milestones = s.project.meta.milestones.filter((m) => m.id !== id)
      })
    },

    // ———————————————————————————————————————————————————————
    // Undo / redo. History is a stack of deep-cloned snapshots.
    // ———————————————————————————————————————————————————————
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

    // ———————————————————————————————————————————————————————
    // Import / export.
    // ———————————————————————————————————————————————————————
    exportFile: async () => {
      await exportProject(get().project)
    },

    importFile: async () => {
      await get().openProjectFromDialog()
    },

    // ———————————————————————————————————————————————————————
    // Internal primitives (do not call from views — use commit() above).
    // ———————————————————————————————————————————————————————
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
      clearPendingSaveTimer()
      if (get().externalChangePending) {
        set((s) => void (s.saveStatus = 'conflict'))
        return
      }
      set((s) => void (s.saveStatus = 'saving'))
      saveTimer = setTimeout(async () => {
        saveTimer = null
        try {
          const { project, currentPath, source, externalChangePending } = get()
          if (source === 'none') return
          if (externalChangePending) {
            set((s) => void (s.saveStatus = 'conflict'))
            return
          }
          await saveProject(project, currentPath ?? undefined)
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
    }
  }),
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

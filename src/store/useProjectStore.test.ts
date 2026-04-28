import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/types'
import { CURRENT_SCHEMA_VERSION } from '@/schema'

const {
  exportProjectMock,
  importProjectFromTextMock,
  importProjectMock,
  loadProjectFromPathMock,
  loadProjectMock,
  saveProjectMock,
  subscribeExternalChangeMock,
} = vi.hoisted(() => ({
  exportProjectMock: vi.fn(),
  importProjectFromTextMock: vi.fn(),
  importProjectMock: vi.fn(),
  loadProjectFromPathMock: vi.fn(),
  loadProjectMock: vi.fn(),
  saveProjectMock: vi.fn(),
  subscribeExternalChangeMock: vi.fn(),
}))

let externalChangeHandler: (() => Promise<void> | void) | null = null

vi.mock('@/lib/persistence', () => ({
  exportProject: exportProjectMock,
  importProject: importProjectMock,
  importProjectFromText: importProjectFromTextMock,
  loadProject: loadProjectMock,
  loadProjectFromPath: loadProjectFromPathMock,
  saveProject: saveProjectMock,
  subscribeExternalChange: subscribeExternalChangeMock,
}))

vi.mock('@/lib/recentFiles', () => ({
  loadRecents: vi.fn(() => []),
  removeRecent: vi.fn((items, predicate) => items.filter((item: unknown) => !predicate(item))),
  saveRecents: vi.fn(),
  upsertRecent: vi.fn((items, next) => [next, ...items]),
}))

vi.mock('@/lib/lastSession', () => ({
  clearLastSession: vi.fn(),
  loadLastSession: vi.fn(() => null),
  saveLastSession: vi.fn(),
}))

function makeProject(name = 'Nimbus'): Project {
  return {
    meta: {
      name,
      description: '',
      version: '0.3.0',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      milestones: [{ id: 'v0.1', label: 'v0.1' }],
    },
    modules: [
      {
        id: 'core',
        label: 'Core',
        color: '#8A867A',
        features: [],
      },
    ],
  }
}

async function freshStore() {
  vi.resetModules()
  const mod = await import('./useProjectStore')
  return mod.useProjectStore
}

describe('useProjectStore external-change handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    externalChangeHandler = null
    exportProjectMock.mockReset()
    importProjectFromTextMock.mockReset()
    importProjectMock.mockReset()
    loadProjectFromPathMock.mockReset()
    loadProjectMock.mockReset()
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation((cb: () => Promise<void> | void) => {
      externalChangeHandler = cb
      return () => {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds external changes behind a conflict state while a debounced local save is pending', async () => {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })

    store.getState().addModule({ label: 'Local module' })
    expect(store.getState().project.modules).toHaveLength(2)
    expect(store.getState().saveStatus).toBe('saving')

    expect(externalChangeHandler).toBeTypeOf('function')
    await externalChangeHandler?.()

    expect(store.getState().externalChangePending).toBe(true)
    expect(store.getState().saveStatus).toBe('conflict')
    expect(store.getState().project.modules).toHaveLength(2)
    expect(loadProjectFromPathMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    expect(saveProjectMock).not.toHaveBeenCalled()
  })

  it('does not autosave again until Keep mine is chosen, then persists the latest local state', async () => {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })

    store.getState().addModule({ label: 'Local module A' })
    await externalChangeHandler?.()
    store.getState().addModule({ label: 'Local module B' })

    expect(store.getState().project.modules).toHaveLength(3)
    expect(store.getState().saveStatus).toBe('conflict')

    await vi.advanceTimersByTimeAsync(500)
    expect(saveProjectMock).not.toHaveBeenCalled()

    store.getState().dismissExternalChange()
    expect(store.getState().externalChangePending).toBe(false)
    expect(store.getState().saveStatus).toBe('saving')

    await vi.advanceTimersByTimeAsync(500)
    expect(saveProjectMock).toHaveBeenCalledTimes(1)
    expect((saveProjectMock.mock.calls[0]?.[0] as Project).modules).toHaveLength(3)
    expect(store.getState().saveStatus).toBe('saved')
  })

  it('reloads immediately when there are no local unsaved changes to protect', async () => {
    const externalProject = makeProject('External Rewrite')
    loadProjectFromPathMock.mockResolvedValue({
      status: 'ok',
      source: 'disk',
      project: externalProject,
      path: '/tmp/project.json',
    })

    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })

    await externalChangeHandler?.()

    expect(loadProjectFromPathMock).toHaveBeenCalledWith('/tmp/project.json')
    expect(store.getState().externalChangePending).toBe(false)
    expect(store.getState().saveStatus).toBe('saved')
    expect(store.getState().project.meta.name).toBe('External Rewrite')
  })

  it('holds external changes behind a conflict state while modal editors are open', async () => {
    const externalProject = makeProject('External Rewrite')
    loadProjectFromPathMock.mockResolvedValue({
      status: 'ok',
      source: 'disk',
      project: externalProject,
      path: '/tmp/project.json',
    })

    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
      metaEditorOpen: true,
    })

    await externalChangeHandler?.()

    expect(loadProjectFromPathMock).not.toHaveBeenCalled()
    expect(store.getState().externalChangePending).toBe(true)
    expect(store.getState().saveStatus).toBe('conflict')
    expect(store.getState().project.meta.name).toBe('Nimbus')
  })

  it('holds external changes behind a conflict state while the dependency editor is open', async () => {
    const externalProject = makeProject('External Rewrite')
    loadProjectFromPathMock.mockResolvedValue({
      status: 'ok',
      source: 'disk',
      project: externalProject,
      path: '/tmp/project.json',
    })

    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
      depEditor: { fromId: 'a', toId: 'b', anchor: { x: 10, y: 20 } },
    })

    await externalChangeHandler?.()

    expect(loadProjectFromPathMock).not.toHaveBeenCalled()
    expect(store.getState().externalChangePending).toBe(true)
    expect(store.getState().saveStatus).toBe('conflict')
    expect(store.getState().project.meta.name).toBe('Nimbus')
  })
})

describe('useProjectStore project-open session resets', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    externalChangeHandler = null
    exportProjectMock.mockReset()
    importProjectFromTextMock.mockReset()
    importProjectMock.mockReset()
    loadProjectFromPathMock.mockReset()
    loadProjectMock.mockReset()
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation((cb: () => Promise<void> | void) => {
      externalChangeHandler = cb
      return () => {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets transient session UI state when opening a project from path', async () => {
    const store = await freshStore()
    await store.getState().init()

    loadProjectFromPathMock.mockResolvedValue({
      status: 'ok',
      source: 'disk',
      project: makeProject('Fresh Disk Project'),
      path: '/tmp/fresh.json',
    })

    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/stale.json',
      project: makeProject('Stale Project'),
      externalChangePending: true,
      activeView: 'gantt',
      activeMilestone: 'v0.1',
      activeStatus: 'blocked',
      cursorFeatureId: 'stale-feature',
      drawerFeatureId: 'stale-feature',
      paletteOpen: true,
      helpOpen: true,
      msEditorOpen: true,
      metaEditorOpen: true,
      history: [makeProject('Undo snapshot')],
      future: [makeProject('Redo snapshot')],
      mindmapOverrides: { stale: { x: 10, y: 20 } },
      depEditor: { fromId: 'a', toId: 'b', anchor: { x: 1, y: 2 } },
      saveStatus: 'conflict',
      savedAt: null,
    })

    const ok = await store.getState().openProjectFromPath('/tmp/fresh.json')

    expect(ok).toBe(true)
    expect(store.getState()).toMatchObject({
      currentPath: '/tmp/fresh.json',
      project: makeProject('Fresh Disk Project'),
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
      history: [],
      future: [],
      mindmapOverrides: {},
      depEditor: null,
      saveStatus: 'saved',
    })
  })

  it('resets transient session UI state when starting a new empty project', async () => {
    const store = await freshStore()
    await store.getState().init()

    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/stale.json',
      project: makeProject('Stale Project'),
      externalChangePending: true,
      activeView: 'mindmap',
      activeMilestone: 'v0.1',
      activeStatus: 'conflict',
      cursorFeatureId: 'stale-feature',
      drawerFeatureId: 'stale-feature',
      paletteOpen: true,
      helpOpen: true,
      msEditorOpen: true,
      metaEditorOpen: true,
      history: [makeProject('Undo snapshot')],
      future: [makeProject('Redo snapshot')],
      mindmapOverrides: { stale: { x: 10, y: 20 } },
      depEditor: { fromId: 'a', toId: 'b', anchor: { x: 1, y: 2 } },
      saveStatus: 'conflict',
      savedAt: null,
    })

    store.getState().startEmptyProject('Fresh Start')

    expect(store.getState()).toMatchObject({
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
      history: [],
      future: [],
      mindmapOverrides: {},
      depEditor: null,
    })
    expect(store.getState().project.meta.name).toBe('Fresh Start')
  })
})

describe('useProjectStore task label hygiene', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    externalChangeHandler = null
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation((cb: () => Promise<void> | void) => {
      externalChangeHandler = cb
      return () => {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function seededStore(): Promise<{
    store: Awaited<ReturnType<typeof freshStore>>
    featureId: string
  }> {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })
    const featureId = store.getState().addFeature('core', { label: 'Task Host' })
    return { store, featureId }
  }

  it('addTask ignores whitespace-only labels', async () => {
    const { store, featureId } = await seededStore()
    store.getState().addTask(featureId, '   ')
    const tasks = store.getState().project.modules[0]!.features.find((f) => f.id === featureId)?.tasks
    expect(tasks).toHaveLength(0)
  })

  it('addTask trims padded labels before persisting', async () => {
    const { store, featureId } = await seededStore()
    store.getState().addTask(featureId, '  ship it  ')
    const tasks = store.getState().project.modules[0]!.features.find((f) => f.id === featureId)?.tasks
    expect(tasks).toHaveLength(1)
    expect(tasks?.[0]!.label).toBe('ship it')
  })

  it('updateTask trims padded labels and rejects whitespace-only renames', async () => {
    const { store, featureId } = await seededStore()
    store.getState().addTask(featureId, 'original')
    const feat = store.getState().project.modules[0]!.features.find((f) => f.id === featureId)
    const taskId = feat!.tasks[0]!.id

    store.getState().updateTask(featureId, taskId, { label: '   ' })
    expect(
      store.getState().project.modules[0]!.features.find((f) => f.id === featureId)?.tasks[0]!.label,
    ).toBe('original')

    store.getState().updateTask(featureId, taskId, { label: '  renamed  ' })
    expect(
      store.getState().project.modules[0]!.features.find((f) => f.id === featureId)?.tasks[0]!.label,
    ).toBe('renamed')
  })
})

describe('useProjectStore kanban rank normalization', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    externalChangeHandler = null
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation((cb: () => Promise<void> | void) => {
      externalChangeHandler = cb
      return () => {}
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('participates in undo — normalize pushes a history frame and undo restores prior ranks', async () => {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })

    const a = store.getState().addFeature('core', { label: 'A' })
    const b = store.getState().addFeature('core', { label: 'B' })
    store.getState().setKanbanRank(a, 1.5)
    store.getState().setKanbanRank(b, 1.75)

    const before = store
      .getState()
      .project.modules[0]!.features.filter((f) => f.id === a || f.id === b)
      .map((f) => ({ id: f.id, rank: f.rank }))

    store.getState().normalizeKanbanRanks()

    const afterNormalize = store
      .getState()
      .project.modules[0]!.features.filter((f) => f.id === a || f.id === b)
      .map((f) => ({ id: f.id, rank: f.rank }))
    expect(afterNormalize).not.toEqual(before)
    expect(afterNormalize.every((f) => Number.isInteger(f.rank))).toBe(true)

    store.getState().undo()

    const afterUndo = store
      .getState()
      .project.modules[0]!.features.filter((f) => f.id === a || f.id === b)
      .map((f) => ({ id: f.id, rank: f.rank }))
    expect(afterUndo).toEqual(before)
  })
})

describe('useProjectStore renameFeatureId', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    externalChangeHandler = null
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation((cb: () => Promise<void> | void) => {
      externalChangeHandler = cb
      return () => {}
    })
  })
  afterEach(() => vi.useRealTimers())

  async function seeded() {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })
    const a = store.getState().addFeature('core', { label: 'Alpha' })
    const b = store.getState().addFeature('core', { label: 'Beta' })
    const c = store.getState().addFeature('core', { label: 'Gamma' })
    store.getState().addDep(b, { id: a, reason: 'needs', type: 'build' })
    store.getState().addDep(c, { id: a, reason: 'needs', type: 'runtime' })
    return { store, a, b, c }
  }

  it('rejects empty or whitespace-only ids', async () => {
    const { store, a } = await seeded()
    expect(store.getState().renameFeatureId(a, '')).toEqual({ ok: false, reason: 'empty' })
    expect(store.getState().renameFeatureId(a, '   ')).toEqual({ ok: false, reason: 'empty' })
    expect(store.getState().project.modules[0]!.features.find((f) => f.id === a)).toBeTruthy()
  })

  it('is a no-op when the new id matches the old one', async () => {
    const { store, a } = await seeded()
    const before = JSON.parse(JSON.stringify(store.getState().project))
    expect(store.getState().renameFeatureId(a, a)).toEqual({ ok: true })
    expect(store.getState().project).toEqual(before)
  })

  it('rejects ids already used by another feature', async () => {
    const { store, a, b } = await seeded()
    expect(store.getState().renameFeatureId(a, b)).toEqual({ ok: false, reason: 'duplicate' })
    expect(store.getState().project.modules[0]!.features.find((f) => f.id === a)).toBeTruthy()
  })

  it('rejects unknown source ids', async () => {
    const { store } = await seeded()
    expect(store.getState().renameFeatureId('ghost', 'whatever')).toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('renames the feature and cascades to every incoming dep', async () => {
    const { store, a, b, c } = await seeded()
    const res = store.getState().renameFeatureId(a, 'alpha-v2')
    expect(res).toEqual({ ok: true })
    const feats = store.getState().project.modules[0]!.features
    expect(feats.find((f) => f.id === 'alpha-v2')).toBeTruthy()
    expect(feats.find((f) => f.id === a)).toBeUndefined()
    const bf = feats.find((f) => f.id === b)!
    const cf = feats.find((f) => f.id === c)!
    expect(bf.deps.map((d) => d.id)).toEqual(['alpha-v2'])
    expect(cf.deps.map((d) => d.id)).toEqual(['alpha-v2'])
  })

  it('keeps the drawer+cursor anchored on the renamed feature', async () => {
    const { store, a } = await seeded()
    store.getState().openDrawer(a)
    store.getState().setCursorFeature(a)
    store.getState().renameFeatureId(a, 'alpha-v2')
    expect(store.getState().drawerFeatureId).toBe('alpha-v2')
    expect(store.getState().cursorFeatureId).toBe('alpha-v2')
  })

  it('migrates meta.mindmapPositions + volatile mindmap overrides', async () => {
    const { store, a } = await seeded()
    store.setState((s) => {
      s.project.meta.mindmapPositions = { [a]: { x: 10, y: 20 } }
      s.mindmapOverrides[a] = { x: 30, y: 40 }
    })
    store.getState().renameFeatureId(a, 'alpha-v2')
    expect(store.getState().project.meta.mindmapPositions).toEqual({
      'alpha-v2': { x: 10, y: 20 },
    })
    expect(store.getState().mindmapOverrides).toEqual({
      'alpha-v2': { x: 30, y: 40 },
    })
  })

  it('is undoable as a single history frame', async () => {
    const { store, a, b } = await seeded()
    const historyBefore = store.getState().history.length
    store.getState().renameFeatureId(a, 'alpha-v2')
    expect(store.getState().history.length).toBe(historyBefore + 1)
    store.getState().undo()
    const feats = store.getState().project.modules[0]!.features
    expect(feats.find((f) => f.id === a)).toBeTruthy()
    const bf = feats.find((f) => f.id === b)!
    expect(bf.deps.map((d) => d.id)).toEqual([a])
  })
})

describe('useProjectStore renameModuleId', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation(() => () => {})
  })
  afterEach(() => vi.useRealTimers())

  async function seeded() {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })
    store.getState().addModule({ label: 'Storage' })
    return store
  }

  it('rejects duplicate, empty and unknown ids', async () => {
    const store = await seeded()
    const existing = store.getState().project.modules.map((m) => m.id)
    expect(existing).toContain('core')
    expect(store.getState().renameModuleId('core', '')).toEqual({ ok: false, reason: 'empty' })
    expect(store.getState().renameModuleId('core', existing[1]!)).toEqual({
      ok: false,
      reason: 'duplicate',
    })
    expect(store.getState().renameModuleId('ghost', 'whatever')).toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('renames the module id and is undoable', async () => {
    const store = await seeded()
    const historyBefore = store.getState().history.length
    const res = store.getState().renameModuleId('core', 'platform')
    expect(res).toEqual({ ok: true })
    expect(store.getState().project.modules.map((m) => m.id)).toContain('platform')
    expect(store.getState().history.length).toBe(historyBefore + 1)
    store.getState().undo()
    expect(store.getState().project.modules.map((m) => m.id)).toContain('core')
  })
})

describe('useProjectStore reorderTaskInFeature', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation(() => () => {})
  })
  afterEach(() => vi.useRealTimers())

  async function seeded() {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })
    const fid = store.getState().addFeature('core', { label: 'Alpha' })
    store.getState().addTask(fid, 'one')
    store.getState().addTask(fid, 'two')
    store.getState().addTask(fid, 'three')
    return { store, fid }
  }

  it('moves a task within its feature and persists through undo', async () => {
    const { store, fid } = await seeded()
    const tasks = store
      .getState()
      .project.modules[0]!.features.find((f) => f.id === fid)!.tasks
    const thirdId = tasks[2]!.id
    store.getState().reorderTaskInFeature(fid, thirdId, 0)
    const labelsNow = store
      .getState()
      .project.modules[0]!.features.find((f) => f.id === fid)!
      .tasks.map((t) => t.label)
    expect(labelsNow).toEqual(['three', 'one', 'two'])
    store.getState().undo()
    const labelsAfterUndo = store
      .getState()
      .project.modules[0]!.features.find((f) => f.id === fid)!
      .tasks.map((t) => t.label)
    expect(labelsAfterUndo).toEqual(['one', 'two', 'three'])
  })

  it('clamps out-of-range target indices to the valid window', async () => {
    const { store, fid } = await seeded()
    const firstId = store
      .getState()
      .project.modules[0]!.features.find((f) => f.id === fid)!.tasks[0]!.id
    store.getState().reorderTaskInFeature(fid, firstId, 999)
    const labels = store
      .getState()
      .project.modules[0]!.features.find((f) => f.id === fid)!
      .tasks.map((t) => t.label)
    expect(labels).toEqual(['two', 'three', 'one'])
  })

  it('is a silent no-op for unknown feature or task ids', async () => {
    const { store, fid } = await seeded()
    const before = JSON.parse(JSON.stringify(store.getState().project))
    store.getState().reorderTaskInFeature('ghost-feat', 'x', 0)
    store.getState().reorderTaskInFeature(fid, 'ghost-task', 0)
    expect(store.getState().project).toEqual(before)
  })
})

describe('useProjectStore clearFilters', () => {
  beforeEach(() => {
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation(() => () => {})
  })

  it('resets both activeStatus and activeMilestone without pushing undo history', async () => {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
      activeStatus: 'blocked',
      activeMilestone: 'v0.1',
    })
    const historyBefore = store.getState().history.length
    store.getState().clearFilters()
    expect(store.getState().activeStatus).toBe('all')
    expect(store.getState().activeMilestone).toBe('all')
    expect(store.getState().history.length).toBe(historyBefore)
  })
})

describe('useProjectStore deleteFeature', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation(() => () => {})
  })
  afterEach(() => vi.useRealTimers())

  async function seeded() {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })
    const a = store.getState().addFeature('core', { label: 'Alpha' })
    const b = store.getState().addFeature('core', { label: 'Beta' })
    store.getState().addDep(b, { id: a, reason: 'needs', type: 'build' })
    return { store, a, b }
  }

  it('drops incoming deps when a feature is deleted', async () => {
    const { store, a, b } = await seeded()
    store.getState().deleteFeature(a)
    const feats = store.getState().project.modules[0]!.features
    expect(feats.find((f) => f.id === a)).toBeUndefined()
    const bf = feats.find((f) => f.id === b)!
    expect(bf.deps).toEqual([])
  })

  it('clears UI state that pointed at the deleted feature', async () => {
    const { store, a } = await seeded()
    store.getState().openDrawer(a)
    store.getState().setCursorFeature(a)
    store.getState().openDepEditor(a, a, { x: 0, y: 0 })
    store.setState((s) => {
      s.mindmapOverrides[a] = { x: 7, y: 8 }
      s.project.meta.mindmapPositions = { [a]: { x: 1, y: 2 } }
    })
    store.getState().deleteFeature(a)
    expect(store.getState().drawerFeatureId).toBeNull()
    expect(store.getState().cursorFeatureId).toBeNull()
    expect(store.getState().depEditor).toBeNull()
    expect(store.getState().mindmapOverrides[a]).toBeUndefined()
    expect(store.getState().project.meta.mindmapPositions?.[a]).toBeUndefined()
  })

  it('leaves unrelated UI state alone', async () => {
    const { store, a, b } = await seeded()
    store.getState().setCursorFeature(b)
    store.setState((s) => {
      s.mindmapOverrides[b] = { x: 9, y: 9 }
    })
    store.getState().deleteFeature(a)
    expect(store.getState().cursorFeatureId).toBe(b)
    expect(store.getState().mindmapOverrides[b]).toEqual({ x: 9, y: 9 })
  })

  it('is undoable as a single history frame', async () => {
    const { store, a, b } = await seeded()
    const historyBefore = store.getState().history.length
    store.getState().deleteFeature(a)
    expect(store.getState().history.length).toBe(historyBefore + 1)
    store.getState().undo()
    const feats = store.getState().project.modules[0]!.features
    expect(feats.find((f) => f.id === a)).toBeTruthy()
    const bf = feats.find((f) => f.id === b)!
    expect(bf.deps.map((d) => d.id)).toEqual([a])
  })
})

describe('useProjectStore deleteModule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation(() => () => {})
  })
  afterEach(() => vi.useRealTimers())

  async function seeded() {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })
    store.getState().addModule({ id: 'storage', label: 'Storage' })
    const a = store.getState().addFeature('core', { label: 'Alpha' })
    const b = store.getState().addFeature('core', { label: 'Beta' })
    const c = store.getState().addFeature('storage', { label: 'Gamma' })
    store.getState().addDep(c, { id: a, reason: 'needs', type: 'build' })
    return { store, a, b, c }
  }

  it('removes the module and prunes incoming deps from surviving features', async () => {
    const { store, a, c } = await seeded()
    store.getState().deleteModule('core')
    const mods = store.getState().project.modules
    expect(mods.map((m) => m.id)).toEqual(['storage'])
    const cf = mods[0]!.features.find((f) => f.id === c)!
    expect(cf.deps.find((d) => d.id === a)).toBeUndefined()
  })

  it('clears UI state that pointed at any feature in the deleted module', async () => {
    const { store, a, b } = await seeded()
    store.getState().openDrawer(a)
    store.getState().setCursorFeature(b)
    store.getState().openDepEditor(a, b, { x: 0, y: 0 })
    store.setState((s) => {
      s.mindmapOverrides[a] = { x: 1, y: 1 }
      s.mindmapOverrides[b] = { x: 2, y: 2 }
      s.project.meta.mindmapPositions = {
        [a]: { x: 3, y: 3 },
        [b]: { x: 4, y: 4 },
      }
    })
    store.getState().deleteModule('core')
    expect(store.getState().drawerFeatureId).toBeNull()
    expect(store.getState().cursorFeatureId).toBeNull()
    expect(store.getState().depEditor).toBeNull()
    expect(store.getState().mindmapOverrides[a]).toBeUndefined()
    expect(store.getState().mindmapOverrides[b]).toBeUndefined()
    expect(store.getState().project.meta.mindmapPositions?.[a]).toBeUndefined()
    expect(store.getState().project.meta.mindmapPositions?.[b]).toBeUndefined()
  })

  it('leaves UI state for features in other modules untouched', async () => {
    const { store, c } = await seeded()
    store.getState().setCursorFeature(c)
    store.setState((s) => {
      s.mindmapOverrides[c] = { x: 5, y: 5 }
    })
    store.getState().deleteModule('core')
    expect(store.getState().cursorFeatureId).toBe(c)
    expect(store.getState().mindmapOverrides[c]).toEqual({ x: 5, y: 5 })
  })
})

describe('useProjectStore deleteMilestone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveProjectMock.mockReset().mockResolvedValue(undefined)
    subscribeExternalChangeMock.mockReset().mockImplementation(() => () => {})
  })
  afterEach(() => vi.useRealTimers())

  async function seeded() {
    const store = await freshStore()
    await store.getState().init()
    store.setState({
      loaded: true,
      source: 'disk',
      currentPath: '/tmp/project.json',
      project: makeProject(),
      saveStatus: 'saved',
      savedAt: Date.now(),
    })
    store.getState().addMilestone('v0.2', 'v0.2')
    const a = store.getState().addFeature('core', { label: 'Alpha', ms: 'v0.1' })
    const b = store.getState().addFeature('core', { label: 'Beta', ms: 'v0.2' })
    return { store, a, b }
  }

  it('reassigns orphaned features to the first remaining milestone', async () => {
    const { store, a } = await seeded()
    store.getState().deleteMilestone('v0.1')
    const af = store.getState().project.modules[0]!.features.find((f) => f.id === a)!
    expect(af.ms).toBe('v0.2')
    const milestones = store.getState().project.meta.milestones.map((m) => m.id)
    expect(milestones).toEqual(['v0.2'])
  })

  it('resets activeMilestone when its milestone is deleted', async () => {
    const { store } = await seeded()
    store.setState({ activeMilestone: 'v0.1' })
    store.getState().deleteMilestone('v0.1')
    expect(store.getState().activeMilestone).toBe('all')
  })

  it('keeps activeMilestone when a different milestone is deleted', async () => {
    const { store } = await seeded()
    store.setState({ activeMilestone: 'v0.2' })
    store.getState().deleteMilestone('v0.1')
    expect(store.getState().activeMilestone).toBe('v0.2')
  })

  it('leaves features orphaned when no milestone remains (validator surfaces it)', async () => {
    const { store, a } = await seeded()
    store.getState().deleteMilestone('v0.2')
    store.getState().deleteMilestone('v0.1')
    const af = store.getState().project.modules[0]!.features.find((f) => f.id === a)
    expect(af).toBeTruthy()
    expect(store.getState().project.meta.milestones).toEqual([])
  })
})

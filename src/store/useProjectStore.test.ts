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
})

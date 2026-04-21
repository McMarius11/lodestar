import type { Project } from '@/types'
import { migrate } from '@/schema'

const LS_KEY = 'projekt-planner:project:v1'

export type LoadedProject =
  | { project: Project; source: 'disk' | 'localStorage'; status: 'ok'; path?: string }
  | { project: null; source: 'none'; status: 'empty' }
  | {
      project: Project
      source: 'disk' | 'localStorage'
      status: 'corrupt'
      error: string
    }

function hasElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.projectAPI !== 'undefined'
}

/**
 * Default-location load: the app's canonical slot.
 * - Electron dev: <repo>/data/project.json
 * - Electron packaged: <userData>/data/project.json
 * - Browser: localStorage[LS_KEY]
 *
 * Returns `source: 'none'` if nothing is there yet.
 */
export async function loadProject(): Promise<LoadedProject> {
  if (hasElectron()) {
    const res = await window.projectAPI.load()
    if (res.ok) {
      try {
        return {
          project: migrate(res.data),
          source: 'disk',
          status: 'ok',
          path: res.path,
        }
      } catch (err) {
        return {
          project: null as unknown as Project,
          source: 'disk',
          status: 'corrupt',
          error: String(err),
        } as LoadedProject
      }
    }
    return { project: null, source: 'none', status: 'empty' }
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { project: migrate(JSON.parse(raw)), source: 'localStorage', status: 'ok' }
  } catch (err) {
    console.warn('localStorage migration failed', err)
  }
  return { project: null, source: 'none', status: 'empty' }
}

/**
 * Electron-only. Load a project from an arbitrary filesystem path.
 * In the browser this has no meaning — callers should guard with
 * hasElectron() or use loadProject() instead.
 */
export async function loadProjectFromPath(path: string): Promise<LoadedProject> {
  if (!hasElectron()) return { project: null, source: 'none', status: 'empty' }
  const res = await window.projectAPI.load(path)
  if (!res.ok) return { project: null, source: 'none', status: 'empty' }
  try {
    return {
      project: migrate(res.data),
      source: 'disk',
      status: 'ok',
      path: res.path ?? path,
    }
  } catch (err) {
    return {
      project: null as unknown as Project,
      source: 'disk',
      status: 'corrupt',
      error: String(err),
    } as LoadedProject
  }
}

/**
 * Save a project.
 *   - Electron + explicit path: writes there, watcher latches onto the path.
 *   - Electron + no path: writes to the default data/project.json slot.
 *   - Browser: writes to localStorage.
 */
export async function saveProject(
  project: Project,
  path?: string,
): Promise<void> {
  if (hasElectron()) {
    await window.projectAPI.save(project, path)
    return
  }
  localStorage.setItem(LS_KEY, JSON.stringify(project))
}

export async function exportProject(project: Project): Promise<string | null> {
  if (hasElectron()) {
    const res = await window.projectAPI.exportTo(project)
    return res.ok ? (res.path ?? null) : null
  }
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'project.json'
  a.click()
  URL.revokeObjectURL(url)
  return 'download'
}

export type ImportedProject = { project: Project; path?: string }

export async function importProject(): Promise<ImportedProject | null> {
  if (hasElectron()) {
    const res = await window.projectAPI.importFrom()
    if (!res.ok) return null
    return { project: migrate(res.data), path: res.path }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const text = await file.text()
      try {
        resolve({ project: migrate(JSON.parse(text)) })
      } catch {
        resolve(null)
      }
    }
    input.click()
  })
}

export function importProjectFromText(text: string): Project | null {
  try {
    return migrate(JSON.parse(text))
  } catch (err) {
    console.warn('Import from text failed', err)
    return null
  }
}

export function subscribeExternalChange(cb: () => void): () => void {
  if (hasElectron()) return window.projectAPI.onExternalChange(cb)
  return () => {}
}

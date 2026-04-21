import type { Project } from '@/types'
import { migrate } from '@/schema'

const LS_KEY = 'projekt-planner:project:v1'

export type LoadedProject =
  | { project: Project; source: 'disk' | 'localStorage'; status: 'ok' }
  | { project: null; source: 'none'; status: 'empty' }
  | { project: Project; source: 'disk' | 'localStorage'; status: 'corrupt'; error: string }

function hasElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.projectAPI !== 'undefined'
}

export async function loadProject(): Promise<LoadedProject> {
  if (hasElectron()) {
    const res = await window.projectAPI.load()
    if (res.ok) {
      try {
        return { project: migrate(res.data), source: 'disk', status: 'ok' }
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

export async function saveProject(project: Project): Promise<void> {
  if (hasElectron()) {
    await window.projectAPI.save(project)
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

export async function importProject(): Promise<Project | null> {
  if (hasElectron()) {
    const res = await window.projectAPI.importFrom()
    return res.ok ? migrate(res.data) : null
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
        resolve(migrate(JSON.parse(text)))
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

import type { Project } from '@/types'
import { migrate } from '@/schema'
import { sampleProject } from '@/data/sample'

const LS_KEY = 'projekt-planner:project:v1'

function hasElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.projectAPI !== 'undefined'
}

export async function loadProject(): Promise<{ project: Project; source: 'disk' | 'localStorage' | 'sample' }> {
  if (hasElectron()) {
    const res = await window.projectAPI.load()
    if (res.ok) {
      try {
        return { project: migrate(res.data), source: 'disk' }
      } catch (err) {
        console.warn('Migration failed, falling back to sample:', err)
        return { project: migrate(sampleProject), source: 'sample' }
      }
    }
    return { project: migrate(sampleProject), source: 'sample' }
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { project: migrate(JSON.parse(raw)), source: 'localStorage' }
  } catch {
    /* ignore */
  }
  return { project: migrate(sampleProject), source: 'sample' }
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

export function subscribeExternalChange(cb: () => void): () => void {
  if (hasElectron()) return window.projectAPI.onExternalChange(cb)
  return () => {}
}

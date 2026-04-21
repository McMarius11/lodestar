import { contextBridge, ipcRenderer, webUtils } from 'electron'

export type LoadResult =
  | { ok: true; data: unknown; path?: string }
  | { ok: false; error: string }

export type SaveResult =
  | { ok: true; path?: string }
  | { ok: false; error: string }

contextBridge.exposeInMainWorld('projectAPI', {
  load: (filePath?: string): Promise<LoadResult> =>
    ipcRenderer.invoke('project:load', filePath),
  save: (payload: unknown, filePath?: string): Promise<SaveResult> =>
    ipcRenderer.invoke('project:save', payload, filePath),
  exportTo: (payload: unknown): Promise<SaveResult> =>
    ipcRenderer.invoke('project:export', payload),
  importFrom: (): Promise<LoadResult> => ipcRenderer.invoke('project:import'),
  openPath: (filePath: string): Promise<LoadResult> =>
    ipcRenderer.invoke('project:openPath', filePath),
  loadExample: (): Promise<LoadResult> => ipcRenderer.invoke('project:example'),
  getFilePath: (file: File): string | null => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  },
  onExternalChange: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('project:external-change', handler)
    return () => ipcRenderer.off('project:external-change', handler)
  },
})

declare global {
  interface Window {
    projectAPI: {
      load: (filePath?: string) => Promise<LoadResult>
      save: (payload: unknown, filePath?: string) => Promise<SaveResult>
      exportTo: (payload: unknown) => Promise<SaveResult>
      importFrom: () => Promise<LoadResult>
      openPath: (filePath: string) => Promise<LoadResult>
      loadExample: () => Promise<LoadResult>
      getFilePath: (file: File) => string | null
      onExternalChange: (cb: () => void) => () => void
    }
  }
}

import { contextBridge, ipcRenderer } from 'electron'

export type LoadResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string }

export type SaveResult =
  | { ok: true; path?: string }
  | { ok: false; error: string }

contextBridge.exposeInMainWorld('projectAPI', {
  load: (): Promise<LoadResult> => ipcRenderer.invoke('project:load'),
  save: (payload: unknown): Promise<SaveResult> =>
    ipcRenderer.invoke('project:save', payload),
  exportTo: (payload: unknown): Promise<SaveResult> =>
    ipcRenderer.invoke('project:export', payload),
  importFrom: (): Promise<LoadResult> => ipcRenderer.invoke('project:import'),
  onExternalChange: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('project:external-change', handler)
    return () => ipcRenderer.off('project:external-change', handler)
  },
})

declare global {
  interface Window {
    projectAPI: {
      load: () => Promise<LoadResult>
      save: (payload: unknown) => Promise<SaveResult>
      exportTo: (payload: unknown) => Promise<SaveResult>
      importFrom: () => Promise<LoadResult>
      onExternalChange: (cb: () => void) => () => void
    }
  }
}

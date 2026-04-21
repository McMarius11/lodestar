import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync, watch as fsWatch, type FSWatcher } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const DATA_DIR = path.join(process.env.APP_ROOT, 'data')
const DATA_FILE = path.join(DATA_DIR, 'project.json')

let win: BrowserWindow | null = null
let watcher: FSWatcher | null = null
let writingOwn = false

async function ensureDataFile(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true })
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 640,
    backgroundColor: '#0A0A0C',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.on('closed', () => {
    win = null
    watcher?.close()
    watcher = null
  })
}

function startWatcher(): void {
  if (!existsSync(DATA_FILE)) return
  watcher?.close()
  try {
    watcher = fsWatch(DATA_FILE, { persistent: false }, (eventType) => {
      if (writingOwn) return
      if (eventType === 'change' && win) {
        win.webContents.send('project:external-change')
      }
    })
  } catch {
    /* ignore */
  }
}

ipcMain.handle('project:load', async () => {
  await ensureDataFile()
  if (!existsSync(DATA_FILE)) {
    return { ok: false, error: 'NOT_FOUND' }
  }
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    return { ok: true, data: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('project:save', async (_evt, payload: unknown) => {
  await ensureDataFile()
  try {
    writingOwn = true
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8')
    if (!watcher) startWatcher()
    setTimeout(() => {
      writingOwn = false
    }, 200)
    return { ok: true }
  } catch (err) {
    writingOwn = false
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('project:export', async (_evt, payload: unknown) => {
  if (!win) return { ok: false, error: 'NO_WINDOW' }
  const result = await dialog.showSaveDialog(win, {
    defaultPath: 'project-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, error: 'CANCELED' }
  try {
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, path: result.filePath }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('project:import', async () => {
  if (!win) return { ok: false, error: 'NO_WINDOW' }
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'CANCELED' }
  try {
    const raw = await fs.readFile(result.filePaths[0], 'utf-8')
    return { ok: true, data: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

app.whenReady().then(async () => {
  await ensureDataFile()
  createWindow()
  startWatcher()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

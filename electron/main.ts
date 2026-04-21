import { app, BrowserWindow, ipcMain, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
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

// In dev: keep data in the repo's ./data so Claude Code can see edits live.
// In packaged builds: app.asar is read-only, so use the platform userData dir.
let _dataDir: string | null = null
function dataDir(): string {
  if (_dataDir) return _dataDir
  _dataDir = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT!, 'data')
    : path.join(app.getPath('userData'), 'data')
  return _dataDir
}
function dataFile(): string {
  return path.join(dataDir(), 'project.json')
}
function backupFile(): string {
  return dataFile() + '.bak'
}

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.5

let win: BrowserWindow | null = null
let watcher: FSWatcher | null = null
let writingOwn = false

async function ensureDataFile(): Promise<void> {
  if (!existsSync(dataDir())) {
    await fs.mkdir(dataDir(), { recursive: true })
  }
}

function setZoom(delta: number): void {
  if (!win) return
  const current = win.webContents.getZoomFactor()
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current + delta))
  win.webContents.setZoomFactor(next)
}

function resetZoom(): void {
  win?.webContents.setZoomFactor(1)
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => setZoom(ZOOM_STEP),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => setZoom(-ZOOM_STEP),
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: resetZoom,
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      role: 'windowMenu',
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
      zoomFactor: 1,
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
  if (!existsSync(dataFile())) return
  watcher?.close()
  try {
    watcher = fsWatch(dataFile(), { persistent: false }, (eventType) => {
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
  if (!existsSync(dataFile())) {
    return { ok: false, error: 'NOT_FOUND' }
  }
  try {
    const raw = await fs.readFile(dataFile(), 'utf-8')
    return { ok: true, data: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('project:save', async (_evt, payload: unknown) => {
  await ensureDataFile()
  try {
    writingOwn = true
    // Rotating single-slot backup: copy previous file before overwrite.
    if (existsSync(dataFile())) {
      try {
        await fs.copyFile(dataFile(), backupFile())
      } catch (err) {
        console.warn('Backup copy failed (non-fatal):', err)
      }
    }
    await fs.writeFile(dataFile(), JSON.stringify(payload, null, 2), 'utf-8')
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

ipcMain.handle('project:example', async () => {
  const candidates = [
    path.join(process.env.APP_ROOT!, 'data', 'project.example.json'),
    process.resourcesPath
      ? path.join(process.resourcesPath, 'project.example.json')
      : '',
  ].filter(Boolean)
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = await fs.readFile(p, 'utf-8')
        return { ok: true, data: JSON.parse(raw) }
      } catch {
        /* try next */
      }
    }
  }
  return { ok: false, error: 'EXAMPLE_NOT_FOUND' }
})

app.whenReady().then(async () => {
  await ensureDataFile()
  buildMenu()
  createWindow()
  startWatcher()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

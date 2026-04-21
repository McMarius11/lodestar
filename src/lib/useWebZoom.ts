import { useEffect } from 'react'

const KEY = 'lodestar:zoom'
const MIN = 0.5
const MAX = 2.5
const STEP = 0.1

function hasElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.projectAPI !== 'undefined'
}

function readZoom(): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return 1
    const n = Number(raw)
    if (Number.isFinite(n) && n >= MIN && n <= MAX) return n
    return 1
  } catch {
    return 1
  }
}

function applyZoom(z: number): void {
  document.documentElement.style.setProperty('--zoom', String(z))
  const body = document.body
  if (!body) return
  body.style.transformOrigin = '0 0'
  body.style.transform = z === 1 ? '' : `scale(${z})`
  body.style.width = z === 1 ? '' : `${100 / z}%`
  body.style.height = z === 1 ? '' : `${100 / z}%`
}

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, Number(n.toFixed(2))))
}

/**
 * Web-build fallback for the zoom menu accelerators Electron already owns.
 * Applies a CSS transform to <body> so the whole tree (SVG included) scales.
 */
export function useWebZoom() {
  useEffect(() => {
    // In Electron, webContents.setZoomFactor (native menu) handles this.
    if (hasElectron()) return

    let zoom = readZoom()
    applyZoom(zoom)

    const save = (z: number) => {
      try {
        localStorage.setItem(KEY, String(z))
      } catch {
        /* ignore */
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoom = clamp(zoom + STEP)
        applyZoom(zoom)
        save(zoom)
      } else if (e.key === '-') {
        e.preventDefault()
        zoom = clamp(zoom - STEP)
        applyZoom(zoom)
        save(zoom)
      } else if (e.key === '0') {
        e.preventDefault()
        zoom = 1
        applyZoom(zoom)
        save(zoom)
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -STEP : STEP
      zoom = clamp(zoom + delta)
      applyZoom(zoom)
      save(zoom)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])
}

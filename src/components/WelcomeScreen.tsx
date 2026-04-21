import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useProjectStore } from '@/store/useProjectStore'
import { migrate } from '@/schema'
import { loadProject } from '@/lib/persistence'

const RECENT_KEY = 'lodestar:recent-files'

type Recent = { name: string; path?: string; when: number }

type ExistingProject = { name: string; version: string } | null

function loadRecents(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Recent[]
  } catch {
    return []
  }
}

function basenameOf(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}

export function WelcomeScreen() {
  const importFromText = useProjectStore((s) => s.importFromText)
  const startEmpty = useProjectStore((s) => s.startEmptyProject)
  const loadRoadmap = useProjectStore((s) => s.loadLodestarRoadmap)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [recents, setRecents] = useState<Recent[]>([])
  const [existing, setExisting] = useState<ExistingProject>(null)

  useEffect(() => {
    setRecents(loadRecents())
    let cancelled = false
    loadProject()
      .then((res) => {
        if (cancelled) return
        if (res.status === 'ok' && res.project.modules.length > 0) {
          setExisting({
            name: res.project.meta.name || 'Untitled',
            version: res.project.meta.version,
          })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const confirmOverwrite = useCallback(
    (intent: string) => {
      if (!existing) return true
      return window.confirm(
        `Your saved project "${existing.name}" (v${existing.version}) is still on disk.\n\n${intent} will overwrite it. Continue?`,
      )
    },
    [existing],
  )

  const rememberRecent = useCallback(
    (r: Recent) => {
      const next = [r, ...recents.filter((x) => x.name !== r.name)].slice(0, 5)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      setRecents(next)
    },
    [recents],
  )

  const clearRecent = useCallback(
    (predicate: (r: Recent) => boolean) => {
      const next = recents.filter((r) => !predicate(r))
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      setRecents(next)
    },
    [recents],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const text = await file.text()
        const ok = importFromText(text)
        if (!ok) {
          setError('That file is not a valid Lodestar project.')
          return
        }
        const api = typeof window !== 'undefined' ? window.projectAPI : undefined
        const path = api?.getFilePath?.(file) ?? undefined
        rememberRecent({ name: file.name, path, when: Date.now() })
        setExisting(null)
      } catch (err) {
        setError('Failed to read file: ' + String(err))
      }
    },
    [importFromText, rememberRecent],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const onBrowse = useCallback(async () => {
    setError(null)
    const api = typeof window !== 'undefined' ? window.projectAPI : undefined
    if (api?.importFrom) {
      const res = await api.importFrom()
      if (!res.ok) {
        if (res.error !== 'CANCELED') setError(res.error)
        return
      }
      const ok = importFromText(JSON.stringify(res.data))
      if (!ok) {
        setError('That file is not a valid Lodestar project.')
        return
      }
      if (res.path) {
        rememberRecent({ name: basenameOf(res.path), path: res.path, when: Date.now() })
      }
      setExisting(null)
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) handleFile(f)
    }
    input.click()
  }, [handleFile, importFromText, rememberRecent])

  const reopenPath = useCallback(
    async (r: Recent) => {
      if (!r.path) return
      setError(null)
      const api = typeof window !== 'undefined' ? window.projectAPI : undefined
      if (!api?.openPath) return
      if (!confirmOverwrite(`Opening "${r.name}"`)) return
      const res = await api.openPath(r.path)
      if (!res.ok) {
        if (res.error === 'NOT_FOUND') {
          clearRecent((x) => x.path === r.path)
          setError(`File moved or deleted: ${r.name}`)
        } else {
          setError(`Failed to open ${r.name}: ${res.error}`)
        }
        return
      }
      const ok = importFromText(JSON.stringify(res.data))
      if (!ok) {
        setError('That file is no longer a valid Lodestar project.')
        return
      }
      rememberRecent({ name: r.name, path: r.path, when: Date.now() })
      setExisting(null)
    },
    [confirmOverwrite, clearRecent, importFromText, rememberRecent],
  )

  const loadExample = useCallback(async () => {
    setError(null)
    if (!confirmOverwrite('Loading the Nimbus example')) return
    const anyAPI = (typeof window !== 'undefined' ? window.projectAPI : undefined) as
      | { loadExample?: () => Promise<{ ok: boolean; data?: unknown }> }
      | undefined
    if (anyAPI?.loadExample) {
      const res = await anyAPI.loadExample()
      if (res.ok && res.data) {
        try {
          const project = migrate(res.data)
          useProjectStore.setState({ project, source: 'disk' })
          useProjectStore.getState()._persist()
          setExisting(null)
          return
        } catch (err) {
          console.warn('Bundled example invalid, using in-memory sample:', err)
        }
      }
    }
    useProjectStore.getState().loadSample()
    setExisting(null)
  }, [confirmOverwrite])

  const onLoadRoadmap = useCallback(() => {
    setError(null)
    if (!confirmOverwrite("Loading Lodestar's own roadmap")) return
    loadRoadmap()
    setExisting(null)
  }, [confirmOverwrite, loadRoadmap])

  const onStartEmpty = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      if (!confirmOverwrite('Starting an empty project')) return
      startEmpty(name.trim() || 'Untitled Project')
      setExisting(null)
    },
    [confirmOverwrite, name, startEmpty],
  )

  return (
    <div className="h-full w-full flex items-center justify-center grain overflow-y-auto">
      <div className="max-w-2xl w-full px-6 py-10">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="label-mono">LODESTAR · v0.3</span>
          <span className="label-mono text-fg-subtle">project planner</span>
        </div>
        <h1 className="ser-display text-5xl md:text-6xl mb-2 leading-none">
          {existing ? 'Welcome back.' : 'Nothing yet.'}
        </h1>
        <p className="text-fg-muted mb-8 max-w-md">
          {existing ? (
            <>
              Your saved project{' '}
              <span className="num-mono text-fg">{existing.name}</span> is still on
              disk. Re-open it from the Recent list below, drop a different
              <span className="num-mono text-fg"> project.json</span>, or replace it
              with a sample.
            </>
          ) : (
            <>
              Drop a <span className="num-mono text-fg">project.json</span> to
              continue where you left off, start from an empty skeleton, or explore
              a sample project to see the views in action.
            </>
          )}
        </p>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            'relative border border-dashed p-8 mb-6 cursor-pointer transition-colors',
            dragging
              ? 'border-accent bg-accent/5'
              : 'border-line/60 hover:border-line-strong/80',
          ].join(' ')}
          onClick={onBrowse}
        >
          <div className="flex items-center gap-4">
            <div className="text-4xl ser-display text-accent">↓</div>
            <div>
              <div className="text-fg font-medium mb-1">
                Drop a project.json here
              </div>
              <div className="label-mono text-fg-subtle">
                or click to browse · will overwrite data/project.json
              </div>
            </div>
          </div>
        </motion.div>

        {error && (
          <div className="mb-6 border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <button onClick={loadExample} className="btn-ghost justify-between text-left">
            <div>
              <div className="text-fg">Try the Nimbus example</div>
              <div className="label-mono text-fg-subtle">6 modules · 5 milestones</div>
            </div>
            <span className="text-fg-subtle">→</span>
          </button>

          <button onClick={onLoadRoadmap} className="btn-ghost justify-between text-left">
            <div>
              <div className="text-fg">Look at Lodestar's own roadmap</div>
              <div className="label-mono text-fg-subtle">
                dogfood · v0.3 plan in the app itself
              </div>
            </div>
            <span className="text-fg-subtle">→</span>
          </button>
        </div>

        <form
          onSubmit={onStartEmpty}
          className="flex items-stretch border border-line/60 bg-raised/40 mb-6 max-w-md"
        >
          <input
            type="text"
            placeholder="Project name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-2 text-sm outline-none placeholder:text-fg-subtle"
          />
          <button type="submit" className="px-3 border-l border-line/60 text-sm hover:bg-raised">
            Start empty →
          </button>
        </form>

        {recents.length > 0 && (
          <div>
            <div className="label-mono mb-2 text-fg-subtle">RECENT</div>
            <div className="space-y-1">
              {recents.map((r) => {
                const clickable = Boolean(
                  r.path && typeof window !== 'undefined' && window.projectAPI?.openPath,
                )
                if (clickable) {
                  return (
                    <button
                      key={(r.path ?? r.name) + r.when}
                      onClick={() => reopenPath(r)}
                      className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-raised/60 label-mono text-left transition-colors group"
                      title={r.path}
                    >
                      <span className="num-mono text-fg group-hover:text-accent truncate">
                        {r.name}
                      </span>
                      <span className="text-fg-subtle shrink-0 ml-4">
                        {formatWhen(r.when)}
                      </span>
                    </button>
                  )
                }
                return (
                  <div
                    key={(r.path ?? r.name) + r.when}
                    className="flex items-center justify-between py-1.5 px-2 hover:bg-raised/40 label-mono"
                    title="Drop this file again to re-open it (path not captured)"
                  >
                    <span className="num-mono text-fg-muted truncate">{r.name}</span>
                    <span className="text-fg-subtle shrink-0 ml-4">
                      {formatWhen(r.when)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="label-mono text-fg-subtle mt-2">
              Click to re-open · fallback: drop the file again
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatWhen(ts: number): string {
  const d = new Date(ts)
  return d.toISOString().slice(0, 10)
}

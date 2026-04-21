import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useProjectStore } from '@/store/useProjectStore'
import type { Recent } from '@/lib/recentFiles'
import type { LastSession } from '@/lib/lastSession'

function basenameOf(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}

function formatWhen(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function WelcomeScreen() {
  const openProjectFromPath = useProjectStore((s) => s.openProjectFromPath)
  const openProjectFromDialog = useProjectStore((s) => s.openProjectFromDialog)
  const openProjectFromText = useProjectStore((s) => s.openProjectFromText)
  const openLastSession = useProjectStore((s) => s.openLastSession)
  const recentsFn = useProjectStore((s) => s.recents)
  const lastSessionFn = useProjectStore((s) => s.lastSession)
  const forgetRecent = useProjectStore((s) => s.forgetRecent)
  const startEmpty = useProjectStore((s) => s.startEmptyProject)
  const loadSample = useProjectStore((s) => s.loadSample)
  const loadRoadmap = useProjectStore((s) => s.loadLodestarRoadmap)

  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [recents, setRecents] = useState<Recent[]>([])
  const [last, setLast] = useState<LastSession | null>(null)

  const refreshLists = useCallback(() => {
    setRecents(recentsFn())
    setLast(lastSessionFn())
  }, [lastSessionFn, recentsFn])

  useEffect(() => {
    refreshLists()
  }, [refreshLists])

  const continueLabel = useMemo(() => {
    if (!last) return null
    if (last.path) {
      const match = recents.find((r) => r.path === last.path)
      return match?.name ?? basenameOf(last.path)
    }
    // Browser mode: no path — fall back to the name of the newest recent
    // entry, if any. Otherwise a generic label.
    return recents[0]?.name ?? 'your last project'
  }, [last, recents])

  const onContinue = useCallback(async () => {
    setError(null)
    const ok = await openLastSession()
    if (!ok) {
      setError('Last project could not be reopened (file moved or deleted).')
      refreshLists()
    }
  }, [openLastSession, refreshLists])

  const onReopenRecent = useCallback(
    async (r: Recent) => {
      if (!r.path) return
      setError(null)
      const ok = await openProjectFromPath(r.path)
      if (!ok) {
        setError(`File moved or deleted: ${r.name}`)
        refreshLists()
      }
    },
    [openProjectFromPath, refreshLists],
  )

  const onBrowse = useCallback(async () => {
    setError(null)
    const ok = await openProjectFromDialog()
    if (!ok) {
      const api = typeof window !== 'undefined' ? window.projectAPI : undefined
      if (api) return // user cancelled — silent
      // Browser fallback: Electron-less environments don't get a dialog.
      setError('Could not open file dialog.')
    }
  }, [openProjectFromDialog])

  const onDropFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const text = await file.text()
        const api = typeof window !== 'undefined' ? window.projectAPI : undefined
        const path = api?.getFilePath?.(file) ?? undefined
        const ok = openProjectFromText(text, { name: file.name, path })
        if (!ok) {
          setError('That file is not a valid Lodestar project.')
          return
        }
        refreshLists()
      } catch (err) {
        setError('Failed to read file: ' + String(err))
      }
    },
    [openProjectFromText, refreshLists],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) onDropFile(file)
    },
    [onDropFile],
  )

  const onStartEmpty = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      startEmpty(name.trim() || 'Untitled Project')
    },
    [name, startEmpty],
  )

  const onForgetRecent = useCallback(
    (r: Recent, e: React.MouseEvent) => {
      e.stopPropagation()
      forgetRecent((x) => (r.path ? x.path === r.path : x.name === r.name))
      refreshLists()
    },
    [forgetRecent, refreshLists],
  )

  return (
    <div className="h-full w-full flex items-center justify-center grain overflow-y-auto">
      <div className="max-w-2xl w-full px-6 py-10">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="label-mono">LODESTAR · v0.3</span>
          <span className="label-mono text-fg-subtle">project planner</span>
        </div>
        <h1 className="ser-display text-5xl md:text-6xl mb-2 leading-none">
          {continueLabel ? 'Welcome back.' : 'Nothing yet.'}
        </h1>
        <p className="text-fg-muted mb-8 max-w-md">
          {continueLabel ? (
            <>
              Pick up where you left off, or open a different{' '}
              <span className="num-mono text-fg">project.json</span>.
            </>
          ) : (
            <>
              Drop a <span className="num-mono text-fg">project.json</span> to
              continue, start from an empty skeleton, or explore a sample
              project to see the views in action.
            </>
          )}
        </p>

        {continueLabel && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onContinue}
            className="w-full mb-4 flex items-center justify-between border border-accent/60 bg-accent/5 hover:bg-accent/10 px-5 py-3 text-left transition-colors"
          >
            <div>
              <div className="label-mono text-accent mb-0.5">CONTINUE</div>
              <div className="num-mono text-fg">{continueLabel}</div>
            </div>
            <span className="ser-display text-2xl text-accent">→</span>
          </motion.button>
        )}

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
            'relative border border-dashed p-6 mb-6 cursor-pointer transition-colors',
            dragging
              ? 'border-accent bg-accent/5'
              : 'border-line/60 hover:border-line-strong/80',
          ].join(' ')}
          onClick={onBrowse}
        >
          <div className="flex items-center gap-4">
            <div className="text-3xl ser-display text-accent">↓</div>
            <div>
              <div className="text-fg font-medium mb-1">
                Open a project.json
              </div>
              <div className="label-mono text-fg-subtle">
                drop here · or click to browse
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
          <button onClick={loadSample} className="btn-ghost justify-between text-left">
            <div>
              <div className="text-fg">Try the Nimbus example</div>
              <div className="label-mono text-fg-subtle">6 modules · 5 milestones</div>
            </div>
            <span className="text-fg-subtle">→</span>
          </button>

          <button onClick={loadRoadmap} className="btn-ghost justify-between text-left">
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
                  r.path && typeof window !== 'undefined' && window.projectAPI,
                )
                const key = (r.path ?? r.name) + r.when
                if (clickable) {
                  return (
                    <div
                      key={key}
                      className="flex items-center hover:bg-raised/60 label-mono transition-colors group"
                      title={r.path}
                    >
                      <button
                        onClick={() => onReopenRecent(r)}
                        className="flex-1 flex items-center justify-between py-1.5 px-2 text-left"
                      >
                        <span className="num-mono text-fg group-hover:text-accent truncate">
                          {r.name}
                        </span>
                        <span className="text-fg-subtle shrink-0 ml-4">
                          {formatWhen(r.when)}
                        </span>
                      </button>
                      <button
                        onClick={(e) => onForgetRecent(r, e)}
                        aria-label={`Remove ${r.name} from recents`}
                        className="px-2 py-1.5 text-fg-subtle hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  )
                }
                return (
                  <div
                    key={key}
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
              Click to re-open · × removes the entry · drop the file again to recapture its path
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

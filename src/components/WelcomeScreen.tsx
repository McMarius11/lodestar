import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useProjectStore } from '@/store/useProjectStore'
import { migrate } from '@/schema'

const RECENT_KEY = 'lodestar:recent-files'

type Recent = { name: string; when: number }

function loadRecents(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Recent[]
  } catch {
    return []
  }
}

export function WelcomeScreen() {
  const importFromText = useProjectStore((s) => s.importFromText)
  const startEmpty = useProjectStore((s) => s.startEmptyProject)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [recents, setRecents] = useState<Recent[]>([])

  useEffect(() => {
    setRecents(loadRecents())
  }, [])

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
        const next = [{ name: file.name, when: Date.now() }, ...recents.filter((r) => r.name !== file.name)].slice(0, 5)
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch (err) {
        setError('Failed to read file: ' + String(err))
      }
    },
    [importFromText, recents],
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

  const onBrowse = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) handleFile(f)
    }
    input.click()
  }, [handleFile])

  const loadExample = useCallback(async () => {
    setError(null)
    // Prefer bundled file from main process; fall back to in-memory sample.
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
          return
        } catch (err) {
          console.warn('Bundled example invalid, using in-memory sample:', err)
        }
      }
    }
    useProjectStore.getState().loadSample()
  }, [])

  return (
    <div className="h-full w-full flex items-center justify-center grain overflow-y-auto">
      <div className="max-w-2xl w-full px-6 py-10">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="label-mono">LODESTAR · v0.2</span>
          <span className="label-mono text-fg-subtle">project planner</span>
        </div>
        <h1 className="ser-display text-5xl md:text-6xl mb-2 leading-none">
          Nothing yet.
        </h1>
        <p className="text-fg-muted mb-8 max-w-md">
          Drop a <span className="num-mono text-fg">project.json</span> to continue
          where you left off, start from an empty skeleton, or explore a sample
          project to see the views in action.
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

        <div className="grid md:grid-cols-2 gap-3 mb-6">
          <button onClick={loadExample} className="btn-ghost justify-between text-left">
            <div>
              <div className="text-fg">Try the Nimbus example</div>
              <div className="label-mono text-fg-subtle">6 modules · 5 milestones</div>
            </div>
            <span className="text-fg-subtle">→</span>
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              startEmpty(name.trim() || 'Untitled Project')
            }}
            className="flex items-stretch border border-line/60 bg-raised/40"
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
        </div>

        {recents.length > 0 && (
          <div>
            <div className="label-mono mb-2 text-fg-subtle">RECENT</div>
            <div className="space-y-1">
              {recents.map((r) => (
                <div
                  key={r.name + r.when}
                  className="flex items-center justify-between py-1.5 px-2 hover:bg-raised/40 label-mono"
                >
                  <span className="num-mono text-fg">{r.name}</span>
                  <span className="text-fg-subtle">{formatWhen(r.when)}</span>
                </div>
              ))}
            </div>
            <p className="label-mono text-fg-subtle mt-2">
              Recent files are tracked locally; drop the file again to re-open it.
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

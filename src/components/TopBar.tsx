import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import type { ViewId } from '@/types'
import { MilestoneFilter } from './MilestoneFilter'
import { StatusFilter } from './StatusFilter'
import { MilestoneEditor } from './MilestoneEditor'
import { ProjectMetaEditor } from './ProjectMetaEditor'
import { useContextMenu } from './ContextMenu'
import { useEffect, useMemo, useRef, useState } from 'react'
import { validate } from '@/lib/validate'

const tabs: { id: ViewId; label: string; tag: string }[] = [
  { id: 'scope', label: 'Scope', tag: '1' },
  { id: 'roadmap', label: 'Roadmap', tag: '2' },
  { id: 'kanban', label: 'Kanban', tag: '3' },
  { id: 'mindmap', label: 'Mind', tag: '4' },
  { id: 'gantt', label: 'Gantt', tag: '5' },
  { id: 'validate', label: 'Status', tag: '6' },
]

export function TopBar() {
  const project = useProjectStore((s) => s.project)
  const active = useProjectStore((s) => s.activeView)
  const setActive = useProjectStore((s) => s.setActiveView)
  const togglePalette = useProjectStore((s) => s.togglePalette)
  const saveStatus = useProjectStore((s) => s.saveStatus)
  const savedAt = useProjectStore((s) => s.savedAt)
  const source = useProjectStore((s) => s.source)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const historyDepth = useProjectStore((s) => s.history.length)
  const futureDepth = useProjectStore((s) => s.future.length)
  const canUndo = historyDepth > 0
  const canRedo = futureDepth > 0
  const addFeature = useProjectStore((s) => s.addFeature)
  const addModule = useProjectStore((s) => s.addModule)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const msEditorOpen = useProjectStore((s) => s.msEditorOpen)
  const metaEditorOpen = useProjectStore((s) => s.metaEditorOpen)
  const toggleMilestoneEditor = useProjectStore((s) => s.toggleMilestoneEditor)
  const toggleMetaEditor = useProjectStore((s) => s.toggleMetaEditor)
  const closeCurrentProject = useProjectStore((s) => s.closeCurrentProject)
  const newCtx = useContextMenu()
  const projectCtx = useContextMenu()

  const { errCount, warnCount } = useMemo(() => {
    const issues = validate(project)
    return {
      errCount: issues.filter((i) => i.severity === 'error').length,
      warnCount: issues.filter((i) => i.severity === 'warn').length,
    }
  }, [project])

  const handleAddFeature = () => {
    const firstModule = project.modules[0]
    if (!firstModule) {
      alert('Add a module first.')
      return
    }
    const id = addFeature(firstModule.id)
    openDrawer(id)
  }

  const openProjectMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    projectCtx.openAt(rect.left, rect.bottom + 4, [
      {
        kind: 'action',
        label: 'Edit project meta…',
        run: () => toggleMetaEditor(true),
      },
      {
        kind: 'action',
        label: 'Edit milestones…',
        run: () => toggleMilestoneEditor(true),
      },
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Close / switch project…',
        run: () => {
          if (
            confirm(
              'Close current project? The saved file on disk is not touched — you will return to the welcome screen to pick another.',
            )
          ) {
            closeCurrentProject()
          }
        },
      },
    ])
  }

  const openNewMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    newCtx.openAt(rect.left, rect.bottom + 4, [
      {
        kind: 'action',
        label: 'New Feature',
        hint: 'N',
        disabled: project.modules.length === 0,
        run: handleAddFeature,
      },
      {
        kind: 'action',
        label: 'New Module',
        run: () => {
          addModule()
        },
      },
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Edit Milestones…',
        run: () => toggleMilestoneEditor(true),
      },
    ])
  }

  return (
    <header className="relative z-20 border-b border-line/60 bg-void/80 backdrop-blur-sm">
      <div className="flex items-stretch">
        {/* Brand */}
        <div
          className="flex items-stretch border-r border-line/60 min-w-[280px]"
          onContextMenu={(e) => {
            e.preventDefault()
            projectCtx.openAt(e.clientX, e.clientY, [
              {
                kind: 'action',
                label: 'Edit project meta…',
                run: () => toggleMetaEditor(true),
              },
              {
                kind: 'action',
                label: 'Edit milestones…',
                run: () => toggleMilestoneEditor(true),
              },
              { kind: 'separator' },
              {
                kind: 'action',
                label: 'Close / switch project…',
                run: () => {
                  if (
                    confirm(
                      'Close current project? The saved file on disk is not touched — you will return to the welcome screen to pick another.',
                    )
                  ) {
                    closeCurrentProject()
                  }
                },
              },
            ])
          }}
        >
          <button
            onClick={() => toggleMetaEditor(true)}
            className="flex items-center gap-3 px-5 py-3 flex-1 text-left hover:bg-raised/30 transition-colors"
            title="Edit project meta"
          >
            <BrandMark />

            <div className="flex flex-col leading-none">
              <span className="ser-display text-xl italic text-fg">
                {project.meta.name || 'Untitled'}
              </span>
              <span className="label-mono mt-1 flex items-center gap-2">
                <span className="num-mono">v{project.meta.version}</span>
                <span className="w-1 h-1 rounded-full bg-fg-subtle" />
                <span>{source ?? '—'}</span>
              </span>
            </div>
          </button>
          <button
            onClick={openProjectMenu}
            title="Project actions"
            aria-label="Project actions"
            className="px-2 py-3 label-mono text-fg-subtle hover:text-fg hover:bg-raised/30 transition-colors border-l border-line/30"
          >
            ⋮
          </button>
        </div>

        {/* Tabs */}
        <nav className="flex items-stretch flex-1 overflow-x-auto scroll-thin">
          {tabs.map((t) => {
            const isActive = t.id === active
            const isValidateTab = t.id === 'validate'
            const badge = isValidateTab ? errCount + warnCount : 0
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                title={`${t.label} (${t.tag})`}
                className={clsx(
                  'group relative px-5 py-3 border-r border-line/60 transition-colors',
                  isActive ? 'bg-raised/60' : 'hover:bg-raised/30',
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={clsx(
                      'text-sm transition-colors',
                      isActive ? 'text-fg' : 'text-fg-muted group-hover:text-fg',
                    )}
                  >
                    {t.label}
                  </span>
                  <span className="num-mono text-[9px] leading-none text-fg-subtle group-hover:text-fg-muted">
                    {t.tag}
                  </span>
                  {badge > 0 && (
                    <span
                      className={clsx(
                        'num-mono text-[10px] px-1 ml-1 border',
                        errCount > 0
                          ? 'border-danger text-danger'
                          : 'border-warn text-warn',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </div>
                {isActive && (
                  <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-accent" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2 px-3 border-l border-line/60">
          <div className="flex items-center gap-1 pr-1 border-r border-line/60">
            <IconBtn
              onClick={() => undo()}
              disabled={!canUndo}
              title={`Undo (⌘Z) · ${historyDepth} steps`}
            >
              ↶
            </IconBtn>
            <IconBtn
              onClick={() => redo()}
              disabled={!canRedo}
              title={`Redo (⌘⇧Z) · ${futureDepth} steps`}
            >
              ↷
            </IconBtn>
            <button
              onClick={openNewMenu}
              title="Create…"
              className={clsx(
                'px-2 py-1 border border-line/40 text-sm transition-colors',
                'hover:bg-raised hover:border-line-strong/80',
              )}
            >
              ＋
            </button>
          </div>
          <StatusFilter />
          <MilestoneFilter />
          <SaveIndicator status={saveStatus} savedAt={savedAt} />
          <button
            onClick={() => togglePalette(true)}
            className="btn-ghost label-mono"
            title="Command Palette (⌘K)"
          >
            <span className="num-mono">⌘K</span>
          </button>
        </div>
      </div>

      {newCtx.menu}
      {projectCtx.menu}
      {msEditorOpen && <MilestoneEditor onClose={() => toggleMilestoneEditor(false)} />}
      {metaEditorOpen && <ProjectMetaEditor onClose={() => toggleMetaEditor(false)} />}
    </header>
  )
}

function BrandMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-7 w-7 shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id="brand-star" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFC49B" />
          <stop offset="55%" stopColor="#FF5A1F" />
          <stop offset="100%" stopColor="#B8340E" />
        </linearGradient>
      </defs>
      <polygon
        points="32,6 33.53,28.31 39.42,22.58 36.32,31.47
                58,32 36.32,32.53 39.42,41.42 33.53,35.69
                32,58 30.47,35.69 24.58,41.42 27.68,32.53
                6,32 27.68,31.47 24.58,22.58 30.47,28.31"
        fill="url(#brand-star)"
        stroke="#FF7B3F"
        strokeOpacity="0.8"
        strokeWidth="0.6"
      />
      <circle cx="32" cy="32" r="2.2" fill="rgb(var(--void))" />
      <circle cx="32" cy="32" r="0.8" fill="#FFC49B" />
    </svg>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'px-2 py-1 border border-line/40 text-sm transition-colors',
        'hover:bg-raised hover:border-line-strong/80',
        'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-line/40',
      )}
    >
      {children}
    </button>
  )
}

function SaveIndicator({
  status,
  savedAt,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  savedAt: number | null
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const tooltip =
    status === 'saving'
      ? 'Saving…'
      : status === 'error'
      ? 'Save failed — check console'
      : savedAt
      ? `Saved · ${rel(now - savedAt)}`
      : 'In sync'

  const isSuccess = !!savedAt && now - savedAt < 3500

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className="flex items-center justify-center w-5 h-5"
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full transition-colors',
          status === 'saving'
            ? 'bg-accent animate-accent-pulse'
            : status === 'error'
            ? 'bg-danger'
            : isSuccess
            ? 'bg-success'
            : 'bg-fg-subtle/70',
        )}
      />
    </span>
  )
}

function rel(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

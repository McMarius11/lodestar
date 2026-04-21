import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import type { ViewId } from '@/types'
import { MilestoneFilter } from './MilestoneFilter'
import { StatusFilter } from './StatusFilter'
import { useEffect, useMemo, useState } from 'react'
import { validate } from '@/lib/validate'

const tabs: { id: ViewId; label: string; tag: string }[] = [
  { id: 'scope', label: 'Scope', tag: '01' },
  { id: 'roadmap', label: 'Roadmap', tag: '02' },
  { id: 'kanban', label: 'Kanban', tag: '03' },
  { id: 'mindmap', label: 'Mind', tag: '04' },
  { id: 'gantt', label: 'Gantt', tag: '05' },
  { id: 'validate', label: 'Validate', tag: '06' },
]

export function TopBar() {
  const project = useProjectStore((s) => s.project)
  const active = useProjectStore((s) => s.activeView)
  const setActive = useProjectStore((s) => s.setActiveView)
  const togglePalette = useProjectStore((s) => s.togglePalette)
  const saveStatus = useProjectStore((s) => s.saveStatus)
  const source = useProjectStore((s) => s.source)
  const { errCount, warnCount } = useMemo(() => {
    const issues = validate(project)
    return {
      errCount: issues.filter((i) => i.severity === 'error').length,
      warnCount: issues.filter((i) => i.severity === 'warn').length,
    }
  }, [project])

  return (
    <header className="relative z-20 border-b border-line/60 bg-void/80 backdrop-blur-sm">
      <div className="flex items-stretch">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-3 border-r border-line/60 min-w-[280px]">
          <div className="h-6 w-6 bg-accent shrink-0" aria-hidden />
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
                className={clsx(
                  'group relative px-5 py-3 border-r border-line/60 transition-colors',
                  isActive ? 'bg-raised/60' : 'hover:bg-raised/30',
                )}
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="label-mono num-mono text-fg-subtle group-hover:text-fg-muted">
                    {t.tag}
                  </span>
                  <span
                    className={clsx(
                      'text-sm transition-colors',
                      isActive ? 'text-fg' : 'text-fg-muted group-hover:text-fg',
                    )}
                  >
                    {t.label}
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
        <div className="flex items-center gap-3 px-4 border-l border-line/60">
          <StatusFilter />
          <MilestoneFilter />
          <SaveIndicator status={saveStatus} />
          <button
            onClick={() => togglePalette(true)}
            className="btn-ghost label-mono"
            title="Command Palette (⌘K)"
          >
            <span className="num-mono">⌘K</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (status === 'saved') {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1400)
      return () => clearTimeout(t)
    }
  }, [status])

  const { label, color } =
    status === 'saving'
      ? { label: 'SAVING', color: 'text-accent' }
      : status === 'error'
      ? { label: 'ERROR', color: 'text-danger' }
      : flash
      ? { label: 'SAVED', color: 'text-success' }
      : { label: 'SYNCED', color: 'text-fg-subtle' }

  return (
    <span className={clsx('label-mono flex items-center gap-1.5', color)}>
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          status === 'saving'
            ? 'bg-accent animate-accent-pulse'
            : status === 'error'
            ? 'bg-danger'
            : flash
            ? 'bg-success'
            : 'bg-fg-subtle',
        )}
      />
      {label}
    </span>
  )
}

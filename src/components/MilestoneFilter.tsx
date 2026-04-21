import { useProjectStore } from '@/store/useProjectStore'
import clsx from 'clsx'

export function MilestoneFilter() {
  const milestones = useProjectStore((s) => s.project.meta.milestones)
  const active = useProjectStore((s) => s.activeMilestone)
  const set = useProjectStore((s) => s.setActiveMilestone)

  return (
    <div className="flex items-stretch border border-line/60">
      <button
        onClick={() => set('all')}
        className={clsx(
          'px-3 py-1.5 label-mono transition-colors border-r border-line/60',
          active === 'all'
            ? 'bg-fg text-void'
            : 'text-fg-muted hover:text-fg hover:bg-raised/50',
        )}
      >
        All
      </button>
      {milestones.map((ms, i) => (
        <button
          key={ms.id}
          onClick={() => set(ms.id)}
          className={clsx(
            'px-3 py-1.5 label-mono transition-colors',
            i < milestones.length - 1 && 'border-r border-line/60',
            active === ms.id
              ? 'bg-accent text-void'
              : 'text-fg-muted hover:text-fg hover:bg-raised/50',
          )}
          title={ms.label}
        >
          <span className="num-mono">{ms.id}</span>
        </button>
      ))}
    </div>
  )
}

import clsx from 'clsx'
import { useProjectStore, type StatusFilter as SF } from '@/store/useProjectStore'

const options: { id: SF; label: string; dot: string }[] = [
  { id: 'all', label: 'All', dot: 'bg-fg-subtle' },
  { id: 'ready', label: 'Ready', dot: 'bg-success' },
  { id: 'blocked', label: 'Blocked', dot: 'bg-warn' },
  { id: 'conflict', label: 'Conflict', dot: 'bg-danger' },
]

export function StatusFilter() {
  const active = useProjectStore((s) => s.activeStatus)
  const set = useProjectStore((s) => s.setActiveStatus)

  return (
    <div className="flex items-stretch border border-line/60">
      {options.map((o, i) => (
        <button
          key={o.id}
          onClick={() => set(o.id)}
          className={clsx(
            'px-3 py-1.5 label-mono flex items-center gap-2 transition-colors',
            i < options.length - 1 && 'border-r border-line/60',
            active === o.id
              ? o.id === 'all'
                ? 'bg-fg text-void'
                : 'bg-raised/80 text-fg'
              : 'text-fg-muted hover:text-fg hover:bg-raised/50',
          )}
          title={o.label}
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full', o.dot)} />
          {o.label}
        </button>
      ))}
    </div>
  )
}

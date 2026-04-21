import type { Effort } from '@/types'
import clsx from 'clsx'

const widths: Record<Effort, string> = {
  S: 'w-[18px]',
  M: 'w-[24px]',
  L: 'w-[32px]',
  XL: 'w-[40px]',
}

export function EffortBadge({ effort, className }: { effort: Effort; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 label-mono text-fg-muted',
        className,
      )}
      title={`Effort ${effort}`}
    >
      <span className="num-mono">{effort}</span>
      <span className={clsx('h-[2px] bg-fg-muted', widths[effort])} />
    </span>
  )
}

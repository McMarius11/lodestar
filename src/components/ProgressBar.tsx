import clsx from 'clsx'

export function ProgressBar({
  value,
  className,
  color = 'accent',
}: {
  value: number
  className?: string
  color?: 'accent' | 'success' | 'fg'
}) {
  const pct = Math.max(0, Math.min(1, value))
  const bg =
    color === 'success'
      ? 'bg-success'
      : color === 'fg'
      ? 'bg-fg'
      : 'bg-accent'
  return (
    <div
      className={clsx('h-[2px] w-full bg-line/50 relative overflow-hidden', className)}
    >
      <div
        className={clsx('absolute inset-y-0 left-0 transition-[width] duration-300', bg)}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  )
}

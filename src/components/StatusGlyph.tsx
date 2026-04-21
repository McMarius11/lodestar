import type { FeatureStatus } from '@/types'
import clsx from 'clsx'

type Kind = FeatureStatus | 'blocked' | 'conflict'

const colors: Record<Kind, string> = {
  backlog: 'text-fg-subtle',
  progress: 'text-accent',
  done: 'text-success',
  blocked: 'text-warn',
  conflict: 'text-danger',
}

export function StatusGlyph({
  kind,
  size = 10,
  className,
}: {
  kind: Kind
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      className={clsx(colors[kind], className)}
      aria-label={kind}
    >
      {kind === 'backlog' && (
        <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1" />
      )}
      {kind === 'progress' && (
        <>
          <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M5 1.5 A3.5 3.5 0 0 1 8.5 5 L5 5 Z" fill="currentColor" />
        </>
      )}
      {kind === 'done' && <circle cx="5" cy="5" r="3.5" fill="currentColor" />}
      {kind === 'blocked' && (
        <path d="M5 1 L9 8.5 L1 8.5 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      )}
      {kind === 'conflict' && (
        <path d="M5 1 L9 5 L5 9 L1 5 Z" fill="currentColor" />
      )}
    </svg>
  )
}

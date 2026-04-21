import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { Dep, DepType, Feature } from '@/types'

const TYPES: { value: DepType; label: string; hint: string }[] = [
  { value: 'build', label: 'build', hint: 'must be built first' },
  { value: 'runtime', label: 'runtime', hint: 'needs its data live' },
  { value: 'optional', label: 'optional', hint: 'nice to have' },
]

type Anchor = { x: number; y: number }

export function DepEditorPopover({
  fromFeature,
  toFeature,
  anchor,
  initial,
  onSave,
  onCancel,
}: {
  fromFeature: Feature
  toFeature: Feature
  anchor: Anchor
  initial?: Partial<Dep>
  onSave: (dep: Dep) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [type, setType] = useState<DepType>(initial?.type ?? 'build')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return
      if (ref.current.contains(e.target as Node)) return
      onCancel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  const W = 300
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const x = Math.min(anchor.x, vw - W - 12)
  const y = Math.min(anchor.y, vh - 220)

  const commit = () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    onSave({ id: toFeature.id, reason: trimmed, type })
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Add dependency"
      data-testid="dialog-dep-editor"
      data-dep-from={fromFeature.id}
      data-dep-to={toFeature.id}
      className="fixed z-[1000] bg-base border border-line-strong/70 shadow-2xl w-[300px] p-3"
      style={{ left: x, top: y }}
    >
      <div className="label-mono mb-2 flex items-baseline gap-2">
        <span className="text-fg-subtle">DEP</span>
        <span className="num-mono text-fg">{fromFeature.id}</span>
        <span className="text-fg-subtle">→</span>
        <span className="num-mono text-accent">{toFeature.id}</span>
      </div>
      <div className="text-xs text-fg-muted mb-3 truncate">
        <span className="italic">{fromFeature.label}</span>
        <span className="mx-1.5 text-fg-subtle">depends on</span>
        <span className="italic">{toFeature.label}</span>
      </div>

      <label className="label-mono text-fg-subtle block mb-1">REASON</label>
      <input
        ref={inputRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
        placeholder="why does it need this?"
        className="w-full bg-transparent text-sm outline-none border-b border-line/60 focus:border-accent py-1 mb-3 text-fg placeholder:text-fg-subtle"
      />

      <label className="label-mono text-fg-subtle block mb-1">TYPE</label>
      <div className="grid grid-cols-3 gap-1 mb-3">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            title={t.hint}
            className={clsx(
              'label-mono px-2 py-1.5 border transition-colors',
              type === t.value
                ? 'border-accent text-accent bg-accent/10'
                : 'border-line/60 text-fg-muted hover:border-line-strong/70 hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 justify-end pt-1 border-t border-line/30">
        <button
          type="button"
          onClick={onCancel}
          className="label-mono text-fg-muted hover:text-fg px-2 py-1"
        >
          CANCEL
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={!reason.trim()}
          className="label-mono px-3 py-1 border border-accent text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          SAVE
        </button>
      </div>
    </div>,
    document.body,
  )
}

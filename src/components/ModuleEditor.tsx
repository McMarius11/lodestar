import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import type { Module } from '@/types'

const PRESETS = [
  '#FF5A1F', // accent orange
  '#D97706',
  '#C2410C',
  '#E11D48',
  '#DB2777',
  '#7C3AED',
  '#4F46E5',
  '#2563EB',
  '#0891B2',
  '#059669',
  '#65A30D',
  '#CA8A04',
  '#8A867A',
  '#57534E',
]

function normalizeModuleColor(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase()
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(trimmed) ? trimmed : fallback
}

export function ModuleEditor({
  module,
  anchor,
  onClose,
}: {
  module: Module
  anchor: DOMRect
  onClose: () => void
}) {
  const updateModule = useProjectStore((s) => s.updateModule)
  const deleteModule = useProjectStore((s) => s.deleteModule)
  const renameModuleId = useProjectStore((s) => s.renameModuleId)
  const [label, setLabel] = useState(module.label)
  const [color, setColor] = useState(module.color)
  const [idDraft, setIdDraft] = useState(module.id)
  const [idEditing, setIdEditing] = useState(false)
  const [idError, setIdError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLabel(module.label)
    setColor(module.color)
    setIdDraft(module.id)
    setIdEditing(false)
    setIdError(null)
  }, [module.id, module.label, module.color])

  const commitIdRename = () => {
    const next = idDraft.trim()
    if (!next || next === module.id) {
      setIdEditing(false)
      setIdError(null)
      setIdDraft(module.id)
      return
    }
    const res = renameModuleId(module.id, next)
    if (res.ok) {
      setIdEditing(false)
      setIdError(null)
      return
    }
    setIdError(
      res.reason === 'duplicate'
        ? 'id already in use'
        : res.reason === 'empty'
        ? 'cannot be empty'
        : 'invalid id',
    )
  }

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const commit = (overrides?: { label?: string; color?: string }) => {
    const patch: Partial<Module> = {}
    const nextLabel = (overrides?.label ?? label).trim() || module.label
    if (nextLabel !== label) setLabel(nextLabel)
    if (nextLabel !== module.label) patch.label = nextLabel
    const nextColor = normalizeModuleColor(overrides?.color ?? color, module.color)
    if (nextColor !== color) setColor(nextColor)
    if (nextColor !== module.color) patch.color = nextColor
    if (Object.keys(patch).length) updateModule(module.id, patch)
  }

  const left = Math.max(12, Math.min(window.innerWidth - 320, anchor.left))
  const estHeight = 320
  const top = anchor.bottom + 6 + estHeight <= window.innerHeight
    ? anchor.bottom + 6
    : Math.max(12, anchor.top - 6 - estHeight)

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.12 }}
        style={{ left, top }}
        className="fixed z-[60] w-[300px] bg-base border border-line-strong/60 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mod-editor-title"
        data-testid="dialog-module"
        data-module-id={module.id}
      >
        <div className="px-4 pt-4 pb-3 border-b border-line/60">
          <div className="label-mono mb-2 flex items-center gap-2">
            <span className="text-fg-subtle">MODULE ·</span>
            {idEditing ? (
              <input
                autoFocus
                value={idDraft}
                onChange={(e) => {
                  setIdDraft(e.target.value)
                  if (idError) setIdError(null)
                }}
                onBlur={commitIdRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setIdDraft(module.id)
                    setIdError(null)
                    setIdEditing(false)
                  }
                }}
                data-testid="module-editor-id-input"
                aria-label="Module id"
                className={clsx(
                  'num-mono bg-sunken/40 outline-none px-1.5 border text-fg w-40',
                  idError ? 'border-danger' : 'border-line/60 focus:border-accent',
                )}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIdDraft(module.id)
                  setIdError(null)
                  setIdEditing(true)
                }}
                data-testid="module-editor-id"
                title="Click to rename id"
                className="num-mono hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors"
              >
                {module.id}
              </button>
            )}
            {idError && (
              <span
                className="label-mono text-danger"
                data-testid="module-editor-id-error"
              >
                {idError}
              </span>
            )}
          </div>
          <input
            id="mod-editor-title"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={(e) => commit({ label: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit({ label: e.currentTarget.value })
                onClose()
              }
            }}
            aria-label="Module label"
            data-testid="module-editor-label"
            className="w-full bg-transparent outline-none ser-display italic text-2xl border-b border-line/60 focus:border-accent transition-colors pb-1"
          />
        </div>

        <div className="px-4 py-3 border-b border-line/60">
          <div className="label-mono mb-2">COLOR</div>
          <div
            className="grid grid-cols-7 gap-1.5"
            data-testid="module-color-presets"
          >
            {PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c)
                  updateModule(module.id, { color: c })
                }}
                className={clsx(
                  'h-6 border transition-transform',
                  color.toLowerCase() === c.toLowerCase()
                    ? 'border-fg scale-110'
                    : 'border-line/40 hover:border-fg-muted',
                )}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span
              className="w-5 h-5 border border-line/60"
              style={{ background: color }}
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={(e) => commit({ color: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commit({ color: e.currentTarget.value })
                  onClose()
                }
              }}
              className="flex-1 bg-transparent label-mono num-mono border border-line/60 px-2 py-1 focus:border-accent outline-none"
              placeholder="#HEX"
            />
          </div>
        </div>

        <div className="px-4 py-2.5 flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm(`Delete module "${module.label}" and all its features?`)) {
                deleteModule(module.id)
                onClose()
              }
            }}
            className="label-mono text-fg-subtle hover:text-danger"
          >
            DELETE MODULE
          </button>
          <button
            onClick={() => {
              commit()
              onClose()
            }}
            className="label-mono text-fg-muted hover:text-fg"
          >
            DONE <span className="num-mono ml-1">↵</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

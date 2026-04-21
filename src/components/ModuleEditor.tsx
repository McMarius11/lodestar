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
  const [label, setLabel] = useState(module.label)
  const [color, setColor] = useState(module.color)
  const ref = useRef<HTMLDivElement>(null)

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

  const commit = () => {
    const patch: Partial<Module> = {}
    if (label !== module.label) patch.label = label
    if (color !== module.color) patch.color = color
    if (Object.keys(patch).length) updateModule(module.id, patch)
  }

  const left = Math.max(12, Math.min(window.innerWidth - 320, anchor.left))
  const top = anchor.bottom + 6

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
      >
        <div className="px-4 pt-4 pb-3 border-b border-line/60">
          <div className="label-mono mb-2">MODULE · {module.id}</div>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit()
                onClose()
              }
            }}
            className="w-full bg-transparent outline-none ser-display italic text-2xl border-b border-line/60 focus:border-accent transition-colors pb-1"
          />
        </div>

        <div className="px-4 py-3 border-b border-line/60">
          <div className="label-mono mb-2">COLOR</div>
          <div className="grid grid-cols-7 gap-1.5">
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
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commit()
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

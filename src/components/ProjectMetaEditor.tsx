import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useProjectStore } from '@/store/useProjectStore'

export function ProjectMetaEditor({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const updateMeta = useProjectStore((s) => s.updateMeta)
  const [name, setName] = useState(project.meta.name)
  const [description, setDescription] = useState(project.meta.description)
  const [version, setVersion] = useState(project.meta.version)
  const [today, setToday] = useState<string>(
    project.meta.today !== undefined ? String(project.meta.today) : '',
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const commit = () => {
    const patch: Partial<typeof project.meta> = {}
    if (name !== project.meta.name) patch.name = name
    if (description !== project.meta.description) patch.description = description
    if (version !== project.meta.version) patch.version = version
    const t = today.trim() === '' ? undefined : Number(today)
    if (t !== project.meta.today && (t === undefined || Number.isFinite(t))) {
      patch.today = t
    }
    if (Object.keys(patch).length) updateMeta(patch)
  }

  const save = () => {
    commit()
    onClose()
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-void/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="w-[min(640px,calc(100%-2rem))] bg-base border border-line-strong/60 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-line/60 flex items-baseline justify-between">
            <div>
              <div className="label-mono mb-0.5">PROJECT META</div>
              <div className="ser-display italic text-2xl">{name || 'Untitled'}</div>
            </div>
            <button onClick={onClose} className="label-mono text-fg-subtle hover:text-fg">
              CLOSE · ESC
            </button>
          </div>

          <div className="p-5 space-y-4">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commit}
                className="w-full bg-transparent border border-line/60 focus:border-accent px-2 py-1.5 outline-none"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={commit}
                rows={3}
                className="w-full bg-transparent border border-line/60 focus:border-accent px-2 py-1.5 outline-none resize-y"
              />
            </Field>

            <div className="flex gap-4">
              <Field label="Version" className="flex-1">
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  onBlur={commit}
                  className="w-full num-mono bg-transparent border border-line/60 focus:border-accent px-2 py-1.5 outline-none"
                />
              </Field>
              <Field label="Today · Gantt week" className="flex-1">
                <input
                  value={today}
                  onChange={(e) => setToday(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={commit}
                  placeholder="(hidden)"
                  className="w-full num-mono bg-transparent border border-line/60 focus:border-accent px-2 py-1.5 outline-none"
                />
              </Field>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-line/60 flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">
              Cancel
            </button>
            <button onClick={save} className="btn-primary text-sm">
              Save
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="label-mono mb-1">{label}</div>
      {children}
    </div>
  )
}

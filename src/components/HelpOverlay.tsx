import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useProjectStore } from '@/store/useProjectStore'

const groups: { title: string; shortcuts: [string, string][] }[] = [
  {
    title: 'Navigation',
    shortcuts: [
      ['1 – 6', 'Switch view'],
      ['j / ↓', 'Next feature'],
      ['k / ↑', 'Previous feature'],
      ['Enter', 'Open feature'],
      ['Esc', 'Close drawer / palette'],
    ],
  },
  {
    title: 'Commands',
    shortcuts: [
      ['⌘ K  /  Ctrl K', 'Command palette'],
      ['/', 'Focus palette search'],
      ['?', 'Show this help'],
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      ['⌘ Z', 'Undo'],
      ['⇧ ⌘ Z', 'Redo'],
      ['Space', 'Toggle first task'],
      ['n', 'New feature in current view'],
    ],
  },
]

export function HelpOverlay() {
  const open = useProjectStore((s) => s.helpOpen)
  const close = useProjectStore((s) => s.toggleHelp)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-sunken z-50"
            onClick={() => close(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="fixed z-50 left-1/2 top-[10vh] -translate-x-1/2 w-[640px] max-w-[92vw] bg-base border border-line-strong/60"
          >
            <header className="flex items-baseline justify-between px-6 py-4 border-b border-line/60">
              <div>
                <div className="label-mono mb-1">KEYBOARD</div>
                <h2 className="ser-display italic text-3xl">shortcuts</h2>
              </div>
              <button
                onClick={() => close(false)}
                className="label-mono text-fg-muted hover:text-fg"
              >
                CLOSE <span className="num-mono ml-1">ESC</span>
              </button>
            </header>
            <div className="grid grid-cols-3 gap-0 p-0">
              {groups.map((g, i) => (
                <div
                  key={g.title}
                  className={
                    'p-5 ' + (i < groups.length - 1 ? 'border-r border-line/40' : '')
                  }
                >
                  <h3 className="label-mono mb-3">{g.title}</h3>
                  <dl className="space-y-2">
                    {g.shortcuts.map(([key, desc]) => (
                      <div
                        key={key}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <dt className="label-mono num-mono text-fg shrink-0 text-[11px]">
                          {key}
                        </dt>
                        <dd className="text-xs text-fg-muted text-right">{desc}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <footer className="px-6 py-3 border-t border-line/60 label-mono text-fg-subtle">
              Press <span className="num-mono text-fg-muted">?</span> anytime to show this.
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

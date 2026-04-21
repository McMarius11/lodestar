import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useProjectStore } from '@/store/useProjectStore'
import { downloadMarkdown } from '@/lib/markdown'
import type { ViewId } from '@/types'

type Cmd = {
  id: string
  label: string
  hint?: string
  run: () => void
  group: 'view' | 'feature' | 'task' | 'project' | 'file' | 'edit'
}

export function CommandPalette() {
  const open = useProjectStore((s) => s.paletteOpen)
  const toggle = useProjectStore((s) => s.togglePalette)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape') toggle(false)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useProjectStore.getState().undo()
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        ((e.shiftKey && e.key === 'z') || e.key === 'y')
      ) {
        e.preventDefault()
        useProjectStore.getState().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return (
    <AnimatePresence>
      {open && <PaletteBody onClose={() => toggle(false)} />}
    </AnimatePresence>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const store = useProjectStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const commands = useMemo<Cmd[]>(() => {
    const views: { id: ViewId; label: string }[] = [
      { id: 'scope', label: 'Go to Module Scope' },
      { id: 'roadmap', label: 'Go to Roadmap' },
      { id: 'kanban', label: 'Go to Kanban' },
      { id: 'mindmap', label: 'Go to Mind Map' },
      { id: 'gantt', label: 'Go to Gantt' },
      { id: 'validate', label: 'Go to Status' },
    ]
    const list: Cmd[] = views.map((v) => ({
      id: `view:${v.id}`,
      label: v.label,
      group: 'view',
      run: () => store.setActiveView(v.id),
    }))

    for (const m of store.project.modules) {
      list.push({
        id: `add:${m.id}`,
        label: `New Feature in ${m.label}`,
        hint: m.id,
        group: 'feature',
        run: () => {
          const id = store.addFeature(m.id, { label: 'New Feature' })
          store.openDrawer(id)
        },
      })
    }

    list.push({
      id: 'new:module',
      label: 'New Module',
      group: 'feature',
      run: () => store.addModule({ label: 'New Module', color: '#8A867A' }),
    })

    for (const m of store.project.modules) {
      for (const f of m.features) {
        list.push({
          id: `open:${f.id}`,
          label: `Open: ${f.label}`,
          hint: `${m.label} · ${f.ms}`,
          group: 'feature',
          run: () => store.openDrawer(f.id),
        })
        for (const t of f.tasks) {
          list.push({
            id: `task:${f.id}:${t.id}`,
            label: t.label,
            hint: `${f.label} · ${t.done ? 'DONE' : 'OPEN'}`,
            group: 'task',
            run: () => store.openDrawer(f.id),
          })
        }
      }
    }

    list.push({
      id: 'edit:undo',
      label: 'Undo',
      hint: '⌘Z',
      group: 'edit',
      run: () => store.undo(),
    })
    list.push({
      id: 'edit:redo',
      label: 'Redo',
      hint: '⇧⌘Z',
      group: 'edit',
      run: () => store.redo(),
    })

    list.push({
      id: 'file:export',
      label: 'Export project.json…',
      group: 'file',
      run: () => store.exportFile(),
    })
    list.push({
      id: 'file:import',
      label: 'Import project.json…',
      group: 'file',
      run: () => store.importFile(),
    })
    list.push({
      id: 'file:markdown',
      label: 'Export as Markdown…',
      hint: '.md',
      group: 'file',
      run: () => downloadMarkdown(store.project),
    })

    list.push({
      id: 'proj:edit-meta',
      label: 'Edit Project Meta…',
      group: 'project',
      run: () => store.toggleMetaEditor(true),
    })
    list.push({
      id: 'proj:edit-milestones',
      label: 'Edit Milestones…',
      hint: `${store.project.meta.milestones.length}`,
      group: 'project',
      run: () => store.toggleMilestoneEditor(true),
    })
    list.push({
      id: 'proj:rename',
      label: 'Rename Project',
      group: 'project',
      run: () => {
        const name = prompt('Project name', store.project.meta.name)
        if (name) store.updateMeta({ name })
      },
    })
    list.push({
      id: 'proj:version',
      label: 'Set Version',
      hint: store.project.meta.version,
      group: 'project',
      run: () => {
        const v = prompt('Version', store.project.meta.version)
        if (v) store.updateMeta({ version: v })
      },
    })
    list.push({
      id: 'proj:today',
      label: 'Set Today Marker (week)',
      hint: store.project.meta.today?.toString() ?? '—',
      group: 'project',
      run: () => {
        const w = prompt('Today (week number)', String(store.project.meta.today ?? 0))
        if (w !== null) store.updateMeta({ today: Number(w) })
      },
    })
    list.push({
      id: 'proj:close',
      label: 'Close current project…',
      group: 'project',
      run: () => {
        if (
          confirm(
            'Close current project? The saved project on disk is not touched — you will return to the welcome screen.',
          )
        ) {
          store.closeCurrentProject()
        }
      },
    })

    return list
  }, [store])

  const filtered = useMemo(() => {
    if (!q) return commands.filter((c) => c.group !== 'task')
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
    return commands
      .map((c) => {
        const hay = `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase()
        let score = 0
        for (const t of tokens) {
          const idx = hay.indexOf(t)
          if (idx < 0) return { c, score: -1 }
          score += 1000 - idx
        }
        if (hay.startsWith(tokens[0])) score += 500
        return { c, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((x) => x.c)
  }, [commands, q])

  useEffect(() => {
    setSel(0)
  }, [q])

  const run = (cmd: Cmd) => {
    cmd.run()
    onClose()
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 bg-sunken z-50"
        onClick={onClose}
        data-testid="dialog-command-palette-backdrop"
      />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.14 }}
        className="fixed z-50 left-1/2 -translate-x-1/2 top-[12vh] w-[640px] max-w-[90vw] bg-base border border-line-strong/60"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="dialog-command-palette"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line/60">
          <span className="label-mono text-fg-subtle">▸</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, filtered.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(s - 1, 0))
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                const cmd = filtered[sel]
                if (cmd) run(cmd)
              }
            }}
            placeholder="Type a command or feature…"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[sel] ? `cmd-${filtered[sel].id}` : undefined}
            aria-label="Command search"
            data-testid="command-palette-input"
            className="flex-1 text-base outline-none placeholder:text-fg-subtle"
          />
          <span className="label-mono text-fg-subtle">ESC</span>
        </div>
        <div
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[60vh] overflow-auto scroll-thin"
        >
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center label-mono text-fg-subtle" data-testid="command-palette-empty">
              NO MATCHES
            </div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === sel}
              data-testid={`command-${c.id}`}
              data-command-group={c.group}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(c)}
              className={clsx(
                'w-full flex items-center justify-between px-5 py-2.5 text-left transition-colors',
                i === sel ? 'bg-raised/80' : 'hover:bg-raised/40',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="label-mono w-[70px] shrink-0 text-fg-subtle">
                  {c.group.toUpperCase()}
                </span>
                <span className="text-sm truncate">{c.label}</span>
              </div>
              {c.hint && (
                <span className="label-mono text-fg-subtle shrink-0 ml-4">
                  {c.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  )
}

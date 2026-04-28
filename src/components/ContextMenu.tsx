import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

export type CtxMenuItem =
  | {
      kind: 'action'
      label: string
      hint?: string
      danger?: boolean
      disabled?: boolean
      run: () => void
    }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; disabled?: boolean; items: CtxMenuItem[] }
  | { kind: 'label'; label: string }

type OpenState = {
  x: number
  y: number
  items: CtxMenuItem[]
}

export function useContextMenu() {
  const [state, setState] = useState<OpenState | null>(null)

  const openAt = useCallback((x: number, y: number, items: CtxMenuItem[]) => {
    setState({ x, y, items })
  }, [])
  const close = useCallback(() => setState(null), [])

  const bindTo = useCallback(
    (items: CtxMenuItem[] | (() => CtxMenuItem[])) => ({
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const resolved = typeof items === 'function' ? items() : items
        if (!resolved || resolved.length === 0) return
        setState({ x: e.clientX, y: e.clientY, items: resolved })
      },
    }),
    [],
  )

  const menu = state ? (
    <ContextMenuPortal
      x={state.x}
      y={state.y}
      items={state.items}
      onClose={close}
    />
  ) : null

  return { menu, openAt, close, bindTo, isOpen: state !== null }
}

const MENU_W = 220
const ITEM_H = 28

function ContextMenuPortal({
  x,
  y,
  items,
  onClose,
  isSubmenu = false,
}: {
  x: number
  y: number
  items: CtxMenuItem[]
  onClose: () => void
  isSubmenu?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [submenuOpen, setSubmenuOpen] = useState<{
    index: number
    x: number
    y: number
  } | null>(null)
  const [active, setActive] = useState<number>(firstEnabled(items, 0, 1))

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!ref.current) return
      const target = e.target as Element | null
      if (!target) return
      // Submenus are portaled to document.body so they're NOT inside ref.current.
      // Include them explicitly, otherwise clicking a submenu item closes the
      // main menu on mousedown before the click event reaches the item.
      if (target.closest('[data-testid="context-menu"], [data-testid="context-submenu"]'))
        return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => firstEnabled(items, a + 1, 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => firstEnabled(items, a - 1, -1))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        triggerItem(items[active])
      }
    }
    if (!isSubmenu) document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, active, isSubmenu])

  function triggerItem(it: CtxMenuItem | undefined) {
    if (!it) return
    if (it.kind === 'action' && !it.disabled) {
      it.run()
      onClose()
    }
  }

  const adj = useMemo(() => {
    if (typeof window === 'undefined') return { x, y }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = MENU_W
    const h = Math.min(items.length * ITEM_H + 8, vh - 16)
    return {
      x: Math.min(x, vw - w - 8),
      y: Math.min(y, vh - h - 8),
    }
  }, [x, y, items.length])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={isSubmenu ? 'Submenu' : 'Context menu'}
      data-testid={isSubmenu ? 'context-submenu' : 'context-menu'}
      className={clsx(
        'fixed z-[1000] bg-base border border-line-strong/70 shadow-2xl',
        'py-1 min-w-[var(--ctx-w)] text-fg',
      )}
      style={{
        left: adj.x,
        top: adj.y,
        ['--ctx-w' as string]: `${MENU_W}px`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.kind === 'separator')
          return <div key={i} className="my-1 border-t border-line/50" />
        if (it.kind === 'label')
          return (
            <div
              key={i}
              className="label-mono text-fg-subtle px-3 pt-1.5 pb-1 uppercase"
            >
              {it.label}
            </div>
          )
        if (it.kind === 'submenu') {
          const isOpen = submenuOpen?.index === i
          return (
            <button
              key={i}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-disabled={it.disabled || undefined}
              data-testid={`menuitem-submenu-${slugLabel(it.label)}`}
              disabled={it.disabled}
              onMouseEnter={(e) => {
                if (it.disabled) return
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setSubmenuOpen({ index: i, x: rect.right, y: rect.top })
                setActive(i)
              }}
              onClick={(e) => {
                e.preventDefault()
                if (it.disabled) return
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setSubmenuOpen({ index: i, x: rect.right, y: rect.top })
              }}
              className={clsx(
                'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-left',
                it.disabled
                  ? 'text-fg-subtle cursor-not-allowed'
                  : active === i
                  ? 'bg-fg/8 text-fg'
                  : 'hover:bg-fg/6',
              )}
            >
              <span>{it.label}</span>
              <span className="text-fg-subtle">›</span>
              {isOpen && (
                <ContextMenuPortal
                  x={submenuOpen!.x}
                  y={submenuOpen!.y}
                  items={it.items}
                  onClose={onClose}
                  isSubmenu
                />
              )}
            </button>
          )
        }
        // action
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            aria-disabled={it.disabled || undefined}
            data-testid={`menuitem-${slugLabel(it.label)}`}
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => triggerItem(it)}
            className={clsx(
              'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-left',
              it.disabled
                ? 'text-fg-subtle cursor-not-allowed'
                : it.danger
                ? active === i
                  ? 'bg-danger/10 text-danger'
                  : 'text-danger/90 hover:bg-danger/10'
                : active === i
                ? 'bg-fg/8 text-fg'
                : 'hover:bg-fg/6',
            )}
          >
            <span className="truncate">{it.label}</span>
            {it.hint && (
              <span className="label-mono text-fg-subtle shrink-0">{it.hint}</span>
            )}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

function slugLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function firstEnabled(items: CtxMenuItem[], from: number, dir: 1 | -1): number {
  const n = items.length
  if (n === 0) return 0
  for (let step = 0; step < n; step++) {
    const idx = ((from + step * dir) % n + n) % n
    const it = items[idx]
    if (!it) continue
    if (it.kind === 'action' && !it.disabled) return idx
    if (it.kind === 'submenu' && !it.disabled) return idx
  }
  return 0
}

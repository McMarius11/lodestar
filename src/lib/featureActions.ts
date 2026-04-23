import type { Dep, Feature, Module, Project } from '@/types'
import type { CtxMenuItem } from '@/components/ContextMenu'
import { featureStatus } from '@/lib/deps'
import { newId } from '@/lib/id'

const MODULE_COLORS = [
  '#8A867A',
  '#C4845C',
  '#5C8AC4',
  '#A45C5C',
  '#5CA47A',
  '#7A7A7A',
  '#9C5C9C',
  '#BBA060',
]

type Api = {
  project: Project
  openDrawer: (id: string | null) => void
  cloneFeature: (id: string) => string | null
  deleteFeature: (id: string) => void
  moveFeatureToModule: (id: string, targetModuleId: string) => void
  moveFeatureToMs: (id: string, ms: string) => void
  setFeatureColumn: (id: string, col: 'backlog' | 'progress' | 'done') => void
  addTask: (id: string, label: string) => void
  toggleTask: (featureId: string, taskId: string) => void
  updateFeature: (id: string, patch: Partial<Feature>) => void
  addFeature: (moduleId: string, partial?: Partial<Feature>) => string
  cloneModule: (id: string) => string | null
  deleteModule: (id: string) => void
  updateModule: (id: string, patch: Partial<Module>) => void
  addModule: (partial?: Partial<Module>) => string
  toggleMilestoneEditor: (open?: boolean) => void
  addDep: (featureId: string, dep: Dep) => void
  removeDep: (featureId: string, depId: string) => void
  openDepEditor: (fromId: string, toId: string, anchor: { x: number; y: number }) => void
}

function normalizePromptRename(current: string, next: string | null): string | null {
  const trimmed = next?.trim()
  if (!trimmed || trimmed === current) return null
  return trimmed
}

export function featureMenu(api: Api, feature: Feature): CtxMenuItem[] {
  const f = feature
  const { project } = api
  const currentModuleId =
    project.modules.find((m) => m.features.some((x) => x.id === f.id))?.id ?? null

  const moduleItems: CtxMenuItem[] = project.modules.map((m) => ({
    kind: 'action' as const,
    label: m.label,
    disabled: m.id === currentModuleId,
    run: () => api.moveFeatureToModule(f.id, m.id),
  }))

  const msItems: CtxMenuItem[] = project.meta.milestones.map((ms) => ({
    kind: 'action' as const,
    label: `${ms.id} — ${ms.label}`,
    disabled: ms.id === f.ms,
    run: () => api.moveFeatureToMs(f.id, ms.id),
  }))

  const existingDepIds = new Set(f.deps.map((d) => d.id))
  const depCandidates: CtxMenuItem[] = project.modules
    .flatMap((m) => m.features.map((x) => ({ feat: x, modLabel: m.label })))
    .filter((x) => x.feat.id !== f.id)
    .map((x) => ({
      kind: 'action' as const,
      label: `${x.feat.id} — ${x.feat.label}`,
      hint: x.modLabel,
      disabled: existingDepIds.has(x.feat.id),
      run: () =>
        api.openDepEditor(f.id, x.feat.id, {
          x: window.innerWidth / 2 - 150,
          y: window.innerHeight / 2 - 110,
        }),
    }))

  const removeDepItems: CtxMenuItem[] = f.deps.map((d) => ({
    kind: 'action' as const,
    label: `${d.id} — ${d.reason || '(no reason)'}`,
    hint: d.type,
    run: () => api.removeDep(f.id, d.id),
  }))

  const status = featureStatus(f)

  return [
    {
      kind: 'action',
      label: 'Open',
      hint: '⏎',
      run: () => api.openDrawer(f.id),
    },
    {
      kind: 'action',
      label: 'Rename…',
      hint: 'F2',
      run: () => {
        const next = normalizePromptRename(f.label, prompt('Rename feature', f.label))
        if (next) {
          api.updateFeature(f.id, { label: next })
        }
      },
    },
    {
      kind: 'action',
      label: 'Duplicate',
      hint: '⌘D',
      run: () => {
        const id = api.cloneFeature(f.id)
        if (id) api.openDrawer(id)
      },
    },
    {
      kind: 'submenu',
      label: 'Move to Module',
      disabled: moduleItems.every((it) => it.kind === 'action' && it.disabled),
      items: moduleItems,
    },
    {
      kind: 'submenu',
      label: 'Move to Milestone',
      disabled:
        msItems.length === 0 ||
        msItems.every((it) => it.kind === 'action' && it.disabled),
      items: msItems,
    },
    {
      kind: 'submenu',
      label: 'Add dependency to',
      disabled:
        depCandidates.length === 0 ||
        depCandidates.every((it) => it.kind === 'action' && it.disabled),
      items: depCandidates,
    },
    {
      kind: 'submenu',
      label: 'Remove dependency',
      disabled: removeDepItems.length === 0,
      items: removeDepItems,
    },
    { kind: 'separator' },
    {
      kind: 'submenu',
      label: 'Set Status',
      items: [
        {
          kind: 'action',
          label: 'Backlog',
          disabled: status === 'backlog',
          run: () => api.setFeatureColumn(f.id, 'backlog'),
        },
        {
          kind: 'action',
          label: 'In Progress',
          disabled: status === 'progress',
          run: () => api.setFeatureColumn(f.id, 'progress'),
        },
        {
          kind: 'action',
          label: 'Done',
          disabled: status === 'done',
          run: () => api.setFeatureColumn(f.id, 'done'),
        },
      ],
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Copy ID',
      hint: f.id,
      run: () => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(f.id).catch(() => {})
        }
      },
    },
    {
      kind: 'action',
      label: 'Delete',
      danger: true,
      hint: '⌫',
      run: () => {
        if (confirm(`Delete feature "${f.label}"? This also removes it from all dependency lists.`)) {
          api.deleteFeature(f.id)
        }
      },
    },
  ]
}

export function moduleMenu(api: Api, mod: Module): CtxMenuItem[] {
  return [
    {
      kind: 'action',
      label: 'Rename…',
      run: () => {
        const next = normalizePromptRename(mod.label, prompt('Rename module', mod.label))
        if (next) {
          api.updateModule(mod.id, { label: next })
        }
      },
    },
    {
      kind: 'action',
      label: 'Duplicate',
      run: () => {
        api.cloneModule(mod.id)
      },
    },
    {
      kind: 'submenu',
      label: 'Change Color',
      items: MODULE_COLORS.map((c) => ({
        kind: 'action' as const,
        label: c,
        disabled: c.toLowerCase() === mod.color.toLowerCase(),
        run: () => api.updateModule(mod.id, { color: c }),
      })),
    },
    {
      kind: 'action',
      label: 'Add Feature',
      hint: 'N',
      run: () => {
        const id = api.addFeature(mod.id)
        api.openDrawer(id)
      },
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Delete Module',
      danger: true,
      run: () => {
        if (
          confirm(
            `Delete module "${mod.label}" with ${mod.features.length} feature(s)? Dependencies pointing to removed features will also be cleaned up.`,
          )
        ) {
          api.deleteModule(mod.id)
        }
      },
    },
  ]
}

export type EmptyContext =
  | { kind: 'scope' }
  | { kind: 'scope-module'; moduleId: string }
  | { kind: 'roadmap-column'; ms: string }
  | { kind: 'roadmap-header' }
  | { kind: 'kanban-column'; col: 'backlog' | 'progress' | 'done' }
  | { kind: 'mindmap-empty' }

export function emptyAreaMenu(api: Api, ctx: EmptyContext): CtxMenuItem[] {
  const firstModule = api.project.modules[0]
  if (ctx.kind === 'scope') {
    return [
      {
        kind: 'action',
        label: 'New Module',
        run: () => api.addModule(),
      },
      {
        kind: 'action',
        label: 'New Feature',
        disabled: !firstModule,
        run: () => {
          if (!firstModule) return
          const id = api.addFeature(firstModule.id)
          api.openDrawer(id)
        },
      },
    ]
  }
  if (ctx.kind === 'scope-module') {
    return [
      {
        kind: 'action',
        label: 'New Feature in this Module',
        run: () => {
          const id = api.addFeature(ctx.moduleId)
          api.openDrawer(id)
        },
      },
    ]
  }
  if (ctx.kind === 'roadmap-header') {
    return [
      {
        kind: 'action',
        label: 'Edit Milestones…',
        run: () => api.toggleMilestoneEditor(true),
      },
    ]
  }
  if (ctx.kind === 'roadmap-column') {
    return [
      {
        kind: 'action',
        label: `New Feature in ${ctx.ms}`,
        disabled: !firstModule,
        run: () => {
          if (!firstModule) return
          const id = api.addFeature(firstModule.id, { ms: ctx.ms })
          api.openDrawer(id)
        },
      },
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Edit Milestones…',
        run: () => api.toggleMilestoneEditor(true),
      },
    ]
  }
  if (ctx.kind === 'mindmap-empty') {
    const moduleItems: CtxMenuItem[] = api.project.modules.map((m) => ({
      kind: 'action' as const,
      label: m.label,
      run: () => {
        const id = api.addFeature(m.id)
        api.openDrawer(id)
      },
    }))
    return [
      {
        kind: 'submenu',
        label: 'New feature in…',
        disabled: moduleItems.length === 0,
        items: moduleItems,
      },
      {
        kind: 'action',
        label: 'New module',
        run: () => {
          api.addModule()
        },
      },
    ]
  }
  // kanban-column
  return [
    {
      kind: 'action',
      label: `New Feature in ${ctx.col === 'progress' ? 'In Progress' : ctx.col.charAt(0).toUpperCase() + ctx.col.slice(1)}`,
      disabled: !firstModule,
      run: () => {
        if (!firstModule) return
        const partial: Partial<Feature> = {}
        if (ctx.col === 'done') {
          partial.tasks = [{ id: newId('t'), label: 'Done', done: true }]
        } else if (ctx.col === 'progress') {
          partial.tasks = [
            { id: newId('t'), label: 'Kickoff', done: true },
            { id: newId('t'), label: 'Next step', done: false },
          ]
        }
        const id = api.addFeature(firstModule.id, partial)
        api.openDrawer(id)
      },
    },
  ]
}

export type FeatureActionsApi = Api

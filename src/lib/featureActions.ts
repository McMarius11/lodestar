import type { Feature, Module, Project } from '@/types'
import type { CtxMenuItem } from '@/components/ContextMenu'
import { featureStatus } from '@/lib/deps'

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
  setAllTasksDone: (id: string, done: boolean) => void
  addTask: (id: string, label: string) => void
  toggleTask: (featureId: string, taskId: string) => void
  updateFeature: (id: string, patch: Partial<Feature>) => void
  addFeature: (moduleId: string, partial?: Partial<Feature>) => string
  cloneModule: (id: string) => string | null
  deleteModule: (id: string) => void
  updateModule: (id: string, patch: Partial<Module>) => void
  addModule: (partial?: Partial<Module>) => string
  toggleMilestoneEditor: (open?: boolean) => void
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
        const next = prompt('Rename feature', f.label)
        if (next && next.trim() && next !== f.label) {
          api.updateFeature(f.id, { label: next.trim() })
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
    { kind: 'separator' },
    {
      kind: 'submenu',
      label: 'Set Status',
      items: [
        {
          kind: 'action',
          label: 'Backlog',
          disabled: status === 'backlog',
          run: () => api.setAllTasksDone(f.id, false),
        },
        {
          kind: 'action',
          label: 'In Progress',
          disabled: status === 'progress',
          run: () => {
            if (f.tasks.length === 0) {
              api.addTask(f.id, 'Kickoff')
              return
            }
            if (status === 'backlog') {
              const first = f.tasks[0]
              if (first) api.toggleTask(f.id, first.id)
            } else if (status === 'done') {
              const last = f.tasks[f.tasks.length - 1]
              if (last) api.toggleTask(f.id, last.id)
            }
          },
        },
        {
          kind: 'action',
          label: 'Done',
          disabled: status === 'done',
          run: () => api.setAllTasksDone(f.id, true),
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
        const next = prompt('Rename module', mod.label)
        if (next && next.trim() && next !== mod.label) {
          api.updateModule(mod.id, { label: next.trim() })
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
          partial.tasks = [{ id: 't-seed', label: 'Done', done: true }]
        }
        const id = api.addFeature(firstModule.id, partial)
        api.openDrawer(id)
      },
    },
  ]
}

export type FeatureActionsApi = Api

import { useProjectStore } from '@/store/useProjectStore'

export function useFeatureActionsApi(): Api {
  const project = useProjectStore((s) => s.project)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const cloneFeature = useProjectStore((s) => s.cloneFeature)
  const deleteFeature = useProjectStore((s) => s.deleteFeature)
  const moveFeatureToModule = useProjectStore((s) => s.moveFeatureToModule)
  const moveFeatureToMs = useProjectStore((s) => s.moveFeatureToMs)
  const setAllTasksDone = useProjectStore((s) => s.setAllTasksDone)
  const addTask = useProjectStore((s) => s.addTask)
  const toggleTask = useProjectStore((s) => s.toggleTask)
  const updateFeature = useProjectStore((s) => s.updateFeature)
  const addFeature = useProjectStore((s) => s.addFeature)
  const cloneModule = useProjectStore((s) => s.cloneModule)
  const deleteModule = useProjectStore((s) => s.deleteModule)
  const updateModule = useProjectStore((s) => s.updateModule)
  const addModule = useProjectStore((s) => s.addModule)
  const toggleMilestoneEditor = useProjectStore((s) => s.toggleMilestoneEditor)
  return {
    project,
    openDrawer,
    cloneFeature,
    deleteFeature,
    moveFeatureToModule,
    moveFeatureToMs,
    setAllTasksDone,
    addTask,
    toggleTask,
    updateFeature,
    addFeature,
    cloneModule,
    deleteModule,
    updateModule,
    addModule,
    toggleMilestoneEditor,
  }
}

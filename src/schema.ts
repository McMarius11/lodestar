import { z } from 'zod'

export const EffortSchema = z.enum(['S', 'M', 'L', 'XL'])
export const DepTypeSchema = z.enum(['build', 'runtime', 'optional'])

export const TaskSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  done: z.boolean(),
})

export const DepSchema = z.object({
  id: z.string().min(1),
  reason: z.string(),
  type: DepTypeSchema,
})

export const FeatureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  effort: EffortSchema,
  ms: z.string().min(1),
  ganttStart: z.number().int().nonnegative(),
  ganttEnd: z.number().int().nonnegative(),
  deps: z.array(DepSchema),
  tasks: z.array(TaskSchema),
  rank: z.number().optional(),
})

export const ModuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  features: z.array(FeatureSchema),
})

export const MilestoneSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
})

export const CURRENT_SCHEMA_VERSION = 3

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const ProjectMetaSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  schemaVersion: z.number().int().default(CURRENT_SCHEMA_VERSION),
  milestones: z.array(MilestoneSchema),
  today: z.number().int().nonnegative().optional(),
  mindmapPositions: z.record(PointSchema).optional(),
})

export const ProjectSchema = z.object({
  meta: ProjectMetaSchema,
  modules: z.array(ModuleSchema),
})

export type ProjectParsed = z.infer<typeof ProjectSchema>

/**
 * Accept legacy project.json shape (milestones as string[], ganttWeeks map)
 * and migrate to the canonical shape.
 */
export function migrate(raw: unknown): ProjectParsed {
  const input = raw as Record<string, any>
  const meta = input?.meta ?? {}

  let milestones: Milestone[] = []
  if (Array.isArray(meta.milestones) && meta.milestones.length > 0) {
    if (typeof meta.milestones[0] === 'string') {
      const labels: Record<string, string> = meta.milestoneLabels ?? {}
      milestones = (meta.milestones as string[]).map((id) => ({
        id,
        label: labels[id] ?? id,
      }))
    } else {
      milestones = meta.milestones as Milestone[]
    }
  }

  const normalized = {
    meta: {
      name: meta.name ?? 'Untitled Project',
      description: meta.description ?? '',
      version: meta.version ?? '0.1.0',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      milestones,
      today: meta.today,
      mindmapPositions: normalizePositions(meta.mindmapPositions),
    },
    modules: (input.modules ?? []).map((m: any) => ({
      id: m.id,
      label: m.label,
      color: m.color,
      features: (m.features ?? []).map((f: any) => ({
        id: f.id,
        label: f.label,
        description: typeof f.description === 'string' ? f.description : '',
        effort: f.effort,
        ms: f.ms,
        ganttStart: f.ganttStart ?? 0,
        ganttEnd: f.ganttEnd ?? 1,
        deps: (f.deps ?? []).map((d: any) => ({
          id: d.id,
          reason: d.reason ?? '',
          type: d.type ?? 'build',
        })),
        tasks: (f.tasks ?? []).map((t: any) => ({
          id: t.id,
          label: t.label,
          done: Boolean(t.done),
        })),
        rank: typeof f.rank === 'number' && Number.isFinite(f.rank) ? f.rank : undefined,
      })),
    })),
  }

  return ProjectSchema.parse(normalized)
}

type Milestone = z.infer<typeof MilestoneSchema>

function normalizePositions(
  input: unknown,
): Record<string, { x: number; y: number }> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const out: Record<string, { x: number; y: number }> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (
      v &&
      typeof v === 'object' &&
      typeof (v as { x?: unknown }).x === 'number' &&
      typeof (v as { y?: unknown }).y === 'number'
    ) {
      out[k] = {
        x: (v as { x: number }).x,
        y: (v as { y: number }).y,
      }
    }
  }
  return Object.keys(out).length ? out : undefined
}

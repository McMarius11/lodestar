import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, ProjectSchema, migrate } from './schema'

const minimal = {
  meta: {
    name: 'P',
    description: '',
    version: '0.1.0',
    milestones: [{ id: 'v0.1', label: 'Foundation' }],
  },
  modules: [
    {
      id: 'm',
      label: 'Mod',
      color: '#AABBCC',
      features: [
        {
          id: 'f1',
          label: 'Feat',
          effort: 'M',
          ms: 'v0.1',
          ganttStart: 0,
          ganttEnd: 2,
          deps: [],
          tasks: [{ id: 't1', label: 'Do it', done: false }],
        },
      ],
    },
  ],
}

describe('migrate', () => {
  it('always stamps the current schema version', () => {
    const out = migrate({ ...minimal })
    expect(out.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('adds an empty description when missing (v1 → v2)', () => {
    const v1 = { ...minimal, meta: { ...minimal.meta, schemaVersion: 1 } }
    const out = migrate(v1)
    expect(out.modules[0]!.features[0]!.description).toBe('')
  })

  it('preserves existing descriptions', () => {
    const input = JSON.parse(JSON.stringify(minimal))
    input.modules[0].features[0].description = 'Hello **world**'
    const out = migrate(input)
    expect(out.modules[0]!.features[0]!.description).toBe('Hello **world**')
  })

  it('roundtrips v2 without loss', () => {
    const v2 = {
      ...minimal,
      meta: { ...minimal.meta, schemaVersion: 2 },
    }
    const once = migrate(v2)
    const twice = migrate(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })

  it('round-trips v3 rank through migrate', () => {
    const input = JSON.parse(JSON.stringify(minimal))
    input.meta.schemaVersion = 3
    input.modules[0].features[0].rank = 2.5
    const out = migrate(input)
    expect(out.modules[0]!.features[0]!.rank).toBe(2.5)
  })

  it('drops non-finite rank values', () => {
    const input = JSON.parse(JSON.stringify(minimal))
    input.modules[0].features[0].rank = Number.NaN
    const out = migrate(input)
    expect(out.modules[0]!.features[0]!.rank).toBeUndefined()
  })

  it('migrates legacy milestones as string[] with milestoneLabels map', () => {
    const legacy = {
      meta: {
        name: 'P',
        description: '',
        version: '0.1.0',
        milestones: ['v0.1', 'v0.2'],
        milestoneLabels: { 'v0.1': 'Foundation', 'v0.2': 'Storage' },
      },
      modules: [],
    }
    const out = migrate(legacy)
    expect(out.meta.milestones).toEqual([
      { id: 'v0.1', label: 'Foundation' },
      { id: 'v0.2', label: 'Storage' },
    ])
  })

  it('rejects shapes that cannot be coerced (invalid color)', () => {
    const bad = JSON.parse(JSON.stringify(minimal))
    bad.modules[0].color = 'not-a-color'
    expect(() => migrate(bad)).toThrow()
  })

  it('rejects shapes with invalid effort', () => {
    const bad = JSON.parse(JSON.stringify(minimal))
    bad.modules[0].features[0].effort = 'HUGE'
    expect(() => migrate(bad)).toThrow()
  })

  it('defaults missing gantt values to 0/1', () => {
    const input = JSON.parse(JSON.stringify(minimal))
    delete input.modules[0].features[0].ganttStart
    delete input.modules[0].features[0].ganttEnd
    const out = migrate(input)
    expect(out.modules[0]!.features[0]!.ganttStart).toBe(0)
    expect(out.modules[0]!.features[0]!.ganttEnd).toBe(1)
  })

  it('defaults dep.type to build when missing', () => {
    const input = JSON.parse(JSON.stringify(minimal))
    input.modules[0].features.push({
      id: 'f2',
      label: 'B',
      effort: 'S',
      ms: 'v0.1',
      ganttStart: 2,
      ganttEnd: 3,
      deps: [{ id: 'f1', reason: '' }],
      tasks: [],
    })
    const out = migrate(input)
    expect(out.modules[0]!.features[1]!.deps[0]!.type).toBe('build')
  })
})

describe('ProjectSchema', () => {
  it('validates a fully-specified v2 project', () => {
    const parsed = ProjectSchema.parse({
      ...minimal,
      meta: { ...minimal.meta, schemaVersion: 2 },
    })
    expect(parsed.meta.schemaVersion).toBe(2)
  })
})

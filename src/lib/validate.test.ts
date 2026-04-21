import { describe, expect, it } from 'vitest'
import type { Feature, Project } from '@/types'
import { countBySeverity, validate } from './validate'

function mkFeat(over: Partial<Feature> = {}): Feature {
  return {
    id: 'f',
    label: 'F',
    effort: 'M',
    ms: 'v0.1',
    ganttStart: 0,
    ganttEnd: 2,
    deps: [],
    tasks: [],
    ...over,
  }
}

function mkProject(features: Feature[], milestones = ['v0.1', 'v0.2']): Project {
  return {
    meta: {
      name: 'P',
      description: '',
      version: '0.1.0',
      schemaVersion: 2,
      milestones: milestones.map((id) => ({ id, label: id })),
    },
    modules: [{ id: 'm', label: 'M', color: '#FFFFFF', features }],
  }
}

describe('validate', () => {
  it('flags unknown dep IDs as errors', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'ghost', reason: '', type: 'build' }] })
    const p = mkProject([a])
    const issues = validate(p)
    expect(issues.some((i) => i.kind === 'unknown-dep' && i.severity === 'error')).toBe(true)
  })

  it('flags dep-conflict (later milestone) as warning', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.2' })
    const a = mkFeat({ id: 'a', ms: 'v0.1', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    const issues = validate(p)
    expect(issues.some((i) => i.kind === 'dep-conflict' && i.severity === 'warn')).toBe(true)
  })

  it('does not flag optional deps with later milestones', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.2' })
    const a = mkFeat({ id: 'a', ms: 'v0.1', deps: [{ id: 'b', reason: '', type: 'optional' }] })
    const p = mkProject([a, b])
    const issues = validate(p)
    expect(issues.some((i) => i.kind === 'dep-conflict')).toBe(false)
  })

  it('flags invalid gantt range (end <= start) as error', () => {
    const a = mkFeat({ id: 'a', ganttStart: 4, ganttEnd: 4 })
    const p = mkProject([a])
    const issues = validate(p)
    expect(issues.some((i) => i.kind === 'gantt-invalid' && i.severity === 'error')).toBe(true)
  })

  it('flags orphan milestone (feature.ms not in meta.milestones) as error', () => {
    const a = mkFeat({ id: 'a', ms: 'v9.9' })
    const p = mkProject([a])
    const issues = validate(p)
    expect(issues.some((i) => i.kind === 'orphan-milestone' && i.severity === 'error')).toBe(true)
  })

  it('flags cycles as errors', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const b = mkFeat({ id: 'b', deps: [{ id: 'a', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    const issues = validate(p)
    expect(issues.some((i) => i.kind === 'dep-cycle' && i.severity === 'error')).toBe(true)
  })

  it('returns no issues for a clean project', () => {
    const a = mkFeat({ id: 'a', ms: 'v0.1', ganttStart: 0, ganttEnd: 2 })
    const p = mkProject([a])
    const issues = validate(p).filter((i) => i.severity !== 'info')
    expect(issues).toEqual([])
  })

  it('emits an info-level hint when effort and gantt span diverge strongly', () => {
    const a = mkFeat({ id: 'a', effort: 'S', ganttStart: 0, ganttEnd: 5 })
    const p = mkProject([a])
    const issues = validate(p)
    expect(issues.some((i) => i.kind === 'gantt-effort-mismatch' && i.severity === 'info')).toBe(true)
  })
})

describe('countBySeverity', () => {
  it('groups correctly', () => {
    const a = mkFeat({
      id: 'a',
      ms: 'v9.9',
      deps: [{ id: 'ghost', reason: '', type: 'build' }],
    })
    const p = mkProject([a])
    const counts = countBySeverity(validate(p))
    expect(counts.error).toBeGreaterThanOrEqual(2)
  })
})

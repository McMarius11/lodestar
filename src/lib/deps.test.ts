import { describe, expect, it } from 'vitest'
import type { Feature, Project } from '@/types'
import {
  blockedBy,
  countIncomingDeps,
  depStatus,
  findCycles,
  hasConflict,
  isBlocked,
} from './deps'

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

function mkProject(features: Feature[], milestones = ['v0.1', 'v0.2', 'v0.3']): Project {
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

describe('depStatus', () => {
  it('returns "unknown" when target feature does not exist', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'ghost', reason: '', type: 'build' }] })
    const p = mkProject([a])
    expect(depStatus(p, a, a.deps[0]!)).toBe('unknown')
  })

  it('returns "done" when target feature is 100% done', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.1', tasks: [{ id: 't', label: 'x', done: true }] })
    const a = mkFeat({ id: 'a', ms: 'v0.2', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    expect(depStatus(p, a, a.deps[0]!)).toBe('done')
  })

  it('returns "conflict" when dep is in a later milestone', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.3' })
    const a = mkFeat({ id: 'a', ms: 'v0.1', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    expect(depStatus(p, a, a.deps[0]!)).toBe('conflict')
  })

  it('returns "same" when dep is in the same milestone', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.1' })
    const a = mkFeat({ id: 'a', ms: 'v0.1', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    expect(depStatus(p, a, a.deps[0]!)).toBe('same')
  })

  it('returns "open" when dep is in an earlier milestone but not done', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.1' })
    const a = mkFeat({ id: 'a', ms: 'v0.2', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    expect(depStatus(p, a, a.deps[0]!)).toBe('open')
  })
})

describe('isBlocked', () => {
  it('ignores optional deps', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.3' })
    const a = mkFeat({ id: 'a', ms: 'v0.1', deps: [{ id: 'b', reason: '', type: 'optional' }] })
    const p = mkProject([a, b])
    expect(isBlocked(p, a)).toBe(false)
  })

  it('returns true for open deps', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.1' })
    const a = mkFeat({ id: 'a', ms: 'v0.2', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    expect(isBlocked(p, a)).toBe(true)
  })

  it('returns false when dep is done', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.1', tasks: [{ id: 't', label: 'x', done: true }] })
    const a = mkFeat({ id: 'a', ms: 'v0.2', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    expect(isBlocked(p, a)).toBe(false)
  })
})

describe('blockedBy', () => {
  it('returns the feature objects that block', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.1', label: 'B' })
    const c = mkFeat({ id: 'c', ms: 'v0.1', label: 'C', tasks: [{ id: 't', label: 'x', done: true }] })
    const a = mkFeat({
      id: 'a',
      ms: 'v0.2',
      deps: [
        { id: 'b', reason: '', type: 'build' },
        { id: 'c', reason: '', type: 'build' },
      ],
    })
    const p = mkProject([a, b, c])
    const res = blockedBy(p, a)
    expect(res.map((f) => f.id)).toEqual(['b'])
  })
})

describe('hasConflict', () => {
  it('detects conflict with later milestone dep', () => {
    const b = mkFeat({ id: 'b', ms: 'v0.3' })
    const a = mkFeat({ id: 'a', ms: 'v0.1', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    expect(hasConflict(p, a)).toBe(true)
  })

  it('returns false without deps', () => {
    const a = mkFeat({ id: 'a' })
    const p = mkProject([a])
    expect(hasConflict(p, a)).toBe(false)
  })
})

describe('findCycles', () => {
  it('detects self-reference', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'a', reason: '', type: 'build' }] })
    const p = mkProject([a])
    const { cycles } = findCycles(p)
    expect(cycles.length).toBeGreaterThan(0)
    expect(cycles[0]).toContain('a')
  })

  it('detects direct 2-cycle', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const b = mkFeat({ id: 'b', deps: [{ id: 'a', reason: '', type: 'build' }] })
    const p = mkProject([a, b])
    const { cycles } = findCycles(p)
    expect(cycles.length).toBeGreaterThan(0)
  })

  it('detects indirect 3-cycle', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const b = mkFeat({ id: 'b', deps: [{ id: 'c', reason: '', type: 'build' }] })
    const c = mkFeat({ id: 'c', deps: [{ id: 'a', reason: '', type: 'build' }] })
    const p = mkProject([a, b, c])
    const { cycles } = findCycles(p)
    expect(cycles.length).toBeGreaterThan(0)
    const flat = cycles.flat()
    expect(flat).toContain('a')
    expect(flat).toContain('b')
    expect(flat).toContain('c')
  })

  it('returns no cycles on a DAG', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'b', reason: '', type: 'build' }] })
    const b = mkFeat({ id: 'b', deps: [{ id: 'c', reason: '', type: 'build' }] })
    const c = mkFeat({ id: 'c' })
    const p = mkProject([a, b, c])
    expect(findCycles(p).cycles).toEqual([])
  })

  it('ignores deps that point to non-existent features (treated as no edge)', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'ghost', reason: '', type: 'build' }] })
    const p = mkProject([a])
    expect(findCycles(p).cycles).toEqual([])
  })
})

describe('countIncomingDeps', () => {
  it('returns 0 for a feature nobody depends on', () => {
    const a = mkFeat({ id: 'a' })
    const b = mkFeat({ id: 'b' })
    const p = mkProject([a, b])
    expect(countIncomingDeps(p, 'a')).toBe(0)
  })

  it('counts each dependent feature once per dep record', () => {
    const a = mkFeat({ id: 'a' })
    const b = mkFeat({ id: 'b', deps: [{ id: 'a', reason: '', type: 'build' }] })
    const c = mkFeat({ id: 'c', deps: [{ id: 'a', reason: '', type: 'runtime' }] })
    const p = mkProject([a, b, c])
    expect(countIncomingDeps(p, 'a')).toBe(2)
  })

  it('ignores self-references (cycles are counted by findCycles, not here)', () => {
    const a = mkFeat({ id: 'a', deps: [{ id: 'a', reason: '', type: 'build' }] })
    const p = mkProject([a])
    expect(countIncomingDeps(p, 'a')).toBe(0)
  })
})

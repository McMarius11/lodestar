import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  loadRecents,
  removeRecent,
  saveRecents,
  upsertRecent,
  type Recent,
} from './recentFiles'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
  }
}

describe('recentFiles pure transforms', () => {
  const base: Recent = { name: 'one.json', path: '/a/one.json', when: 1 }

  it('upsert adds to head when new', () => {
    expect(upsertRecent([], base)).toEqual([base])
  })

  it('upsert moves existing path entry to head and replaces metadata', () => {
    const older: Recent = { name: 'x', path: '/a/one.json', when: 0 }
    const other: Recent = { name: 'two', path: '/a/two.json', when: 2 }
    const out = upsertRecent([other, older], { ...base, when: 5 })
    expect(out[0]).toEqual({ ...base, when: 5 })
    expect(out).toHaveLength(2)
    expect(out.find((r) => r.path === '/a/one.json')!.when).toBe(5)
  })

  it('upsert dedupes pathless entries into a single default-slot recent', () => {
    const a: Recent = { name: 'Default Slot', when: 1 }
    const b: Recent = { name: 'Nimbus', when: 9 }
    expect(upsertRecent([a], b)).toEqual([b])
  })

  it('upsert does not treat pathless entry as same as path-having entry', () => {
    const a: Recent = { name: 'dup.json', when: 1 }
    const b: Recent = { name: 'dup.json', path: '/p/dup.json', when: 2 }
    const out = upsertRecent([a], b)
    expect(out).toHaveLength(2)
  })

  it('upsert caps the list to max and drops the tail (oldest-first-out)', () => {
    // Callers are expected to keep the list newest-first. The 5th entry
    // (f4) is the oldest slot and will be evicted when a new entry lands.
    const list: Recent[] = Array.from({ length: 5 }, (_, i) => ({
      name: `f${i}`,
      path: `/p/f${i}.json`,
      when: 100 - i,
    }))
    const out = upsertRecent(list, { name: 'new', path: '/p/new.json', when: 999 }, 5)
    expect(out).toHaveLength(5)
    expect(out[0].path).toBe('/p/new.json')
    expect(out.find((r) => r.path === '/p/f4.json')).toBeUndefined()
    expect(out.find((r) => r.path === '/p/f0.json')).toBeDefined()
  })

  it('removeRecent filters by predicate', () => {
    const list: Recent[] = [
      { name: 'a', path: '/a', when: 1 },
      { name: 'b', path: '/b', when: 2 },
    ]
    expect(removeRecent(list, (r) => r.path === '/a')).toEqual([list[1]])
  })
})

describe('recentFiles storage I/O', () => {
  const originalStorage = (globalThis as { localStorage?: Storage }).localStorage
  beforeEach(() => {
    ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
  })
  afterEach(() => {
    if (originalStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage
    } else {
      ;(globalThis as { localStorage?: Storage }).localStorage = originalStorage
    }
  })

  it('loadRecents returns [] when nothing is stored', () => {
    expect(loadRecents()).toEqual([])
  })

  it('saveRecents round-trips through localStorage', () => {
    const list: Recent[] = [{ name: 'x.json', path: '/p/x.json', when: 42 }]
    saveRecents(list)
    expect(loadRecents()).toEqual(list)
  })

  it('loadRecents tolerates garbage', () => {
    localStorage.setItem('lodestar:recent-files', 'not-json')
    expect(loadRecents()).toEqual([])
  })

  it('loadRecents tolerates a non-array payload', () => {
    localStorage.setItem('lodestar:recent-files', JSON.stringify({ foo: 1 }))
    expect(loadRecents()).toEqual([])
  })
})

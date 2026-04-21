import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearLastSession,
  loadLastSession,
  saveLastSession,
} from './lastSession'

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

describe('lastSession', () => {
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

  it('returns null when empty', () => {
    expect(loadLastSession()).toBeNull()
  })

  it('round-trips a session', () => {
    saveLastSession({ path: '/x/project.json', when: 42 })
    expect(loadLastSession()).toEqual({ path: '/x/project.json', when: 42 })
  })

  it('clear removes the entry', () => {
    saveLastSession({ path: '/x/project.json', when: 42 })
    clearLastSession()
    expect(loadLastSession()).toBeNull()
  })

  it('rejects malformed payloads (missing path)', () => {
    localStorage.setItem('lodestar:last-session', JSON.stringify({ when: 1 }))
    expect(loadLastSession()).toBeNull()
  })

  it('rejects malformed payloads (wrong types)', () => {
    localStorage.setItem(
      'lodestar:last-session',
      JSON.stringify({ path: 5, when: 'soon' }),
    )
    expect(loadLastSession()).toBeNull()
  })

  it('tolerates garbage', () => {
    localStorage.setItem('lodestar:last-session', '{not-json')
    expect(loadLastSession()).toBeNull()
  })
})

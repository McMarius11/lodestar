export type Recent = {
  name: string
  path?: string
  when: number
}

const KEY = 'lodestar:recent-files'
const MAX_RECENTS = 5

function sameEntry(a: Recent, b: Recent): boolean {
  if (a.path && b.path) return a.path === b.path
  return !a.path && !b.path && a.name === b.name
}

export function upsertRecent(
  list: Recent[],
  entry: Recent,
  max = MAX_RECENTS,
): Recent[] {
  const filtered = list.filter((r) => !sameEntry(r, entry))
  return [entry, ...filtered].slice(0, max)
}

export function removeRecent(
  list: Recent[],
  predicate: (r: Recent) => boolean,
): Recent[] {
  return list.filter((r) => !predicate(r))
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function loadRecents(): Recent[] {
  const s = storage()
  if (!s) return []
  try {
    const raw = s.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Recent[]) : []
  } catch {
    return []
  }
}

export function saveRecents(list: Recent[]): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(KEY, JSON.stringify(list))
  } catch {
    // quota / private mode: silently drop
  }
}

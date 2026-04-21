/**
 * Pointer to the last project the user had open. In Electron, `path` is the
 * filesystem path of the project.json. In the browser build (no filesystem),
 * `path` is `null` and the canonical localStorage slot holds the data.
 */
export type LastSession = {
  path: string | null
  when: number
}

const KEY = 'lodestar:last-session'

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function loadLastSession(): LastSession | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      (typeof parsed.path === 'string' || parsed.path === null) &&
      typeof parsed.when === 'number'
    ) {
      return parsed as LastSession
    }
    return null
  } catch {
    return null
  }
}

export function saveLastSession(session: LastSession): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(KEY, JSON.stringify(session))
  } catch {
    // quota / private mode: silently drop
  }
}

export function clearLastSession(): void {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(KEY)
  } catch {
    // ignore
  }
}

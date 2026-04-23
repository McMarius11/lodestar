import { saveLastSession } from '@/lib/lastSession'
import { loadRecents, saveRecents, upsertRecent } from '@/lib/recentFiles'

/**
 * Cross-platform basename: strips everything before the last `/` or `\`.
 * Falls back to the input when no separator is present so browser-mode
 * "virtual" paths (display-only names) pass through unchanged.
 */
export function basenameOf(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

/**
 * A project at `path` just became active. Updates the recent-files list and
 * the last-session pointer so the Welcome screen can offer "Continue" on the
 * next boot. Call this from every action that opens a named file.
 */
export function rememberOpened(path: string): void {
  const now = Date.now()
  saveLastSession({ path, when: now })
  saveRecents(
    upsertRecent(loadRecents(), {
      name: basenameOf(path),
      path,
      when: now,
    }),
  )
}

/**
 * Browser-mode / pathless opens: the project lives in the canonical default
 * slot (localStorage or userData/data/project.json). We still leave a
 * breadcrumb so the Welcome screen can offer Continue on the next visit and
 * the recent list gets a named entry.
 */
export function markDefaultSlotOpened(name?: string): void {
  const now = Date.now()
  saveLastSession({ path: null, when: now })
  if (name) {
    saveRecents(upsertRecent(loadRecents(), { name, when: now }))
  }
}

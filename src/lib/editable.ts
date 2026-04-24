/**
 * Shared policy for single-line "edit on blur" renames: trim the draft, and
 * return `null` when the edit should be discarded (empty, whitespace-only, or
 * unchanged). A non-null return is the normalized value ready to persist.
 *
 * Callers pair this with a fall-back that resets the draft to `current` when
 * `null` comes back, so rename inputs always show a valid value after blur.
 * Used by TaskDrawer (feature label) and ModuleScope TaskRow (inline task
 * rename) to keep the two rename flows behaving identically.
 */
export function commitInlineEdit(current: string, draft: string): string | null {
  const trimmed = draft.trim()
  if (!trimmed || trimmed === current) return null
  return trimmed
}

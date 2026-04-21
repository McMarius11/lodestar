import { customAlphabet } from 'nanoid'

const alpha = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8)

export const newId = (prefix: string): string => `${prefix}-${alpha()}`

/**
 * Build a slug-ish id from a label, with a short random suffix so duplicates
 * cannot collide even when the same label is used twice.
 */
export function slugId(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24)
  const suffix = alpha().slice(0, 4)
  return base ? `${base}-${suffix}` : suffix
}

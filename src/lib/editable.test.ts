import { describe, expect, it } from 'vitest'
import { commitInlineEdit } from './editable'

describe('commitInlineEdit', () => {
  it('returns null for empty drafts', () => {
    expect(commitInlineEdit('Hello', '')).toBeNull()
  })

  it('returns null for whitespace-only drafts', () => {
    expect(commitInlineEdit('Hello', '   ')).toBeNull()
  })

  it('returns null when the draft equals current after trim', () => {
    expect(commitInlineEdit('Hello', 'Hello')).toBeNull()
    expect(commitInlineEdit('Hello', '  Hello  ')).toBeNull()
  })

  it('returns the trimmed value when the draft is a genuine change', () => {
    expect(commitInlineEdit('Hello', 'World')).toBe('World')
    expect(commitInlineEdit('Hello', '  World  ')).toBe('World')
  })
})

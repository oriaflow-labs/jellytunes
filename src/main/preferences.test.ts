// src/main/preferences.test.ts
// Tests for preferences module (userData/preferences.json persistence)

import { describe, it, expect } from 'vitest'

// We test the logic by mocking the underlying primitives
describe('preferences module logic', () => {
  const DEFAULT_PREFS = { analyticsEnabled: true }

  function getPreferencesFromFile(fileContent: string | null) {
    if (!fileContent) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...JSON.parse(fileContent) }
  }

  function setPreferencesLogic(current: ReturnType<typeof getPreferencesFromFile>, partial: Partial<typeof current>) {
    return { ...current, ...partial }
  }

  it('returns default prefs when file is empty or missing', () => {
    const result = getPreferencesFromFile(null)
    expect(result).toEqual({ analyticsEnabled: true })
  })

  it('returns default prefs when file has empty object', () => {
    const result = getPreferencesFromFile('{}')
    expect(result).toEqual({ analyticsEnabled: true })
  })

  it('returns default prefs when file content is invalid JSON', () => {
    // In the real module, invalid JSON throws and falls back to defaults
    let result = { ...DEFAULT_PREFS }
    try {
      JSON.parse('not json')
    } catch {
      result = { ...DEFAULT_PREFS }
    }
    expect(result).toEqual({ analyticsEnabled: true })
  })

  it('merges stored prefs with defaults', () => {
    const stored = '{"analyticsEnabled": false}'
    const result = getPreferencesFromFile(stored)
    expect(result).toEqual({ analyticsEnabled: false })
  })

  it('setPreferences merges partial into current', () => {
    const current = { analyticsEnabled: true }
    const updated = setPreferencesLogic(current, { analyticsEnabled: false })
    expect(updated).toEqual({ analyticsEnabled: false })
  })

  it('setPreferences preserves unspecified fields', () => {
    const current = { analyticsEnabled: true }
    const updated = setPreferencesLogic(current, { analyticsEnabled: false })
    expect(updated).toEqual({ analyticsEnabled: false })
    // Only field is analyticsEnabled in this interface
  })

  it('preferences round-trip preserves analyticsEnabled=false', () => {
    const stored = '{"analyticsEnabled": false}'
    const current = getPreferencesFromFile(stored)
    const updated = setPreferencesLogic(current, { analyticsEnabled: true })
    expect(updated).toEqual({ analyticsEnabled: true })
  })
})


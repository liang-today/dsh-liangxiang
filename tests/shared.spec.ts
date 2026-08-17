import { describe, expect, it } from 'vitest'
import {
  HOST_PLUGIN_NAME,
  HOVER_TEXT,
  INCENSE_STAT_LABEL,
  MY_INCENSE_LABEL,
  OVERLAY_ENTRY_ID,
  PLUGIN_PACKAGE_NAME,
  PRODUCT_NAME,
  RECONCILE_LABEL,
  VOTER_STAT_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_UP_LABEL,
} from '../src/shared/index.ts'

describe('shared frozen copy', () => {
  it('hover text is exactly 今日梁向 (frozen contract #8)', () => {
    expect(HOVER_TEXT).toBe('今日梁向')
  })

  it('product name is 梁向', () => {
    expect(PRODUCT_NAME).toBe('梁向')
  })

  it('freezes the accepted 梁向 vocabulary without renaming retained ritual copy', () => {
    expect(MY_INCENSE_LABEL).toBe('今日凝香')
    expect(VOTE_UP_LABEL).toBe('夯 · 升梁')
    expect(VOTE_DOWN_LABEL).toBe('拉 · 降梁')
    expect(INCENSE_STAT_LABEL).toBe('三界香火')
    expect(VOTER_STAT_LABEL).toBe('五行香客')
    expect(RECONCILE_LABEL).toBe('上达天听')
  })

  it('identifiers are stable', () => {
    expect(PLUGIN_PACKAGE_NAME).toBe('dsh-liangbiao')
    expect(HOST_PLUGIN_NAME).toBe('liangbiao')
    expect(OVERLAY_ENTRY_ID).toBe('liangbiao')
  })
})

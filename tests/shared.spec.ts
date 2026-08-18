import { describe, expect, it } from 'vitest'
import {
  HOST_PLUGIN_NAME,
  HOVER_TEXT,
  INCENSE_STAT_LABEL,
  MY_INCENSE_LABEL,
  OVERLAY_ENTRY_ID,
  PLUGIN_PACKAGE_NAME,
  PRODUCT_NAME,
  UTILITY_LABEL,
  VOTER_STAT_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_UP_LABEL,
  readLiangxiangEnv,
} from '../src/shared/index.ts'

describe('shared frozen copy', () => {
  it('hover text is exactly 今日梁相 (frozen contract #8)', () => {
    expect(HOVER_TEXT).toBe('今日梁相')
  })

  it('product name is 梁相', () => {
    expect(PRODUCT_NAME).toBe('梁相')
  })

  it('freezes the accepted 梁相 vocabulary without renaming retained ritual copy', () => {
    expect(MY_INCENSE_LABEL).toBe('今日凝香')
    expect(VOTE_UP_LABEL).toBe('夯 · 升梁')
    expect(VOTE_DOWN_LABEL).toBe('拉 · 降梁')
    expect(INCENSE_STAT_LABEL).toBe('三界香火')
    expect(VOTER_STAT_LABEL).toBe('五行香客')
    expect(UTILITY_LABEL).toBe('梁相案牍')
  })

  it('uses the Liangxiang technical identifiers', () => {
    expect(PLUGIN_PACKAGE_NAME).toBe('dsh-liangxiang')
    expect(HOST_PLUGIN_NAME).toBe('liangxiang')
    expect(OVERLAY_ENTRY_ID).toBe('liangxiang')
  })

  it('reads only the canonical LIANGXIANG configuration namespace', () => {
    expect(readLiangxiangEnv({ LIANGXIANG_BACKEND_URL: 'https://api.liang.today' }, 'BACKEND_URL'))
      .toBe('https://api.liang.today')
    expect(readLiangxiangEnv({}, 'COMMUNITY_KEY')).toBeUndefined()
  })
})

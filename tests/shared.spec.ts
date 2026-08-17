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
    expect(RECONCILE_LABEL).toBe('上达天听')
  })

  it('uses the Liangxiang technical identifiers', () => {
    expect(PLUGIN_PACKAGE_NAME).toBe('dsh-liangxiang')
    expect(HOST_PLUGIN_NAME).toBe('liangxiang')
    expect(OVERLAY_ENTRY_ID).toBe('liangxiang')
  })

  it('prefers LIANGXIANG configuration but reads one-release legacy aliases', () => {
    expect(readLiangxiangEnv({ LIANGXIANG_BACKEND_URL: 'new' }, 'BACKEND_URL')).toBe('new')
    expect(readLiangxiangEnv({ LIANGBIAO_BACKEND_URL: 'legacy' }, 'BACKEND_URL')).toBe('legacy')
    expect(readLiangxiangEnv({
      LIANGXIANG_COMMUNITY_KEY: '',
      LIANGBIAO_COMMUNITY_KEY: 'must-not-win',
    }, 'COMMUNITY_KEY')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { HOST_PLUGIN_NAME, HOVER_TEXT, OVERLAY_ENTRY_ID, PLUGIN_PACKAGE_NAME, PRODUCT_NAME } from '../src/shared/index.ts'

describe('shared frozen copy', () => {
  it('hover text is exactly 今日梁位 (frozen contract #8)', () => {
    expect(HOVER_TEXT).toBe('今日梁位')
  })

  it('product name is 梁标', () => {
    expect(PRODUCT_NAME).toBe('梁标')
  })

  it('identifiers are stable', () => {
    expect(PLUGIN_PACKAGE_NAME).toBe('dsh-liangbiao')
    expect(HOST_PLUGIN_NAME).toBe('liangbiao')
    expect(OVERLAY_ENTRY_ID).toBe('liangbiao')
  })
})

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { LIANGZI_STATES } from '../src/domain/index.ts'
import { LIANGZI_ART } from '../src/client/liangzi-art.ts'

const sourceNames = ['waiting', 'gong', 'zong', 'shen', 'sheng', 'zu'] as const

describe('inlined Liangzi artwork', () => {
  it('uses six lossless WebPs with the source dimensions and visible pixels', async () => {
    for (const [index, state] of LIANGZI_STATES.entries()) {
      const uri = LIANGZI_ART[state]
      expect(uri).toMatch(/^data:image\/webp;base64,/)
      const encoded = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')
      const source = await readFile(fileURLToPath(new URL(
        `../src/client/artwork/${sourceNames[index]}.png`,
        import.meta.url,
      )))
      const encodedImage = sharp(encoded).ensureAlpha()
      const sourceImage = sharp(source).ensureAlpha()
      const [metadata, actual, expected] = await Promise.all([
        encodedImage.metadata(),
        encodedImage.raw().toBuffer(),
        sourceImage.raw().toBuffer(),
      ])

      expect(metadata).toMatchObject({ format: 'webp', width: 256, height: 256, hasAlpha: true })
      expect(actual.byteLength).toBe(expected.byteLength)
      let transparentPixels = 0
      let mismatchOffset = -1
      for (let offset = 0; offset < expected.byteLength; offset += 4) {
        if (actual[offset + 3] !== expected[offset + 3]) {
          mismatchOffset = offset
          break
        }
        if (expected[offset + 3] === 0) {
          transparentPixels += 1
          continue
        }
        if (!actual.subarray(offset, offset + 3).equals(expected.subarray(offset, offset + 3))) {
          mismatchOffset = offset
          break
        }
      }
      expect(mismatchOffset, `${state} must preserve every visible RGBA pixel`).toBe(-1)
      expect(transparentPixels).toBeGreaterThan(0)
    }
  })
})

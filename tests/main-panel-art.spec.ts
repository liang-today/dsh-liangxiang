import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MAIN_PANEL_ART } from '../src/client/main-panel-art.ts'
import { PLUGIN_VERSION } from '../src/shared/index.ts'

const ASSETS = [
  { id: 'nan', width: 256, height: 256, bytes: 58_538, hash: '64daf8d4385b45bcffba071f8abf5191370284736ad586439403abd764d71ccf' },
  { id: 'grass', width: 109, height: 128, bytes: 11_952, hash: '07d7585c1d32fddf7c2071c6baebee9a94c302c1efe2c9ed3573dceb34004c5e' },
  { id: 'fish', width: 128, height: 85, bytes: 4_556, hash: '11946688f46f9174b1e481127d8dd66429fecce927586b0ab69bea12af855b8c' },
] as const

describe('separate approved main-panel artwork', () => {
  it('retains the approved transparent WebP bytes, dimensions and bounded transfer sizes', async () => {
    for (const asset of ASSETS) {
      const image = await readFile(new URL(`../src/client/assets/main-${asset.id}.webp`, import.meta.url))
      const metadata = await sharp(image).metadata()
      expect([metadata.width, metadata.height, metadata.hasAlpha, metadata.format]).toEqual([asset.width, asset.height, true, 'webp'])
      expect(image.byteLength).toBe(asset.bytes)
      expect(createHash('sha256').update(image).digest('hex')).toBe(asset.hash)
    }
  })

  it('ships all three art files without embedding them into the URL module', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { files: string[] }
    for (const { id } of ASSETS) {
      expect(manifest.files).toContain(`lib/main-${id}.webp`)
      expect(MAIN_PANEL_ART[id]).toBe(`/liangxiang/api/panel/art.webp?asset=${id}&v=${encodeURIComponent(PLUGIN_VERSION)}`)
    }
    expect(Object.keys(MAIN_PANEL_ART)).toEqual(['nan', 'grass', 'fish'])
    expect(JSON.stringify(MAIN_PANEL_ART)).not.toContain('data:')
  })
})

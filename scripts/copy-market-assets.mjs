import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import sharp from 'sharp'

const assets = [
  { file: 'market-whale.webp', width: 493, height: 512, maxBytes: 80_000 },
  { file: 'main-nan.webp', width: 256, height: 256, maxBytes: 60_000 },
  { file: 'main-grass.webp', width: 109, height: 128, maxBytes: 12_500 },
  { file: 'main-fish.webp', width: 128, height: 85, maxBytes: 5_000 },
]
await mkdir(new URL('../lib/', import.meta.url), { recursive: true })
for (const { file, width, height, maxBytes } of assets) {
  const source = new URL('../src/client/assets/' + file, import.meta.url)
  const target = new URL('../lib/' + file, import.meta.url)
  const info = await stat(source)
  if (info.size > maxBytes) throw new Error(`${file} exceeds its ${maxBytes}-byte transfer budget`)
  const artwork = await sharp(await readFile(source)).metadata()
  if (artwork.format !== 'webp' || artwork.width !== width || artwork.height !== height || !artwork.hasAlpha) {
    throw new Error(`${file} must retain its ${width}×${height} transparent source-derived sprite`)
  }
  await copyFile(source, target)
}

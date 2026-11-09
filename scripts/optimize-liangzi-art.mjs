#!/usr/bin/env node
// Re-encode only when every decoded RGBA byte stays identical and size shrinks.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
const path = new URL('../src/client/liangzi-art.ts', import.meta.url)
let source = await readFile(path, 'utf8'), saved = 0
for (const match of source.matchAll(/(\w+): 'data:image\/webp;base64,([^']+)'/g)) {
  const previous = Buffer.from(match[2], 'base64')
  const next = await sharp(previous).webp({ lossless: true, quality: 100, effort: 6, exact: true }).toBuffer()
  if (next.length >= previous.length) continue
  const before = await sharp(previous).ensureAlpha().raw().toBuffer()
  const after = await sharp(next).ensureAlpha().raw().toBuffer()
  if (!before.equals(after)) throw new Error('Portrait optimization changed RGBA pixels')
  source = source.replace(match[0], `${match[1]}: 'data:image/webp;base64,${next.toString('base64')}'`)
  saved += previous.length - next.length
}
await writeFile(path, source)
console.log(`Lossless portrait optimization: ${saved} bytes saved; RGBA pixels preserved`)

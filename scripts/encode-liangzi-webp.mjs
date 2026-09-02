#!/usr/bin/env node
/** Encode generated transparent portrait PNGs as deterministic lossless WebP. */
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import sharp from 'sharp'

const inputs = process.argv.slice(2)
if (inputs.length === 0) {
  console.error('usage: node scripts/encode-liangzi-webp.mjs <portrait.png> [...]')
  process.exit(2)
}

for (const input of inputs) {
  if (extname(input).toLowerCase() !== '.png') {
    throw new Error(`expected a .png input, received ${input}`)
  }
  const output = input.replace(/\.png$/i, '.webp')
  await sharp(input)
    .webp({ lossless: true, effort: 6 })
    .toFile(output)
  console.log(`${output}: ${(await stat(output)).size} bytes`)
}

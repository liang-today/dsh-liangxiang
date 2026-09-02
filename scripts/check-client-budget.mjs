#!/usr/bin/env node
/** Fail the build when the single-file browser payload regresses materially. */
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const client = await readFile(new URL('../lib/client.js', import.meta.url))
const rawLimit = 700_000
const gzipLimit = 400_000
const gzipBytes = gzipSync(client, { level: 9 }).byteLength

console.log(`client.js: ${client.byteLength} bytes raw, ${gzipBytes} bytes gzip`)
if (client.byteLength > rawLimit || gzipBytes > gzipLimit) {
  throw new Error(
    `client.js exceeds budget (raw <= ${rawLimit}, gzip <= ${gzipLimit}); `
      + 'inspect inlined artwork and accidental browser dependencies',
  )
}

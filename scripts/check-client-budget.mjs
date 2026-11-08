#!/usr/bin/env node
/** Fail the build when the single-file browser payload regresses materially. */
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'

const client = await readFile(new URL('../lib/client.js', import.meta.url))
// Merging the existing read-only bars dialog adds 17.6 KB raw / 5.9 KB gzip.
// Both chart surfaces stay available; no artwork or runtime dependency was added.
// Approved market layout and seven distinct companion interactions add about
// 2.9 KB of code to alpha10. Keep the original compressed transfer ceiling.
const rawLimit = 725_000
// The original portraits remain pixel-identical. The market adds about 22 KB
// compressed code; its separately budgeted sprite stays outside this always-loaded bundle.
const gzipLimit = 430_000
const gzipBytes = gzipSync(client, { level: 9 }).byteLength

console.log(`client.js: ${client.byteLength} bytes raw, ${gzipBytes} bytes gzip`)
if (client.byteLength > rawLimit || gzipBytes > gzipLimit) {
  throw new Error(
    `client.js exceeds budget (raw <= ${rawLimit}, gzip <= ${gzipLimit}); `
      + 'inspect inlined artwork and accidental browser dependencies',
  )
}

// Output minification must preserve the DSH wrapper; an ESM export or a broken
// factory can fit the byte budget and still fail every installed WebUI at boot.
let loaded
runInNewContext(client.toString('utf8'), {
  window: { __ModuleLoader__: { load: value => { loaded = value } } },
})
if (loaded?.id !== 'dsh-liangxiang' || typeof loaded.factory !== 'function') {
  throw new Error('client.js must register the DSH CommonJS factory')
}
const plugin = loaded.factory(createRequire(import.meta.url))
if (typeof plugin?.apply !== 'function' || !Array.isArray(plugin.inject) || !plugin.inject.includes('slots')) {
  throw new Error('client.js must export the DSH apply function and slots injection')
}

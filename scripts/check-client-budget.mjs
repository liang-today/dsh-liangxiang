#!/usr/bin/env node
/** Project payload review gate; feature growth may use a user-approved budget. */
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'

const client = await readFile(new URL('../lib/client.js', import.meta.url))
// These are project review thresholds, not DSH runtime limits. For necessary
// feature growth, report raw/gzip deltas and loading impact, obtain the user's
// approval, then revise both thresholds and their evidence. Preserve approved
// artwork and motion; do not silently bypass this gate or chase harmless bytes.
const rawLimit = 735_000
const gzipLimit = 430_000
const gzipBytes = gzipSync(client, { level: 9 }).byteLength

const size = bytes => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${(bytes / 1_000).toFixed(2)} KB`
console.log(`client.js: ${size(client.byteLength)} raw, ${size(gzipBytes)} gzip`)
if (client.byteLength > rawLimit || gzipBytes > gzipLimit) {
  throw new Error(
    `client.js needs budget review (raw <= ${size(rawLimit)}, gzip <= ${size(gzipLimit)}); `
      + 'inspect accidental dependencies; report necessary feature growth and request user approval to revise the budget',
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

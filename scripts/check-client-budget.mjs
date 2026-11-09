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
const rawLimit = 725_000
const gzipLimit = 430_000
const gzipBytes = gzipSync(client, { level: 9 }).byteLength

console.log(`client.js: ${client.byteLength} bytes raw, ${gzipBytes} bytes gzip`)
if (client.byteLength > rawLimit || gzipBytes > gzipLimit) {
  throw new Error(
    `client.js needs budget review (raw <= ${rawLimit}, gzip <= ${gzipLimit}); `
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

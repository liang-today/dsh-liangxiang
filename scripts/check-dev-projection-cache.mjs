#!/usr/bin/env node
/** Detect the known pre-alpha.4 projection-cache shape before DSH emits a loader traceback. */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dshHome = process.argv[2]
if (!dshHome) throw new Error('usage: check-dev-projection-cache.mjs <DSH_HOME>')

const recordsDir = join(dshHome, 'storages', 'session_projcache', 'sessions')
let files
try {
  files = readdirSync(recordsDir).filter((name) => name.endsWith('.json'))
} catch (error) {
  if (error?.code === 'ENOENT') process.exit(0)
  throw error
}

const incompatible = []
for (const name of files) {
  let document
  try {
    document = JSON.parse(readFileSync(join(recordsDir, name), 'utf8'))
  } catch {
    // The per-record JSON backend deliberately treats malformed documents as absent.
    continue
  }
  if (document?.version !== 5) continue
  const identity = document?.record?.identity
  if (
    typeof identity?.isSeeded !== 'boolean'
    || !Number.isInteger(identity?.inheritedEventCount)
    || identity.inheritedEventCount < 0
  ) {
    incompatible.push(name.slice(0, -'.json'.length))
  }
}

if (incompatible.length === 0) process.exit(0)

console.error(
  `DSH session projection cache uses the pre-alpha.4 identity shape (${incompatible.length} record(s)).`,
)
console.error('The cache is rebuildable; session logs and Liangxiang ledgers are separate and remain untouched.')
console.error('Run: pnpm run dev:repair-cache')
process.exit(2)

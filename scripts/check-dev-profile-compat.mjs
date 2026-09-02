#!/usr/bin/env node
/** Fail early on known third-party profile residues that cannot load on pinned DSH. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [dshHome, profile] = process.argv.slice(2)
if (!dshHome || !profile) throw new Error('usage: check-dev-profile-compat.mjs <DSH_HOME> <profile>')

const manifestPath = join(dshHome, 'profiles', profile, 'package.json')
let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  if (error?.code === 'ENOENT') process.exit(0)
  throw error
}

const bundles = manifest?.dsh?.profile?.bundles ?? []
const hasMarket = bundles.includes('dshmarket') || manifest?.dependencies?.dshmarket !== undefined
if (!hasMarket) process.exit(0)

let marketVersion = manifest.dependencies?.dshmarket ?? 'unknown'
let settingsPeer = 'unknown'
let incompatibleReason = 'installed package is missing'
try {
  const marketRoot = join(dshHome, 'profiles', profile, 'node_modules', 'dshmarket')
  const market = JSON.parse(readFileSync(join(marketRoot, 'package.json'), 'utf8'))
  marketVersion = market.version ?? marketVersion
  settingsPeer = market.peerDependencies?.['@deepseek-ai/dsh-settings'] ?? settingsPeer
  const settingsModule = readFileSync(join(marketRoot, 'lib', 'settings.js'), 'utf8')
  incompatibleReason = /\b(?:installSettingsSection|settingsNamespace)\b/.test(settingsModule)
    ? 'imports settings APIs removed by DSH alpha.4+'
    : ''
} catch {
  // A declared but incomplete dependency cannot load either.
}

if (!incompatibleReason) process.exit(0)

console.error(`Profile '${profile}' still contains dshmarket ${marketVersion}.`)
console.error(`It ${incompatibleReason}; its @deepseek-ai/dsh-settings peer range is '${settingsPeer}'.`)
console.error('Remove this unrelated residue from the isolated Liangxiang dev Profile:')
console.error(`  DSH_HOME="${dshHome}" pnpm exec dsh plugin --profile "${profile}" remove dshmarket`)
process.exit(1)

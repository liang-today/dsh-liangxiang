#!/usr/bin/env node
/**
 * Guard against the failure mode that breaks tool calls in a dev profile:
 * TWO MODULE INSTANCES of one in-box DSH package.
 *
 * How it happens: `dsh plugin add @deepseek-ai/dsh-web-app` installs that
 * bundle's whole closure (dsh-tools, dsh-session, …) into
 * `<profile>/node_modules`, which shadows the launcher-maintained flat fallback
 * at `<home>/profiles/node_modules` (docs: app-boot/src/profile.ts
 * `healProfilesModuleFallback`). A plugin row then loads the profile-local copy
 * while another in-box package loads the installation copy.
 *
 * Why that is fatal rather than merely wasteful: DSH wires some internal seams
 * with `unique symbol` keys — e.g. `TOOL_RUNTIME_SCHEDULER` in
 * `@deepseek-ai/dsh-tools`, read by `@deepseek-ai/dsh-agent-loop`. Two module
 * instances mint two different symbols, so the lookup returns `undefined` and
 * the first tool call of every turn dies with
 * `Cannot read properties of undefined (reading 'prepare')` — after the
 * assistant's `tool_calls` message was already recorded, which then poisons the
 * session with "an assistant message with 'tool_calls' must be followed by tool
 * messages".
 *
 * A profile should therefore declare in-box bundles in `dsh.profile.bundles`
 * but NOT depend on them; only genuinely out-of-tree plugins belong in
 * `dependencies`.
 *
 * Usage: node scripts/assert-profile-modules.mjs <profile-dir>
 */
import { createRequire } from 'node:module'
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const profileDir = resolve(process.argv[2] ?? '')
if (profileDir === '' || !existsSync(profileDir)) {
  console.error(`assert-profile-modules: no such profile directory: ${profileDir}`)
  process.exit(2)
}
const profilesDir = dirname(profileDir)
const fallbackDir = join(profilesDir, 'node_modules')

/** Package names under one node_modules, scoped names included. */
function listPackages(modulesDir) {
  if (!existsSync(modulesDir)) return []
  const names = []
  for (const entry of readdirSync(modulesDir)) {
    if (entry.startsWith('.')) continue
    if (entry.startsWith('@')) {
      const scopeDir = join(modulesDir, entry)
      if (!existsSync(scopeDir)) continue
      for (const scoped of readdirSync(scopeDir)) {
        if (!scoped.startsWith('.')) names.push(`${entry}/${scoped}`)
      }
      continue
    }
    names.push(entry)
  }
  return names
}

const profilePackages = listPackages(join(profileDir, 'node_modules'))
const inBoxPackages = new Set(listPackages(fallbackDir))
const shadowed = profilePackages.filter((name) => inBoxPackages.has(name))

/**
 * Packages whose identity must be shared process-wide (they carry `unique
 * symbol` seams or singleton service classes), each checked from several
 * anchors that legitimately import them.
 */
const SHARED = [
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-storage-domain',
  '@deepseek-ai/cordis',
]
const ANCHORS = [
  '@deepseek-ai/dsh-agent-loop',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-base',
]

const requireFromProfile = createRequire(join(profileDir, 'package.json'))

function resolveRealPath(id, fromDir) {
  try {
    const req = fromDir === undefined ? requireFromProfile : createRequire(join(fromDir, 'package.json'))
    return realpathSync(req.resolve(id))
  } catch {
    return undefined
  }
}

function packageDir(id) {
  const entry = resolveRealPath(id)
  if (entry === undefined) return undefined
  // lib/index.js -> package root (both levels are inside the package).
  let dir = dirname(entry)
  for (let i = 0; i < 4 && !existsSync(join(dir, 'package.json')); i += 1) dir = dirname(dir)
  return existsSync(join(dir, 'package.json')) ? dir : undefined
}

const duplicates = []
for (const shared of SHARED) {
  const seen = new Map()
  const record = (label, path) => {
    if (path === undefined) return
    const anchors = seen.get(path) ?? []
    anchors.push(label)
    seen.set(path, anchors)
  }
  record('profile', resolveRealPath(shared))
  for (const anchor of ANCHORS) {
    const dir = packageDir(anchor)
    if (dir === undefined) continue
    record(basename(anchor), resolveRealPath(shared, dir))
  }
  if (seen.size > 1) duplicates.push({ shared, seen })
}

if (shadowed.length === 0 && duplicates.length === 0) {
  console.log(`OK: profile '${basename(profileDir)}' resolves every in-box package from the installation (single instances).`)
  process.exit(0)
}

console.error(`ERROR: profile '${basename(profileDir)}' has a duplicated module graph.`)
if (shadowed.length > 0) {
  const shown = shadowed.slice(0, 10)
  console.error(`\n${shadowed.length} profile-local copies shadow the installation fallback, e.g.:`)
  for (const name of shown) console.error(`  - ${name}`)
  if (shadowed.length > shown.length) console.error(`  … and ${shadowed.length - shown.length} more`)
  console.error(
    '\nFix: keep the bundle in dsh.profile.bundles but drop the dependency, e.g.\n'
    + `  pnpm --dir ${profileDir} remove <package>`,
  )
}
for (const { shared, seen } of duplicates) {
  console.error(`\n${shared} resolves to ${seen.size} different files:`)
  for (const [path, anchors] of seen) console.error(`  - ${path}\n      via: ${anchors.join(', ')}`)
}
process.exit(1)

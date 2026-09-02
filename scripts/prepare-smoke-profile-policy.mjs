#!/usr/bin/env node
/** Add the repository's audited pnpm build policy to one throwaway Profile. */
import { readFile, writeFile } from 'node:fs/promises'

const [profileWorkspacePath, policyPath] = process.argv.slice(2)
if (profileWorkspacePath === undefined || policyPath === undefined) {
  console.error('usage: node scripts/prepare-smoke-profile-policy.mjs <profile-workspace> <policy>')
  process.exit(2)
}

const [workspace, policy] = await Promise.all([
  readFile(profileWorkspacePath, 'utf8'),
  readFile(policyPath, 'utf8'),
])
if (!policy.startsWith('allowBuilds:\n')) {
  throw new Error(`${policyPath} must contain only the audited allowBuilds policy`)
}
if (workspace.includes('\nallowBuilds:\n') || workspace.startsWith('allowBuilds:\n')) {
  throw new Error(`${profileWorkspacePath} already declares allowBuilds`)
}
await writeFile(profileWorkspacePath, `${workspace.trimEnd()}\n\n${policy.trim()}\n`, 'utf8')

#!/usr/bin/env node
/** Fail before a pinned DSH command uses an unaudited local runtime. */
import { execFileSync } from 'node:child_process'

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
const nodeSupported = (nodeMajor === 22 && nodeMinor >= 19) || nodeMajor >= 24
if (!nodeSupported) {
  throw new Error(
    `DSH 0.1.2-alpha.4 requires Node ^22.19.0 or >=24.0.0; received ${process.versions.node}`,
  )
}

const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim()
const launchOnly = process.argv.includes('--launch-only')
if (!launchOnly && pnpmVersion !== '11.7.0') {
  throw new Error(`DSH 0.1.2-alpha.4 baseline requires pnpm 11.7.0; received ${pnpmVersion}`)
}

console.log(
  launchOnly
    ? `DSH launch runtime: Node ${process.versions.node} (pnpm ${pnpmVersion} only dispatches the existing install)`
    : `DSH install runtime: Node ${process.versions.node}, pnpm ${pnpmVersion}`,
)

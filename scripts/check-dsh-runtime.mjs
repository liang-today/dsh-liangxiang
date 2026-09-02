#!/usr/bin/env node
/** Keep the disposable clean-Profile smoke on its audited runtime baseline. */
import { execFileSync } from 'node:child_process'

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
const nodeSupported = (nodeMajor === 22 && nodeMinor >= 19) || nodeMajor >= 24
if (!nodeSupported) {
  throw new Error(
    `DSH 0.1.2-alpha.4 requires Node ^22.19.0 or >=24.0.0; received ${process.versions.node}`,
  )
}

const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim()
if (pnpmVersion !== '11.7.0') {
  throw new Error(`DSH 0.1.2-alpha.4 clean-Profile baseline requires pnpm 11.7.0; received ${pnpmVersion}`)
}

console.log(`clean-Profile runtime: Node ${process.versions.node}, pnpm ${pnpmVersion}`)

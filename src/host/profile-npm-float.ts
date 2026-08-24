/**
 * DSH `plugin add` is a thin pnpm forwarder. Two consumer-side pnpm behaviours
 * pin people to an old Liangxiang build even though the plugin itself has no
 * tight version range:
 *
 *   1. `pnpm add dsh-liangxiang` writes the resolved exact version into the
 *      profile manifest. The next add is "Already up to date".
 *   2. pnpm 11 defaults `minimumReleaseAge` to 1440 minutes. A dist-tag whose
 *      target is younger than one day falls back to the last aged version.
 *
 * This module rewrites a DSH profile so the specifier stays the floating
 * `latest` tag and the package is excluded from the age gate. Leftover `beta`
 * pins, exact versions and tarball `file:` rows are migrated to `latest`.
 * Developers using `link:` or a non-tarball `file:` checkout are left alone.
 * Startup only edits the manifest — it never runs `pnpm add`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PLUGIN_PACKAGE_NAME } from '../shared/index.ts'

interface ProfileManifest {
  name?: string
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

export interface NpmFloatResult {
  profileDir: string
  changed: boolean
  specifier?: string
  refreshed: boolean
}

/** Official install/upgrade channel after 1.0.0. */
export const FLOATING_NPM_TAG = 'latest'

function readJson(path: string): ProfileManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as ProfileManifest
}

export function findDshProfileRoot(startDir: string): string | undefined {
  let dir = startDir
  for (let i = 0; i < 12; i += 1) {
    const manifestPath = join(dir, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = readJson(manifestPath)
        if (
          manifest.name?.startsWith('dsh-profile-')
          && manifest.dsh?.profile?.bundles?.includes(PLUGIN_PACKAGE_NAME)
        ) {
          return dir
        }
      } catch {
        // Keep walking past unreadable manifests.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/** Keep a floating registry tag; do not rewrite developer checkouts. */
export function floatingRegistrySpecifier(current: string | undefined): string | undefined {
  if (current === undefined) return undefined
  if (current === FLOATING_NPM_TAG || current === '*' || current.startsWith('>=')) {
    return current
  }
  if (current.startsWith('link:') || current.startsWith('workspace:')) return current
  if (current.startsWith('file:') && !/\.tgz(?:#|$)/.test(current)) return current
  return FLOATING_NPM_TAG
}

/** Make `minimumReleaseAgeExclude` contain the bare package name (all versions). */
export function withPackageReleaseAgeExclude(workspaceText: string, packageName: string): string {
  const lines = workspaceText.replace(/\r\n/g, '\n').split('\n')
  const header = 'minimumReleaseAgeExclude:'
  const wanted = `  - ${packageName}`
  const headerIndex = lines.findIndex(line => line.trim() === header)
  if (headerIndex === -1) {
    const next = [...lines]
    if (next.length > 0 && next[next.length - 1] !== '') next.push('')
    next.push(header, wanted, '')
    return next.join('\n')
  }
  const kept: string[] = []
  let i = headerIndex + 1
  while (i < lines.length && (/^[\t ]*- /.test(lines[i] as string) || (lines[i] as string).trim() === '')) {
    const line = lines[i] as string
    const item = line.replace(/^[\t ]*- /, '').trim()
    if (item !== '' && item !== packageName && !item.startsWith(`${packageName}@`)) {
      kept.push(line)
    }
    i += 1
  }
  const rebuilt = [
    ...lines.slice(0, headerIndex + 1),
    wanted,
    ...kept,
    ...lines.slice(i),
  ]
  return rebuilt.join('\n')
}

export function applyNpmFloatToProfile(profileDir: string): { changed: boolean, specifier?: string } {
  const manifestPath = join(profileDir, 'package.json')
  const workspacePath = join(profileDir, 'pnpm-workspace.yaml')
  if (!existsSync(manifestPath)) return { changed: false }

  let changed = false
  const manifest = readJson(manifestPath)
  const current = manifest.dependencies?.[PLUGIN_PACKAGE_NAME]
  const next = floatingRegistrySpecifier(current)
  if (next !== undefined && next !== current) {
    manifest.dependencies = { ...manifest.dependencies, [PLUGIN_PACKAGE_NAME]: next }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    changed = true
  }

  const workspace = existsSync(workspacePath) ? readFileSync(workspacePath, 'utf8') : 'packages:\n  - .\n\n'
  const floated = withPackageReleaseAgeExclude(workspace, PLUGIN_PACKAGE_NAME)
  if (floated !== workspace) {
    writeFileSync(workspacePath, floated.endsWith('\n') ? floated : `${floated}\n`)
    changed = true
  }

  const specifier = next ?? current
  return specifier === undefined ? { changed } : { changed, specifier }
}

export function refreshFloatingLatest(profileDir: string): boolean {
  const result = spawnSync('pnpm', ['add', `${PLUGIN_PACKAGE_NAME}@${FLOATING_NPM_TAG}`], {
    cwd: profileDir,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  return result.status === 0
}

export function ensureProfileTracksLatest(
  startDir: string,
  options: { refresh?: boolean } = {},
): NpmFloatResult | undefined {
  if (process.env.LIANGXIANG_SKIP_NPM_FLOAT === '1') return undefined
  const profileDir = findDshProfileRoot(startDir)
  if (profileDir === undefined) return undefined
  const applied = applyNpmFloatToProfile(profileDir)
  let refreshed = false
  if (applied.changed && options.refresh === true) {
    refreshed = refreshFloatingLatest(profileDir)
  }
  return applied.specifier === undefined
    ? { profileDir, changed: applied.changed, refreshed }
    : {
      profileDir,
      changed: applied.changed,
      specifier: applied.specifier,
      refreshed,
    }
}

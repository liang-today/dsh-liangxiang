/**
 * Manifest invariants: our own loud mirror of the DSH client-modules scan
 * requirements (docs/003 rows C7 + B1). If any of these drift, `dsh` fails
 * with "declares dsh.client but exports no ./client bundle" or installs the
 * package as a plain dependency without a layer.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLUGIN_PACKAGE_NAME, PLUGIN_VERSION } from '../src/shared/index.ts'

interface Manifest {
  name: string
  version: string
  homepage: string
  repository: { type: string, url: string }
  bugs: { url: string }
  engines: { node: string }
  type: string
  main: string
  exports: Record<string, unknown>
  files: string[]
  dsh: {
    bundle?: { patch?: string }
    client?: { platform?: string }
  }
}

function readRootFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')
}

const manifest = JSON.parse(readRootFile('package.json')) as Manifest

describe('package.json dsh manifests', () => {
  it('package name matches the shared constant', () => {
    expect(manifest.name).toBe(PLUGIN_PACKAGE_NAME)
  })

  it('keeps the package/tarball version and visible plugin version in sync', () => {
    expect(manifest.version).toBe(PLUGIN_VERSION)
  })

  it('keeps every current-facing release document on the package version', () => {
    const escaped = manifest.version.replaceAll('.', '\\.')
    const markers: Array<[string, RegExp]> = [
      ['CHANGELOG.md', new RegExp(`^## ${escaped}\\b`, 'm')],
      ['SECURITY.md', new RegExp(`梁相 v${escaped}\\b`)],
      ['docs/100-release-readiness.md', new RegExp(`^# .*v${escaped}\\b`, 'm')],
      ['docs/102-known-limitations.md', new RegExp(`更新至 v${escaped}`)],
      ['docs/103-test-matrix.md', new RegExp(`v${escaped}`)],
      ['docs/142-hk-migration-report.md', new RegExp(`dsh-liangxiang@${escaped}`)],
      ['docs/COMPATIBILITY.md', new RegExp(`\\| 梁相版本 \\| ${escaped} \\|`)],
      ['docs/BUGFIX.md', new RegExp('当前版本 `v' + escaped + '`')],
      ['docs/INSTALL.md', new RegExp(`dsh-liangxiang-${escaped}\\.tgz`)],
      ['docs/144-client-recovery-and-update.md', new RegExp(`dsh-liangxiang-${escaped}\\.tgz`)],
    ]
    for (const [path, marker] of markers) {
      expect(readRootFile(path), `${path} must identify release ${manifest.version}`).toMatch(marker)
    }
  })

  it('publishes npm discovery and compatibility metadata', () => {
    expect(manifest.homepage).toBe('https://liang.today/')
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/NiYa193/dsh-liang-meter.git',
    })
    expect(manifest.bugs.url).toBe('https://github.com/NiYa193/dsh-liang-meter/issues')
    expect(manifest.engines.node).toBe('^22.19.0 || >=24')
  })

  it('is an ESM package with the host entry as main', () => {
    expect(manifest.type).toBe('module')
    expect(manifest.main).toBe('lib/index.js')
  })

  it('declares dsh.bundle with the patch file (bundle layer requirement)', () => {
    expect(manifest.dsh.bundle?.patch).toBe('./cordis.patch.yml')
  })

  it('declares dsh.client with platform web (client scan requirement)', () => {
    expect(manifest.dsh.client?.platform).toBe('web')
  })

  it('exports "." and "./client" as string paths the scan accepts', () => {
    expect(manifest.exports['.']).toBe('./lib/index.js')
    expect(manifest.exports['./client']).toBe('./lib/client.js')
  })

  it('ships both artifacts and the patch file', () => {
    expect(manifest.files).toEqual(expect.arrayContaining([
      'lib/index.js',
      'lib/client.js',
      'cordis.patch.yml',
    ]))
  })
})

describe('cordis.patch.yml', () => {
  const patch = readRootFile('cordis.patch.yml')

  it('inserts the host row referencing the package by name', () => {
    expect(patch).toContain('id: liangxiang')
    expect(patch).toContain(`name: ${PLUGIN_PACKAGE_NAME}`)
  })
})

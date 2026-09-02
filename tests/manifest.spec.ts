/**
 * Manifest invariants: our own loud mirror of the DSH client-modules scan
 * requirements (docs/003 rows C7 + B1). If any of these drift, `dsh` fails
 * with "declares dsh.client but exports no ./client bundle" or installs the
 * package as a plain dependency without a layer.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLUGIN_PACKAGE_NAME, PLUGIN_VERSION, SERVER_BUILD } from '../src/shared/index.ts'

interface Manifest {
  name: string
  version: string
  description: string
  homepage: string
  repository: { type: string, url: string }
  bugs: { url: string }
  engines?: { node?: string }
  type: string
  main: string
  exports: Record<string, unknown>
  files: string[]
  dsh: {
    bundle?: { patch?: string }
    client?: { inject?: string[], platform?: string }
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

  it('keeps a server-only build label that does not bump the client version', () => {
    expect(SERVER_BUILD).toMatch(new RegExp(`^${PLUGIN_VERSION.replaceAll('.', '\\.')}-u\\d+$`))
    expect(SERVER_BUILD).not.toBe(PLUGIN_VERSION)
  })

  it('keeps current authority documents on the source version without rewriting history', () => {
    const escaped = manifest.version.replaceAll('.', '\\.')
    const markers: Array<[string, RegExp]> = [
      ['CHANGELOG.md', new RegExp(`^## ${escaped}\\b`, 'm')],
      ['SECURITY.md', new RegExp(`梁相当前源码版本 v${escaped}\\b`)],
      ['docs/COMPATIBILITY.md', new RegExp(`\\| 梁相版本 \\| ${escaped} \\|`)],
      ['docs/CURRENT_ARCHITECTURE.md', new RegExp(`PLUGIN_VERSION` + String.raw`[^\n]*` + escaped)],
    ]
    for (const [path, marker] of markers) {
      expect(readRootFile(path), `${path} must identify release ${manifest.version}`).toMatch(marker)
    }
  })

  it('publishes npm discovery and compatibility metadata', () => {
    expect(manifest.homepage).toBe('https://liang.today/')
    expect(manifest.description).toContain('香火')
    expect(manifest.description).toContain('梁位')
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/liang-today/dsh-liangxiang.git',
    })
    expect(manifest.bugs.url).toBe('https://github.com/liang-today/dsh-liangxiang/issues')
    expect(manifest.engines).toBeUndefined()
    expect(readRootFile('README.md')).not.toMatch(/梁文锋/)
    expect(readRootFile('README.md')).not.toMatch(/本页右侧/)
    expect(readRootFile('README.md')).toContain('众香成势，梁子显相')
    expect(readRootFile('README.md')).toContain('https://liang.today/')
    expect(readRootFile('README.md')).toContain('plugin --profile web add dsh-liangxiang')
    expect(readRootFile('README.md')).not.toContain('dsh-liangxiang@beta')
    expect(readRootFile('README.md')).toContain('不要运行 `npm i dsh-liangxiang`')
    expect(readRootFile('docs/npm-readme.md')).toContain('本页右侧')
    expect(readRootFile('docs/npm-readme.md')).toContain('plugin --profile web add dsh-liangxiang')
    expect(readRootFile('docs/npm-readme.md')).not.toContain('dsh-liangxiang@beta')
  })

  it('is an ESM package with the host entry as main', () => {
    expect(manifest.type).toBe('module')
    expect(manifest.main).toBe('lib/index.js')
  })

  it('declares dsh.bundle with the patch file (bundle layer requirement)', () => {
    expect(manifest.dsh.bundle?.patch).toBe('./cordis.patch.yml')
  })

  it('declares the alpha.4 renderer/layout injections and web platform', () => {
    expect(manifest.dsh.client?.inject).toEqual([
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-layout',
    ])
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

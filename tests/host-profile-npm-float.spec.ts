import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  applyNpmFloatToProfile,
  findDshProfileRoot,
  floatingRegistrySpecifier,
  withPackageReleaseAgeExclude,
} from '../src/host/profile-npm-float.ts'

function writeProfile(dir: string, dependency: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: { 'dsh-liangxiang': dependency },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-liangxiang'] } },
  }, undefined, 2)}\n`)
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`)
}

describe('profile npm float', () => {
  it('keeps developer checkouts and already-floating tags', () => {
    expect(floatingRegistrySpecifier('beta')).toBe('beta')
    expect(floatingRegistrySpecifier('link:../../dsh-liangxiang')).toBe('link:../../dsh-liangxiang')
    expect(floatingRegistrySpecifier('file:/Users/fc/code/dsh-liangxiang')).toBe('file:/Users/fc/code/dsh-liangxiang')
    expect(floatingRegistrySpecifier('0.8.3-beta')).toBe('beta')
    expect(floatingRegistrySpecifier('file:/Users/fc/Desktop/liangxiang/dsh-liangxiang-0.8.3-beta.tgz'))
      .toBe('beta')
  })

  it('writes a package-level release-age exclude and replaces version-specific rows', () => {
    const next = withPackageReleaseAgeExclude(
      `packages:
  - .

minimumReleaseAgeExclude:
  - dsh-liangxiang@0.8.3-beta || 0.8.5-beta
  - other-pkg
`,
      'dsh-liangxiang',
    )
    expect(next).toContain('  - dsh-liangxiang\n')
    expect(next).toContain('  - other-pkg')
    expect(next).not.toContain('dsh-liangxiang@')
  })

  it('finds a DSH profile and rewrites an exact version to beta', () => {
    const dir = join(tmpdir(), `liangxiang-float-${Date.now()}`)
    writeProfile(dir, '0.8.3-beta')
    expect(findDshProfileRoot(join(dir, 'node_modules', 'dsh-liangxiang', 'lib'))).toBe(dir)
    const result = applyNpmFloatToProfile(dir)
    expect(result).toEqual({ changed: true, specifier: 'beta' })
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies['dsh-liangxiang']).toBe('beta')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('  - dsh-liangxiang\n')
  })

  it('does not treat the plugin repo as a DSH profile', () => {
    expect(findDshProfileRoot(process.cwd())).toBeUndefined()
  })
})

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readScript(name: string): string {
  return readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8')
}

describe('local development workflow', () => {
  it('keeps explicit mock isolation even when a checkout dotenv points to another home and backend', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-preview-env-'))
    mkdirSync(join(dir, 'scripts'))
    const script = join(dir, 'scripts/env.sh')
    writeFileSync(script, readScript('env.sh'))
    writeFileSync(join(dir, '.env'), 'DSH_HOME=unexpected-existing-home\nLIANGXIANG_BACKEND_URL=https://backend.invalid\nLIANGXIANG_PROFILE=unexpected-existing-profile\n')
    const isolated = join(dir, 'isolated-home')
    const read = (skip: string): string[] => execFileSync('bash', ['-c',
      '. "$1"\nprintf "%s\\n" "$DSH_HOME" "$LIANGXIANG_BACKEND_URL" "$PROFILE"', 'preview-env', script], {
      encoding: 'utf8', env: { ...process.env, LIANGXIANG_SKIP_DOTENV: skip,
        DSH_HOME: isolated, LIANGXIANG_BACKEND_URL: 'http://127.0.0.1:4199', LIANGXIANG_PROFILE: 'liangxiang-market-preview' },
    }).trim().split('\n')
    try {
      expect(read('1')).toEqual([isolated, 'http://127.0.0.1:4199', 'liangxiang-market-preview'])
      expect(read('0')).toEqual(['unexpected-existing-home', 'https://backend.invalid', 'unexpected-existing-profile'])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('finds current document-relative boot resources and legacy parser-loaded bundles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-boot-'))
    const html = join(dir, 'index.html')
    const script = fileURLToPath(new URL('../scripts/read-client-resource.mjs', import.meta.url))
    try {
      writeFileSync(html, '<script>globalThis["__DSH_BOOT__"] = {"entries":[{"id":"dsh-liangxiang","url":"plugins/??dsh-liangxiang/client.js&rev=current"}]}</script>')
      expect(execFileSync(process.execPath, [script, html], { encoding: 'utf8' }))
        .toBe('/plugins/??dsh-liangxiang/client.js&rev=current')
      writeFileSync(html, '<script src="/plugins/??dsh-liangxiang/client.js&amp;rev=legacy"></script>')
      expect(execFileSync(process.execPath, [script, html], { encoding: 'utf8' }))
        .toBe('/plugins/??dsh-liangxiang/client.js&rev=legacy')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('repairs an undecided native build without changing other Profile choices and can be repeated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-policy-'))
    const workspace = join(dir, 'pnpm-workspace.yaml')
    const policy = join(dir, 'policy.yaml')
    writeFileSync(workspace, 'nodeLinker: hoisted\nallowBuilds:\n  koffi: set this to true or false\n  another-package: false\n')
    writeFileSync(policy, 'allowBuilds:\n  koffi: true\n')
    try {
      const script = fileURLToPath(new URL('../scripts/prepare-smoke-profile-policy.mjs', import.meta.url))
      execFileSync(process.execPath, [script, workspace, policy])
      const first = readFileSync(workspace, 'utf8')
      expect(first).toContain('koffi: true')
      expect(first).toContain('another-package: false')
      expect(first).toContain('nodeLinker: hoisted')
      execFileSync(process.execPath, [script, workspace, policy])
      expect(readFileSync(workspace, 'utf8')).toBe(first)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('does not impose the disposable clean-profile runtime gate on daily development', () => {
    expect(readScript('dev-install.sh')).not.toContain('check-dsh-runtime.mjs')
    expect(readScript('dev-web.sh')).not.toContain('check-dsh-runtime.mjs')
  })

  it('keeps the audited runtime gate on the disposable clean-profile smoke', () => {
    expect(readScript('smoke-clean-profile.sh')).toContain('check-dsh-runtime.mjs')
  })

  it('keeps a disposable clean profile offline unless online coverage is explicit', () => {
    const smoke = readScript('smoke-clean-profile.sh')
    expect(smoke).toContain('LIANGXIANG_SMOKE_BACKEND_URL')
    expect(smoke).toContain('export LIANGXIANG_BACKEND_URL="local"')
    expect(smoke.indexOf('export LIANGXIANG_BACKEND_URL="local"')).toBeLessThan(
      smoke.indexOf('"$DSH_BIN" --profile'),
    )
  })

  it('leaves projection-cache recovery to DSH alpha.5 without moving user data', () => {
    const devWeb = readScript('dev-web.sh')
    const repair = readScript('repair-dev-cache.sh')
    expect(devWeb).not.toContain('check-dev-projection-cache.mjs')
    expect(repair).toContain('DSH 0.1.2-alpha.5')
    expect(repair).toContain('No cache, session, profile, or Liangxiang ledger was moved.')
    expect(repair).not.toMatch(/\bmv\b/)
  })
})

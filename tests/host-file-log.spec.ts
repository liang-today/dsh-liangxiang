import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendCappedLine,
  createHostFileLog,
  resolveHostLogPath,
} from '../src/host/file-log.ts'
import { PLUGIN_VERSION } from '../src/shared/index.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'liangxiang-host-log-'))
  dirs.push(dir)
  return dir
}

function entry(dir: string, name: string): string {
  const root = join(dir, 'runtime', 'node_modules', ...name.split('/'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name,
    ...(name === '@deepseek-ai/dsh' ? { bin: { dsh: './lib/index.js' } } : {}),
  }))
  const path = join(root, 'lib', 'index.js')
  writeFileSync(path, '')
  return path
}

function profile(dir: string, name: string): string {
  const path = join(dir, 'profiles', name)
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'package.json'), JSON.stringify({
    name: 'dsh-profile-custom', dsh: { profile: { bundles: ['dsh-liangxiang'] } },
  }))
  return path
}

describe('host file log', () => {
  it('prefers LIANGXIANG_HOST_LOG, then DSH_HOME/logs', () => {
    expect(resolveHostLogPath({ LIANGXIANG_HOST_LOG: '/tmp/explicit.log' })).toBe('/tmp/explicit.log')
    expect(resolveHostLogPath({ DSH_HOME: '/tmp/dsh-home' })).toBe(join('/tmp/dsh-home', 'logs', 'liangxiang.log'))
    expect(resolveHostLogPath({}, '/workspace')).toBe(join('/workspace', '.dsh', 'logs', 'liangxiang.log'))
  })

  it('writes succinct lines and keeps the file at or under the cap', () => {
    const dir = tempDir()
    const path = join(dir, 'liangxiang.log')
    const log = createHostFileLog({ path, maxBytes: 400 })
    log.log('[dsh-liangxiang] host half active')
    log.warn('backend token-claim failed: timeout')
    const text = readFileSync(path, 'utf8')
    expect(text).toContain(' log [dsh-liangxiang] host half active')
    expect(text).toContain(' warn backend token-claim failed: timeout')
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(400)
  })

  it('drops the oldest complete lines when the cap would be exceeded', () => {
    const dir = tempDir()
    const path = join(dir, 'liangxiang.log')
    writeFileSync(path, 'old-1\nold-2\nkeep-me\n')
    appendCappedLine(path, 'newest\n', 20)
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('newest')
    expect(text).not.toContain('old-1')
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(20)
  })

  it('distinguishes verified Web and Desktop entries and their Host processes in one shared log', () => {
    const dir = tempDir(), path = join(dir, 'liangxiang.log')
    const webEntry = entry(dir, '@deepseek-ai/dsh'), desktopEntry = entry(dir, '@deepseek-ai/dsh-desktop-host')
    const desktopProfile = profile(dir, 'desktop')
    const web = createHostFileLog({ path, runtime: { argv: ['node', webEntry, 'web'], cwd: dir, pid: 1001 } })
    const desktop = createHostFileLog({ path, runtime: {
      argv: ['node', desktopEntry, join(dir, 'runtime'), desktopProfile], cwd: desktopProfile, pid: 1002,
    } })
    web.warn('backend GET /bootstrap failed with HTTP 412 (wallet_upgrade_required)')
    desktop.log('host half active')
    const lines = readFileSync(path, 'utf8').trim().split('\n')
    expect(lines[0]).toContain(`v${PLUGIN_VERSION} Web`)
    expect(lines[1]).toContain(`v${PLUGIN_VERSION} Desktop`)
    expect(lines[0]).toContain('host=h' + (1001).toString(36))
    expect(lines[1]).toContain('host=h' + (1002).toString(36))
    expect(lines[0]).toContain('wallet_upgrade_required')
    expect(readFileSync(path, 'utf8')).not.toContain(dir)
  })

  it('hashes private profile names without recording paths, arbitrary arguments or environment secrets', () => {
    const dir = tempDir(), path = join(dir, 'liangxiang.log'), name = 'private-person@example.invalid'
    const cwd = profile(dir, name), script = entry(dir, '@deepseek-ai/dsh')
    const secret = 'not-for-log-api-key'
    const log = createHostFileLog({ path, env: { DSH_HOME: dir, API_KEY: secret },
      runtime: { argv: ['node', script, '--profile', name, '--api-key', secret], cwd, pid: 1003 } })
    log.log('probe')
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('profile=p' + createHash('sha256').update(name).digest('hex').slice(0, 8))
    expect(text).not.toContain(name)
    expect(text).not.toContain(dir)
    expect(text).not.toContain(secret)
    expect(text).not.toContain('@example')
  })

  it('does not label an arbitrary script or a profile called desktop as the Desktop application', () => {
    const dir = tempDir(), path = join(dir, 'liangxiang.log'), cwd = profile(dir, 'desktop')
    const script = entry(dir, 'another-runner')
    createHostFileLog({ path, runtime: { argv: ['node', script, 'web'], cwd, pid: 1004 } }).log('probe')
    createHostFileLog({ path, runtime: {
      argv: ['node', entry(dir, '@deepseek-ai/dsh'), '--profile', 'desktop'], cwd, pid: 1005,
    } }).log('probe')
    const lines = readFileSync(path, 'utf8').trim().split('\n')
    for (const line of lines) {
      expect(line).toContain(`v${PLUGIN_VERSION} Host`)
      expect(line).not.toContain(' Desktop ')
      expect(line).not.toContain(' Web ')
    }
  })

  it('falls back safely when runtime metadata cannot be identified', () => {
    const dir = tempDir(), path = join(dir, 'liangxiang.log')
    const log = createHostFileLog({ path, runtime: { argv: ['node', join(dir, 'missing')], cwd: dir, pid: NaN } })
    expect(() => log.warn('probe')).not.toThrow()
    const text = readFileSync(path, 'utf8')
    expect(text).toContain(`v${PLUGIN_VERSION} Host profile=unknown host=unknown`)
    expect(text).not.toContain(dir)
    expect(text).not.toContain('NaN')
  })

  it('hashes an explicit --profile=value without treating its name as an application type', () => {
    const dir = tempDir(), path = join(dir, 'liangxiang.log'), name = 'desktop-private-owner'
    const script = entry(dir, '@deepseek-ai/dsh')
    createHostFileLog({ path, runtime: { argv: ['node', script, `--profile=${name}`], cwd: dir, pid: 1006 } }).log('probe')
    const text = readFileSync(path, 'utf8')
    expect(text).toContain(`v${PLUGIN_VERSION} Host`)
    expect(text).toContain('profile=p' + createHash('sha256').update(name).digest('hex').slice(0, 8))
    expect(text).not.toContain(name)
  })

  it('does not identify an arbitrary script as Web solely from its enclosing package name', () => {
    const dir = tempDir(), path = join(dir, 'liangxiang.log'), script = entry(dir, '@deepseek-ai/dsh')
    writeFileSync(join(dir, 'runtime/node_modules/@deepseek-ai/dsh/package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh', bin: { dsh: './lib/another.js' },
    }))
    createHostFileLog({ path, runtime: { argv: ['node', script, 'web'], cwd: dir, pid: 1007 } }).log('probe')
    expect(readFileSync(path, 'utf8')).toContain(`v${PLUGIN_VERSION} Host profile=unknown`)
  })
})

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendCappedLine,
  createHostFileLog,
  resolveHostLogPath,
} from '../src/host/file-log.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'liangxiang-host-log-'))
  dirs.push(dir)
  return dir
}

describe('host file log', () => {
  it('prefers LIANGXIANG_HOST_LOG, then DSH_HOME/logs', () => {
    expect(resolveHostLogPath({ LIANGXIANG_HOST_LOG: '/tmp/explicit.log' })).toBe('/tmp/explicit.log')
    expect(resolveHostLogPath({ DSH_HOME: '/tmp/dsh-home' })).toBe('/tmp/dsh-home/logs/liangxiang.log')
    expect(resolveHostLogPath({}, '/Users/demo')).toBe('/Users/demo/.dsh/logs/liangxiang.log')
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
})

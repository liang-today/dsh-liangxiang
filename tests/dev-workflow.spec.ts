import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readScript(name: string): string {
  return readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8')
}

describe('local development workflow', () => {
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

  it('validates a projection cache before moving it for repair', () => {
    const repair = readScript('repair-dev-cache.sh')
    expect(repair).toContain('check-dev-projection-cache.mjs')
    expect(repair).toContain('already compatible; nothing was moved')
  })
})

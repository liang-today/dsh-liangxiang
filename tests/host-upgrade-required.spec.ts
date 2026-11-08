/** A real HTTP compatibility rejection must remain readable through the Host. */
import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { createBackendClient } from '../src/host/backend-client.ts'
import { generateCommunityKeypair } from '../src/host/community-keys.ts'

it('keeps an upgrade precondition distinct from a connection failure without attempting a write', async () => {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    res.writeHead(412, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'wallet_upgrade_required', min_client_version: '2.0.0',
      message: '请升级至梁相2.0.0及以上版本；余额、冻结香火和梁股结算均已保留。' } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('listener missing')
  const identity = generateCommunityKeypair('compatibility-message-device')
  const host = new BackendLiangService({ client: createBackendClient({ baseUrl: `http://127.0.0.1:${address.port}`, signer: () => identity }),
    clock: { now: () => Date.UTC(2026, 10, 8, 12) }, timezone: 'Asia/Shanghai', warn: () => undefined })
  try {
    host.attachIdentity(identity.installationId)
    await host.refreshBootstrap()
    expect(host.getWireState()).toMatchObject({ authorityAvailable: false,
      authorityReason: '请升级至梁相2.0.0及以上版本' })
    expect(requests).toEqual(['GET /v1/bootstrap'])
  } finally {
    host.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

import { afterEach, expect, it } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const moduleUrl = pathToFileURL(resolve('scripts/dev-network-gate.mjs')).href
const { startNetworkGate } = await import(moduleUrl)
const cleanup: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const origin = (server: Server): string => `http://127.0.0.1:${(server.address() as { port: number }).port}`
async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  return origin(server)
}
async function setup(online = true) {
  let stateReads = 0, otherReads = 0
  const host = await listen(createServer((req, res) => {
    if (req.url === '/?token=local-fixture') { res.writeHead(303, { 'set-cookie': 'session=private-fixture; HttpOnly', location: '/' }); res.end(); return }
    if (req.url === '/liangxiang/api/state' && req.headers.cookie === 'session=private-fixture') {
      stateReads++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: online })); return
    }
    otherReads++; res.writeHead(404); res.end()
  }))
  const target = await listen(createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end('{"status":"ok"}') }))
  const dir = mkdtempSync(join(tmpdir(), 'liangxiang-network-gate-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const log = join(dir, 'web.log'); writeFileSync(log, `dsh web: ${host}/?token=local-fixture\n`)
  const gate = await startNetworkGate({ target, dsh: host, dshLog: log, proxyPort: 0, controlPort: 0 })
  cleanup.push(() => gate.close())
  const control = origin(gate.control), proxy = origin(gate.proxy)
  const command = (connected: boolean, sequence: number, headers = {}) => fetch(`${control}/connection`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-liangxiang-manual-test': '1', ...headers },
    body: JSON.stringify({ connected, controller: 'rapid-click-fixture', sequence }),
  })
  return { control, proxy, command, stateReads: () => stateReads, otherReads: () => otherReads }
}

it('honors the last rapid-click intent even when an older command arrives later', async () => {
  const h = await setup()
  expect((await h.command(false, 1)).status).toBe(200)
  expect((await fetch(`${h.proxy}/v1/health`)).status).toBe(503)
  await h.command(true, 3)
  await h.command(false, 2)
  const state = await (await fetch(`${h.control}/status`)).json()
  expect(state).toMatchObject({ connected: true, revision: 2, online: true })
  expect((await fetch(`${h.proxy}/v1/health`)).status).toBe(200)
  const batch = await Promise.all(Array.from({ length: 10 }, (_, i) => h.command(i % 2 === 0, 4 + i)))
  expect(batch.every(response => response.ok)).toBe(true)
  expect(await (await fetch(`${h.control}/status`)).json()).toMatchObject({ connected: false })
})

it('shows the real local Host signal separately from an enabled switch without extra cloud reads', async () => {
  const h = await setup(false)
  const replies = await Promise.all(Array.from({ length: 8 }, () => fetch(`${h.control}/status`).then(r => r.json())))
  for (const state of replies) expect(state).toMatchObject({ connected: true, online: false })
  expect(h.stateReads()).toBe(1)
  expect(h.otherReads()).toBe(0)
  const body = JSON.stringify(replies)
  expect(body).not.toContain('private-fixture')
  expect(body).not.toContain('local-fixture')
})

it('rejects foreign-origin controls and cannot forward absolute external targets', async () => {
  const h = await setup()
  expect((await h.command(false, 1, { origin: 'https://example.invalid' })).status).toBe(403)
  const foreignHost = await new Promise(resolve => {
    const req = request(`${h.control}/open-dsh`, { headers: { host: 'example.invalid' } }, res => { res.resume(); resolve(res.statusCode) })
    req.end()
  })
  expect(foreignHost).toBe(403)
  expect((await fetch(`${h.proxy}//example.invalid/v1/health`)).status).toBe(400)
  expect(await (await fetch(`${h.control}/status`)).json()).toMatchObject({ connected: true })
  await expect(startNetworkGate({ target: 'https://example.invalid', dsh: 'http://127.0.0.1:3999', dshLog: '' })).rejects.toThrow('loopback')
})

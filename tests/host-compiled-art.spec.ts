import { createServer } from 'node:http'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { createLiangxiangApi } from '../src/host/routes.ts'
import type { LiangHostService } from '../src/host/service.ts'

const ART = [
  { file: 'main-nan.webp', path: '/liangxiang/api/panel/art.webp?asset=nan&v=2.0.0' },
  { file: 'main-grass.webp', path: '/liangxiang/api/panel/art.webp?asset=grass&v=2.0.0' },
  { file: 'main-fish.webp', path: '/liangxiang/api/panel/art.webp?asset=fish&v=2.0.0' },
  { file: 'market-whale.webp', path: '/liangxiang/api/market/art.webp' },
] as const

let temporary: string
let compiled: string
let fixtureId = 0

beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'liangxiang-compiled-art-'))
  const output = join(temporary, 'bundle')
  await build({
    config: false,
    entry: [fileURLToPath(new URL('../src/host/routes.ts', import.meta.url))],
    outDir: output,
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: true,
    logLevel: 'silent',
  })
  const entry = (await readdir(output)).find(name => /^routes\.(mjs|js)$/.test(name))
  if (entry === undefined) throw new Error('compiled illustration route is missing')
  compiled = join(output, entry)
}, 30_000)

afterAll(async () => {
  if (temporary !== undefined) await rm(temporary, { recursive: true, force: true })
})

async function withCompiledRoute(
  kind: 'clone' | 'package' | 'both',
  check: (base: string, lib: string) => Promise<void>,
): Promise<void> {
  // Exercise encoded spaces and non-ASCII file URLs on every supported OS.
  const root = join(temporary, `图片 fixture ${++fixtureId}`)
  const lib = join(root, 'lib')
  await mkdir(lib, { recursive: true })
  const entry = join(lib, 'routes.mjs')
  await copyFile(compiled, entry)
  for (const art of ART) {
    const source = new URL(`../src/client/assets/${art.file}`, import.meta.url)
    if (kind !== 'clone') await copyFile(source, join(lib, art.file))
    if (kind !== 'package') {
      const directory = join(root, 'src', 'client', 'assets')
      await mkdir(directory, { recursive: true })
      if (kind === 'both') await writeFile(join(directory, art.file), 'source must not replace installed artwork')
      else await copyFile(source, join(directory, art.file))
    }
  }
  const loaded = await import(pathToFileURL(entry).href) as { createLiangxiangApi: typeof createLiangxiangApi }
  // Art is available before an authority starts; no identity or ledger exists.
  const api = loaded.createLiangxiangApi({ isReady: false } as LiangHostService, () => undefined, {
    selectAuthorityMode: () => { throw new Error('art reads must not select an authority') },
  })
  const server = createServer((request, response) => { void api.handler(request, response) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('illustration test server did not bind')
    await check(`http://127.0.0.1:${address.port}`, lib)
  } finally {
    api.closeAllConnections()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

async function expectApprovedArt(base: string): Promise<void> {
  for (const art of ART) {
    const response = await fetch(base + art.path)
    expect(response.status, art.file).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      await readFile(new URL(`../src/client/assets/${art.file}`, import.meta.url)),
    )
  }
}

describe('compiled Host illustration layout', () => {
  it('reads all four clone sources when the compiled lib has no copied images', async () => {
    await withCompiledRoute('clone', expectApprovedArt)
  })

  it('serves a package containing lib artwork without any source tree', async () => {
    await withCompiledRoute('package', expectApprovedArt)
  })

  it('keeps installed lib artwork ahead of clone sources', async () => {
    await withCompiledRoute('both', expectApprovedArt)
  })

  it('does not hide unreadable packaged paths and retries rejected image caches', async () => {
    await withCompiledRoute('clone', async (base, lib) => {
      for (const art of ART) {
        const installed = join(lib, art.file)
        // Reading a directory is an I/O error, not a missing asset. The valid
        // clone source must not hide that error or poison the promise cache.
        await mkdir(installed)
        expect((await fetch(base + art.path)).status).toBe(404)
        await rm(installed, { recursive: true })
        const approved = new URL(`../src/client/assets/${art.file}`, import.meta.url)
        await copyFile(approved, installed)
        const recovered = await fetch(base + art.path)
        expect(recovered.status).toBe(200)
        expect(Buffer.from(await recovered.arrayBuffer())).toEqual(await readFile(approved))
      }
    })
  })

  it('keeps selectors fixed and refuses non-read requests after compilation', async () => {
    await withCompiledRoute('clone', async base => {
      for (const query of [
        '?asset=../src/client/assets/main-nan.webp',
        '?asset=market-whale',
        '?asset=nan&asset=grass',
        '?asset=nan&path=main-grass.webp',
        '?asset=nan&v=../outside',
        '?asset=nan&v=2.0.0&v=2.0.0',
      ]) {
        expect((await fetch(base + '/liangxiang/api/panel/art.webp' + query)).status).toBe(400)
      }
      for (const art of ART) {
        expect((await fetch(base + art.path, { method: 'POST' })).status).toBe(405)
      }
    })
  })
})

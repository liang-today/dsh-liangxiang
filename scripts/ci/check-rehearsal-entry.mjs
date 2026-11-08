#!/usr/bin/env node
/** Post-build check: bundling must preserve both isolated CLI entry points. */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const backend = join(repo, 'lib/rehearsal-backend.js'), activity = join(repo, 'lib/rehearsal-activity.js')
assert(existsSync(backend) && existsSync(activity), 'Build the repository before checking isolated entries')
const root = mkdtempSync(join(realpathSync(tmpdir()), 'liangxiang-rehearsal-entry-'))
const directory = join(root, 'rehearsal'); mkdirSync(directory)
const clock = join(directory, 'clock.json'), epoch = Date.UTC(2026, 10, 8, 1)
writeFileSync(clock, JSON.stringify({ epoch_ms: epoch, anchor_wall_ms: Date.now(), rate: 0 }), { mode: 0o600 })
const env = { ...process.env, LIANGXIANG_REHEARSAL: '1', LIANGXIANG_ALLOW_UNSIGNED: '0',
  LIANGXIANG_BACKEND_HOST: '127.0.0.1', LIANGXIANG_BACKEND_PORT: '4195',
  LIANGXIANG_BACKEND_DB: join(directory, 'liangxiang-rehearsal.sqlite'),
  LIANGXIANG_REHEARSAL_CLOCK_FILE: clock }
let child
try {
  const refused = spawnSync(process.execPath, [backend], { cwd: repo, env: { ...env, LIANGXIANG_REHEARSAL: '0' }, encoding: 'utf8', timeout: 5000 })
  assert.equal(refused.status, 1, 'Backend entry must execute and reject an ordinary environment')
  assert.match(refused.stderr, /Rehearsal requires explicit opt-in/)
  child = spawn(process.execPath, [backend], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += String(bytes) })
  child.stderr.resume()
  let health
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw Error('Bundled backend exited before its isolated listener was ready')
    if (output.includes('ISOLATED REHEARSAL')) {
      const response = await fetch('http://127.0.0.1:4195/v1/health', { signal: AbortSignal.timeout(1000) })
      assert.equal(response.status, 200); health = await response.json(); break
    }
    await pause(50)
  }
  assert.equal(health?.status, 'ok', 'Compiled isolated backend must actually start')
  const snapshot = await (await fetch('http://127.0.0.1:4195/v1/snapshot')).json()
  assert.equal(snapshot.server_time, epoch)
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  child.kill('SIGTERM')
  const stopped = await Promise.race([exit, pause(5000).then(() => null)])
  assert.deepEqual(stopped, { code: 0, signal: null }, 'Compiled backend must close cleanly')
  child = undefined
  const previous = join(directory, 'previous'); mkdirSync(previous, { mode: 0o700 })
  const prior = join(previous, 'state.json'); writeFileSync(prior, '{}', { mode: 0o600 })
  const bytes = readFileSync(clock), outside = join(dirname(directory), 'outside')
  const rejected = spawnSync(process.execPath, [activity, '--mode', 'run', '--state-dir', outside, '--prior-state', prior, '--clock-file', clock], { cwd: repo, env, encoding: 'utf8', timeout: 5000 })
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /isolated activity did not complete/)
  assert(!existsSync(outside), 'Invalid activity paths must not create a state directory')
  assert.deepEqual(readFileSync(clock), bytes, 'Rejected activity must not change the clock')
  const invalid = spawnSync(process.execPath, [activity, '--url', 'https://example.invalid'], { cwd: repo, env, encoding: 'utf8', timeout: 5000 })
  assert.equal(invalid.status, 1)
  console.log('OK: compiled rehearsal listener/health/shutdown and activity guard entry verified')
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve))
    child.kill('SIGKILL'); await stopped
  }
  rmSync(root, { recursive: true, force: true })
}

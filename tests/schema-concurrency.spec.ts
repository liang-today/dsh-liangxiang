import { Worker } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { BACKEND_SCHEMA_USER_VERSION } from '../src/backend/schema.ts'

it('rechecks schema after a competing upgrader commits a rejected receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'liangxiang-schema-race-'))
  const path = join(root, 'ledger.sqlite'), barrier = new SharedArrayBuffer(12), flags = new Int32Array(barrier)
  const initial = new DatabaseSync(path)
  initial.exec('PRAGMA journal_mode=WAL'); initial.close()
  const workers: Worker[] = []
  const program = `
    const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    (async () => {
      const { migrate } = await import(workerData.schema);
      const db = new DatabaseSync(workerData.path), flags = new Int32Array(workerData.barrier);
      db.exec('PRAGMA busy_timeout=10000');
      const exec = db.exec.bind(db);
      db.exec = sql => {
        if (sql === 'BEGIN IMMEDIATE') {
          if (!workerData.first) Atomics.store(flags, 1, 1);
          exec(sql);
          if (workerData.first) {
            Atomics.store(flags, 0, 1);
            if (Atomics.wait(flags, 2, 0, 10000) === 'timed-out') throw new Error('barrier timeout');
          }
          return;
        }
        if (workerData.first && sql === 'COMMIT') db.prepare(
          "INSERT INTO liang_vote_request(installation_id,request_id,case_id,business_date,vote_type,requested_count,result_status,rejection_reason,rejection_message,created_at) VALUES('test-reader','rejected-upgrade-intent','test-case','2026-08-16','up',1,'rejected','insufficient_incense','empty',1)"
        ).run();
        exec(sql);
      };
      try { migrate(db); } finally { db.close(); }
      parentPort.postMessage('done');
    })().catch(error => { parentPort.postMessage({ error: error.message }); process.exitCode = 1; });
  `
  const start = (first: boolean) => {
    const worker = new Worker(program, { eval: true, execArgv: [], workerData: {
      first, path, barrier, schema: new URL('../src/backend/schema.ts', import.meta.url).href } })
    workers.push(worker)
    return new Promise<void>((resolve, reject) => {
      worker.on('message', value => value === 'done' ? resolve() : reject(new Error(String(value.error))))
      worker.on('error', reject)
      worker.on('exit', code => { if (code !== 0) reject(new Error(`upgrade worker exited ${code}`)) })
    })
  }
  const until = async (index: number) => {
    const deadline = Date.now() + 10000
    while (Atomics.load(flags, index) !== 1) {
      if (Date.now() > deadline) throw new Error('test barrier timeout')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  try {
    const first = start(true)
    await until(0)
    const second = start(false)
    await until(1)
    Atomics.store(flags, 2, 1); Atomics.notify(flags, 2)
    await Promise.all([first, second])
    const db = new DatabaseSync(path)
    db.exec('PRAGMA busy_timeout=5000')
    try {
      expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: BACKEND_SCHEMA_USER_VERSION })
      expect(db.prepare("SELECT result_status FROM liang_vote_request WHERE request_id='rejected-upgrade-intent'").get()).toMatchObject({ result_status: 'rejected' })
    } finally { db.close() }
  } finally {
    Atomics.store(flags, 2, 1); Atomics.notify(flags, 2)
    await Promise.all(workers.map(worker => worker.terminate()))
    rmSync(root, { recursive: true, force: true })
  }
}, 15000)

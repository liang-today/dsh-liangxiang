import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { BACKEND_SCHEMA_USER_VERSION, migrate } from '../src/backend/schema.ts'
import { parseV1Bootstrap, parseV1SnapshotResponse } from '../src/shared/backend-v1.ts'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'

let fixture: BackendFixture | null = null

afterEach(() => {
  fixture?.close()
  fixture = null
})

describe('low-disruption client broadcast', () => {
  it('migrates an existing v9 database to the singleton broadcast table', () => {
    const db = new DatabaseSync(':memory:')
    migrate(db)
    db.exec('DROP TABLE client_broadcast; PRAGMA user_version = 9;')

    migrate(db)

    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: BACKEND_SCHEMA_USER_VERSION })
    expect(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'client_broadcast'",
    ).get()).toEqual({ name: 'client_broadcast' })
    db.close()
  })

  it('travels on bootstrap/snapshot and disappears automatically at expiry', () => {
    fixture = createBackendFixture()
    const f = fixture
    const notice = f.service.setBroadcast('QQ群 453683905 已开，来群里一起出梁案', 'important', 2)

    expect(parseV1Bootstrap(f.service.bootstrap('install-broadcast-1')).broadcast).toEqual(notice)
    expect(parseV1SnapshotResponse(f.service.snapshotResponse()).broadcast).toEqual(notice)

    f.clock.advance(2 * 60 * 60 * 1000)
    expect(parseV1SnapshotResponse(f.service.snapshotResponse()).broadcast).toBeNull()
    expect(f.service.broadcastStatus()).toEqual(notice)
    expect(f.service.clearBroadcast()).toBe(true)
    expect(f.service.broadcastStatus()).toBeNull()
  })

  it('bounds duration and message size so the fixed 梁小号 row stays usable', () => {
    fixture = createBackendFixture()
    const f = fixture
    expect(() => f.service.setBroadcast('', 'important', 1)).toThrow('non-empty')
    expect(() => f.service.setBroadcast('急'.repeat(81), 'emergency', 1)).toThrow('at most 80')
    expect(() => f.service.setBroadcast('一条消息', 'important', 0)).toThrow('integer in [1,720]')
  })
})

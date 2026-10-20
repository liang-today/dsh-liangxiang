import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { BACKEND_SCHEMA_USER_VERSION, migrate } from '../src/backend/schema.ts'

it('migrates v10 receipts without inventing a previously clamped acceptance', () => {
  const db = new DatabaseSync(':memory:')
  try {
    migrate(db)
    db.exec(`
      ALTER TABLE liang_vote DROP COLUMN accepted_incense;
      INSERT INTO daily_liang_case
        (id, business_date, title, status, token_per_incense, liangzi_policy_version, created_at, opened_at)
        VALUES ('case-old', '2026-10-19', '迁移测试', 'active', 50000, 'liangzi-v0.2-25-50-70-85-95', 1, 1);
      INSERT INTO liang_vote
        (request_id, installation_id, case_id, business_date, vote_type, requested_count, used_incense_after, remaining_incense_after, created_at)
        VALUES ('old-receipt', 'install-receipt-1', 'case-old', '2026-10-19', 'up', 500, 50, 750, 1);
      PRAGMA user_version = 10;
    `)
    migrate(db)
    migrate(db)
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: BACKEND_SCHEMA_USER_VERSION })
    expect(db.prepare('SELECT requested_count, accepted_incense, used_incense_after FROM liang_vote').get())
      .toEqual({ requested_count: 500, accepted_incense: null, used_incense_after: 50 })
    expect(() => db.exec('UPDATE liang_vote SET accepted_incense = 501')).toThrow()
    expect(() => db.exec('UPDATE liang_vote SET accepted_incense = 0')).toThrow()
  } finally { db.close() }
})

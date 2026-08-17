/**
 * Host `/v1` client: vote parse, and the recovery path when an older backend
 * accepts a vote but omits `global_snapshot` (the 502 / 「投票失败」 bug).
 */
import { describe, expect, it } from 'vitest'
import { createBackendClient } from '../src/host/backend-client.ts'
import {
  CLAIM_SOURCE_HOST_OBSERVED,
  LIANGZI_POLICY_VERSION,
  completeV1VoteResponse,
  isMissingVoteSnapshotError,
  parseV1VoteEnvelope,
  parseV1VoteResponse,
} from '../src/shared/backend-v1.ts'
import { WireError } from '../src/shared/wire.ts'

const PERSONAL = {
  business_date: '2026-08-16',
  claimed_effective_tokens: 150_000,
  claim_source: CLAIM_SOURCE_HOST_OBSERVED,
  claim_verified: false,
  earned_incense: 3,
  used_incense: 1,
  remaining_incense: 2,
  token_remainder: 0,
  tokens_to_next_incense: 50_000,
  token_per_incense: 50_000,
  version: 2,
  updated_at: 1_776_297_600_000,
}

const SNAPSHOT = {
  case_id: 'case-2026-08-16',
  business_date: '2026-08-16',
  up_votes: 1,
  down_votes: 0,
  total_incense: 1,
  unique_voters: 1,
  up_ratio: 1,
  down_ratio: 0,
  liangzi_state: 'liang_zu' as const,
  captured_at: 1_776_297_600_000,
  sequence: 2,
  policy_version: LIANGZI_POLICY_VERSION,
  lifetime_incense: 1,
  lifetime_voters: 1,
}

const ACTIVE_CASE = {
  id: 'case-2026-08-16',
  business_date: '2026-08-16',
  title: 'DeepSeek Harness 是夯还是拉',
  status: 'active',
  created_at: 1_776_297_600_000,
  token_per_incense: 50_000,
  liangzi_policy_version: LIANGZI_POLICY_VERSION,
}

const ACCEPTED_RESULT = {
  status: 'accepted',
  request_id: 'req-host-00001',
  vote_type: 'up',
  used_incense: 1,
  remaining_incense: 2,
  replayed: false,
}

function completeVoteBody() {
  return {
    schema_version: 1,
    result: ACCEPTED_RESULT,
    authoritative_personal_state: PERSONAL,
    snapshot_version: { sequence: 2, captured_at: SNAPSHOT.captured_at },
    global_snapshot: SNAPSHOT,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('parseV1VoteEnvelope / parseV1VoteResponse', () => {
  it('a complete vote body parses as a strict response', () => {
    const parsed = parseV1VoteResponse(completeVoteBody())
    expect(parsed.result.status).toBe('accepted')
    expect(parsed.global_snapshot.sequence).toBe(2)
    expect(parsed.snapshot_version.sequence).toBe(2)
  })

  it('remaps a stale server Liangzi label onto this binary\'s thresholds instead of 502', () => {
    // Staging still on 20% bands painted 梁神 at ~45%; current policy is 梁工.
    const body = completeVoteBody() as Record<string, unknown>
    body.global_snapshot = {
      ...SNAPSHOT,
      up_votes: 45,
      down_votes: 55,
      total_incense: 100,
      unique_voters: 3,
      up_ratio: 0.45,
      down_ratio: 0.55,
      liangzi_state: 'liang_shen',
      policy_version: 'liangzi-v0.1-20-40-60-80',
      lifetime_incense: 100,
      lifetime_voters: 3,
    }
    const parsed = parseV1VoteResponse(body)
    expect(parsed.result.status).toBe('accepted')
    expect(parsed.global_snapshot.up_votes).toBe(45)
    expect(parsed.global_snapshot.up_ratio).toBe(0.45)
    expect(parsed.global_snapshot.liangzi_state).toBe('liang_gong')
  })

  it('an older accepted body without global_snapshot is an envelope, not a response', () => {
    const body = completeVoteBody() as Record<string, unknown>
    delete body.global_snapshot
    delete body.snapshot_version

    const envelope = parseV1VoteEnvelope(body)
    expect(envelope.result.status).toBe('accepted')
    expect(envelope.authoritative_personal_state.remaining_incense).toBe(2)
    expect(envelope.global_snapshot).toBeNull()
    expect(envelope.snapshot_version).toBeNull()

    expect(() => parseV1VoteResponse(body)).toThrow(WireError)
    try {
      parseV1VoteResponse(body)
    } catch (error) {
      expect(error).toBeInstanceOf(WireError)
      expect((error as WireError).field).toBe('voteResponse.global_snapshot')
      expect(String(error)).toContain('voteResponse.global_snapshot: expected an object')
      expect(isMissingVoteSnapshotError(error)).toBe(true)
    }
  })

  it('null global_snapshot is treated as missing, not as a corrupt object', () => {
    const body = { ...completeVoteBody(), global_snapshot: null, snapshot_version: null }
    expect(parseV1VoteEnvelope(body).global_snapshot).toBeNull()
    expect(() => parseV1VoteResponse(body)).toThrow(/voteResponse.global_snapshot: expected an object/)
    expect(isMissingVoteSnapshotError(
      (() => {
        try {
          parseV1VoteResponse(body)
        } catch (error) {
          return error
        }
        return undefined
      })(),
    )).toBe(true)
  })

  it('a missing result is not a snapshot-recovery case', () => {
    const body = completeVoteBody() as Record<string, unknown>
    delete body.result
    expect(() => parseV1VoteEnvelope(body)).toThrow(WireError)
    try {
      parseV1VoteEnvelope(body)
    } catch (error) {
      expect(isMissingVoteSnapshotError(error)).toBe(false)
    }
  })

  it('completeV1VoteResponse stitches a published snapshot onto the envelope', () => {
    const envelope = parseV1VoteEnvelope({
      schema_version: 1,
      result: ACCEPTED_RESULT,
      authoritative_personal_state: PERSONAL,
    })
    const completed = completeV1VoteResponse(envelope, SNAPSHOT)
    expect(completed.global_snapshot.up_votes).toBe(1)
    expect(completed.snapshot_version.sequence).toBe(2)
    expect(parseV1VoteResponse(completed).result.status).toBe('accepted')
  })
})

describe('createBackendClient.vote snapshot recovery', () => {
  const intent = { case_id: 'case-2026-08-16', vote_type: 'up' as const, request_id: 'req-host-00001' }

  it('returns a complete vote when the backend already includes global_snapshot', async () => {
    const calls: string[] = []
    const client = createBackendClient({
      baseUrl: 'http://127.0.0.1:4180',
      fetchImpl: async (input) => {
        calls.push(String(input))
        return jsonResponse(completeVoteBody())
      },
    })
    const response = await client.vote('inst-host-0001', intent)
    expect(response.result.status).toBe('accepted')
    expect(response.global_snapshot.sequence).toBe(2)
    expect(calls).toEqual(['http://127.0.0.1:4180/v1/votes'])
    client.dispose()
  })

  it('GETs /v1/snapshot when an accepted vote omitted global_snapshot', async () => {
    const calls: string[] = []
    const client = createBackendClient({
      baseUrl: 'http://127.0.0.1:4180',
      fetchImpl: async (input) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith('/v1/votes')) {
          return jsonResponse({
            schema_version: 1,
            result: ACCEPTED_RESULT,
            authoritative_personal_state: PERSONAL,
          })
        }
        if (url.endsWith('/v1/snapshot')) {
          return jsonResponse({
            schema_version: 1,
            server_time: SNAPSHOT.captured_at,
            business_date: '2026-08-16',
            active_case: ACTIVE_CASE,
            global_snapshot: SNAPSHOT,
          })
        }
        return jsonResponse({ error: { code: 'unknown_route', message: url } }, 404)
      },
    })
    const response = await client.vote('inst-host-0001', intent)
    expect(response.result.status).toBe('accepted')
    if (response.result.status === 'accepted') {
      expect(response.result.remaining_incense).toBe(2)
    }
    expect(response.global_snapshot.up_votes).toBe(1)
    expect(response.global_snapshot.liangzi_state).toBe('liang_zu')
    expect(response.snapshot_version.sequence).toBe(2)
    expect(calls).toEqual([
      'http://127.0.0.1:4180/v1/votes',
      'http://127.0.0.1:4180/v1/snapshot',
    ])
    client.dispose()
  })

  it('does not fetch a snapshot when the vote body itself is invalid', async () => {
    const calls: string[] = []
    const client = createBackendClient({
      baseUrl: 'http://127.0.0.1:4180',
      fetchImpl: async (input) => {
        calls.push(String(input))
        return jsonResponse({ schema_version: 1 })
      },
    })
    await expect(client.vote('inst-host-0001', intent)).rejects.toBeInstanceOf(WireError)
    expect(calls).toEqual(['http://127.0.0.1:4180/v1/votes'])
    client.dispose()
  })
})

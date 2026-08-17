/**
 * Closed-beta defaults. The URL is public; the door-latch is NOT.
 *
 * A live passphrase belongs in `.env` as `LIANGBIAO_COMMUNITY_KEY` (gitignored)
 * or a local uncommitted edit of this file. Never commit a real key.
 */
export { STAGING_BACKEND_URL } from './community-endpoint.ts'

export const STAGING_COMMUNITY_KEY: string | null = null

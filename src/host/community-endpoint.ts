/**
 * Closed-beta community endpoint baked into the plugin so a Host does not
 * need `LIANGBIAO_BACKEND_URL` to try online mode. Force the in-process
 * loop with `LIANGBIAO_BACKEND_URL=local`. The shared door-latch still
 * comes from the environment (or a local untracked overlay) — never commit
 * a live passphrase here.
 */
export const STAGING_BACKEND_URL = 'http://203.0.113.11:26753'

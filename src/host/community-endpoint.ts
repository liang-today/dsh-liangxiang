/**
 * Closed-beta community endpoint baked into the plugin so a Host does not
 * need `LIANGXIANG_BACKEND_URL` to try online mode. Force the in-process
 * loop with `LIANGXIANG_BACKEND_URL=local`. Admission secrets are never
 * compiled into a distributable bundle; a closed staging node may receive
 * one through its process environment.
 */
export const STAGING_BACKEND_URL = 'https://api.liang.today'

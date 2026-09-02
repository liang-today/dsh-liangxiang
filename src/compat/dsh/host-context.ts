/**
 * compat/dsh — the only layer allowed to import DSH APIs directly.
 *
 * Host-side context alias. Host plugins are ordinary cordis object plugins
 * (`apply(ctx)` + optional `inject`). Verified against deepseek-harness
 * 0.1.2-alpha.4 @ 4e84901e: docs/user/develop/basic/index.md.
 */
export type { Context as DshHostContext } from '@deepseek-ai/cordis'

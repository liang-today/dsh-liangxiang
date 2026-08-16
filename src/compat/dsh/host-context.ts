/**
 * compat/dsh — the only layer allowed to import DSH APIs directly.
 *
 * Host-side context alias. Host plugins are ordinary cordis object plugins
 * (`apply(ctx)` + optional `inject`), per deepseek-harness
 * docs/user/develop/basic/index.md @ 47f94385.
 */
export type { Context as DshHostContext } from '@deepseek-ai/cordis'

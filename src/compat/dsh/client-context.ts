/**
 * compat/dsh — the only layer allowed to import DSH APIs directly.
 *
 * Client-side context alias. Source of truth:
 * packages/client/runtime/src/client/index.ts (`ClientContext`) @ 47f94385;
 * consumed here through the published `@deepseek-ai/dsh-client-runtime/client`
 * export (type-only, erased at build time).
 */
export type { ClientContext as DshClientContext } from '@deepseek-ai/dsh-client-runtime/client'

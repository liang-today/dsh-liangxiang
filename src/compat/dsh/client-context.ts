/**
 * compat/dsh — the only layer allowed to import DSH APIs directly.
 *
 * Client-side context alias. DSH 0.1.2-alpha.4 removed the former client
 * runtime package; browser plugins now receive the shared Cordis Context.
 * The renderer's published `/client` export declaration-merges `ctx.slots`
 * onto that context. Slot-specific declarations stay with their adapters.
 *
 * Verified against deepseek-harness 0.1.2-alpha.4 @ 4e84901e:
 * packages/client/ui-renderer/src/client/index.ts (`Context.slots`).
 */
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

export type { Context as DshClientContext } from '@deepseek-ai/cordis'

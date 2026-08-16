/**
 * Shared layer: serializable contracts and constants used by both the host
 * and client halves. Pure TypeScript only — no React, no DSH, no Node APIs.
 * Wire types (state snapshot, SSE frames, vote command) arrive with the
 * host↔client channel milestone.
 */

/** npm package name: the loader row `name`, the client bundle id, and the `/plugins/<id>/client.js` route segment. */
export const PLUGIN_PACKAGE_NAME = 'dsh-liangbiao'

/** Cordis plugin display name of the host half. */
export const HOST_PLUGIN_NAME = 'liangbiao'

/** Frozen product copy (AGENTS.md): the product name. */
export const PRODUCT_NAME = '梁标'

/** Frozen product copy (AGENTS.md, contract #8): the hover tooltip. Must remain exactly this string. */
export const HOVER_TEXT = '今日梁位'

/** List-entry id of the badge inside the `shell.overlay` slot. */
export const OVERLAY_ENTRY_ID = 'liangbiao'

/** List ordering of the badge entry among `shell.overlay` occupants. */
export const OVERLAY_ENTRY_ORDER = 100

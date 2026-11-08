import { PLUGIN_VERSION } from '../shared/index.ts'

/** Same-origin, immutable illustration bytes, fetched separately from client.js. */
export const MAIN_PANEL_ART = {
  nan: `/liangxiang/api/panel/art.webp?asset=nan&v=${encodeURIComponent(PLUGIN_VERSION)}`,
  grass: `/liangxiang/api/panel/art.webp?asset=grass&v=${encodeURIComponent(PLUGIN_VERSION)}`,
  fish: `/liangxiang/api/panel/art.webp?asset=fish&v=${encodeURIComponent(PLUGIN_VERSION)}`,
} as const

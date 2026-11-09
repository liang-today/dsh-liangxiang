import { PLUGIN_VERSION } from '../shared/index.ts'

const version = encodeURIComponent(PLUGIN_VERSION)
const panelArt = (asset: string): string => `/liangxiang/api/panel/art.webp?asset=${asset}&v=${version}`

/** Same-origin, immutable illustration bytes, fetched separately from client.js. */
export const MAIN_PANEL_ART = {
  nan: panelArt('nan'),
  grass: panelArt('grass'),
  fish: panelArt('fish'),
} as const

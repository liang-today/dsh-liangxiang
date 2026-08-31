/**
 * Decode the six inlined 梁子 portraits once. DSH still serves a single
 * client.js, so the bytes stay in the bundle; this only avoids re-decoding
 * the same data URI on every remount.
 */
const decoded = new Map<string, HTMLImageElement>()

export function preloadLiangziArt(urls: Readonly<Record<string, string>>): void {
  if (typeof Image === 'undefined') return
  for (const url of Object.values(urls)) {
    if (decoded.has(url)) continue
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    decoded.set(url, image)
  }
}

export function cachedLiangziArtCount(): number {
  return decoded.size
}

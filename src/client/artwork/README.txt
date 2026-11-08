# Sticker sources for 梁子 (256px).

Legacy JPEG originals keep the light-gray checkerboard plate. Punch that plate
out to PNG (flood-fill from the edges, stop at the black outline), encode a
lossless WebP with the same visible RGBA pixels, and inline that WebP into
liangzi-art.ts:

  python3 scripts/punch-liangzi-art.py
  node scripts/optimize-liangzi-art.mjs

In-art jokes only (UI copy is unchanged): the waiting plaque deliberately
reads 牢梁, while each active portrait may carry its matching state name as a
small chest badge/plaque. These marks are decorative and never authoritative.
nan.png is the approved 小难梁 portrait, resized to 256px with an optimized
palette from the 2026-10-18 concept. It has native alpha: the generator preserves
it directly instead of punching a JPEG. Its inlined WebP preserves every visible
RGBA pixel of this production PNG. Regeneration requires no image service.

牢梁 remains only a waiting-art plaque. 小难梁 is the new lowest voted tier
(<25% with votes); 老梁 remains forbidden.

The optional final optimizer uses lossless WebP quality 100 / effort 6 / exact
encoding. It compares every decoded RGBA byte before accepting a smaller
encoding; portrait dimensions, color and pixels must not change.

The approved pale-blue nan.png mirrors assets/main-nan.webp exactly. This one
portrait is served through the bounded Host panel-art route to avoid embedding
the larger new bitmap into client.js; the other six inline portraits retain
their original pixels. The ring and figures do not determine wallet authority.

# Market whale artwork

Original transparent artwork generated with the built-in imagegen tool for the
blue market view. The user's reference informed the palette and character
direction; the existing Liangzi portraits are unchanged.

`market-whale-source.png` retains the original 1230×1278 transparent image.
The shipped `market-whale.webp` is 493×512 pixels, 79,664 bytes, with alpha.
It is downsampled directly from that source with Sharp: height 512, no
enlargement, WebP quality 94, alpha quality 100, effort 6 and smart subsampling.
No character was redrawn and no new image generation or upscaling was used.
The source PNG is excluded from the npm package; only the WebP is served
separately on demand, within the existing 80 KB transfer budget. It supports
the roughly 81-pixel-tall header figure on dense displays without inlining
another data URI in the browser bundle. Motion, water and bubbles are local
presentation; the server stores no animation frames.

## Main-panel illustrations

The approved blue panel supplies three separate, transparent WebP files:
`main-nan.webp` (256×256, 58,538 bytes), `main-grass.webp` (109×128, 11,952 bytes),
and `main-fish.webp` (128×85, 4,556 bytes). Their bytes are copied directly from
the reviewed design, without redrawing, resampling or recoloring. Each is
served on demand by the Host's fixed allowlist at `/liangxiang/api/panel/art.webp`;
none is embedded as another data URI in the always-loaded browser bundle.
The grass and fish are decorative only. Water depth, growth, swimming and
bubbles remain local presentation of already-confirmed incense values.

## Generation prompt

Use case: stylized-concept. Asset type: a small transparent character sprite for
Liangxiang's blue incense trading interface. Input image is a style reference
only, not an edit target. Create one original, adorable rounded chibi blue
whale-girl mascot inspired by the reference's friendly blue-haired anime whale
aesthetic. She is a fully clothed adult character rendered as a compact cute
mascot: oversized head, very soft rounded silhouette, glossy gentle blue eyes,
long flowing cobalt-to-sky-blue hair, small whale-fin hair ornaments and a
visible rounded whale tail curling at her side. Wear a tasteful simple
navy-and-white sailor/maid-inspired dress with opaque fabric and a small blue
bow. Full body, centered and wholly visible, seated buoyantly with an inviting
happy expression, arms relaxed, no props. Clean polished 2D anime sticker
illustration, crisp readable contour suitable at 64–96px, fewer fine costume
details, limited blue/white palette, no surrounding water or bubbles (those
will be animated by UI). True transparent background and generous transparent
margin. No letters, logos, watermark, text, scenery, border, cast shadow,
checkerboard, or frame. Preserve the general charming blue cartoon vibe while
make an original design rather than tracing the reference.

# Sticker sources for 梁子 (256px).

JPEG originals keep the light-gray checkerboard plate. Punch that plate
out to PNG (flood-fill from the edges, stop at the black outline) and
inline the PNG into liangzi-art.ts:

  python3 scripts/punch-liangzi-art.py

#!/usr/bin/env python3
"""Punch the light-gray JPEG plate out of 梁子 stickers and inline PNGs."""

from __future__ import annotations

import base64
import os
import struct
import subprocess
import zlib
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'src' / 'client' / 'artwork'
OUT = ROOT / 'src' / 'client' / 'liangzi-art.ts'
STATES = [
    ('waiting', 'waiting'),
    ('gong', 'liang_gong'),
    ('zong', 'liang_zong'),
    ('shen', 'liang_shen'),
    ('sheng', 'liang_sheng'),
    ('zu', 'liang_zu'),
]
W = H = 256


def decode_jpg(path: Path) -> bytes:
    raw = subprocess.check_output([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(path),
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    ])
    if len(raw) != W * H * 3:
        raise RuntimeError(f'{path} decoded to {len(raw)} bytes')
    return raw


def pix(raw: bytes, x: int, y: int) -> tuple[int, int, int]:
    i = (y * W + x) * 3
    return raw[i], raw[i + 1], raw[i + 2]


def is_bg(r: int, g: int, b: int) -> bool:
    return max(r, g, b) - min(r, g, b) <= 18 and min(r, g, b) >= 210


def punch(raw: bytes) -> bytes:
    marked = [[False] * W for _ in range(H)]
    queue: deque[tuple[int, int]] = deque()

    def try_mark(x: int, y: int) -> None:
        if marked[y][x]:
            return
        r, g, b = pix(raw, x, y)
        if is_bg(r, g, b):
            marked[y][x] = True
            queue.append((x, y))

    for x in range(W):
        try_mark(x, 0)
        try_mark(x, H - 1)
    for y in range(H):
        try_mark(0, y)
        try_mark(W - 1, y)
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                try_mark(nx, ny)

    extra: list[tuple[int, int]] = []
    for y in range(H):
        for x in range(W):
            if marked[y][x]:
                continue
            r, g, b = pix(raw, x, y)
            if not is_bg(r, g, b):
                continue
            if any(
                0 <= x + dx < W and 0 <= y + dy < H and marked[y + dy][x + dx]
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                extra.append((x, y))
    for x, y in extra:
        marked[y][x] = True

    rgba = bytearray(W * H * 4)
    for y in range(H):
        for x in range(W):
            r, g, b = pix(raw, x, y)
            o = (y * W + x) * 4
            rgba[o] = r
            rgba[o + 1] = g
            rgba[o + 2] = b
            rgba[o + 3] = 0 if marked[y][x] else 255
    return bytes(rgba)


def write_png(path: Path, rgba: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    raw = b''.join(b'\x00' + rgba[y * W * 4:(y + 1) * W * 4] for y in range(H))
    ihdr = struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    path.write_bytes(png)


def main() -> None:
    uris: dict[str, str] = {}
    for file, state in STATES:
        jpg = ART / f'{file}.jpg'
        png = ART / f'{file}.png'
        rgba = punch(decode_jpg(jpg))
        write_png(png, rgba)
        uris[state] = 'data:image/png;base64,' + base64.b64encode(png.read_bytes()).decode('ascii')
        print(f'{file}: {png.stat().st_size} bytes')

    order = ['waiting', 'liang_gong', 'liang_zong', 'liang_shen', 'liang_sheng', 'liang_zu']
    lines = [
        '/**',
        ' * Compressed 梁子 portraits (256px PNG with punched-out sticker',
        ' * background, inlined so the DSH client bundle stays a single file).',
        ' * Source stickers live beside this module as artwork/*.jpg;',
        ' * regenerate with scripts/punch-liangzi-art.py.',
        ' *',
        ' * Art bible: one round-faced engineer, progressively 夯 into an ancestor.',
        ' * Semantics (WAITING / 梁工…梁祖) are frozen — only the pixels change.',
        ' */',
        "import type { LiangziState } from '../domain/index.ts'",
        '',
        'export const LIANGZI_ART: Record<LiangziState, string> = {',
    ]
    for state in order:
        lines.append(f"  {state}: '{uris[state]}',")
    lines.append('}')
    lines.append('')
    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    os.chdir(ROOT)
    main()

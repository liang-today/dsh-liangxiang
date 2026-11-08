import { createRequire } from 'node:module'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { MarketWhaleFigure, WaterMotion } from '../src/client/market/MarketWhaleFigure.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup(element: ReactElement): string }
const geometry = { x: 300, y: 100, width: 108, height: 112.34, waterY: 160, src: '/liangxiang/api/market/art.webp' }

describe('whale illustration and water decoration', () => {
  it('keeps the original bitmap in separately clipped pieces with complete-fish swimming', () => {
    const html = renderToStaticMarkup(<svg><MarketWhaleFigure {...geometry} mood="ahead" animated /></svg>)
    expect(html).toContain('data-pose="surface" data-motion="true"')
    expect(html).toContain('class="liangxiang-market-whale-tail"')
    expect(html).toContain('class="liangxiang-market-whale-hair"')
    expect(html).toContain('class="liangxiang-market-whale-swim"')
    expect(html.match(/data-liangxiang-market-whale-art=/g)).toHaveLength(1)
    expect(html).not.toContain('liangxiang-market-float')
    expect(html).not.toContain('foreignObject')
  })

  it('retains occlusion, underwater colour and bounded dive bubbles in static mode', () => {
    const html = renderToStaticMarkup(<svg><MarketWhaleFigure {...geometry} mood="behind" animated={false} /></svg>)
    expect(html).toContain('data-pose="dive" data-motion="false"')
    expect(html).toContain('data-liangxiang-market-water-occlusion="dive"')
    expect(html).toContain('data-liangxiang-market-underwater-tint="" data-tint-part="body" x="300" y="160"')
    expect(html).toContain('fill="#327ccc" opacity=".58"')
    expect(html.match(/class="liangxiang-market-whale-bubble"/g)).toHaveLength(3)
    expect(html).not.toContain('animation:')
    const neutral = renderToStaticMarkup(<svg><MarketWhaleFigure {...geometry} mood="waiting" animated /></svg>)
    expect(neutral).toContain('data-pose="neutral" data-motion="true"')
    expect(neutral).not.toContain('data-liangxiang-market-dive-bubbles')
  })

  it('moves underwater colour with each masked illustration piece, leaving no resting-colour ghost', () => {
    const html = renderToStaticMarkup(<svg><MarketWhaleFigure {...geometry} mood="behind" animated /></svg>)
    for (const piece of ['tail', 'hair']) {
      const group = html.match(new RegExp(`<g[^>]+data-liangxiang-market-whale-piece="${piece}"[^>]*>(.*?)</g>`))?.[0]
      expect(group).toBeDefined()
      expect(group).toContain('<image ')
      expect(group).toContain(`data-tint-part="${piece}"`)
      expect(group).toContain(`-${piece})`)
    }
    expect(html).toMatch(/data-liangxiang-market-steady-face="" clip-path="url\(#[^"]+-dry\)"><image/)
    expect(html).toMatch(/clip-path="url\(#[^"]+-wet\)" mask="url\(#[^"]+-occlusion\)" data-liangxiang-market-water-occlusion="dive"><image[^]+?data-tint-part="body"/)
    expect(html.match(/data-liangxiang-market-underwater-tint=/g)).toHaveLength(3)
  })

  it('clips every water effect to its supplied confirmed area, with a fixed small particle budget', () => {
    const areaPath = 'M10 100Q40 80 80 110V300H10Z'
    const html = renderToStaticMarkup(<svg><WaterMotion areaPath={areaPath} animated={false} /></svg>)
    expect(html).toContain(`d="${areaPath}"`)
    expect(html).toContain('clip-path="url(#liangxiang-market-water-')
    expect(html).toContain('data-motion="false"')
    expect(html.match(/<circle /g)).toHaveLength(4)
    expect(html).not.toContain('<image')
  })
})

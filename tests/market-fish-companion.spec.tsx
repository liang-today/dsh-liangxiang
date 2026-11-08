import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import type { ReactElement } from 'react'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { COMPANION_CSS, MarketFishCompanion } from '../src/client/market/MarketFishCompanion.tsx'
import { createFishFeedback, expireFishFeedback, fishDanmaku, fishFeedbackDuration, fishResponse, fishSpeechLines, receiveFishFeedback, type FishAction } from '../src/client/market/fish-feedback.ts'
import { fishLoadingFrames, fishMotion, MARKET_MOTION_CSS } from '../src/client/market/market-motion-style.ts'
import type { PositionMood } from '../src/client/market/chart-model.ts'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup(element: ReactElement): string }

describe('decorative header companion', () => {
  it('ships a source-derived dense-display sprite separately, without packing its larger source PNG', async () => {
    const source = await sharp(await readFile(new URL('../src/client/assets/market-whale-source.png', import.meta.url))).metadata()
    const bytes = await readFile(new URL('../src/client/assets/market-whale.webp', import.meta.url))
    const sprite = await sharp(bytes).metadata()
    expect([source.width, source.height]).toEqual([1230, 1278])
    expect([sprite.width, sprite.height]).toEqual([493, 512])
    expect(sprite.hasAlpha).toBe(true)
    expect(bytes.byteLength).toBeLessThanOrEqual(80_000)
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { files: string[] }
    expect(manifest.files).toContain('lib/market-whale.webp')
    expect(manifest.files.some(file => file.includes('market-whale-source'))).toBe(false)
  })
  it('has distinct water, underwater and waiting dialogue without a balance or payout promise', () => {
    expect(fishResponse('ahead', 'idle')).not.toBe(fishResponse('behind', 'idle'))
    expect(fishResponse('waiting', 'idle')).not.toBe(fishResponse('ahead', 'idle'))
    expect(fishResponse('behind', 'long')).toMatch(/^咕噜，/)
    expect(fishResponse('ahead', 'submit')).toBe('等账本点头～')
    expect(fishResponse('ahead', 'confirmed')).toContain('账本点头')
    const actions: FishAction[] = ['idle', 'submit', 'confirmed', 'withdraw', 'long', 'short', 'batch1', 'batch2', 'batch3', 'history', 'rules', 'motion', 'error', 'zoom-in', 'zoom-out', 'mode-candles', 'mode-tide', 'pan', 'inspect', 'reset', 'fullscreen', 'restore', 'amount', 'report', 'periodic', 'pool', 'position', 'newer', 'older', 'dismiss', 'retry', 'receipt']
    const moods: PositionMood[] = ['ahead', 'behind', 'waiting', 'even', 'won', 'lost', 'returned']
    for (const mood of moods) for (const action of actions) for (let variant = 0; variant < 8; variant++) {
      const text = fishResponse(mood, action, variant)
      expect(text.length).toBeLessThanOrEqual(24)
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/保证|必赚|稳赚|已到账|收益到账/)
    }
  })
  it('keeps the existing artwork and full speech as decoration outside the focus sequence', () => {
    const html = renderToStaticMarkup(<MarketFishCompanion mood="ahead" animated reaction={{ id: 1, action: 'submit' }} />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-liangxiang-market-main-whale')
    expect(html).toContain('viewBox="0 0 80 84"')
    expect(html.match(/data-liangxiang-market-whale-art=/g)).toHaveLength(1)
    expect(html).toContain('data-fish-action="submit"')
    expect(html).toContain('等回执')
    expect(html).not.toContain('aria-live')
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('<button')
    for (const css of [COMPANION_CSS, MARKET_MOTION_CSS]) {
      expect(css).toContain('.liangxiang-market-companion')
      expect(css).not.toContain('.~')
    }
  })
  it('retains an underwater pose when static or hidden and never enables decorative loops then', () => {
    for (const props of [{ animated: false }, { animated: true, visible: false }]) {
      const html = renderToStaticMarkup(<MarketFishCompanion mood="behind" {...props} reaction={null} />)
      expect(html).toContain('data-pose="dive"')
      expect(html).toContain('data-motion="false"')
      expect(html).toContain('data-liangxiang-market-water-occlusion="dive"')
      expect(html).toContain('咕噜')
    }
  })
  it('keeps the dry face out of raster masks while whole-body swimming, tail, hair and water retain motion', () => {
    for (const mood of ['ahead', 'behind', 'waiting'] as const) {
      const html = renderToStaticMarkup(<MarketFishCompanion mood={mood} animated reaction={null} />)
      const marker = html.indexOf('data-liangxiang-market-steady-face=')
      expect(marker).toBeGreaterThan(0)
      const ancestors: string[] = []
      for (const [tag] of html.slice(0, marker).matchAll(/<\/?g\b[^>]*>/g)) {
        if (tag.startsWith('</')) ancestors.pop()
        else ancestors.push(tag)
      }
      expect(ancestors.join('')).not.toMatch(/class="liangxiang-market-(?:companion-sway|whale-breath|whale-tail|whale-hair)"/)
      expect(ancestors.join('')).not.toMatch(/\bmask=/)
      expect(ancestors.join('')).toContain('class="liangxiang-market-whale-swim"')
      expect(html).toContain('clip-rule="evenodd"')
      expect(html).toContain('class="liangxiang-market-companion-sway"')
      expect(html).toContain('class="liangxiang-market-whale-tail"')
      expect(html).toContain('class="liangxiang-market-whale-hair"')
      if (mood !== 'waiting') expect(html).toContain('<ellipse class="liangxiang-market-whale-breath"')
    }
    expect(COMPANION_CSS).toContain('animation:liangxiang-market-fish-swim')
    expect(MARKET_MOTION_CSS).toContain('animation:liangxiang-market-body-swim')
    expect(MARKET_MOTION_CSS.match(/@keyframes liangxiang-market-body-swim\{[^@]+/)?.[0]).not.toContain('scale(')
    for (const name of ['breathe', 'tail', 'hair', 'ripple', 'dive-bubble']) expect(MARKET_MOTION_CSS).toContain(`animation:liangxiang-market-${name}`)
  })
  it('samples up to two current facts and one mood-specific click line without inventing a number', () => {
    const facts = Object.freeze(['梁位53.000000% · 梁总', 'P2香池40炷 · 多30 / 空10', '本盘做多5炷', '可用80炷 · 冻结20炷'])
    for (const mood of ['ahead', 'behind', 'waiting'] as const) for (let i = 0; i < 20; i++) {
      const lines = fishDanmaku(mood, facts, i)
      expect(lines).toHaveLength(3)
      expect(new Set(lines).size).toBe(3)
      expect(lines.slice(1).every(line => facts.includes(line))).toBe(true)
      expect(lines[0]).not.toMatch(/\d|稳赚|必赚|到账/)
    }
    expect(fishDanmaku('ahead', facts, 0)[0]).not.toBe(fishDanmaku('behind', facts, 0)[0])
    expect(fishDanmaku('waiting', [], 0)).toHaveLength(1)
    expect(fishDanmaku('waiting', [' 同一条 ', '同一条', ''], 0)).toHaveLength(2)
  })
  it('prepares two complete bounded loops with no bitmap zoom and keeps loading decorative', () => {
    const frames = fishLoadingFrames(100, 150, 30)
    expect(frames).toHaveLength(19)
    expect(frames[1]).toEqual(frames[9])
    expect(frames[9]).toEqual(frames[17])
    expect(frames.at(-1)?.transform).toBe('translate(100px,150px) rotate(0deg)')
    expect(JSON.stringify(frames)).not.toContain('scale')
    const html = renderToStaticMarkup(<MarketFishCompanion mood="waiting" animated loading reaction={null} />)
    expect(html).toContain('大肥鱼捕捞中')
    expect(html.match(/data-liangxiang-market-main-whale=/g)).toHaveLength(1)
    expect(html).not.toContain('aria-live')
  })
  it('preserves the supplied authoritative report and its line break without deriving balances or truncating copy', () => {
    const text = 'P1 · 11:00封盘，12:00定线\n多池 120 炷 · 空池 80 炷'
    const html = renderToStaticMarkup(<MarketFishCompanion mood="behind" animated={false} reaction={{ id: 1, action: 'report', text }} />)
    expect(html).toContain(text)
    expect(html).toContain('data-fish-action="report"')
    expect(html).toContain('data-motion="false"')
    expect(html).not.toContain('line-clamp')
    expect(html).not.toContain('aria-live')
  })
  it('preserves the clicked pool and position facts in motion and static mode instead of sampling a generic fish report', () => {
    for (const animated of [true, false]) for (const action of ['pool', 'position'] as const) {
      const text = action === 'pool' ? '多30炷，占60%\n空20炷，占40%' : '梁位55.000000% · 梁总\n夯55票 · 拉45票'
      const html = renderToStaticMarkup(<MarketFishCompanion mood="ahead" animated={animated} facts={['过时事实不应覆盖本次点击']} reaction={{ id: 1, action, text, deliberate: true }} />)
      for (const line of text.split('\n')) expect(html).toContain(`>${line}</span>`)
      expect(html).toContain(`data-fish-action="${action}"`)
      expect(html).not.toContain('过时事实')
      expect(html).not.toContain('aria-live')
    }
  })
  it('replies to each deliberate repeat without letting periodic or idle chatter replace the operation', () => {
    for (const action of ['pool', 'position', 'newer', 'older', 'dismiss', 'retry', 'receipt'] as const) {
      let state = createFishFeedback({ id: 1, action, deliberate: true }, 0)
      state = receiveFishFeedback(state, { id: 2, action, deliberate: true }, 100)
      expect(state.active?.id).toBe(2)
      for (const [id, low] of [[3, 'periodic'], [4, 'idle']] as const) state = receiveFishFeedback(state, { id, action: low }, 200)
      expect(state.active?.id).toBe(2)
      expect(expireFishFeedback(state, state.until).active).toBeNull()
      const html = renderToStaticMarkup(<MarketFishCompanion mood="behind" animated={false} reaction={{ id: 1, action }} />)
      expect(html).toContain('data-motion="false"')
      expect(html).toContain('data-speech-motion="false"')
      expect(html).toContain('data-pose="dive"')
    }
    expect(fishMotion('newer')!.frames[1]!.transform).toContain('translate(7px,-1px)')
    expect(fishMotion('older')!.frames[1]!.transform).toContain('translate(-7px,-1px)')
  })
  it('uses one card-free line container for idle, reports and every operation, including static copy', () => {
    for (const reaction of [null, { id: 1, action: 'report' as const, text: '16:00封盘\n香池40炷' }, { id: 2, action: 'confirmed' as const, text: '已确认空7炷' }, { id: 3, action: 'periodic' as const, text: '17:00定线\n多30 / 空10' }]) {
      const html = renderToStaticMarkup(<MarketFishCompanion mood="ahead" animated={false} reaction={reaction} />)
      expect(html.match(/class="liangxiang-market-companion-speech liangxiang-market-companion-danmaku"/g)).toHaveLength(1)
      expect(html.match(/data-liangxiang-market-danmaku=/g)?.length).toBeGreaterThanOrEqual(1)
      expect(html).toContain('data-speech-motion="false"')
      if (reaction?.text) for (const line of reaction.text.split('\n')) expect(html).toContain(`>${line}</span>`)
    }
    expect(MARKET_MOTION_CSS).not.toContain('visibility:hidden')
  })
  it('keeps all supplied text within three rows and ends the click report without restoring a second bubble', () => {
    expect(fishSpeechLines(' 第一行 \n第二行\n第三行\n第四行\n第五行')).toEqual(['第一行', '第二行', '第三行 · 第四行 · 第五行'])
    expect(fishSpeechLines('一\r\n\r\n二')).toEqual(['一', '二'])
    const reaction = { id: 1, action: 'report' as const, text: 'P1香池40炷\n16:00封盘' }
    const state = createFishFeedback(reaction, 100)
    expect(fishFeedbackDuration(reaction)).toBe(5_200)
    expect(expireFishFeedback(state, 5_299).active).toEqual(reaction)
    expect(expireFishFeedback(state, 5_300).active).toBeNull()
  })
  it('keeps a continuous zoom gesture to one readable response without extending its lifetime', () => {
    let state = createFishFeedback({ id: 1, action: 'zoom-in' }, 0)
    for (let id = 2; id <= 12; id++) state = receiveFishFeedback(state, { id, action: id % 2 ? 'zoom-out' : 'zoom-in' }, (id - 1) * 500)
    expect(state.until).toBe(4_000)
    expect(state.active).toBeNull()
    state = receiveFishFeedback(state, { id: 13, action: 'zoom-out' }, 7_000)
    expect(state.active?.id).toBe(13)
    expect(state.until).toBe(11_000)
    state = receiveFishFeedback(state, { id: 14, action: 'history' }, 7_100)
    expect(state.active?.action).toBe('history')
  })
  it('lets readers finish the zoom line after a brief pause, while a deliberate report responds immediately', () => {
    let state = createFishFeedback({ id: 1, action: 'zoom-in' }, 0)
    state = receiveFishFeedback(state, { id: 2, action: 'zoom-out' }, 1_500)
    expect(state.active?.id).toBe(1)
    expect(state.until).toBe(4_000)
    state = receiveFishFeedback(state, { id: 3, action: 'error', text: '原单待核对' }, 1_600)
    state = receiveFishFeedback(state, { id: 4, action: 'report', text: 'P1 多池120炷\n空池80炷' }, 1_700)
    expect(state.active?.action).toBe('report')
    expect(state.active?.text).toContain('\n')
  })
  it('answers deliberate opposite zoom buttons while combining passive wheel samples', () => {
    let state = createFishFeedback({ id: 1, action: 'zoom-in' }, 0)
    state = receiveFishFeedback(state, { id: 2, action: 'zoom-out', deliberate: true }, 200)
    expect(state.active?.action).toBe('zoom-out')
    expect(state.until).toBe(4_200)
    state = receiveFishFeedback(state, { id: 3, action: 'zoom-in' }, 300)
    expect(state.active?.id).toBe(3)
    state = receiveFishFeedback(state, { id: 4, action: 'zoom-out' }, 400)
    expect(state.active?.id).toBe(3)
  })
  it('drops low-priority periodic reports during operations or errors and never queues them for later', () => {
    let state = createFishFeedback({ id: 1, action: 'submit' }, 0)
    state = receiveFishFeedback(state, { id: 2, action: 'periodic', text: 'P1 还有十分钟封盘' }, 1_000)
    expect(state.active?.action).toBe('submit')
    state = receiveFishFeedback(state, { id: 3, action: 'error', text: '原单待核对' }, 1_100)
    state = receiveFishFeedback(state, { id: 4, action: 'periodic', text: 'P1 还有九分钟封盘' }, 2_000)
    expect(state.active?.action).toBe('error')
    state = expireFishFeedback(state, 5_100)
    expect(state.active).toBeNull()
    state = receiveFishFeedback(state, { id: 4, action: 'periodic', text: '旧报告不得重放' }, 5_200)
    expect(state.active).toBeNull()
    state = receiveFishFeedback(state, { id: 5, action: 'report', text: 'P1 多池120炷\n空池80炷' }, 5_300)
    expect(state.active?.action).toBe('report')
  })
  it('gives longer factual reports reading time while accepting the next different button immediately', () => {
    const text = 'P1参考线已确定；当前已确认做多十炷，若此刻收盘预计返还十五炷。\n结果以午夜服务器结算回执为准。'
    let state = createFishFeedback({ id: 1, action: 'report', text }, 0)
    expect(state.until).toBeGreaterThan(4_000)
    state = receiveFishFeedback(state, { id: 2, action: 'rules' }, 100)
    expect(state.active?.action).toBe('rules')
    expect(state.until).toBe(4_100)
  })
  it('assigns distinct acting directions instead of replaying one generic swim', () => {
    const actions: FishAction[] = ['long', 'short', 'submit', 'confirmed', 'withdraw', 'batch1', 'batch2', 'batch3', 'zoom-in', 'zoom-out', 'mode-candles', 'mode-tide', 'pan', 'inspect', 'reset', 'history', 'rules', 'motion', 'fullscreen', 'restore', 'amount', 'report', 'periodic', 'error', 'pool', 'position', 'newer', 'older', 'dismiss', 'retry', 'receipt']
    const motions = actions.map(action => fishMotion(action)!)
    expect(new Set(motions.map(motion => JSON.stringify(motion.frames))).size).toBe(actions.length)
    expect(fishMotion('short')?.accent).toBe('bubbles')
    expect(fishMotion('confirmed')?.accent).toBe('stamp')
    expect(fishMotion('report')?.accent).toBe('bubbles')
    expect(fishMotion('report')?.frames[1]?.transform).toContain('translate(0px,-8px)')
    expect(fishMotion('report')?.frames.length).toBeGreaterThan(fishMotion('periodic')!.frames.length)
    expect(fishMotion('idle')).toBeNull()
    expect(fishMotion('long')?.frames[1]?.transform).toContain('translate(0px,-6px)')
    expect(fishMotion('short')?.frames[1]?.transform).toContain('translate(2px,6px)')
    for (const motion of motions) {
      expect(motion.frames[0]).toEqual(motion.frames.at(-1))
      expect(motion.duration).toBeLessThanOrEqual(1_200)
    }
  })
})

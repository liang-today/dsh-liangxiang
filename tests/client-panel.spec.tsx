/**
 * Panel structure (frozen UI contract): four regions, exactly two vote
 * buttons, concrete avatar (not a gauge), LiangQi copy integrated into the
 * ring, WAITING placeholder, disabled reason at zero incense.
 */
import { describe, expect, it } from 'vitest'
import { LiangAvatar } from '../src/client/LiangAvatar.tsx'
import { AVATAR_SLOT, RING_SIZE } from '../src/client/LiangQiRing.tsx'
import { Panel } from '../src/client/Panel.tsx'
import { createMockLiangbiaoStore } from '../src/client/store.ts'
import type { LiangbiaoViewState } from '../src/client/store.ts'
import { LIANGZI_STATES, liangQiFloatPeriodMs } from '../src/domain/index.ts'
import {
  INCENSE_STAT_LABEL,
  LOCAL_MODE_NOTE,
  NO_INCENSE_REASON,
  PANEL_TITLE,
  RECONCILE_CONFIRM_CANCEL,
  RECONCILE_CONFIRM_OK,
  RECONCILE_CONFIRM_PROMPT,
  RECONCILE_HINT,
  RECONCILE_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_UP_LABEL,
  VOTER_STAT_LABEL,
  DEV_CREDIT_LABEL,
} from '../src/shared/index.ts'
import { findAll, findByAttr, renderDeep, styleOf, textContent, type RenderedElement, type RenderedNode } from './helpers/render.ts'

/** Visible 下一炷 caption/value, excluding the hover weight table. */
function visibleNextIncenseText(node: RenderedElement | undefined): string {
  if (node === undefined) return ''
  const visible = node.children.filter((child) =>
    child.kind !== 'element' || !('data-liangbiao-weight-hint' in child.props))
  return textContent(visible)
}

function renderPanel(
  state: LiangbiaoViewState,
  voteFeedback = '',
  extra: {
    reconcilePending?: boolean
    onReconcileAsk?: () => void
    onReconcileConfirm?: () => void
    onReconcileCancel?: () => void
    onDevCredit?: () => void
  } = {},
): RenderedNode[] {
  return renderDeep(
    <Panel
      state={state}
      reducedMotion={false}
      avatarPulse={false}
      justCondensed={false}
      voteFeedback={voteFeedback}
      onVote={() => undefined}
      onClose={() => undefined}
      reconcilePending={extra.reconcilePending ?? false}
      onReconcileAsk={extra.onReconcileAsk ?? (() => undefined)}
      onReconcileConfirm={extra.onReconcileConfirm ?? (() => undefined)}
      onReconcileCancel={extra.onReconcileCancel ?? (() => undefined)}
      {...(extra.onDevCredit !== undefined ? { onDevCredit: extra.onDevCredit } : {})}
    />,
  )
}

const demoState = (): LiangbiaoViewState => createMockLiangbiaoStore().getSnapshot()

describe('four visual regions', () => {
  it('renders exactly case / core / vote / social, in order', () => {
    const tree = renderPanel(demoState())
    const regions = findByAttr(tree, 'data-liangbiao-region')
    expect(regions.map((node) => node.props['data-liangbiao-region'])).toEqual([
      'case',
      'core',
      'vote',
      'social',
    ])
  })

  it('is a dialog titled 今日梁案 showing the single active case', () => {
    const tree = renderPanel(demoState())
    const dialog = findAll(tree, (node) => node.props.role === 'dialog')
    expect(dialog).toHaveLength(1)
    expect(dialog[0]?.props['aria-label']).toBe(PANEL_TITLE)
    expect(textContent(tree)).toContain('DeepSeek Harness 是夯还是拉')
  })

  it('centers the case region and keeps the trust mode out of the visible copy', () => {
    const tree = renderPanel(demoState())
    const header = findByAttr(tree, 'data-liangbiao-region', 'case')[0]
    expect(styleOf(header).textAlign).toBe('center')
    // Local soft-trust stays honest via the attribute + screen-reader summary,
    // not a visible badge next to the title.
    expect(header === undefined ? '' : textContent([header])).not.toContain('本地演示')
    const caseTitle = findByAttr(tree, 'data-liangbiao-case-title')[0]
    expect(styleOf(findAll(header === undefined ? [] : [header], (node) => node.type === 'h2')[0]).fontSize).toBe('13px')
    expect(styleOf(caseTitle).fontSize).toBe('15px')
    expect(styleOf(caseTitle).whiteSpace).toBe('nowrap')
    const dialog = findAll(tree, (node) => node.props.role === 'dialog')[0]
    expect(dialog?.props['data-liangbiao-authority']).toBe('LOCAL_FAKE_DEV')
    const summary = findAll(tree, (node) => node.props['aria-live'] === 'polite')[0]
    expect(summary && textContent([summary])).toContain(LOCAL_MODE_NOTE)
  })
})

describe('region 2: 香火 | 梁子 + 梁位 | 下一炷', () => {
  it('flanks the 梁子 with the personal numbers and leads with one 梁位 value', () => {
    const tree = renderPanel(demoState())
    const incense = findByAttr(tree, 'data-liangbiao-personal', 'incense')[0]
    const next = findByAttr(tree, 'data-liangbiao-personal', 'next-incense')[0]
    const position = findByAttr(tree, 'data-liangbiao-liang-position')[0]
    expect(incense && textContent([incense])).toContain('5 炷')
    const nextVisible = visibleNextIncenseText(next)
    expect(nextVisible).toContain('3K')
    expect(nextVisible).not.toContain('3,000')
    expect(nextVisible).toContain('当量')
    expect(nextVisible).not.toContain('Token')
    expect(next?.props.tabIndex).toBe(0)
    // 10,665/12,846 = 83.0219…%, truncated to six decimals.
    expect(position && textContent([position])).toContain('梁位')
    expect(position && textContent([position])).toContain('83.021952%')
    expect(findByAttr(tree, 'data-liangbiao-avatar', 'liang_sheng')).toHaveLength(1)
    expect(textContent(tree)).toContain('梁圣')
  })

  it('bobs the panel 梁子 with the logo: fill drives cadence, fill 0 is still', () => {
    const filling = renderPanel(demoState())
    const fillingFigure = findByAttr(filling, 'data-liangbiao-avatar-figure')[0]
    expect(demoState().personal.liangQiFill).toBeCloseTo(0.94, 10)
    expect(fillingFigure?.props['data-liangbiao-float-ms']).toBe(liangQiFloatPeriodMs(0.94))
    expect(styleOf(fillingFigure).animation).toContain('liangbiao-avatar-figure-float')

    const still = renderPanel(createMockLiangbiaoStore({ effectiveTokensToday: 50_000, usedIncenseToday: 0 }).getSnapshot())
    const stillFigure = findByAttr(still, 'data-liangbiao-avatar-figure')[0]
    expect(stillFigure?.props['data-liangbiao-float-ms']).toBe(0)
    expect(styleOf(stillFigure).animation).toBeUndefined()
  })

  it('keeps 拉 as the complement in the tooltip instead of a second big number', () => {
    const tree = renderPanel(demoState())
    const position = findByAttr(tree, 'data-liangbiao-liang-position')[0]
    expect(position?.props.title).toBe('夯 83.021952% / 拉 16.978048%')
  })

  it('pins the 梁位 value to the ring footer (one value, not a ratio pair)', () => {
    const tree = renderPanel(demoState())
    const ring = findByAttr(tree, 'data-liangbiao-ring')[0]
    expect(ring).toBeDefined()
    const footer = ring === undefined ? [] : findByAttr([ring], 'data-liangbiao-ring-footer')
    expect(footer).toHaveLength(1)
    expect(footer[0] && textContent([footer[0]])).toContain('83.021952%')
    // The old up/down pair must not come back.
    expect(findByAttr(tree, 'data-liangbiao-ratio')).toHaveLength(0)
  })

  it('never rounds 梁位 past the threshold of the rendered state', () => {
    // 449/501 = 89.6207…% -> 梁圣; rounding up would look like a 梁祖 mismatch.
    const store = createMockLiangbiaoStore({ upVotes: 449, downVotes: 52, uniqueVoters: 40 })
    const tree = renderPanel(store.getSnapshot())
    const position = findByAttr(tree, 'data-liangbiao-liang-position')[0]
    expect(position && textContent([position])).toContain('89.620758%')
    expect(findByAttr(tree, 'data-liangbiao-avatar', 'liang_sheng')).toHaveLength(1)
  })

  it('moves the 梁位 value on a single accepted vote', async () => {
    const store = createMockLiangbiaoStore({ upVotes: 10_665, downVotes: 2_181, uniqueVoters: 2_841 })
    const before = findByAttr(renderPanel(store.getSnapshot()), 'data-liangbiao-liang-position')[0]
    await store.vote('up')
    const after = findByAttr(renderPanel(store.getSnapshot()), 'data-liangbiao-liang-position')[0]
    // The whole point of the decimals: one vote is visible.
    expect(before && textContent([before])).not.toBe(after && textContent([after]))
  })

  it('keeps the 梁子 on the panel centerline as the numbers change', () => {
    const small = createMockLiangbiaoStore({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    const large = createMockLiangbiaoStore({
      upVotes: 1_000_000,
      downVotes: 999,
      uniqueVoters: 900_000,
      effectiveTokensToday: 9_999_000,
      usedIncenseToday: 0,
    })
    for (const state of [small.getSnapshot(), large.getSnapshot()]) {
      const tree = renderPanel(state)
      const core = styleOf(findByAttr(tree, 'data-liangbiao-region', 'core')[0])
      const anchor = styleOf(findByAttr(tree, 'data-liangbiao-core-anchor')[0])
      const incense = styleOf(findByAttr(tree, 'data-liangbiao-personal', 'incense')[0])
      const next = styleOf(findByAttr(tree, 'data-liangbiao-personal', 'next-incense')[0])
      const pill = styleOf(findByAttr(tree, 'data-liangbiao-liang-position')[0])
      const social = findByAttr(tree, 'data-liangbiao-stat')
      // In-flow column is the ring only; flanks overlay and cannot shove it.
      expect(core.position).toBe('relative')
      expect(anchor.justifyContent).toBe('center')
      expect(incense.position).toBe('absolute')
      expect(next.position).toBe('absolute')
      expect(incense.left).toBe('0px')
      expect(next.right).toBe('0px')
      expect(incense.width).toBe(next.width)
      expect(incense.height).toBe(`${RING_SIZE}px`)
      expect(next.height).toBe(`${RING_SIZE}px`)
      expect(pill.width).toBe('132px')
      expect(styleOf(findByAttr(tree, 'data-liangbiao-ring-footer')[0]).top).toBe('100%')
      expect(styleOf(findByAttr(tree, 'data-liangbiao-ring-footer')[0]).marginTop).toBe('8px')
      expect(styleOf(findByAttr(tree, 'data-liangbiao-avatar')[0]).width).toBe(AVATAR_SLOT)
      expect(styleOf(findAll(tree, (node) => node.props.role === 'dialog')[0]).width).toBe('312px')
      expect(social.map((node) => styleOf(node).flex)).toEqual(['1 1 0', '1 1 0'])
    }
    const value = styleOf(findByAttr(renderPanel(small.getSnapshot()), 'data-liangbiao-liang-position-value')[0])
    expect(value.fontVariantNumeric).toBe('tabular-nums')
  })

  it('compacts flank counts so thousands stay short (and keeps exact values in the tooltip / SR)', () => {
    const demo = renderPanel(demoState())
    expect(textContent(findByAttr(demo, 'data-liangbiao-compact', 'incense'))).toBe('5')
    expect(textContent(findByAttr(demo, 'data-liangbiao-compact', 'next-incense'))).toBe('3K')
    expect(findByAttr(demo, 'data-liangbiao-compact', 'next-incense')[0]?.props.title).toBe('3,000 当量')
    expect(textContent(demo)).toContain('距下一炷还差 3,000 当量')
    expect(textContent(demo)).toContain('攒香按 Pro 当量')
    expect(textContent(demo)).toContain('V4-Flash')

    // 1,234 炷 / 50,000 当量 — the previous tests never reached this width.
    const huge = createMockLiangbiaoStore({
      effectiveTokensToday: 1_234 * 50_000,
      usedIncenseToday: 0,
    })
    const tree = renderPanel(huge.getSnapshot())
    expect(huge.getSnapshot().personal.remainingIncense).toBe(1_234)
    expect(huge.getSnapshot().personal.tokensToNextIncense).toBe(50_000)
    expect(textContent(findByAttr(tree, 'data-liangbiao-compact', 'incense'))).toBe('1.2K')
    expect(textContent(findByAttr(tree, 'data-liangbiao-compact', 'next-incense'))).toBe('50K')
    expect(findByAttr(tree, 'data-liangbiao-personal', 'incense')[0]
      && findByAttr(tree, 'data-liangbiao-compact', 'incense')[0]).toBeDefined()
    const incenseValue = findByAttr(tree, 'data-liangbiao-personal', 'incense')[0]
    expect(incenseValue && textContent([incenseValue])).toContain('1.2K')
    expect(incenseValue && textContent([incenseValue])).not.toContain('1,234')

    const tinyNext = createMockLiangbiaoStore({ effectiveTokensToday: 49_991, usedIncenseToday: 0 })
    expect(tinyNext.getSnapshot().personal.tokensToNextIncense).toBe(9)
    expect(textContent(findByAttr(renderPanel(tinyNext.getSnapshot()), 'data-liangbiao-compact', 'next-incense'))).toBe('9')
  })

  it('moves the visible 下一炷 count when usage grows (compact must not swallow the delta)', () => {
    const nextFlank = (state: LiangbiaoViewState) => {
      const tree = renderPanel(state)
      return {
        compact: textContent(findByAttr(tree, 'data-liangbiao-compact', 'next-incense')),
        label: String(findByAttr(tree, 'data-liangbiao-personal', 'next-incense')[0]?.props['aria-label'] ?? ''),
        title: String(findByAttr(tree, 'data-liangbiao-compact', 'next-incense')[0]?.props.title ?? ''),
      }
    }

    // Under 1K: exact digits, so a 200-当量 delta cannot hide.
    const small = createMockLiangbiaoStore({ effectiveTokensToday: 49_200, usedIncenseToday: 0 })
    expect(small.getSnapshot().personal.tokensToNextIncense).toBe(800)
    const beforeSmall = nextFlank(small.getSnapshot())
    expect(beforeSmall.compact).toBe('800')
    small.addEffectiveTokens(200)
    expect(small.getSnapshot().personal.tokensToNextIncense).toBe(600)
    const afterSmall = nextFlank(small.getSnapshot())
    expect(afterSmall.compact).toBe('600')
    expect(afterSmall.label).not.toBe(beforeSmall.label)
    expect(afterSmall.title).toBe('600 当量')

    // Typical 30K band: one-decimal K must tick (integer K froze 33,xxx as 33K).
    const mid = createMockLiangbiaoStore({ effectiveTokensToday: 16_600, usedIncenseToday: 0 })
    expect(mid.getSnapshot().personal.tokensToNextIncense).toBe(33_400)
    const beforeMid = nextFlank(mid.getSnapshot())
    expect(beforeMid.compact).toBe('33.4K')
    expect(beforeMid.title).toBe('33,400 当量')
    mid.addEffectiveTokens(300)
    expect(mid.getSnapshot().personal.tokensToNextIncense).toBe(33_100)
    const afterMid = nextFlank(mid.getSnapshot())
    expect(afterMid.compact).toBe('33.1K')
    expect(afterMid.compact).not.toBe(beforeMid.compact)
    expect(afterMid.label).toContain('33,100')
    expect(afterMid.label).not.toBe(beforeMid.label)
  })

  it('pops the 梁位 value when it moves, and never under reduced motion', () => {
    const state = demoState()
    const pulsing = renderDeep(
      <Panel
        state={state}
        reducedMotion={false}
        avatarPulse={false}
        justCondensed={false}
        voteFeedback=""
        positionPulse
        onVote={() => undefined}
        onClose={() => undefined}
        reconcilePending={false}
        onReconcileAsk={() => undefined}
        onReconcileConfirm={() => undefined}
        onReconcileCancel={() => undefined}
      />,
    )
    const pulsingValue = styleOf(findByAttr(pulsing, 'data-liangbiao-liang-position-value')[0])
    expect(String(pulsingValue.animation)).toContain('liangbiao-position-pop')

    const reduced = renderDeep(
      <Panel
        state={state}
        reducedMotion
        avatarPulse={false}
        justCondensed={false}
        voteFeedback=""
        positionPulse
        onVote={() => undefined}
        onClose={() => undefined}
        reconcilePending={false}
        onReconcileAsk={() => undefined}
        onReconcileConfirm={() => undefined}
        onReconcileCancel={() => undefined}
      />,
    )
    expect(styleOf(findByAttr(reduced, 'data-liangbiao-liang-position-value')[0]).animation).toBeUndefined()
  })

  it('spells out the exact 夯率 band of the current state in the tooltip', () => {
    const tree = renderPanel(demoState())
    const tooltips = findAll(tree, (node) => node.props.title === '梁圣：80% ≤ 夯率 < 90%')
    expect(tooltips.length).toBeGreaterThan(0)
  })

  it('draws 9 stick glyphs around the ring instead of 8 uncountable dots', () => {
    const store = createMockLiangbiaoStore({ effectiveTokensToday: 9 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(9)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangbiao-incense-mark', 'one')).toHaveLength(9)
    expect(findByAttr(tree, 'data-liangbiao-incense-glyph', 'stick')).toHaveLength(9)
    expect(findByAttr(tree, 'data-liangbiao-incense-mark', 'ten')).toHaveLength(0)
    const ring = findByAttr(tree, 'data-liangbiao-ring')[0]
    expect(styleOf(ring).overflow).toBe('visible')
  })

  it('puts moons on a separate orbit so a moon never steals a stick slot', () => {
    const store = createMockLiangbiaoStore({ effectiveTokensToday: 23 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(23)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangbiao-incense-glyph', 'stick')).toHaveLength(3)
    expect(findByAttr(tree, 'data-liangbiao-incense-glyph', 'moon')).toHaveLength(2)
  })

  it('puts suns on an inner orbit so 105 is 5 炷 + 1 日', () => {
    const store = createMockLiangbiaoStore({ effectiveTokensToday: 105 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(105)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangbiao-incense-glyph', 'stick')).toHaveLength(5)
    expect(findByAttr(tree, 'data-liangbiao-incense-glyph', 'moon')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangbiao-incense-glyph', 'sun')).toHaveLength(1)
  })

  it('drops glyphs at 1000+ and shows a compact chip instead of ten moons', () => {
    const store = createMockLiangbiaoStore({ effectiveTokensToday: 1_000 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(1_000)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangbiao-incense-mark', 'one')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangbiao-incense-mark', 'ten')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangbiao-incense-mark', 'hundred')).toHaveLength(0)
    const overflow = findByAttr(tree, 'data-liangbiao-incense-overflow')
    expect(overflow).toHaveLength(1)
    expect(overflow[0] && textContent([overflow[0]])).toContain('1K')
  })

  it('keeps a Pro-equivalent weight table on the next-incense flank', () => {
    const tree = renderPanel(demoState())
    const hint = findByAttr(tree, 'data-liangbiao-weight-hint')[0]
    expect(hint).toBeDefined()
    const copy = hint === undefined ? '' : textContent([hint])
    expect(copy).toContain('攒香按 Pro 当量')
    expect(copy).toContain('V4-Pro')
    expect(copy).toContain('×1')
    expect(copy).toContain('V4-Flash')
    expect(copy).toContain('×0.5')
  })

  it('shows 演示 +1 炷 when the credit callback is wired', () => {
    expect(findByAttr(renderPanel(demoState()), 'data-liangbiao-dev-credit')).toHaveLength(0)
    const tree = renderPanel(demoState(), '', { onDevCredit: () => undefined })
    expect(findByAttr(tree, 'data-liangbiao-dev-credit')).toHaveLength(1)
    expect(textContent(tree)).toContain(DEV_CREDIT_LABEL)
  })

  it('zero votes: “--” 梁位 and the 待开梁 placeholder', () => {
    const store = createMockLiangbiaoStore({ upVotes: 0, downVotes: 0, uniqueVoters: 0 })
    const tree = renderPanel(store.getSnapshot())
    const position = findByAttr(tree, 'data-liangbiao-liang-position')[0]
    expect(position && textContent([position])).toContain('--')
    expect(findByAttr(tree, 'data-liangbiao-avatar', 'waiting')).toHaveLength(1)
    expect(textContent(tree)).toContain('待开梁')
  })
})

describe('region 3: exactly two vote buttons', () => {
  it('renders 夯：升梁！ and 拉：降梁！ aligned, and nothing else', () => {
    const tree = renderPanel(demoState())
    const row = findByAttr(tree, 'data-liangbiao-region', 'vote')[0]
    const votes = findByAttr(tree, 'data-liangbiao-vote')
    expect(votes.map((node) => node.props['data-liangbiao-vote'])).toEqual(['up', 'down'])
    expect(votes[0] && textContent([votes[0]])).toBe(VOTE_UP_LABEL)
    expect(votes[1] && textContent([votes[1]])).toBe(VOTE_DOWN_LABEL)
    expect(VOTE_UP_LABEL).toBe('夯：升梁！')
    expect(VOTE_DOWN_LABEL).toBe('拉：降梁！')
    expect(styleOf(row).gridTemplateColumns).toBe('1fr 1fr')
    expect(styleOf(votes[0]).width).toBe('100%')
    expect(styleOf(votes[1]).width).toBe('100%')
    expect(styleOf(votes[0]).textAlign).toBe('center')
    expect(styleOf(votes[1]).textAlign).toBe('center')
  })

  it('disables both with an accessible reason when remaining incense is 0', () => {
    const store = createMockLiangbiaoStore({ effectiveTokensToday: 47_000, usedIncenseToday: 0 })
    const tree = renderPanel(store.getSnapshot())
    for (const vote of findByAttr(tree, 'data-liangbiao-vote')) {
      expect(vote.props.disabled).toBe(true)
      expect(vote.props.title).toBe(NO_INCENSE_REASON)
    }
    expect(textContent(tree)).toContain(NO_INCENSE_REASON)
    expect(NO_INCENSE_REASON).toContain('打梁')
    expect(NO_INCENSE_REASON).not.toContain('投票')
  })

  it('shows the transient 已上香 feedback line', () => {
    const tree = renderPanel(demoState(), '已上香：夯（剩余 4 炷）')
    expect(textContent(tree)).toContain('已上香：夯（剩余 4 炷）')
  })
})

describe('region 4: social stats', () => {
  it('shows 三界香火 12,846 and 五行香客 2,841', () => {
    const tree = renderPanel(demoState())
    const incense = findByAttr(tree, 'data-liangbiao-stat', 'incense')[0]
    const voters = findByAttr(tree, 'data-liangbiao-stat', 'voters')[0]
    expect(incense && textContent([incense])).toContain('12,846')
    expect(voters && textContent([voters])).toContain('2,841')
    expect(incense && textContent([incense])).toContain(INCENSE_STAT_LABEL)
    expect(voters && textContent([voters])).toContain(VOTER_STAT_LABEL)
    expect(INCENSE_STAT_LABEL).toBe('三界香火')
    expect(VOTER_STAT_LABEL).toBe('五行香客')
  })

  it('uses Journey-to-the-West stat marks on the same row as 上达天听', () => {
    const tree = renderPanel(demoState())
    const social = findByAttr(tree, 'data-liangbiao-region', 'social')[0]
    expect(findByAttr(tree, 'data-liangbiao-incense-icon')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangbiao-voter-icon')).toHaveLength(1)
    expect(findByAttr(social === undefined ? [] : [social], 'data-liangbiao-reconcile-slot')).toHaveLength(1)
    expect(styleOf(findByAttr(tree, 'data-liangbiao-stat-label', 'incense')[0]).fontSize).toBe('10px')
    expect(styleOf(findByAttr(tree, 'data-liangbiao-stat', 'incense')[0]).flex).toBe('1 1 0')
  })
})

describe('上达天听', () => {
  it('sits on the social row, not a fifth region or third vote', () => {
    const tree = renderPanel(demoState())
    const regions = findByAttr(tree, 'data-liangbiao-region')
    expect(regions.map((node) => node.props['data-liangbiao-region'])).toEqual([
      'case',
      'core',
      'vote',
      'social',
    ])
    const votes = findByAttr(tree, 'data-liangbiao-vote')
    expect(votes).toHaveLength(2)
    const slot = findByAttr(tree, 'data-liangbiao-reconcile-slot')[0]
    expect(styleOf(slot).position).toBe('relative')
    expect(styleOf(slot).flex).toBe('0 0 auto')
    const control = findByAttr(tree, 'data-liangbiao-reconcile')[0]
    expect(control && textContent([control])).toContain(RECONCILE_LABEL)
    expect(control?.props.title).toBeUndefined()
    expect(control?.props['aria-label']).toBe(`${RECONCILE_LABEL}：${RECONCILE_HINT}`)
    expect(findByAttr(tree, 'data-liangbiao-heaven-icon')).toHaveLength(1)
    const hint = findByAttr(tree, 'data-liangbiao-hint')[0]
    expect(hint && textContent([hint])).toBe(RECONCILE_HINT)
    expect(RECONCILE_HINT).toBe('和天庭重新对账香火数据')
    expect(findByAttr(tree, 'data-liangbiao-reconcile-confirm')).toHaveLength(0)
  })

  it('asks for confirmation before the expensive sync', () => {
    const tree = renderPanel(demoState(), '', { reconcilePending: true })
    const confirm = findByAttr(tree, 'data-liangbiao-reconcile-confirm')[0]
    expect(confirm?.props.role).toBe('alertdialog')
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_PROMPT)
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_OK)
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_CANCEL)
    expect(styleOf(findByAttr(tree, 'data-liangbiao-reconcile')[0]).visibility).toBe('hidden')
  })
})

describe('avatar states are visually distinct', () => {
  it('every Liangzi state renders a different artwork composition', () => {
    const serialized = LIANGZI_STATES.map((state) =>
      JSON.stringify(renderDeep(<LiangAvatar state={state} pulse={false} reducedMotion={true} />)))
    expect(new Set(serialized).size).toBe(LIANGZI_STATES.length)
  })

  it('labels every state with its Chinese display name', () => {
    const labels = ['待开梁', '梁工', '梁总', '梁神', '梁圣', '梁祖']
    LIANGZI_STATES.forEach((state, index) => {
      const tree = renderDeep(<LiangAvatar state={state} pulse={false} reducedMotion={true} />)
      expect(textContent(tree)).toContain(labels[index] ?? '')
    })
  })
})

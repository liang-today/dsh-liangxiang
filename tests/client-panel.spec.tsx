/**
 * Panel structure (frozen UI contract): four regions, exactly two vote
 * buttons, concrete avatar (not a gauge), LiangQi copy integrated into the
 * ring, WAITING placeholder, disabled reason at zero incense.
 */
import { describe, expect, it } from 'vitest'
import { LiangAvatar } from '../src/client/LiangAvatar.tsx'
import { RING_SIZE } from '../src/client/LiangQiRing.tsx'
import { Panel } from '../src/client/Panel.tsx'
import { createMockLiangbiaoStore } from '../src/client/store.ts'
import type { LiangbiaoViewState } from '../src/client/store.ts'
import { LIANGZI_STATES } from '../src/domain/index.ts'
import {
  INCENSE_STAT_ICON,
  LOCAL_MODE_NOTE,
  NO_INCENSE_REASON,
  PANEL_TITLE,
  VOTE_DOWN_LABEL,
  VOTE_UP_LABEL,
  VOTER_STAT_ICON,
} from '../src/shared/index.ts'
import { findAll, findByAttr, renderDeep, styleOf, textContent, type RenderedNode } from './helpers/render.ts'

function renderPanel(state: LiangbiaoViewState, voteFeedback = ''): RenderedNode[] {
  return renderDeep(
    <Panel
      state={state}
      reducedMotion={false}
      avatarPulse={false}
      justCondensed={false}
      voteFeedback={voteFeedback}
      onVote={() => undefined}
      onClose={() => undefined}
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
    expect(next && textContent([next])).toContain('3K')
    expect(next && textContent([next])).not.toContain('3,000')
    expect(next && textContent([next])).toContain('Token')
    // 10,665/12,846 = 83.0219…%, truncated to six decimals.
    expect(position && textContent([position])).toContain('梁位')
    expect(position && textContent([position])).toContain('83.021952%')
    expect(findByAttr(tree, 'data-liangbiao-avatar', 'liang_sheng')).toHaveLength(1)
    expect(textContent(tree)).toContain('梁圣')
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
      expect(pill.width).toBe('176px')
      expect(social.map((node) => styleOf(node).width)).toEqual(['132px', '132px'])
    }
    const value = styleOf(findByAttr(renderPanel(small.getSnapshot()), 'data-liangbiao-liang-position-value')[0])
    expect(value.fontVariantNumeric).toBe('tabular-nums')
  })

  it('compacts flank counts so thousands stay short (and keeps exact values in the tooltip / SR)', () => {
    const demo = renderPanel(demoState())
    expect(textContent(findByAttr(demo, 'data-liangbiao-compact', 'incense'))).toBe('5')
    expect(textContent(findByAttr(demo, 'data-liangbiao-compact', 'next-incense'))).toBe('3K')
    expect(findByAttr(demo, 'data-liangbiao-compact', 'next-incense')[0]?.props.title).toBe('3,000 Token')
    expect(textContent(demo)).toContain('距下一炷还差 3,000 Token')

    // 1,234 炷 / 50,000 Token — the previous tests never reached this width.
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
      />,
    )
    expect(styleOf(findByAttr(reduced, 'data-liangbiao-liang-position-value')[0]).animation).toBeUndefined()
  })

  it('spells out the exact 夯率 band of the current state in the tooltip', () => {
    const tree = renderPanel(demoState())
    const tooltips = findAll(tree, (node) => node.props.title === '梁圣：80% ≤ 夯率 < 90%')
    expect(tooltips.length).toBeGreaterThan(0)
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
  })

  it('shows the transient 已上香 feedback line', () => {
    const tree = renderPanel(demoState(), '已上香：夯（剩余 4 炷）')
    expect(textContent(tree)).toContain('已上香：夯（剩余 4 炷）')
  })
})

describe('region 4: social stats', () => {
  it('shows 香火 12,846 and 香客 2,841', () => {
    const tree = renderPanel(demoState())
    const incense = findByAttr(tree, 'data-liangbiao-stat', 'incense')[0]
    const voters = findByAttr(tree, 'data-liangbiao-stat', 'voters')[0]
    expect(incense && textContent([incense])).toContain('12,846')
    expect(voters && textContent([voters])).toContain('2,841')
    expect(incense && textContent([incense])).toContain('香火')
    expect(voters && textContent([voters])).toContain('香客')
  })

  it('uses the shared stat glyphs and a larger stat type scale', () => {
    const tree = renderPanel(demoState())
    const social = findByAttr(tree, 'data-liangbiao-region', 'social')[0]
    expect(styleOf(social).fontSize).toBe('15px')
    const text = social === undefined ? '' : textContent([social])
    expect(text).toContain(INCENSE_STAT_ICON)
    expect(text).toContain(VOTER_STAT_ICON)
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

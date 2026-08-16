/**
 * Panel structure (frozen UI contract): four regions, exactly two vote
 * buttons, concrete avatar (not a gauge), LiangQi copy integrated into the
 * ring, WAITING placeholder, disabled reason at zero incense.
 */
import { describe, expect, it } from 'vitest'
import { LiangAvatar } from '../src/client/LiangAvatar.tsx'
import { Panel } from '../src/client/Panel.tsx'
import { createMockLiangbiaoStore } from '../src/client/store.ts'
import type { LiangbiaoViewState } from '../src/client/store.ts'
import { LIANGZI_STATES } from '../src/domain/index.ts'
import {
  INCENSE_STAT_ICON,
  LOCAL_MODE_NOTE,
  NO_INCENSE_REASON,
  PANEL_TITLE,
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
    expect(next && textContent([next])).toContain('3,000')
    expect(next && textContent([next])).toContain('Token')
    // 10,665/12,846 = 83.0219…%, truncated to four decimals.
    expect(position && textContent([position])).toContain('梁位')
    expect(position && textContent([position])).toContain('83.0219%')
    expect(findByAttr(tree, 'data-liangbiao-avatar', 'liang_sheng')).toHaveLength(1)
    expect(textContent(tree)).toContain('梁圣')
  })

  it('keeps 拉 as the complement in the tooltip instead of a second big number', () => {
    const tree = renderPanel(demoState())
    const position = findByAttr(tree, 'data-liangbiao-liang-position')[0]
    expect(position?.props.title).toBe('夯 83.0219% / 拉 16.9781%')
  })

  it('pins the 梁位 value to the ring footer (one value, not a ratio pair)', () => {
    const tree = renderPanel(demoState())
    const ring = findByAttr(tree, 'data-liangbiao-ring')[0]
    expect(ring).toBeDefined()
    const footer = ring === undefined ? [] : findByAttr([ring], 'data-liangbiao-ring-footer')
    expect(footer).toHaveLength(1)
    expect(footer[0] && textContent([footer[0]])).toContain('83.0219%')
    // The old up/down pair must not come back.
    expect(findByAttr(tree, 'data-liangbiao-ratio')).toHaveLength(0)
  })

  it('never rounds 梁位 past the threshold of the rendered state', () => {
    // 449/501 = 89.6207…% -> 梁圣; rounding up would look like a 梁祖 mismatch.
    const store = createMockLiangbiaoStore({ upVotes: 449, downVotes: 52, uniqueVoters: 40 })
    const tree = renderPanel(store.getSnapshot())
    const position = findByAttr(tree, 'data-liangbiao-liang-position')[0]
    expect(position && textContent([position])).toContain('89.6207%')
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
  it('renders 夯！ and 拉！ and nothing else', () => {
    const tree = renderPanel(demoState())
    const votes = findByAttr(tree, 'data-liangbiao-vote')
    expect(votes.map((node) => node.props['data-liangbiao-vote'])).toEqual(['up', 'down'])
    expect(votes[0] && textContent([votes[0]])).toBe('夯！')
    expect(votes[1] && textContent([votes[1]])).toBe('拉！')
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
  it('every Liangzi state renders a different SVG composition', () => {
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

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
import { NO_INCENSE_REASON, PANEL_TITLE } from '../src/shared/index.ts'
import { findAll, findByAttr, renderDeep, textContent, type RenderedNode } from './helpers/render.ts'

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
})

describe('region 2: ratios + concrete 梁子 + personal 梁气环', () => {
  it('shows 83% 夯 / 17% 拉 and the 梁圣 avatar from the same snapshot', () => {
    const tree = renderPanel(demoState())
    const up = findByAttr(tree, 'data-liangbiao-ratio', 'up')[0]
    const down = findByAttr(tree, 'data-liangbiao-ratio', 'down')[0]
    expect(up && textContent([up])).toContain('83%')
    expect(down && textContent([down])).toContain('17%')
    expect(findByAttr(tree, 'data-liangbiao-avatar', 'liang_sheng')).toHaveLength(1)
    expect(textContent(tree)).toContain('梁圣')
  })

  it('integrates “5 炷 · 再 3,000 Token” inside the LiangQi ring component', () => {
    const tree = renderPanel(demoState())
    const ring = findByAttr(tree, 'data-liangbiao-ring')[0]
    expect(ring).toBeDefined()
    const copy = ring === undefined ? [] : findByAttr([ring], 'data-liangbiao-ring-copy')
    expect(copy).toHaveLength(1)
    const text = copy[0] === undefined ? '' : textContent([copy[0]])
    expect(text).toContain('5 炷')
    expect(text).toContain('再 3,000 Token')
  })

  it('zero votes: “--” ratios and the 待开梁 placeholder', () => {
    const store = createMockLiangbiaoStore({ upVotes: 0, downVotes: 0, uniqueVoters: 0 })
    const tree = renderPanel(store.getSnapshot())
    const up = findByAttr(tree, 'data-liangbiao-ratio', 'up')[0]
    expect(up && textContent([up])).toContain('--')
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

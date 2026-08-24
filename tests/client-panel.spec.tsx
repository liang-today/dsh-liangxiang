/**
 * Panel structure (frozen UI contract): four regions, exactly two vote
 * buttons, concrete avatar (not a gauge), LiangQi copy integrated into the
 * ring, WAITING placeholder, disabled reason at zero incense.
 */
import { describe, expect, it } from 'vitest'
import { LiangAvatar } from '../src/client/LiangAvatar.tsx'
import { AVATAR_SLOT, RING_SIZE } from '../src/client/LiangQiRing.tsx'
import { Panel } from '../src/client/Panel.tsx'
import { createMockLiangxiangStore } from '../src/client/store.ts'
import type { LiangxiangViewState } from '../src/client/store.ts'
import { color } from '../src/client/theme.ts'
import { LIANGZI_STATES, liangQiFloatPeriodMs } from '../src/domain/index.ts'
import {
  COMMUNITY_UNAVAILABLE_REASON,
  INCENSE_STAT_LABEL,
  LOCAL_MODE_NOTE,
  NO_INCENSE_REASON,
  PANEL_TITLE_LOCAL,
  PLUGIN_PACKAGE_NAME,
  PLUGIN_VERSION,
  STAGING_MODE_NOTE,
  WELCOME_LOCAL_LABEL,
  WELCOME_ONLINE_LABEL,
  WELCOME_PRIVACY_NOTE,
  WELCOME_TAGLINE,
  WELCOME_TITLE,
  RECONCILE_CONFIRM_CANCEL,
  RECONCILE_CONFIRM_OK,
  RECONCILE_CONFIRM_PROMPT,
  MODE_CONFIRM_LOCAL,
  UTILITY_MODE_LOCAL_LABEL,
  UTILITY_MODE_ONLINE_LABEL,
  UTILITY_HINT,
  UTILITY_LABEL,
  UTILITY_RECONCILE_HINT,
  UTILITY_RECONCILE_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_UP_LABEL,
  VOTER_STAT_LABEL,
  STAT_LIFETIME_LABEL,
  STAT_TODAY_LABEL,
} from '../src/shared/index.ts'
import { findAll, findByAttr, renderDeep, styleOf, textContent, type RenderedElement, type RenderedNode } from './helpers/render.ts'

/** Visible 下一炷 caption/value, excluding the hover weight table. */
function visibleNextIncenseText(node: RenderedElement | undefined): string {
  if (node === undefined) return ''
  const visible = node.children.filter((child) =>
    child.kind !== 'element' || !('data-liangxiang-weight-hint' in child.props))
  return textContent(visible)
}

function renderPanel(
  state: LiangxiangViewState,
  voteFeedback = '',
    extra: {
    reconcilePending?: boolean
    onReconcileAsk?: () => void
    onReconcileConfirm?: () => void
    onReconcileCancel?: () => void
    versionInfoOpen?: boolean
    onInsufficientVote?: (voteType: 'up' | 'down') => void
    welcomeVisible?: boolean
    condensedIncense?: number
    utilityOpen?: boolean
    modeConfirmOpen?: boolean
    modeChanging?: boolean
    localEpithet?: { dedication: string, stance: string, label: string, spent: number }
    chargeVoteType?: 'up' | 'down' | null
    charge?: number
  } = {},
): RenderedNode[] {
  return renderDeep(
    <Panel
      state={state}
      reducedMotion={false}
      soundLevel={0}
      onCycleSound={() => undefined}
      versionInfoOpen={extra.versionInfoOpen ?? false}
      onVersionInfoClose={() => undefined}
      welcomeVisible={extra.welcomeVisible ?? false}
      onChooseOnline={() => undefined}
      onChooseLocal={() => undefined}
      avatarPulse={false}
      condensedIncense={extra.condensedIncense ?? 0}
      voteFeedback={voteFeedback}
      onVote={() => undefined}
      localEpithet={extra.localEpithet ?? null}
      chargeVoteType={extra.chargeVoteType ?? null}
      charge={extra.charge ?? 0}
      onInsufficientVote={extra.onInsufficientVote ?? (() => undefined)}
      onClose={() => undefined}
      reconcilePending={extra.reconcilePending ?? false}
      utilityOpen={extra.utilityOpen ?? false}
      onUtilityToggle={() => undefined}
      onUtilityClose={() => undefined}
      onOpenHomepage={() => undefined}
      modeConfirmOpen={extra.modeConfirmOpen ?? false}
      modeChanging={extra.modeChanging ?? false}
      onModeAsk={() => undefined}
      onModeConfirm={() => undefined}
      onModeCancel={() => undefined}
      onShowVersion={() => undefined}
      onReconcileAsk={extra.onReconcileAsk ?? (() => undefined)}
      onReconcileConfirm={extra.onReconcileConfirm ?? (() => undefined)}
      onReconcileCancel={extra.onReconcileCancel ?? (() => undefined)}
      onOpenLiangci={() => undefined}
    />,
  )
}

const demoState = (): LiangxiangViewState => createMockLiangxiangStore().getSnapshot()
const onlineState = (): LiangxiangViewState => ({
  ...demoState(),
  authorityMode: 'DEV_STAGING_ONLY',
})

describe('four visual regions', () => {
  it('places the four-character 梁祠 entry beneath 梁相案牍 inside Region 4', () => {
    const tree = renderPanel(demoState())
    const social = findByAttr(tree, 'data-liangxiang-region', 'social')[0]
    const controls = findAll(social === undefined ? [] : [social], node =>
      'data-liangxiang-ritual' in node.props)
    expect(controls.map(control => textContent([control]))).toEqual([
      expect.stringContaining(UTILITY_LABEL),
      expect.stringContaining('进入梁祠'),
    ])
    const slot = findByAttr(tree, 'data-liangxiang-utility-slot')[0]
    expect(styleOf(slot).flexDirection).toBe('column')
  })

  it('renders exactly case / core / vote / social, in order', () => {
    const tree = renderPanel(demoState())
    const regions = findByAttr(tree, 'data-liangxiang-region')
    expect(regions.map((node) => node.props['data-liangxiang-region'])).toEqual([
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
    expect(dialog[0]?.props['aria-label']).toBe(PANEL_TITLE_LOCAL)
    expect(textContent(tree)).toContain('DeepSeek Harness 是夯还是拉')
  })

  it('first-run welcome defaults to online with a local opt-out and privacy note', () => {
    const tree = renderPanel(demoState(), '', { welcomeVisible: true })
    const welcome = findByAttr(tree, 'data-liangxiang-welcome')[0]
    expect(welcome?.props['aria-label']).toBe(WELCOME_TITLE)
    expect(textContent(findByAttr(tree, 'data-liangxiang-welcome-online'))).toBe(WELCOME_ONLINE_LABEL)
    expect(textContent(findByAttr(tree, 'data-liangxiang-welcome-local'))).toBe(WELCOME_LOCAL_LABEL)
    expect(textContent(findByAttr(tree, 'data-liangxiang-welcome-tagline'))).toBe(WELCOME_TAGLINE)
    expect(textContent(findByAttr(tree, 'data-liangxiang-welcome-privacy'))).toBe(WELCOME_PRIVACY_NOTE)
    expect(WELCOME_PRIVACY_NOTE).toContain('随机安装 ID')
    expect(WELCOME_PRIVACY_NOTE).not.toContain('投票')
  })

  it('centers the case region and keeps the trust mode out of the visible copy', () => {
    const tree = renderPanel(demoState())
    const header = findByAttr(tree, 'data-liangxiang-region', 'case')[0]
    expect(styleOf(header).textAlign).toBe('center')
    // Local soft-trust stays honest via the attribute + screen-reader summary,
    // not a visible badge next to the title.
    expect(header === undefined ? '' : textContent([header])).toContain('今日梁案（离线）')
    expect(header === undefined ? '' : textContent([header])).not.toContain('本地演示')
    const caseTitle = findByAttr(tree, 'data-liangxiang-case-title')[0]
    expect(styleOf(findAll(header === undefined ? [] : [header], (node) => node.type === 'h2')[0]).fontSize).toBe('12px')
    expect(styleOf(caseTitle).fontSize).toBe('14px')
    expect(styleOf(caseTitle).margin).toBe('6px -24px 0')
    expect(styleOf(caseTitle).whiteSpace).toBe('normal')
    expect(styleOf(caseTitle).WebkitLineClamp).toBe(2)
    const dialog = findAll(tree, (node) => node.props.role === 'dialog')[0]
    expect(dialog?.props['data-liangxiang-authority']).toBe('LOCAL_FAKE_DEV')
    const summary = findAll(tree, (node) => node.props['aria-live'] === 'polite')[0]
    expect(summary && textContent([summary])).toContain(LOCAL_MODE_NOTE)
  })
})

describe('region 2: 香火 | 梁子 + 梁位 | 下一炷', () => {
  it('shows the actual incense gain when one update crosses multiple sticks', () => {
    const tree = renderPanel(demoState(), '', { condensedIncense: 6 })
    const feedback = findByAttr(tree, 'data-liangxiang-condensed')[0]
    expect(feedback?.props['data-liangxiang-condensed']).toBe(6)
    expect(feedback && textContent([feedback])).toBe('凝香 +6 炷')
  })

  it('flanks the 梁子 with the personal numbers and leads with one 梁位 value', () => {
    const tree = renderPanel(demoState())
    const incense = findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
    const next = findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0]
    const position = findByAttr(tree, 'data-liangxiang-liang-position')[0]
    expect(incense && textContent([incense])).toContain('7 炷')
    const nextVisible = visibleNextIncenseText(next)
    expect(nextVisible).toContain('3K')
    expect(nextVisible).toContain('当量')
    expect(nextVisible).toContain('已攒')
    expect(nextVisible).not.toContain('3,000')
    expect(nextVisible).toContain('当量')
    expect(nextVisible).not.toContain('Token')
    expect(next?.props.tabIndex).toBe(0)
    // 10,665/12,846 = 83.0219…%, truncated to six decimals.
    expect(position && textContent([position])).toContain('梁位')
    expect(position && textContent([position])).toContain('83.021952%')
    expect(position && textContent([position])).toContain('→')
    expect(position && textContent([position])).toContain('梁神')
    expect(findByAttr(tree, 'data-liangxiang-avatar', 'liang_shen')).toHaveLength(1)
    expect(textContent(findByAttr(tree, 'data-liangxiang-avatar'))).not.toContain('梁神')
    expect(textContent(findByAttr(tree, 'data-liangxiang-liangzi-title'))).toBe('梁神')
  })

  it('bobs the panel 梁子 with the logo: fill drives cadence, fill 0 is still', () => {
    const filling = renderPanel(demoState())
    const fillingFigure = findByAttr(filling, 'data-liangxiang-avatar-figure')[0]
    expect(demoState().personal.liangQiFill).toBeCloseTo(0.94, 10)
    expect(fillingFigure?.props['data-liangxiang-float-ms']).toBe(liangQiFloatPeriodMs(0.94))
    expect(styleOf(fillingFigure).animation).toContain('liangxiang-avatar-figure-float')

    const still = renderPanel(createMockLiangxiangStore({ effectiveTokensToday: 50_000, usedIncenseToday: 0 }).getSnapshot())
    const stillFigure = findByAttr(still, 'data-liangxiang-avatar-figure')[0]
    expect(stillFigure?.props['data-liangxiang-float-ms']).toBe(0)
    expect(styleOf(stillFigure).animation).toBeUndefined()
  })

  it('keeps 拉 as the complement in the tooltip instead of a second big number', () => {
    const tree = renderPanel(demoState())
    const position = findByAttr(tree, 'data-liangxiang-liang-position')[0]
    expect(position?.props.title).toBe('夯 83.021952% / 拉 16.978048% → 梁神')
  })

  it('sets 梁位 / value / arrow / 称呼 in one type size and weight', () => {
    const tree = renderPanel(demoState())
    const parts = [
      findByAttr(tree, 'data-liangxiang-liang-position-label')[0],
      findByAttr(tree, 'data-liangxiang-liang-position-value')[0],
      findByAttr(tree, 'data-liangxiang-liang-position-causal')[0],
      findByAttr(tree, 'data-liangxiang-liangzi-title')[0],
    ]
    for (const part of parts) {
      expect(styleOf(part).fontSize).toBe('13px')
      expect(styleOf(part).fontWeight).toBe(600)
      expect(styleOf(part).lineHeight).toBe('18px')
    }
    expect(styleOf(findByAttr(tree, 'data-liangxiang-liang-position')[0]).alignItems).toBe('center')
  })

  it('pins the 梁位 value to the ring footer (one value, not a ratio pair)', () => {
    const tree = renderPanel(demoState())
    const ring = findByAttr(tree, 'data-liangxiang-ring')[0]
    expect(ring).toBeDefined()
    const footer = ring === undefined ? [] : findByAttr([ring], 'data-liangxiang-ring-footer')
    expect(footer).toHaveLength(1)
    expect(footer[0] && textContent([footer[0]])).toContain('83.021952%')
    expect(footer[0] && textContent([footer[0]])).toContain('→')
    expect(footer[0] && textContent([footer[0]])).toContain('梁神')
    // The old up/down pair must not come back.
    expect(findByAttr(tree, 'data-liangxiang-ratio')).toHaveLength(0)
  })

  it('never rounds 梁位 past the threshold of the rendered state', () => {
    // 399/501 = 79.6407…% -> 梁神; rounding must not look like a higher state.
    const store = createMockLiangxiangStore({ upVotes: 399, downVotes: 102, uniqueVoters: 40 })
    const tree = renderPanel(store.getSnapshot())
    const position = findByAttr(tree, 'data-liangxiang-liang-position')[0]
    expect(position && textContent([position])).toContain('79.640718%')
    expect(findByAttr(tree, 'data-liangxiang-avatar', 'liang_shen')).toHaveLength(1)
  })

  it('moves the 梁位 value on a single accepted vote', async () => {
    const store = createMockLiangxiangStore({ upVotes: 10_665, downVotes: 2_181, uniqueVoters: 2_841 })
    const before = findByAttr(renderPanel(store.getSnapshot()), 'data-liangxiang-liang-position')[0]
    await store.vote('up')
    const after = findByAttr(renderPanel(store.getSnapshot()), 'data-liangxiang-liang-position')[0]
    // The whole point of the decimals: one vote is visible.
    expect(before && textContent([before])).not.toBe(after && textContent([after]))
  })

  it('keeps the 梁子 on the panel centerline as the numbers change', () => {
    const small = createMockLiangxiangStore({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    const large = createMockLiangxiangStore({
      upVotes: 1_000_000,
      downVotes: 999,
      uniqueVoters: 900_000,
      effectiveTokensToday: 9_999_000,
      usedIncenseToday: 0,
    })
    for (const state of [small.getSnapshot(), large.getSnapshot()]) {
      const tree = renderPanel(state)
      const core = styleOf(findByAttr(tree, 'data-liangxiang-region', 'core')[0])
      const anchor = styleOf(findByAttr(tree, 'data-liangxiang-core-anchor')[0])
      const incense = styleOf(findByAttr(tree, 'data-liangxiang-personal', 'incense')[0])
      const next = styleOf(findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0])
      const pill = styleOf(findByAttr(tree, 'data-liangxiang-liang-position')[0])
      const social = findByAttr(tree, 'data-liangxiang-stat')
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
      expect(pill.width).toBeUndefined()
      expect(pill.whiteSpace).toBe('nowrap')
      expect(styleOf(findByAttr(tree, 'data-liangxiang-ring-footer')[0]).top).toBe('100%')
      expect(styleOf(findByAttr(tree, 'data-liangxiang-ring-footer')[0]).marginTop).toBe('6px')
      expect(styleOf(findByAttr(tree, 'data-liangxiang-avatar')[0]).width).toBe(AVATAR_SLOT)
      expect(styleOf(findAll(tree, (node) => node.props.role === 'dialog')[0]).width).toBe('256px')
      expect(social.map((node) => styleOf(node).flex)).toEqual(['1 1 0', '1 1 0'])
    }
    const value = styleOf(findByAttr(renderPanel(small.getSnapshot()), 'data-liangxiang-liang-position-value')[0])
    expect(value.fontVariantNumeric).toBe('tabular-nums')
  })

  it('paints 今日凝香 and 下一炷 with the same orange value and row rhythm', () => {
    const tree = renderPanel(demoState())
    const incenseWrap = findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
    const nextWrap = findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0]
    expect(styleOf(incenseWrap).gap).toBe(styleOf(nextWrap).gap)
    const valueRow = (wrap: RenderedElement | undefined): RenderedElement | undefined =>
      wrap?.children.find((child): child is RenderedElement =>
        child.kind === 'element' && styleOf(child).fontSize === '13px')
    const incenseValueRow = valueRow(incenseWrap)
    const nextValueRow = valueRow(nextWrap)
    expect(styleOf(incenseValueRow).color).toBe(color.ritualEmber)
    expect(styleOf(nextValueRow).color).toBe(color.ritualEmber)
    expect(styleOf(incenseValueRow).lineHeight).toBe('18px')
    expect(styleOf(nextValueRow).lineHeight).toBe('18px')
    expect(styleOf(incenseValueRow).fontWeight).toBe(700)
    expect(styleOf(nextValueRow).fontWeight).toBe(700)
  })

  it('names the personal ring 香火环 in accessible copy', () => {
    const tree = renderPanel(demoState())
    const ring = findByAttr(tree, 'data-liangxiang-ring')[0]
    const ringImage = ring === undefined
      ? undefined
      : findAll([ring], (node) => node.props.role === 'img' && String(node.props['aria-label']).startsWith('香火环：'))[0]
    expect(ringImage?.props['aria-label']).toContain('香火环：剩余香火')
    expect(ringImage?.props['aria-label']).not.toContain('梁气：')
  })

  it('shows 余 N 炷 (not 可打梁) so the left flank stays narrow', () => {
    const tree = renderPanel(demoState())
    expect(textContent(tree)).toContain('余 ')
    expect(textContent(tree)).not.toContain('可打梁')
  })

  it('shows installed version details only in the dedicated version dialog', () => {
    const tree = renderPanel(demoState(), '', { versionInfoOpen: true })
    const dialogs = findByAttr(tree, 'data-liangxiang-version-dialog')
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]?.props.role).toBe('dialog')
    expect(dialogs[0]?.props['aria-modal']).toBe('true')
    expect(textContent(dialogs)).not.toContain(PLUGIN_PACKAGE_NAME)
    expect(textContent(dialogs)).toContain(`v${PLUGIN_VERSION}`)
    expect(findByAttr(tree, 'data-liangxiang-version-close')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangxiang-version')).toHaveLength(0)
  })

  it('compacts flank counts so thousands stay short (and keeps exact values in the tooltip / SR)', () => {
    const demo = renderPanel(demoState())
    expect(textContent(findByAttr(demo, 'data-liangxiang-compact', 'incense'))).toBe('7')
    expect(textContent(findByAttr(demo, 'data-liangxiang-compact', 'next-incense'))).toBe('3K')
    expect(findByAttr(demo, 'data-liangxiang-compact', 'next-incense')[0]?.props.title).toBe('3,000 当量')
    expect(textContent(demo)).toContain('距下一炷还差 3,000 当量')
    expect(textContent(demo)).toContain('攒香按 Pro 当量')
    expect(textContent(demo)).toContain('V4-Flash')

    // 1,234 炷 / 50,000 当量 — the previous tests never reached this width.
    const huge = createMockLiangxiangStore({
      effectiveTokensToday: 1_234 * 50_000,
      usedIncenseToday: 0,
    })
    const tree = renderPanel(huge.getSnapshot())
    expect(huge.getSnapshot().personal.remainingIncense).toBe(1_234)
    expect(huge.getSnapshot().personal.tokensToNextIncense).toBe(50_000)
    expect(textContent(findByAttr(tree, 'data-liangxiang-compact', 'incense'))).toBe('1.2K')
    expect(textContent(findByAttr(tree, 'data-liangxiang-compact', 'next-incense'))).toBe('50K')
    expect(findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
      && findByAttr(tree, 'data-liangxiang-compact', 'incense')[0]).toBeDefined()
    const incenseValue = findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
    expect(incenseValue && textContent([incenseValue])).toContain('1.2K')
    expect(incenseValue && textContent([incenseValue])).not.toContain('1,234')

    const tinyNext = createMockLiangxiangStore({ effectiveTokensToday: 49_991, usedIncenseToday: 0 })
    expect(tinyNext.getSnapshot().personal.tokensToNextIncense).toBe(9)
    expect(textContent(findByAttr(renderPanel(tinyNext.getSnapshot()), 'data-liangxiang-compact', 'next-incense'))).toBe('9')
  })

  it('moves the visible 下一炷 count when usage grows (compact must not swallow the delta)', () => {
    const nextFlank = (state: LiangxiangViewState) => {
      const tree = renderPanel(state)
      return {
        compact: textContent(findByAttr(tree, 'data-liangxiang-compact', 'next-incense')),
        label: String(findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0]?.props['aria-label'] ?? ''),
        title: String(findByAttr(tree, 'data-liangxiang-compact', 'next-incense')[0]?.props.title ?? ''),
      }
    }

    // Under 1K: exact digits, so a 200-当量 delta cannot hide.
    const small = createMockLiangxiangStore({ effectiveTokensToday: 49_200, usedIncenseToday: 0 })
    expect(small.getSnapshot().personal.tokensToNextIncense).toBe(800)
    const beforeSmall = nextFlank(small.getSnapshot())
    expect(beforeSmall.compact).toBe('800')
    small.addEffectiveTokens(200)
    expect(small.getSnapshot().personal.tokensToNextIncense).toBe(600)
    const afterSmall = nextFlank(small.getSnapshot())
    expect(afterSmall.compact).toBe('600')
    expect(afterSmall.label).not.toBe(beforeSmall.label)
    expect(afterSmall.title).toBe('600 当量')

    // Typical 30K band: integer K so 当量 stays short (no overlap with 梁子).
    // Title / aria still carry the exact count so a 300-当量 delta is not lost.
    const mid = createMockLiangxiangStore({ effectiveTokensToday: 16_600, usedIncenseToday: 0 })
    expect(mid.getSnapshot().personal.tokensToNextIncense).toBe(33_400)
    const beforeMid = nextFlank(mid.getSnapshot())
    expect(beforeMid.compact).toBe('33K')
    expect(beforeMid.compact).not.toMatch(/≈|\./)
    expect(beforeMid.title).toBe('33,400 当量')
    mid.addEffectiveTokens(300)
    expect(mid.getSnapshot().personal.tokensToNextIncense).toBe(33_100)
    const afterMid = nextFlank(mid.getSnapshot())
    expect(afterMid.compact).toBe('33K')
    expect(afterMid.title).toBe('33,100 当量')
    expect(afterMid.label).toContain('33,100')
    expect(afterMid.label).not.toBe(beforeMid.label)
  })

  it('pops the 梁位 value when it moves, and never under reduced motion', () => {
    const state = demoState()
    const pulsing = renderDeep(
      <Panel
        state={state}
        reducedMotion={false}
        soundLevel={0}
        onCycleSound={() => undefined}
        versionInfoOpen={false}
        onVersionInfoClose={() => undefined}
        welcomeVisible={false}
        onChooseOnline={() => undefined}
        onChooseLocal={() => undefined}
        avatarPulse={false}
        condensedIncense={0}
        voteFeedback=""
        positionPulse
        onVote={() => undefined}
        onInsufficientVote={() => undefined}
        onClose={() => undefined}
        reconcilePending={false}
        utilityOpen={false}
        onUtilityToggle={() => undefined}
        onUtilityClose={() => undefined}
        onOpenHomepage={() => undefined}
        modeConfirmOpen={false}
        modeChanging={false}
        onModeAsk={() => undefined}
        onModeConfirm={() => undefined}
        onModeCancel={() => undefined}
        onShowVersion={() => undefined}
        onReconcileAsk={() => undefined}
        onReconcileConfirm={() => undefined}
        onReconcileCancel={() => undefined}
        onOpenLiangci={() => undefined}
      />,
    )
    const pulsingValue = styleOf(findByAttr(pulsing, 'data-liangxiang-liang-position-value')[0])
    expect(String(pulsingValue.animation)).toContain('liangxiang-position-pop')

    const reduced = renderDeep(
      <Panel
        state={state}
        reducedMotion
        soundLevel={0}
        onCycleSound={() => undefined}
        versionInfoOpen={false}
        onVersionInfoClose={() => undefined}
        welcomeVisible={false}
        onChooseOnline={() => undefined}
        onChooseLocal={() => undefined}
        avatarPulse={false}
        condensedIncense={0}
        voteFeedback=""
        positionPulse
        onVote={() => undefined}
        onInsufficientVote={() => undefined}
        onClose={() => undefined}
        reconcilePending={false}
        utilityOpen={false}
        onUtilityToggle={() => undefined}
        onUtilityClose={() => undefined}
        onOpenHomepage={() => undefined}
        modeConfirmOpen={false}
        modeChanging={false}
        onModeAsk={() => undefined}
        onModeConfirm={() => undefined}
        onModeCancel={() => undefined}
        onShowVersion={() => undefined}
        onReconcileAsk={() => undefined}
        onReconcileConfirm={() => undefined}
        onReconcileCancel={() => undefined}
        onOpenLiangci={() => undefined}
      />,
    )
    expect(styleOf(findByAttr(reduced, 'data-liangxiang-liang-position-value')[0]).animation).toBeUndefined()
  })

  it('spells out the exact 夯率 band of the current state in the tooltip', () => {
    const tree = renderPanel(demoState())
    const tooltips = findAll(tree, (node) => node.props.title === '梁神：70% ≤ 夯率 < 85%')
    expect(tooltips.length).toBeGreaterThan(0)
  })

  it('draws 9 stick glyphs around the ring instead of 8 uncountable dots', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 9 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(9)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'one')).toHaveLength(9)
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'stick')).toHaveLength(9)
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'ten')).toHaveLength(0)
    const ring = findByAttr(tree, 'data-liangxiang-ring')[0]
    expect(styleOf(ring).overflow).toBe('visible')
  })

  it('puts moons on a separate orbit so a moon never steals a stick slot', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 23 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(23)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'stick')).toHaveLength(3)
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'moon')).toHaveLength(2)
  })

  it('puts suns on an inner orbit so 105 is 5 炷 + 1 日', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 105 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(105)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'stick')).toHaveLength(5)
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'moon')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'sun')).toHaveLength(1)
  })

  it('drops glyphs at 1000+ and shows a compact chip instead of ten moons', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 1_000 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(1_000)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'one')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'ten')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'hundred')).toHaveLength(0)
    const overflow = findByAttr(tree, 'data-liangxiang-incense-overflow')
    expect(overflow).toHaveLength(1)
    expect(overflow[0] && textContent([overflow[0]])).toContain('1K')
    expect(findByAttr(tree, 'data-liangxiang-overflow-aura')).toHaveLength(1)
  })

  it('keeps a Pro-equivalent weight table on the next-incense flank', () => {
    const tree = renderPanel(demoState())
    const hint = findByAttr(tree, 'data-liangxiang-weight-hint')[0]
    expect(hint).toBeDefined()
    const copy = hint === undefined ? '' : textContent([hint])
    expect(copy).toContain('攒香按 Pro 当量')
    expect(copy).toContain('V4-Pro')
    expect(copy).toContain('×1')
    expect(copy).toContain('V4-Flash')
    expect(copy).toContain('×0.5')
  })

  it('does not render a leftover 演示 +1 炷 probe', () => {
    const tree = renderPanel(demoState())
    expect(findByAttr(tree, 'data-liangxiang-dev-credit')).toHaveLength(0)
    expect(textContent(tree)).not.toContain('演示 +1 炷')
  })

  it('zero votes: “--” 梁位 and the 待开梁 placeholder', () => {
    const store = createMockLiangxiangStore({ upVotes: 0, downVotes: 0, uniqueVoters: 0 })
    const tree = renderPanel(store.getSnapshot())
    const position = findByAttr(tree, 'data-liangxiang-liang-position')[0]
    expect(position && textContent([position])).toContain('--')
    expect(position && textContent([position])).toContain('→')
    expect(position && textContent([position])).toContain('待开梁')
    expect(findByAttr(tree, 'data-liangxiang-avatar', 'waiting')).toHaveLength(1)
    expect(textContent(tree)).toContain('待开梁')
  })
})

describe('region 3: exactly two vote buttons', () => {
  it('renders 夯 · 升梁 and 拉 · 降梁 aligned, and nothing else', () => {
    const tree = renderPanel(demoState())
    const row = findByAttr(tree, 'data-liangxiang-region', 'vote')[0]
    const votes = findByAttr(tree, 'data-liangxiang-vote')
    expect(votes.map((node) => node.props['data-liangxiang-vote'])).toEqual(['up', 'down'])
    expect(votes[0] && textContent([votes[0]])).toBe(VOTE_UP_LABEL)
    expect(votes[1] && textContent([votes[1]])).toBe(VOTE_DOWN_LABEL)
    expect(VOTE_UP_LABEL).toBe('夯 · 升梁')
    expect(VOTE_DOWN_LABEL).toBe('拉 · 降梁')
    expect(styleOf(row).gridTemplateColumns).toBe('1fr 1fr')
    expect(styleOf(votes[0]).width).toBe('100%')
    expect(styleOf(votes[1]).width).toBe('100%')
    expect(styleOf(votes[0]).textAlign).toBe('center')
    expect(styleOf(votes[1]).textAlign).toBe('center')
  })

  it('keeps a reserved vote-feedback row so 上香 does not change panel height', () => {
    const idle = renderPanel(demoState())
    const accepted = renderPanel(demoState(), '已上香 · 夯（剩余 6 炷）')
    const dialog = findAll(idle, (node) => node.props.role === 'dialog')[0]
    const idleFeedback = findByAttr(idle, 'data-liangxiang-vote-feedback')[0]
    const acceptedFeedback = findByAttr(accepted, 'data-liangxiang-vote-feedback')[0]
    const social = findByAttr(idle, 'data-liangxiang-region', 'social')[0]
    expect(styleOf(dialog).padding).toBe('10px 12px 8px')
    expect(styleOf(findByAttr(idle, 'data-liangxiang-region', 'case')[0]).marginBottom).toBe('2px')
    expect(styleOf(findByAttr(idle, 'data-liangxiang-region', 'core')[0]).padding).toBe('20px 0 36px')
    expect(styleOf(findByAttr(idle, 'data-liangxiang-region', 'vote')[0]).marginTop).toBe('6px')
    expect(styleOf(idleFeedback).margin).toBe(styleOf(acceptedFeedback).margin)
    expect(styleOf(idleFeedback).minHeight).toBe('22px')
    expect(styleOf(acceptedFeedback).minHeight).toBe('22px')
    expect(styleOf(idleFeedback).height).toBe('22px')
    expect(styleOf(acceptedFeedback).height).toBe('22px')
    expect(styleOf(idleFeedback).fontSize).toBe('12px')
    expect(acceptedFeedback && textContent([acceptedFeedback])).toContain('已上香')
    expect(styleOf(social).marginTop).toBe(0)
    expect(styleOf(social).paddingTop).toBe('8px')
  })

  it('keeps empty-pool buttons clickable for the gag cue without sending a vote', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 47_000, usedIncenseToday: 0 })
    const blocked: string[] = []
    const tree = renderPanel(store.getSnapshot(), '', {
      onInsufficientVote: (voteType) => blocked.push(voteType),
    })
    for (const vote of findByAttr(tree, 'data-liangxiang-vote')) {
      expect(vote.props.disabled).toBe(false)
      expect(vote.props['aria-disabled']).toBe(true)
      expect(vote.props.title).toBe(NO_INCENSE_REASON)
      const click = vote.props.onClick as (() => void) | undefined
      click?.()
    }
    expect(blocked).toEqual(['up', 'down'])
    expect(textContent(tree)).toContain(NO_INCENSE_REASON)
    expect(NO_INCENSE_REASON).toContain('打梁')
    expect(NO_INCENSE_REASON).not.toContain('投票')
    expect(LOCAL_MODE_NOTE).not.toContain('投票')
    expect(STAGING_MODE_NOTE).not.toContain('投票')
  })

  it('shows the transient 已上香 feedback line', () => {
    const tree = renderPanel(demoState(), '已上香 · 夯（剩余 4 炷）')
    expect(textContent(tree)).toContain('已上香 · 夯（剩余 4 炷）')
  })

  it('paints the local 梁号 in the reserved idle feedback row', () => {
    const tree = renderPanel(demoState(), '', {
      localEpithet: { dedication: '勤香', stance: '死夯梁', label: '勤香 • 死夯梁', spent: 20 },
    })
    const row = findByAttr(tree, 'data-liangxiang-vote-feedback')[0]
    expect(row && textContent([row])).toBe('梁小号：勤香 • 死夯梁')
    expect(row?.props['data-liangxiang-epithet']).toBe('')
    expect(row?.props.title).toBe('仅本机可见，天庭不记账；随今日香火日清')
    expect(styleOf(row).height).toBe('22px')
    expect(styleOf(findByAttr(tree, 'data-liangxiang-epithet-mark')[0]).fontSize).toBe('16px')
  })

  it('charges a held vote button without adding a fifth region', () => {
    const state = demoState()
    const tree = renderPanel(state, '', { chargeVoteType: 'up', charge: 0.8 })
    const votes = findByAttr(tree, 'data-liangxiang-vote')
    expect(votes[0]?.props['data-charging']).toBe('')
    expect(votes[0]?.props['data-armed']).toBe('')
    expect(votes[1]?.props['data-charging']).toBeUndefined()
    expect(styleOf(votes[0])['--charge']).toBe('0.8')
    expect(votes[0] && textContent([votes[0]])).toBe(`倾炉 ×${state.personal.remainingIncense}`)
    expect(styleOf(votes[0]).minHeight).toBe('38px')
    expect(findByAttr(tree, 'data-liangxiang-region').map((node) => node.props['data-liangxiang-region']))
      .toEqual(['case', 'core', 'vote', 'social'])
  })

  it('keeps observed 凝香 visible but disables votes while the community is unreachable', () => {
    const state = {
      ...demoState(),
      authorityMode: 'DEV_STAGING_ONLY' as const,
      authorityAvailable: false,
      observedEarnedIncenseToday: 12,
    }
    const tree = renderPanel(state)
    expect(textContent(tree)).toContain(COMMUNITY_UNAVAILABLE_REASON)
    expect(textContent(findByAttr(tree, 'data-liangxiang-personal', 'incense'))).toContain('12')
    for (const vote of findByAttr(tree, 'data-liangxiang-vote')) {
      expect(vote.props.disabled).toBe(true)
      expect(vote.props.title).toBe(COMMUNITY_UNAVAILABLE_REASON)
    }
  })
})

describe('region 4: social stats', () => {
  it('shows 三界香火 12,846 and 五行香客 2,841', () => {
    const tree = renderPanel(demoState())
    const incense = findByAttr(tree, 'data-liangxiang-stat', 'incense')[0]
    const voters = findByAttr(tree, 'data-liangxiang-stat', 'voters')[0]
    expect(incense && textContent([incense])).toContain('12,846')
    expect(voters && textContent([voters])).toContain('2,841')
    expect(incense && textContent([incense])).toContain(INCENSE_STAT_LABEL)
    expect(voters && textContent([voters])).toContain(VOTER_STAT_LABEL)
    expect(INCENSE_STAT_LABEL).toBe('三界香火')
    expect(VOTER_STAT_LABEL).toBe('五行香客')
    const incenseHint = findByAttr(tree, 'data-liangxiang-stat-hint', 'incense')[0]
    const voterHint = findByAttr(tree, 'data-liangxiang-stat-hint', 'voters')[0]
    expect(incenseHint && textContent([incenseHint])).toContain(STAT_TODAY_LABEL)
    expect(incenseHint && textContent([incenseHint])).toContain(STAT_LIFETIME_LABEL)
    expect(incenseHint && textContent([incenseHint])).toContain('12,846')
    expect(voterHint && textContent([voterHint])).toContain(STAT_TODAY_LABEL)
    expect(voterHint && textContent([voterHint])).toContain(STAT_LIFETIME_LABEL)
    expect(voterHint && textContent([voterHint])).toContain('2,841')
    expect(incense?.props.title).toBeUndefined()
    expect(voters?.props.title).toBeUndefined()
  })

  it('uses Journey-to-the-West stat marks on the same row as 梁相案牍', () => {
    const tree = renderPanel(demoState())
    const social = findByAttr(tree, 'data-liangxiang-region', 'social')[0]
    expect(findByAttr(tree, 'data-liangxiang-incense-icon')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangxiang-voter-icon')).toHaveLength(1)
    expect(findByAttr(social === undefined ? [] : [social], 'data-liangxiang-utility-slot')).toHaveLength(1)
    expect(styleOf(findByAttr(tree, 'data-liangxiang-stat-label', 'incense')[0]).fontSize).toBe('10px')
    expect(styleOf(findByAttr(tree, 'data-liangxiang-stat', 'incense')[0]).flex).toBe('1 1 0')
  })
})

describe('梁相案牍', () => {
  it('sits on the social row, not a fifth region or third vote', () => {
    const tree = renderPanel(demoState())
    const regions = findByAttr(tree, 'data-liangxiang-region')
    expect(regions.map((node) => node.props['data-liangxiang-region'])).toEqual([
      'case',
      'core',
      'vote',
      'social',
    ])
    const votes = findByAttr(tree, 'data-liangxiang-vote')
    expect(votes).toHaveLength(2)
    const slot = findByAttr(tree, 'data-liangxiang-utility-slot')[0]
    expect(styleOf(slot).position).toBe('relative')
    expect(styleOf(slot).flex).toBe('0 0 auto')
    const control = findByAttr(tree, 'data-liangxiang-utility-trigger')[0]
    expect(control && textContent([control])).toContain(UTILITY_LABEL)
    expect(control?.props.title).toBeUndefined()
    expect(control?.props['aria-label']).toBe(`${UTILITY_LABEL}：${UTILITY_HINT}`)
    expect(findByAttr(tree, 'data-liangxiang-utility-icon', 'desk')).toHaveLength(1)
    const hint = findByAttr(tree, 'data-liangxiang-hint')[0]
    expect(hint && textContent([hint])).toBe(UTILITY_HINT)
    expect(findByAttr(tree, 'data-liangxiang-reconcile-confirm')).toHaveLength(0)
  })

  it('asks for confirmation before the expensive sync', () => {
    const tree = renderPanel(demoState(), '', { reconcilePending: true, utilityOpen: true })
    const confirm = findByAttr(tree, 'data-liangxiang-reconcile-confirm')[0]
    expect(confirm?.props.role).toBe('alertdialog')
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_PROMPT)
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_OK)
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_CANCEL)
    const repair = findByAttr(tree, 'data-liangxiang-utility-action', 'reconcile')[0]
    expect(repair && textContent([repair])).toContain(UTILITY_RECONCILE_LABEL)
    expect(repair && textContent([repair])).toContain(UTILITY_RECONCILE_HINT)
  })

  it('opens a themed four-action drawer with an explicit offline-mode control', () => {
    const tree = renderPanel(onlineState(), '', { utilityOpen: true })
    expect(findByAttr(tree, 'data-liangxiang-utility-drawer')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangxiang-utility-action')).toHaveLength(4)
    expect(findByAttr(tree, 'data-liangxiang-utility-action', 'home')).toHaveLength(1)
    const mode = findByAttr(tree, 'data-liangxiang-utility-action', 'mode')[0]
    expect(mode && textContent([mode])).toContain(UTILITY_MODE_LOCAL_LABEL)
    expect(findByAttr(tree, 'data-liangxiang-utility-action', 'reset-position')).toHaveLength(0)
    const version = findByAttr(tree, 'data-liangxiang-utility-action', 'version')[0]
    expect(version).toBeDefined()
    expect(textContent(version === undefined ? [] : [version])).toContain(`v${PLUGIN_VERSION}`)
    expect(textContent(version === undefined ? [] : [version])).not.toContain(PLUGIN_PACKAGE_NAME)
    expect(textContent(version === undefined ? [] : [version])).not.toContain('当前版本')
  })

  it('offers online mode from the isolated local ledger', () => {
    const tree = renderPanel(demoState(), '', { utilityOpen: true })
    const mode = findByAttr(tree, 'data-liangxiang-utility-action', 'mode')[0]
    expect(mode && textContent([mode])).toContain(UTILITY_MODE_ONLINE_LABEL)
  })

  it('confirms that offline play is manual and isolated before switching', () => {
    const tree = renderPanel(onlineState(), '', { utilityOpen: true, modeConfirmOpen: true })
    const confirm = findByAttr(tree, 'data-liangxiang-mode-confirm')[0]
    expect(confirm?.props.role).toBe('alertdialog')
    expect(confirm && textContent([confirm])).toContain(MODE_CONFIRM_LOCAL)
    expect(confirm && textContent([confirm])).toContain('断网不会自动触发')
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

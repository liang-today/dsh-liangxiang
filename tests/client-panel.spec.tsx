/**
 * Panel structure (frozen UI contract): four regions, exactly two vote
 * buttons, concrete avatar (not a gauge), LiangQi copy integrated into the
 * ring, WAITING placeholder, disabled reason at zero incense.
 */
import { describe, expect, it } from 'vitest'
import { LiangAvatar } from '../src/client/LiangAvatar.tsx'
import { AVATAR_SLOT, RING_SIZE } from '../src/client/LiangQiRing.tsx'
import { Panel, type PanelProps } from '../src/client/Panel.tsx'
import { createMockLiangxiangStore } from '../src/client/store.ts'
import type { LiangxiangViewState } from '../src/client/store.ts'
import { color } from '../src/client/theme.ts'
import { mainColor } from '../src/client/main-panel-theme.ts'
import { PERSONAL_INCENSE_CAPTION_CSS } from '../src/client/PersonalIncenseCaption.tsx'
import { RELEASE_NOTES_QQ, RELEASE_NOTES_THANKS, RELEASE_NOTES_TITLE } from '../src/client/release-notes.ts'
import { LEGACY_LIANGZI_POLICY_VERSION, LIANGZI_STATES, VOTE_COUNT_MAX, deriveLocalIncenseStats, liangQiFloatPeriodMs } from '../src/domain/index.ts'
import {
  COMMUNITY_UNAVAILABLE_REASON,
  INCENSE_STAT_LABEL,
  MY_INCENSE_STAT_LABEL,
  LOCAL_MODE_NOTE,
  EMPTY_INCENSE_FEEDBACK_MS,
  NO_INCENSE_GAG,
  NO_INCENSE_REASON,
  PANEL_TITLE_LOCAL,
  PLUGIN_PACKAGE_NAME,
  PLUGIN_VERSION,
  STAGING_MODE_NOTE,
  WELCOME_GIFT_LINE,
  WELCOME_LOCAL_LABEL,
  WELCOME_ONLINE_LABEL,
  WELCOME_PLAY_LINE,
  WELCOME_PRIVACY_NOTE,
  WELCOME_TAGLINE,
  WELCOME_TITLE,
  RECONCILE_CONFIRM_CANCEL,
  RECONCILE_CONFIRM_OK,
  RECONCILE_CONFIRM_PROMPT,
  MODE_CONFIRM_LOCAL,
  UTILITY_BARS_HINT,
  UTILITY_BARS_LABEL,
  UTILITY_MODE_LOCAL_LABEL,
  UTILITY_MODE_ONLINE_LABEL,
  UTILITY_HINT,
  UTILITY_LABEL,
  UTILITY_RECONCILE_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_UP_LABEL,
  VOTER_STAT_LABEL,
  STAT_LIFETIME_LABEL,
  STAT_SHARE_LABEL,
  STAT_TODAY_LABEL,
} from '../src/shared/index.ts'
import { findAll, findByAttr, renderDeep, styleOf, textContent, type RenderedElement, type RenderedNode } from './helpers/render.ts'

/** Passive 下一炷 caption/value. */
function visibleNextIncenseText(node: RenderedElement | undefined): string {
  return node === undefined ? '' : textContent([node])
}

function renderPanel(
  state: LiangxiangViewState,
  voteFeedback = '',
    extra: {
    reconcilePending?: boolean
    onReconcileAsk?: () => void
    onReconcileConfirm?: () => void
    onReconcileCancel?: () => void
    onShowVersion?: () => void
    onOpenMarket?: PanelProps['onOpenMarket']
    onInsufficientVote?: (voteType: 'up' | 'down') => void
    onVoteClick?: (voteType: 'up' | 'down') => void
    welcomeVisible?: boolean
    releaseNotesVisible?: boolean
    condensedIncense?: number
    incenseCaption?: PanelProps['incenseCaption']
    utilityOpen?: boolean
    modeConfirmOpen?: boolean
    modeChanging?: boolean
    localEpithet?: { dedication: string, stance: string, label: string, spent: number }
    localIncense?: ReturnType<typeof deriveLocalIncenseStats>
    chargeVoteType?: 'up' | 'down' | null
    charge?: number
    reducedMotion?: boolean
    dismissedBroadcastId?: string | null
    onBroadcastDismiss?: (broadcastId: string) => void
  } = {},
): RenderedNode[] {
  return renderDeep(
    <Panel
      state={state}
      reducedMotion={extra.reducedMotion ?? false}
      soundLevel={0}
      onCycleSound={() => undefined}
      welcomeVisible={extra.welcomeVisible ?? false}
      onChooseOnline={() => undefined}
      onChooseLocal={() => undefined}
      releaseNotesVisible={extra.releaseNotesVisible ?? false}
      onReleaseNotesClose={() => undefined}
      avatarPulse={false}
      condensedIncense={extra.condensedIncense ?? 0}
      {...(extra.incenseCaption === undefined ? {} : { incenseCaption: extra.incenseCaption })}
      voteFeedback={voteFeedback}
      onVote={() => undefined}
      {...(extra.onVoteClick === undefined ? {} : { onVoteClick: extra.onVoteClick })}
      localEpithet={extra.localEpithet ?? null}
      localIncense={extra.localIncense ?? null}
      dismissedBroadcastId={extra.dismissedBroadcastId ?? null}
      onBroadcastDismiss={extra.onBroadcastDismiss ?? (() => undefined)}
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
      onShowVersion={extra.onShowVersion ?? (() => undefined)}
      {...(extra.onOpenMarket === undefined ? {} : { onOpenMarket: extra.onOpenMarket })}
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
    const desk = findByAttr(tree, 'data-liangxiang-utility-desk')[0]
    const entry = findByAttr(tree, 'data-liangxiang-liangci-entry')[0]
    expect(styleOf(desk).gridRow).toBe(1)
    expect(styleOf(entry).gridRow).toBe(2)
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
    expect(textContent(findByAttr(tree, 'data-liangxiang-welcome-gift'))).toBe(WELCOME_GIFT_LINE)
    expect(textContent(findByAttr(tree, 'data-liangxiang-welcome-play'))).toBe(WELCOME_PLAY_LINE)
    expect(textContent(findByAttr(tree, 'data-liangxiang-welcome-privacy'))).toBe(WELCOME_PRIVACY_NOTE)
    expect(WELCOME_GIFT_LINE).toContain('10 炷')
    expect(WELCOME_PRIVACY_NOTE).toContain('随机安装 ID')
    expect(WELCOME_PRIVACY_NOTE).not.toContain('投票')
    const qqCard = findByAttr(tree, 'data-liangxiang-welcome-qq')[0]
    const qrCode = findByAttr(tree, 'data-liangxiang-welcome-qq-qrcode')[0]
    expect(qqCard && textContent([qqCard])).toContain(RELEASE_NOTES_QQ)
    expect(qrCode?.props.alt).toBe('梁相上香QQ群453683905二维码')
    expect(qrCode?.props.src).toMatch(/^data:image\/jpeg;base64,/)
    expect(qrCode?.props.width).toBe(72)
    expect(qrCode?.props.height).toBe(72)
    expect(textContent(welcome === undefined ? [] : [welcome])).not.toMatch(/秒后|倒计时/)
  })

  it('sequences first-run guidance before the version-scoped update notes', () => {
    const first = renderPanel(demoState(), '', { welcomeVisible: true, releaseNotesVisible: true })
    expect(findByAttr(first, 'data-liangxiang-welcome')).toHaveLength(1)
    expect(findByAttr(first, 'data-liangxiang-release-notes')).toHaveLength(0)
    const welcomeQqCard = findByAttr(first, 'data-liangxiang-qq-card')[0]
    const welcomeQrCode = findByAttr(first, 'data-liangxiang-qq-qrcode')[0]

    let closed = 0
    const updated = renderDeep(
      <Panel
        state={demoState()}
        reducedMotion={false}
        soundLevel={0}
        onCycleSound={() => undefined}
        welcomeVisible={false}
        onChooseOnline={() => undefined}
        onChooseLocal={() => undefined}
        releaseNotesVisible
        onReleaseNotesClose={() => { closed += 1 }}
        avatarPulse={false}
        condensedIncense={0}
        voteFeedback=""
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
    const notes = findByAttr(updated, 'data-liangxiang-release-notes')[0]
    expect(notes?.props['aria-label']).toBe(RELEASE_NOTES_TITLE)
    expect(notes?.props.autoFocus).toBe(true)
    expect(textContent(notes === undefined ? [] : [notes])).toContain('梁相上香QQ群453683905')
    expect(textContent(notes === undefined ? [] : [notes])).toContain(RELEASE_NOTES_THANKS)
    expect(textContent(notes === undefined ? [] : [notes])).not.toContain('上次正式版以来')
    const updateQqCard = findByAttr(updated, 'data-liangxiang-qq-card')[0]
    const updateQrCode = findByAttr(updated, 'data-liangxiang-qq-qrcode')[0]
    expect(findByAttr(updated, 'data-liangxiang-release-notes-qq')).toHaveLength(1)
    expect(findByAttr(updated, 'data-liangxiang-release-notes-qq-qrcode')).toHaveLength(1)
    expect(updateQrCode?.props.src).toBe(welcomeQrCode?.props.src)
    expect(updateQrCode?.props.alt).toBe(welcomeQrCode?.props.alt)
    expect(updateQqCard?.props['aria-label']).toBe(RELEASE_NOTES_QQ)
    expect(updateQqCard?.props.className).toBe('u-community-row')
    expect(welcomeQqCard?.props['data-liangxiang-qq-card']).toBe('')
    expect(updateQrCode?.props.width).toBe(78)
    expect(updateQrCode?.props.height).toBe(78)
    const close = findByAttr(updated, 'data-liangxiang-release-notes-close')[0]
    expect(close?.props.autoFocus).toBeUndefined()
    const onClick = close?.props.onClick as (() => void) | undefined
    onClick?.()
    expect(closed).toBe(1)
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
    const summary = findAll(tree, (node) => node.type === 'p' && node.props['aria-live'] === 'polite')[0]
    expect(summary && textContent([summary])).toContain(LOCAL_MODE_NOTE)
  })
})

describe('region 2: 香火 | 梁子 + 梁位 | 下一炷', () => {
  it('shows live activity without changing confirmed incense, progress or Liangzi', () => {
    const state = demoState()
    const idle = renderPanel(state)
    const active = renderPanel({ ...state, streamingActive: true })
    // Activity retains smoke, but cannot permanently replace today's settled number.
    expect(findByAttr(active, 'data-liangxiang-stream-status')).toHaveLength(0)
    expect(textContent(findByAttr(active, 'data-caption-copy'))).toBe('今日凝香7炷')
    expect(textContent(findByAttr(active, 'data-caption-copy'))).toBe(textContent(findByAttr(idle, 'data-caption-copy')))
    expect(findByAttr(active, 'data-liangxiang-stream-activity')).toHaveLength(1)
    for (const attribute of ['data-liangxiang-compact', 'data-liangxiang-liang-position-value']) {
      expect(textContent(findByAttr(active, attribute))).toBe(textContent(findByAttr(idle, attribute)))
    }
    expect(findByAttr(active, 'data-liangxiang-ring')[0]?.props['data-fill']).toBe(findByAttr(idle, 'data-liangxiang-ring')[0]?.props['data-fill'])
    expect(findByAttr(active, 'data-liangxiang-condensed')).toHaveLength(0)
    const reduced = renderPanel({ ...state, streamingActive: true }, '', { reducedMotion: true })
    for (const wisp of findByAttr(reduced, 'data-liangxiang-stream-wisp')) expect(styleOf(wisp).animation).toBeUndefined()
    const disconnected = renderPanel({ ...state, streamingActive: true, connection: 'offline' })
    expect(findByAttr(disconnected, 'data-liangxiang-stream-activity')).toHaveLength(0)
  })
  it('shows the actual incense gain when one update crosses multiple sticks', () => {
    const state = demoState()
    const tree = renderPanel(state, '', { condensedIncense: 6, incenseCaption: { view: 'gain', gain: 6, sequence: 1 } })
    const feedback = findByAttr(tree, 'data-liangxiang-personal-caption')[0]
    expect(feedback?.props['data-view']).toBe('gain')
    expect(textContent(findByAttr([feedback!], 'data-caption-copy'))).toBe('凝香到账+6炷')
    expect(feedback?.props['aria-label']).toBe('凝香到账6炷')
    expect(findByAttr(tree, 'data-liangxiang-condensed')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-ring')[0]?.props['data-fill']).toBe(state.personal.liangQiFill.toFixed(4))
    expect(state.personal.remainingIncense).toBe(demoState().personal.remainingIncense)
  })

  it('flanks the 梁子 with the personal numbers and leads with one 梁位 value', () => {
    const tree = renderPanel(demoState())
    const incense = findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
    const next = findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0]
    const position = findByAttr(tree, 'data-liangxiang-liang-position')[0]
    expect(textContent(findByAttr(incense ? [incense] : [], 'data-caption-copy'))).toBe('今日凝香7炷')
    const nextVisible = visibleNextIncenseText(next)
    expect(nextVisible).toContain('3K')
    expect(nextVisible).toBe('下一炷3K量')
    expect(nextVisible).not.toContain('已攒')
    expect(nextVisible).not.toContain('3,000')
    expect(next?.props['aria-label']).toBe('下一炷 3,000 当量')
    expect(nextVisible).not.toContain('Token')
    expect(next?.props.tabIndex).toBeUndefined()
    // 10,665/12,846 = 83.0219…%, truncated to six decimals.
    expect(position && textContent([position])).toContain('梁位')
    expect(position && textContent([position])).toContain('83.021952%')
    expect(position && textContent([position])).toContain('→')
    expect(position && textContent([position])).toContain('梁神')
    expect(findByAttr(tree, 'data-liangxiang-avatar', 'liang_shen')).toHaveLength(1)
    expect(textContent(findByAttr(tree, 'data-liangxiang-avatar'))).not.toContain('梁神')
    expect(textContent(findByAttr(tree, 'data-liangxiang-liangzi-title'))).toBe('梁神')
  })

  it('bobs the panel 梁子 with the logo: fill drives cadence from a slow idle', () => {
    const filling = renderPanel(demoState())
    const fillingFigure = findByAttr(filling, 'data-liangxiang-avatar-figure')[0]
    expect(demoState().personal.liangQiFill).toBeCloseTo(0.94, 10)
    expect(fillingFigure?.props['data-liangxiang-float-ms']).toBe(liangQiFloatPeriodMs(0.94))
    expect(styleOf(fillingFigure).animation).toContain('liangxiang-avatar-figure-float')

    const idle = renderPanel(createMockLiangxiangStore({ effectiveTokensToday: 50_000, usedIncenseToday: 0 }).getSnapshot())
    const idleFigure = findByAttr(idle, 'data-liangxiang-avatar-figure')[0]
    expect(idleFigure?.props['data-liangxiang-float-ms']).toBe(liangQiFloatPeriodMs(0))
    expect(styleOf(idleFigure).animation).toContain('liangxiang-avatar-figure-float')
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
      expect(styleOf(part).fontSize).toBe('11px')
      expect(styleOf(part).fontWeight).toBe(600)
      expect(styleOf(part).lineHeight).toBe('18px')
    }
    expect(styleOf(findByAttr(tree, 'data-liangxiang-liang-position')[0]).alignItems).toBe('center')
  })

  it('pins one full-width 梁位 pill under the ring without adding a ratio pair', () => {
    const tree = renderPanel(demoState())
    const ring = findByAttr(tree, 'data-liangxiang-ring')[0]
    expect(ring).toBeDefined()
    const footer = ring === undefined ? [] : findByAttr([ring], 'data-liangxiang-ring-footer')
    expect(footer).toHaveLength(0)
    const core = findByAttr(tree, 'data-liangxiang-region', 'core')[0]!
    const position = findByAttr([core], 'data-liangxiang-liang-position')
    expect(position).toHaveLength(1)
    expect(textContent(position)).toContain('83.021952%')
    expect(textContent(position)).toContain('→')
    expect(textContent(position)).toContain('梁神')
    expect(findByAttr([ring!], 'data-liangxiang-liang-position')).toHaveLength(0)
    expect(styleOf(position[0])).toMatchObject({ position: 'absolute', left: 0, bottom: 0, width: '100%' })
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
      expect(incense.left).toBe('-5px')
      expect(next.right).toBe('-5px')
      expect(incense.width).toBe(next.width)
      expect(incense.height).toBe(`${RING_SIZE}px`)
      expect(next.height).toBe(`${RING_SIZE}px`)
      expect(pill.width).toBe('100%')
      expect(pill.whiteSpace).toBe('nowrap')
      expect(pill.left).toBe(0)
      expect(pill.bottom).toBe(0)
      expect(findByAttr(tree, 'data-liangxiang-ring-footer')).toHaveLength(0)
      const avatarSize = state.snapshot.liangziState === 'liang_zu' ? 102 : state.snapshot.liangziState === 'liang_sheng' ? 100 : AVATAR_SLOT
      expect(styleOf(findByAttr(tree, 'data-liangxiang-avatar')[0]).width).toBe(avatarSize)
      const pond = findByAttr(tree, 'data-liangxiang-main-pond')[0]!
      expect(pond.props['aria-hidden']).toBe('true')
      expect(findByAttr(tree, 'data-liangxiang-ring')[0]?.props['data-remaining']).toBe(state.personal.remainingIncense)
      const chrome = styleOf(findAll(tree, (node) => node.props.role === 'dialog')[0])
      expect(chrome.width).toBe('256px')
      expect(chrome.maxWidth).toBe('100vw')
      expect(chrome.left).toBe('0px')
      expect(social).toHaveLength(2)
      expect(social.map((node) => styleOf(node).gridRow)).toEqual(['1 / 3', '1 / 3'])
      expect(social.map((node) => styleOf(node).gridColumn)).toEqual([1, 2])
    }
    const value = styleOf(findByAttr(renderPanel(small.getSnapshot()), 'data-liangxiang-liang-position-value')[0])
    expect(value.fontVariantNumeric).toBe('tabular-nums')
  })

  it('uses quiet two-line personal flanks with blue values beside the centered portrait', () => {
    const tree = renderPanel(demoState())
    const incenseWrap = findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
    const nextWrap = findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0]
    expect(styleOf(incenseWrap).gap).toBe(styleOf(nextWrap).gap)
    const incenseValue = findByAttr(incenseWrap ? [incenseWrap] : [], 'data-caption-amount')[0]
    const nextValueRow = nextWrap?.children.find((child): child is RenderedElement => child.kind === 'element' && styleOf(child).fontSize === '17px')
    expect(styleOf(incenseValue).fontSize).toBe('17px')
    expect(styleOf(nextValueRow).color).toBe(mainColor.deep)
    expect(PERSONAL_INCENSE_CAPTION_CSS).toContain(`color:var(--liangxiang-main-deep, ${color.textPrimary})`)
    expect(styleOf(nextValueRow).lineHeight).toBe('20px')
    const units = findByAttr(tree, 'data-liangxiang-personal-unit')
    expect(units).toHaveLength(2)
    expect(styleOf(units[0])).toEqual(styleOf(units[1]))
    expect(PERSONAL_INCENSE_CAPTION_CSS).toContain('[data-caption-amount] { font-weight:700;')
    expect(styleOf(nextValueRow).fontWeight).toBe(700)
    expect(textContent(findByAttr(tree, 'data-caption-label'))).toBe('今日凝香')
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

  it('keeps available incense exact and inspectable without a permanent extra balance row', () => {
    const state = demoState()
    const tree = renderPanel(state)
    expect(textContent(findByAttr(tree, 'data-caption-copy'))).toBe('今日凝香7炷')
    const inspecting = renderPanel(state, '', { incenseCaption: { view: 'balance', gain: 0, sequence: 2 } })
    expect(textContent(findByAttr(inspecting, 'data-caption-copy'))).toBe(`个人余香${state.personal.remainingIncense}炷`)
    expect(findByAttr(inspecting, 'data-liangxiang-personal-caption')[0]?.props['aria-label']).toBe(`个人余香${state.personal.remainingIncense}炷`)
    expect(findByAttr(inspecting, 'data-liangxiang-personal', 'incense')).toHaveLength(1)
    expect(textContent(tree)).not.toContain('可打梁')
  })

  it('routes the version seal to the reusable update-notes flow', () => {
    let opened = 0
    const tree = renderPanel(demoState(), '', {
      utilityOpen: true,
      onShowVersion: () => { opened += 1 },
    })
    const version = findByAttr(tree, 'data-liangxiang-utility-action', 'version')[0]
    const onClick = version?.props.onClick as (() => void) | undefined
    onClick?.()
    expect(opened).toBe(1)
    expect(findByAttr(tree, 'data-liangxiang-version-dialog')).toHaveLength(0)
  })

  it('compacts flank counts so thousands stay short and keeps exact next-incense values in accessible copy', () => {
    const demo = renderPanel(demoState())
    expect(textContent(findByAttr(demo, 'data-liangxiang-compact', 'incense'))).toBe('7')
    expect(textContent(findByAttr(demo, 'data-liangxiang-compact', 'next-incense'))).toBe('3K')
    expect(findByAttr(demo, 'data-liangxiang-compact', 'next-incense')[0]?.props.title).toBeUndefined()
    expect(textContent(demo)).toContain('距下一炷还差 3,000 当量')
    expect(findByAttr(demo, 'aria-label', '凝香规则')).toHaveLength(0)
    expect(textContent(demo)).not.toContain('V4-Flash')

    // 1,234 炷 / 50,000 当量 — the previous tests never reached this width.
    const huge = createMockLiangxiangStore({
      effectiveTokensToday: 1_234 * 50_000,
      usedIncenseToday: 0,
    })
    const tree = renderPanel(huge.getSnapshot())
    expect(huge.getSnapshot().personal.remainingIncense).toBe(1_234)
    expect(huge.getSnapshot().personal.tokensToNextIncense).toBe(50_000)
    expect(textContent(findByAttr(tree, 'data-liangxiang-compact', 'incense'))).toBe('1.23K')
    expect(textContent(findByAttr(tree, 'data-liangxiang-compact', 'next-incense'))).toBe('50K')
    expect(findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
      && findByAttr(tree, 'data-liangxiang-compact', 'incense')[0]).toBeDefined()
    const incenseValue = findByAttr(tree, 'data-liangxiang-personal', 'incense')[0]
    expect(textContent(findByAttr(incenseValue ? [incenseValue] : [], 'data-caption-copy'))).toBe('今日凝香1.23K炷')
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
    expect(afterSmall.label).toContain('600 当量')
    expect(afterSmall.title).toBe('')

    // Typical 30K band: integer K so 当量 stays short (no overlap with 梁子).
    // Accessible copy retains the exact count so a 300-当量 delta is not lost.
    const mid = createMockLiangxiangStore({ effectiveTokensToday: 16_600, usedIncenseToday: 0 })
    expect(mid.getSnapshot().personal.tokensToNextIncense).toBe(33_400)
    const beforeMid = nextFlank(mid.getSnapshot())
    expect(beforeMid.compact).toBe('33K')
    expect(beforeMid.compact).not.toMatch(/≈|\./)
    expect(beforeMid.label).toContain('33,400 当量')
    expect(beforeMid.title).toBe('')
    mid.addEffectiveTokens(300)
    expect(mid.getSnapshot().personal.tokensToNextIncense).toBe(33_100)
    const afterMid = nextFlank(mid.getSnapshot())
    expect(afterMid.compact).toBe('33K')
    expect(afterMid.title).toBe('')
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
        welcomeVisible={false}
        onChooseOnline={() => undefined}
        onChooseLocal={() => undefined}
        releaseNotesVisible={false}
        onReleaseNotesClose={() => undefined}
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
        welcomeVisible={false}
        onChooseOnline={() => undefined}
        onChooseLocal={() => undefined}
        releaseNotesVisible={false}
        onReleaseNotesClose={() => undefined}
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

  it('shows the highest magnitude only: 23 incense paints two moons and preserves its exact balance', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 23 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(23)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'stick')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'moon')).toHaveLength(2)
    const ring = findByAttr(tree, 'data-liangxiang-ring')[0]!
    expect(ring.props['data-remaining']).toBe(23)
    expect(findByAttr([ring], 'role', 'img')[0]?.props['aria-label']).toContain('剩余香火 23 炷')
  })

  it('shows one sun for 105 incense without mixing in sticks or changing available funds', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 105 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(105)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'stick')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'moon')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-glyph', 'sun')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangxiang-ring')[0]?.props['data-remaining']).toBe(105)
  })

  it('drops glyphs at 1000+ and keeps its compact amount in the single caption instead of a top chip', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 1_000 * 50_000, usedIncenseToday: 0 })
    expect(store.getSnapshot().personal.remainingIncense).toBe(1_000)
    const tree = renderPanel(store.getSnapshot())
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'one')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'ten')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-incense-mark', 'hundred')).toHaveLength(0)
    const overflow = findByAttr(tree, 'data-liangxiang-incense-overflow')
    expect(overflow).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-overflow-aura')).toHaveLength(0)
    expect(textContent(findByAttr(tree, 'data-caption-copy'))).toBe('今日凝香1K炷')
    expect(findByAttr(tree, 'data-liangxiang-ring')[0]?.props['data-remaining']).toBe(1_000)
  })

  it('keeps 下一炷 passive and exactly readable without a model-rate tooltip', () => {
    const tree = renderPanel(demoState())
    const next = findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0]
    const value = findByAttr(tree, 'data-liangxiang-compact', 'next-incense')[0]
    expect(next?.props.tabIndex).toBeUndefined()
    expect(next?.props['aria-label']).toBe('下一炷 3,000 当量')
    expect(value?.props.title).toBeUndefined()
    expect(findByAttr(tree, 'data-liangxiang-weight-hint')).toHaveLength(0)
    expect(findByAttr(tree, 'aria-label', '凝香规则')).toHaveLength(0)
  })

  it('preserves exact next-incense information for a configurable threshold without repeating model rules', () => {
    const base = createMockLiangxiangStore({ tokenPerIncense: 60_000, effectiveTokensToday: 0, usedIncenseToday: 0 }).getSnapshot()
    const tree = renderPanel(base)
    expect(findByAttr(tree, 'data-liangxiang-personal', 'next-incense')[0]?.props['aria-label']).toBe('下一炷 60,000 当量')
    expect(textContent(tree)).toContain('距下一炷还差 60,000 当量')
    expect(findByAttr(tree, 'data-liangxiang-weight-hint')).toHaveLength(0)
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
    expect(styleOf(findByAttr(idle, 'data-liangxiang-region', 'core')[0]).padding).toBe('10px 0 32px')
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
    expect(textContent(findByAttr(tree, 'data-liangxiang-vote-feedback'))).toBe('')
    expect(NO_INCENSE_REASON).toBe('香炉空了，先去攒香')
    expect(NO_INCENSE_REASON.length).toBeLessThanOrEqual(10)
    expect(NO_INCENSE_REASON).not.toContain('投票')
    expect(LOCAL_MODE_NOTE).not.toContain('投票')
    expect(STAGING_MODE_NOTE).not.toContain('投票')
  })

  it('keeps 梁小号 in the idle row when the furnace is empty', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 47_000, usedIncenseToday: 0 })
    const tree = renderPanel(store.getSnapshot(), '', {
      localEpithet: { dedication: '旁观', stance: '闲梁', label: '旁观 • 闲梁', spent: 0 },
    })
    const row = findByAttr(tree, 'data-liangxiang-vote-feedback')[0]
    expect(row && textContent([row])).toBe('梁小号：旁观闲梁')
    expect(row?.props['data-liangxiang-epithet']).toBe('')
  })

  it('shows the empty-furnace tip only as transient feedback', () => {
    const store = createMockLiangxiangStore({ effectiveTokensToday: 47_000, usedIncenseToday: 0 })
    const tree = renderPanel(store.getSnapshot(), NO_INCENSE_GAG, {
      localEpithet: { dedication: '旁观', stance: '闲梁', label: '旁观 • 闲梁', spent: 0 },
    })
    const row = findByAttr(tree, 'data-liangxiang-vote-feedback')[0]
    expect(row && textContent([row])).toBe(NO_INCENSE_GAG)
    expect(row?.props['data-liangxiang-epithet']).toBeUndefined()
    expect(EMPTY_INCENSE_FEEDBACK_MS).toBe(3000)
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
    expect(row && textContent([row])).toBe('梁小号：勤香死夯梁')
    expect(row?.props['data-liangxiang-epithet']).toBe('')
    expect(row?.props.role).toBe('status')
    expect(row?.props.title).toBeUndefined()
    expect(row?.props.tabIndex).toBeUndefined()
    expect(row?.props.onClick).toBeUndefined()
    expect(row?.props.onKeyDown).toBeUndefined()
    expect(findByAttr(tree, 'data-liangxiang-epithet-hint')).toHaveLength(0)
    expect(styleOf(row).height).toBe('22px')
    expect(styleOf(findByAttr(tree, 'data-liangxiang-epithet-line')[0]).alignItems).toBe('center')
    expect(styleOf(findByAttr(tree, 'data-liangxiang-epithet-mark')[0])).toMatchObject({
      width: '5px',
      height: '5px',
      borderRadius: '50%',
    })
  })

  it('scrolls a long broadcast beside a fixed dismiss control and remembers that broadcast ID', () => {
    const state: LiangxiangViewState = {
      ...demoState(),
      broadcast: {
        id: 'broadcast-qq',
        level: 'important',
        message: 'QQ群 453683905 已开，来群里一起出梁案、晒梁位、催更新，重要信息不错过',
        startsAt: 1,
        expiresAt: 2,
        updatedAt: 1,
      },
    }
    const localEpithet = { dedication: '勤香', stance: '死夯梁', label: '勤香 • 死夯梁', spent: 20 }
    let dismissed = ''
    const broadcast = renderPanel(state, '', {
      localEpithet,
      onBroadcastDismiss: id => { dismissed = id },
    })
    const row = findByAttr(broadcast, 'data-liangxiang-vote-feedback')[0]
    expect(row?.props['data-liangxiang-broadcast']).toBe('important')
    expect(row && textContent([row])).toContain('梁相广播：QQ群 453683905 已开')
    const close = findByAttr(broadcast, 'data-liangxiang-broadcast-dismiss')[0]
    expect(close?.props['aria-label']).toBe('关闭本条梁相广播')
    const track = findByAttr(broadcast, 'data-liangxiang-broadcast-track')[0]
    expect(track?.props['data-scrolling']).toBe('')
    expect(styleOf(track).animation).toContain('liangxiang-broadcast-marquee')
    ;(close?.props.onClick as (() => void) | undefined)?.()
    expect(dismissed).toBe('broadcast-qq')
    expect(findByAttr(broadcast, 'data-liangxiang-region')).toHaveLength(4)

    const vote = renderPanel(state, '已上香 · 夯（剩余 4 炷）', { localEpithet })
    expect(textContent(findByAttr(vote, 'data-liangxiang-vote-feedback'))).toBe('已上香 · 夯（剩余 4 炷）')

    const hidden = renderPanel(state, '', { localEpithet, dismissedBroadcastId: 'broadcast-qq' })
    expect(findByAttr(hidden, 'data-liangxiang-broadcast-dismiss')).toHaveLength(0)
    expect(textContent(findByAttr(hidden, 'data-liangxiang-vote-feedback'))).toBe('梁小号：勤香死夯梁')

    const next = renderPanel({
      ...state,
      broadcast: state.broadcast === null ? null : { ...state.broadcast, id: 'broadcast-next' },
    }, '', { localEpithet, dismissedBroadcastId: 'broadcast-qq' })
    expect(findByAttr(next, 'data-liangxiang-broadcast-dismiss')).toHaveLength(1)

    const reduced = renderPanel(state, '', { localEpithet, reducedMotion: true })
    expect(findByAttr(reduced, 'data-liangxiang-broadcast-track')[0]?.props['data-scrolling']).toBeUndefined()
  })

  it('charges a held vote button without adding a fifth region', () => {
    const state = demoState()
    const tree = renderPanel(state, '', { chargeVoteType: 'up', charge: 0.8 })
    const votes = findByAttr(tree, 'data-liangxiang-vote')
    expect(votes[0]?.props['data-charging']).toBe('')
    expect(votes[0]?.props['data-armed']).toBe('')
    expect(votes[1]?.props['data-charging']).toBeUndefined()
    expect(styleOf(votes[0])['--charge']).toBe('0.8')
    expect(votes[0] && textContent([votes[0]])).toBe(`倾炉 ×${Math.min(state.personal.remainingIncense, VOTE_COUNT_MAX)}`)
    expect(styleOf(votes[0]).minHeight).toBe('38px')
    expect(findByAttr(tree, 'data-liangxiang-region').map((node) => node.props['data-liangxiang-region']))
      .toEqual(['case', 'core', 'vote', 'social'])
  })

  it('charges 拉 as its own cool vessel, still without a fifth region', () => {
    const state = demoState()
    const tree = renderPanel(state, '', { chargeVoteType: 'down', charge: 0.8 })
    const votes = findByAttr(tree, 'data-liangxiang-vote')
    expect(votes[1]?.props['data-liangxiang-vote']).toBe('down')
    expect(votes[1]?.props['data-charging']).toBe('')
    expect(votes[1]?.props['data-armed']).toBe('')
    expect(votes[0]?.props['data-charging']).toBeUndefined()
    expect(styleOf(votes[1])['--charge']).toBe('0.8')
    expect(votes[1] && textContent([votes[1]])).toBe(`倾炉 ×${Math.min(state.personal.remainingIncense, VOTE_COUNT_MAX)}`)
    expect(findByAttr(tree, 'data-liangxiang-vote-bolt')).toHaveLength(2)
    expect(findByAttr(tree, 'data-liangxiang-region').map((node) => node.props['data-liangxiang-region']))
      .toEqual(['case', 'core', 'vote', 'social'])
  })

  it('caps the dump label at the vote count max when remaining is larger', () => {
    const store = createMockLiangxiangStore({
      effectiveTokensToday: 1_234 * 50_000,
      usedIncenseToday: 0,
    })
    const tree = renderPanel(store.getSnapshot(), '', { chargeVoteType: 'up', charge: 0.8 })
    expect(store.getSnapshot().personal.remainingIncense).toBeGreaterThan(VOTE_COUNT_MAX)
    expect(textContent(findByAttr(tree, 'data-liangxiang-vote').slice(0, 1))).toBe(`倾炉 ×${VOTE_COUNT_MAX}`)
  })

  it('lets a synthetic click vote when incense remains', () => {
    const clicks: string[] = []
    const tree = renderPanel(demoState(), '', {
      onVoteClick: (voteType) => clicks.push(voteType),
    })
    for (const vote of findByAttr(tree, 'data-liangxiang-vote')) {
      const click = vote.props.onClick as (() => void) | undefined
      click?.()
    }
    expect(clicks).toEqual(['up', 'down'])
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
    expect(incenseHint && textContent([incenseHint])).not.toContain(MY_INCENSE_STAT_LABEL)
    expect(voterHint && textContent([voterHint])).toContain(STAT_TODAY_LABEL)
    expect(voterHint && textContent([voterHint])).toContain(STAT_LIFETIME_LABEL)
    expect(voterHint && textContent([voterHint])).toContain('2,841')
    expect(incense?.props.title).toBeUndefined()
    expect(voters?.props.title).toBeUndefined()
  })

  it('keeps 此身香火 inside the 三界香火 hover detail, not on the main face', () => {
    const mine = deriveLocalIncenseStats({
      lifetimeUp: 80,
      lifetimeDown: 20,
      todayUp: 8,
      todayDown: 4,
    })
    const tree = renderPanel(demoState(), '', { localIncense: mine })
    const incenseHint = findByAttr(tree, 'data-liangxiang-stat-hint', 'incense')[0]
    const mineHint = findByAttr(tree, 'data-liangxiang-stat-mine')[0]
    const voterHint = findByAttr(tree, 'data-liangxiang-stat-hint', 'voters')[0]
    expect(MY_INCENSE_STAT_LABEL).toBe('此身香火')
    expect(incenseHint && textContent([incenseHint])).toContain(INCENSE_STAT_LABEL)
    expect(mineHint && textContent([mineHint])).toContain(MY_INCENSE_STAT_LABEL)
    expect(mineHint && textContent([mineHint])).toContain(STAT_SHARE_LABEL)
    expect(mineHint && textContent([mineHint])).toContain('夯66%')
    expect(mineHint && textContent([mineHint])).toContain('夯80%')
    expect(voterHint && textContent([voterHint])).not.toContain(MY_INCENSE_STAT_LABEL)
    expect(findByAttr(tree, 'data-liangxiang-stat-mine-inline')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-stat', 'incense')[0]?.props.role).toBeUndefined()
    expect(findByAttr(tree, 'data-liangxiang-stat', 'voters')[0]?.props.role).toBeUndefined()
    expect(findByAttr(tree, 'data-liangxiang-region').map((node) => node.props['data-liangxiang-region']))
      .toEqual(['case', 'core', 'vote', 'social'])
  })

  it('puts 三界香火 and 五行香客 side by side: labels over numbers, aligned to the two ritual buttons', () => {
    const tree = renderPanel(demoState())
    const social = findByAttr(tree, 'data-liangxiang-region', 'social')[0]
    const incense = findByAttr(tree, 'data-liangxiang-stat', 'incense')[0]
    const voters = findByAttr(tree, 'data-liangxiang-stat', 'voters')[0]
    const slot = findByAttr(social === undefined ? [] : [social], 'data-liangxiang-utility-slot')[0]
    const desk = findByAttr(tree, 'data-liangxiang-utility-desk')[0]
    const entry = findByAttr(tree, 'data-liangxiang-liangci-entry')[0]
    const incenseValue = findByAttr(tree, 'data-liangxiang-stat-value', 'incense')[0]
    const voterValue = findByAttr(tree, 'data-liangxiang-stat-value', 'voters')[0]
    expect(findByAttr(tree, 'data-liangxiang-incense-icon')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangxiang-voter-icon')).toHaveLength(1)
    expect(styleOf(social).display).toBe('grid')
    expect(styleOf(social).gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr) auto')
    expect(styleOf(social).gridTemplateRows).toBe('auto auto')
    expect(styleOf(social).alignItems).toBe('center')
    expect(styleOf(incense).gridColumn).toBe(1)
    expect(styleOf(voters).gridColumn).toBe(2)
    expect(styleOf(incense).gridRow).toBe('1 / 3')
    expect(styleOf(voters).gridRow).toBe('1 / 3')
    expect(styleOf(incense).gridTemplateRows).toBe('subgrid')
    expect(styleOf(incense).gridTemplateColumns).toBe('auto minmax(0, 1fr)')
    expect(styleOf(incense).alignItems).toBe('center')
    const incenseIcon = findByAttr(tree, 'data-liangxiang-stat-icon', 'incense')[0]
    const voterIcon = findByAttr(tree, 'data-liangxiang-stat-icon', 'voters')[0]
    expect(styleOf(incenseIcon).gridRow).toBe('1 / 3')
    expect(styleOf(voterIcon).gridRow).toBe('1 / 3')
    expect(styleOf(incenseIcon).alignSelf).toBe('center')
    expect(styleOf(voterIcon).alignSelf).toBe('center')
    expect(findByAttr(tree, 'data-liangxiang-incense-icon')[0]?.props.height).toBe(16)
    expect(findByAttr(tree, 'data-liangxiang-voter-icon')[0]?.props.height).toBe(16)
    expect(styleOf(slot).display).toBe('contents')
    expect(styleOf(desk).gridRow).toBe(1)
    expect(styleOf(entry).gridRow).toBe(2)
    expect(styleOf(incenseValue).textAlign).toBe('center')
    expect(styleOf(voterValue).textAlign).toBe('center')
    expect(styleOf(findByAttr(tree, 'data-liangxiang-stat-label', 'incense')[0]).fontSize).toBe('11px')
    expect(styleOf(findByAttr(tree, 'data-liangxiang-stat-label', 'voters')[0]).fontSize).toBe('11px')
    expect(findByAttr(tree, 'data-liangxiang-utility-desk')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangxiang-liangci-entry')).toHaveLength(1)
  })
})

describe('梁相案牍', () => {
  it('bounds social counts while preserving the full labels and exact accessible detail', () => {
    for (const [value, expected] of [[0, '0'], [999, '999'], [1000, '1K'], [9999, '9.99K'], [99999, '9.99万'], [9999999, '999.9万'], [Number.MAX_SAFE_INTEGER, '9007万亿']] as const) {
      const initial = demoState()
      const state = { ...initial, snapshot: { ...initial.snapshot, totalIncense: value, upVotes: value, downVotes: 0, uniqueVoters: value } }
      const tree = renderPanel(state, '', { onOpenMarket: () => undefined })
      for (const kind of ['incense', 'voters'] as const) {
        const stat = findByAttr(tree, 'data-liangxiang-stat', kind)[0]!
        const count = findByAttr(tree, 'data-liangxiang-stat-value', kind)[0]!
        expect(textContent([count])).toBe(expected)
        expect(stat.props['aria-label']).toContain(value.toLocaleString('zh-CN'))
        expect(stat.props.title).toBeUndefined()
        const hint = findByAttr(tree, 'data-liangxiang-stat-hint', kind)[0]!
        expect(textContent([hint])).toContain(value.toLocaleString('zh-CN'))
      }
      expect(textContent([findByAttr(tree, 'data-liangxiang-stat-label', 'incense')[0]!])).toBe('三界香火')
      expect(textContent([findByAttr(tree, 'data-liangxiang-stat-label', 'voters')[0]!])).toBe('五行香客')
    }
  })
  it('opens one clearly named market action while keeping its miniature decorative', () => {
    let opened = 0
    const tree = renderPanel(onlineState(), '', { utilityOpen: true, reducedMotion: true, onOpenMarket: () => { opened++ } })
    const market = findByAttr(tree, 'data-liangxiang-market-entry')[0]
    expect(market?.props['aria-label']).toBe('梁股 · 香火市场：走势与三次入场')
    expect(market?.props['data-motion']).toBe(false)
    expect(market && textContent([market])).toContain('梁股')
    expect(findByAttr(tree, 'data-liangxiang-utility-market')).toHaveLength(0)
    expect(findByAttr(tree, 'data-liangxiang-utility-action', 'bars')).toHaveLength(0)
    const icon = findByAttr(tree, 'data-liangxiang-utility-icon', 'market')[0]
    expect(icon?.props['aria-hidden']).toBe('true')
    expect(icon?.props.focusable).toBe('false')
    expect(findByAttr(tree, 'data-liangxiang-utility-action')).toHaveLength(5)
    const onClick = market?.props.onClick as ((event: { detail: number, currentTarget: HTMLButtonElement }) => void) | undefined
    onClick?.({ detail: 0, currentTarget: { matches: () => false } as unknown as HTMLButtonElement })
    expect(opened).toBe(1)
  })

  it('keeps one direct market entry above two compact ritual actions with pointer and keyboard activation', () => {
    const calls: { origin: string, trigger: HTMLButtonElement, keyboard: boolean }[] = []
    const tree = renderPanel(onlineState(), '', { utilityOpen: true, onOpenMarket: (origin, trigger, keyboard) => calls.push({ origin, trigger, keyboard }) })
    const main = findByAttr(tree, 'data-liangxiang-market-entry')[0]!
    expect(findByAttr(tree, 'data-liangxiang-utility-market')).toHaveLength(0)
    const social = findByAttr(tree, 'data-liangxiang-region', 'social')[0]
    const desk = findByAttr(tree, 'data-liangxiang-utility-desk')[0]
    const utility = findByAttr(tree, 'data-liangxiang-utility-trigger')[0]!
    const calendar = findByAttr(tree, 'data-liangxiang-liangci-entry')[0]!
    expect(styleOf(social).gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr) 78px')
    expect(styleOf(main).gridRow).toBe(1)
    expect(styleOf(desk).gridRow).toBe(2)
    expect(styleOf(calendar).gridRow).toBe(2)
    expect(styleOf(desk).width).toBe('78px')
    expect(main.props['aria-label']).toBe('梁股 · 香火市场：走势与三次入场')
    expect(utility.props['aria-label']).toBe(`${UTILITY_LABEL}：${UTILITY_HINT}`)
    expect(calendar.props['aria-label']).toContain('进入梁祠')
    for (const node of [main, utility, calendar]) expect(node.props.title).toBeUndefined()
    expect(textContent([utility])).toContain('牍')
    expect(textContent([calendar])).toContain('祠')
    expect(findByAttr([main], 'data-liangxiang-utility-icon', 'market')).toHaveLength(1)
    // A pointer can click an already keyboard-focused trigger. Its lingering
    // :focus-visible state must not turn that native pointer click into a key.
    const trigger = { matches: () => true } as unknown as HTMLButtonElement
    const activate = (node: RenderedElement, detail: number): void => {
      const click = node.props.onClick as (event: { detail: number, currentTarget: HTMLButtonElement }) => void
      click({ detail, currentTarget: trigger })
    }
    activate(main, 1)
    activate(main, 0)
    expect(calls).toEqual([{ origin: 'panel', trigger, keyboard: false }, { origin: 'panel', trigger, keyboard: true }])
    expect(findByAttr(tree, 'data-liangxiang-region')).toHaveLength(4)
    expect(findByAttr(tree, 'data-liangxiang-vote')).toHaveLength(2)
  })

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
    const desk = findByAttr(tree, 'data-liangxiang-utility-desk')[0]
    expect(styleOf(slot).display).toBe('contents')
    expect(styleOf(desk).position).toBe('relative')
    expect(styleOf(desk).gridRow).toBe(1)
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
    let asks = 0, reconciles = 0, cancels = 0
    const callbacks = { utilityOpen: true, onOpenMarket: () => undefined, onReconcileAsk: () => { asks++ }, onReconcileConfirm: () => { reconciles++ }, onReconcileCancel: () => { cancels++ } }
    const resting = renderPanel(onlineState(), '', callbacks)
    const tree = renderPanel(onlineState(), '', { ...callbacks, reconcilePending: true })
    const confirm = findByAttr(tree, 'data-liangxiang-reconcile-confirm')[0]
    expect(confirm?.props.role).toBe('alertdialog')
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_PROMPT)
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_OK)
    expect(confirm && textContent([confirm])).toContain(RECONCILE_CONFIRM_CANCEL)
    const repair = findByAttr(tree, 'data-liangxiang-utility-action', 'reconcile')[0]
    expect(repair && textContent([repair])).toContain(UTILITY_RECONCILE_LABEL)
    expect(repair && textContent([repair])).toContain('显示异常？')
    expect(styleOf(confirm)).toMatchObject({ position: 'absolute', inset: 0, zIndex: 5 })
    const restingDrawer = findByAttr(resting, 'data-liangxiang-utility-drawer')[0]
    const confirmDrawer = findByAttr(tree, 'data-liangxiang-utility-drawer')[0]
    expect(styleOf(restingDrawer).height).toBe('180px')
    expect(styleOf(confirmDrawer).height).toBe(styleOf(restingDrawer).height)
    const ask = repair?.props.onClick as () => void
    ask()
    expect(asks).toBe(1)
    expect(reconciles).toBe(0)
    const cancel = findByAttr(tree, 'data-liangxiang-reconcile-cancel')[0]?.props.onClick as () => void
    cancel()
    expect(cancels).toBe(1)
    expect(reconciles).toBe(0)
    const ok = findByAttr(tree, 'data-liangxiang-reconcile-ok')[0]?.props.onClick as () => void
    ok()
    expect(reconciles).toBe(1)
  })

  it('keeps the 2x2 utilities and repair, with the legacy read-only route only when market is absent', () => {
    const tree = renderPanel(onlineState(), '', { utilityOpen: true })
    expect(findByAttr(tree, 'data-liangxiang-utility-drawer')).toHaveLength(1)
    const bridge = findByAttr(tree, 'data-liangxiang-utility-bridge')[0]
    expect(styleOf(bridge).bottom).toBe('100%')
    expect(styleOf(bridge).height).toBe('7px')
    expect(styleOf(bridge).width).toBe('242px')
    // Four grid tiles + the full-width 走势 row + the collapsed repair action.
    expect(findByAttr(tree, 'data-liangxiang-utility-action')).toHaveLength(6)
    const bars = findByAttr(tree, 'data-liangxiang-utility-action', 'bars')[0]
    expect(bars).toBeDefined()
    expect(bars && textContent([bars])).toContain(UTILITY_BARS_LABEL)
    expect(bars && textContent([bars])).toContain(UTILITY_BARS_HINT)
    expect(styleOf(bars).gridColumn).toBeUndefined()
    expect(styleOf(bars).width).toBe('100%')
    expect(findByAttr(tree, 'data-liangxiang-utility-action', 'day-end')).toHaveLength(1)
    expect(findByAttr(tree, 'data-liangxiang-utility-action', 'home')).toHaveLength(1)
    const mode = findByAttr(tree, 'data-liangxiang-utility-action', 'mode')[0]
    expect(mode && textContent([mode])).toContain(UTILITY_MODE_LOCAL_LABEL)
    expect(findByAttr(tree, 'data-liangxiang-utility-action', 'reset-position')).toHaveLength(0)
    // 走势 must not become a fifth panel region.
    expect(findByAttr(tree, 'data-liangxiang-bars-dock')).toHaveLength(0)
    const version = findByAttr(tree, 'data-liangxiang-utility-action', 'version')[0]
    expect(version).toBeDefined()
    expect(version?.props['aria-label']).toContain(`v${PLUGIN_VERSION}`)
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
  it('keeps old archive range text while the current 梁工 range starts at 25%', () => {
    const old = renderDeep(<LiangAvatar state="liang_gong" policyVersion={LEGACY_LIANGZI_POLICY_VERSION} pulse={false} reducedMotion />)
    const current = renderDeep(<LiangAvatar state="liang_gong" pulse={false} reducedMotion />)
    expect(findAll(old, node => node.type === 'img')[0]?.props.alt).toBe('梁子当前状态：梁工（夯率 < 50%）')
    expect(findAll(current, node => node.type === 'img')[0]?.props.alt).toBe('梁子当前状态：梁工（25% ≤ 夯率 < 50%）')
  })

  it('every Liangzi state renders a different artwork composition', () => {
    const serialized = LIANGZI_STATES.map((state) =>
      JSON.stringify(renderDeep(<LiangAvatar state={state} pulse={false} reducedMotion={true} />)))
    expect(new Set(serialized).size).toBe(LIANGZI_STATES.length)
  })

  it('labels every state with its Chinese display name', () => {
    const labels = ['待开梁', '小难梁', '梁工', '梁总', '梁神', '梁圣', '梁祖']
    LIANGZI_STATES.forEach((state, index) => {
      const tree = renderDeep(<LiangAvatar state={state} pulse={false} reducedMotion={true} />)
      expect(textContent(tree)).toContain(labels[index] ?? '')
    })
  })
})


describe('wallet compatibility feedback', () => {
  it('shows the exact minimum-version instruction instead of a generic network failure', () => {
    const hint = '请升级至梁相2.0.0及以上版本'
    const state = { ...onlineState(), connection: 'live' as const, authorityAvailable: false, authorityReason: hint }
    const tree = renderPanel(state)
    const text = textContent(tree)
    expect(text).toContain(hint)
    expect(text).not.toContain('无法连接天庭：' + hint)
    const votes = findByAttr(tree, 'data-liangxiang-region', 'vote').flatMap(region => findAll([region], node => node.type === 'button'))
    expect(votes.length).toBe(2)
    expect(votes.every(node => node.props.disabled === true)).toBe(true)
  })
})

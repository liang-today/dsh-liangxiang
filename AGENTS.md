# AGENTS.md — 梁相 V0.1

> This file defines the permanent product and engineering rules for the Liangxiang repository.
> It applies to Cursor, Codex, and any other coding agent working in this repo.
> If old code, tests, docs, prompts, comments, or mock data conflict with this file, this file wins.
> Read `docs/CURRENT_ARCHITECTURE.md` next for the current repository/runtime
> map and evidence routing. `docs/LIANGXIANG_CURSOR_MASTER_R3.md` is a historical
> prompt archive and must not be loaded as a current execution plan.
> Brand theme and release copy are centralized in `docs/140-liangxiang-brand.md`.

## Cumulative wallet and market candidate

The approved extension in `docs/MARKET_WALLET.md` supersedes the daily-only
spendable-balance formulas below for online wallets. Assets and confirmed
sub-stick usage carry across business dates; daily statistics, gifts and cases
remain date-scoped. `remaining_incense` means wallet **available** incense,
excluding frozen orders; today's used incense may exceed today's earned amount.
Legacy/offline daily accounting stays isolated and never funds community trades.

Approved 2026-11-08 compatibility correction: a daily-only installation does
not accumulate funds or fractional usage across dates. Expire them using the
backend business clock, including offline users and restart. First authenticated
cumulative-client use enables the wallet once, preserving ONLY that day's actual
remaining funds and fractional progress, never summing historical daily rows.
Once enabled, old requests require client >=2.0.0 before any personal mutation;
they never revert its wallet to daily mode or touch frozen positions/settlement.
Schema-14 candidate wallets already held cumulative assets: preserve them during
schema-15 migration. Released 1.2 ignores server error prose; only a client patch
can add a specific on-screen upgrade explanation. Never claim otherwise.

New v3 markets accept positions at 07:00–11:00 / 12:00–16:00 / 17:00–21:00,
lock at 11:00/16:00/21:00, fix raw-count reference points at 12:00/17:00/22:00
and share the old case's midnight close. Existing v1/v2 markets retain all
stored deadlines and their original rule version through restart, settlement
and receipts; v2's early session still opens at 09:00.
Server transactions own freezing, idempotency, integer pool allocation and
rollover. No client cache or chart is a ledger. Usage remains soft trust.

The approved blue pond design in `docs/MAIN_PANEL_BLUE_UI.md` supersedes the
older visual details below, without changing any accounting or market rule.
Keep the panel 256px and four regions. Use calm pale-blue water behind the
original figures, with height based only on available incense (0–500), saturating at 500.
Below 100, whole plants grow from the bottom with water depth; do not expose
only the tips of a clipped full plant. Two little stones per side stay at the
roots. Above 100, an occasional small whale performs the same two puffs;
foreground bubbles grow upward from above its head and pop at the live water
surface, away from the portrait. Hide/static/unmount cancels all local motion.
The left caption defaults to today's earned total. Confirmed settlements
briefly show gained incense and then available incense; confirmed vote spending
also briefly shows personal available incense. Repeated frames must not replay
that feedback, while consecutive accepted votes keep the balance readable.
Sustained request activity never replaces the daily caption. It may grow small
bubbles near the plants, rising and popping at the actual water surface, without
changing water or progress. No water or an extremely thin layer uses only the
ring-bottom glow; shallow bubbles fit the visible water, while their surface
pop rings remain at least 18×3 CSS pixels and centered on the bubble. Keep these emitters
separate from the whale's two original puffs and cancel all activity on hide,
static preference or unmount. Clicking the figure inspects
available incense. One highest-order ring glyph group (ones / tens / hundreds)
avoids crowding; large amounts use the compact caption and exact accessible
summary. The full-width Liangwei pill matches the two vote buttons together.
Preserve blue charge/bolt/dump choreography and the original gesture timing.
Keep the dock rounded-square. Never trim Shen/Sheng's native halos.
The utility drawer no longer repeats the direct market entry. Repair and mode
confirmation occupy the same fixed-height drawer, never an expanding row.

The four-region panel and original Liangzi effects remain intact. The approved
main panel keeps its original 256 CSS pixels, matching the default DSH
sidebar's content width, with its default outer left edge and badge at x=12.
Clamp the panel independently at narrow viewport edges; never rewrite the
freely dragged badge position to fit it. Region 4's compact right column has
the direct `梁股` action above two bold icon-and-glyph controls `牍` / `祠`.
Keep their full accessible names and custom hints. The market uses the primary
ritual accent; tools/history use the quieter theme color. The utility drawer omits the duplicate market shortcut; the direct entry opens
the existing chart/trading view. Keyboard closing returns focus to its actual origin;
pointer closing blurs the entry and keeps its hint quiet until real re-entry.
Do not add a second `梁位走势` entry or
restore the retired window from old browser preferences. Keep official minute candles distinct from the retained Host-local observation API.
Legacy five-minute records retain their true grain and are never subdivided. The whale stays
in the header between the title/wallet and window controls, outside the plot.
The same restrained gray future region in both charts starts at the actual
business clock, with a clear current-time boundary and left-aligned `待开梁`
caption. Thin stage strips distinguish investment windows without stacking
full-height backgrounds; missing historical data remains a gap. The footer carries a quiet `午夜揭晓` beside the selected pool; its full
explanation states all three pools reveal after 24:00. One noninteractive time-window text beside the zoom controls shows the actual zoomed span.
Wheel zoom is continuous and pointer-anchored; +/− step through 24/12/6/3/1 hours and 30 minutes; candle grain is automatic,
never a separate interval selector, and cannot exceed the real source resolution. Record the active case all
business day, including before trading opens; phase shading never hides prices. The normal window and order ticket stay compact. The header whale uses action-specific local motion and readable speech. It reports the selected batch's actual cutoff and pool once per minute, below operation/error priority; clicking it reports on demand.
The stage buttons use centered groups with small daypart icons: 早盘/午盘/晚盘
above the user's direction/amount, with the actual cutoff in quieter type
(11点封盘; retain minutes for non-hour cutoffs). Omit 未投入; show necessary
status when there is no position. Use 争梁位/已定梁 consistently. The footer's
left two thirds contain three aligned cells: 梁位/state, 今日香池 (all three
stages), and the selected stage's pool with the quiet reveal hint at the right; the right third contains 我的回执/梁股玩法. Keep amount and 炷 together,
inside a stable information cell; never reserve a gap between digits and unit.
State text is bolder than its caption; the reveal hint stays quiet and secondary. Clicking either fact prompts the
fish; pool speech uses actual side quantities and percentages, never fake 50/50
for an empty pool. Do not restore a permanent countdown, sticky pool popup or
duplicate position-caption row. Stack 个人可用/冻结香火 on two rows with shared label, amount and unit
columns so 炷 aligns vertically. Put 今日香池 in the middle footer cell. The public daily pool sums all three batches' long/short pools
with exact integers; never add personal frozen funds again or label it cumulative
turnover. The wallet pair shares compact blue styling; footer pool amounts
share their own blue size and baseline. Keep exact accessible values. The wallet and chart toolbar share a compact 200px width and align both edges;
wallet amounts expand within that grid while units keep their common column.
Let the fish reclaim the released horizontal space for speech without reducing
its motion or increasing normal header height. The quiet midnight hint directly
follows its pool caption with a small gap, never automatic edge-pushing margins.
The slightly larger clock under the motion
toggle stays within its control column and uses server business date/time only.
Confirm and withdraw share one compact order row. The title is `梁股 · 香火市场`.
Receipts and rules open overlays from permanent buttons; batch, status and wallet updates never resize the window.
Its blue whale-girl artwork is a market
decoration, never a replacement central Liangzi or a new business namespace.
Market animation/static preference is local and respects reduced motion.
Market surfaces inherit DSH's explicit color scheme. Verify an OS-light / DSH-dark
combination as well as ordinary light/dark themes; static mode stops every local CSS transition and WAAPI action.
Dragging either chart must not select its labels or adjacent readout; ordinary
text outside the drag remains selectable. The 夯/拉 legend sits beside the
volume band in the same centered right-axis column as the price labels, below
the lowest tick, while 梁位 is in the footer; no independent readout row.
Candle details follow the pointer in a
bounded themed tooltip, retaining exact keyboard/touch access. Compact amounts
use at most four significant digits and truncate toward zero, with exact
accessible values and integer editing; 梁位 retains six truncated decimals.
Keep whole-fish swimming and local
motion in dynamic mode; solve sharpness in rendering rather than removing motion.
First uncached loading may swim two circles then return the same fish to its
header slot; errors, hiding, static mode and unmount cancel the flight. All
fish speech shares one unboxed, staggered fading area beside the fish; do not
restore a second speech card. Clicked fish may emit up to three short local
lines sampled from current confirmed facts. They expire, never block controls,
and never claim unconfirmed earnings. Static mode keeps the text readable.
New Hosts negotiate `x-liangxiang-wallet: cumulative-v1`. Older Hosts retain
the actual daily protocol and transactionally bounded daily voting, using the
same wallet. Never invent daily Tokens or spending to fit old equations; mixed
or downgraded installs that cannot represent their actual funds require a clear
compatibility response. Unupgraded daily-only users must remain supported.
Do not read another implementation until the independent implementation has
been completed and recorded in a commit; comparisons must be documented.

---

## 1. Product Contract

### Product identity

- Product name: **梁相**
- Technical identifiers are exclusively `dsh-liangxiang`, `liangxiang`,
  `/liangxiang/api`, `LIANGXIANG_*`, and `liangxiang-backend`. Do not add
  alternate brand namespaces to code, configuration, storage, routes, logs,
  deployments, tests, or documentation.
- 产品 UI/copy 中，中央角色统一称为 **梁子**；不直接使用现实人物姓名。
- DSH WebUI entry name, accessible name and default Hover / Focus text: **今日梁相**.
  Use one custom tooltip, never a competing native title popup. Pointer single
  click toggles the panel after a short 200ms classification window. Only taps
  within that interval form a double/continuous play gesture; they never change
  either the open or closed panel state. No separate long play/idle window.
  Keyboard toggles, × and Escape respond immediately; drag/cancel clears pending
  toggles and never plays a toy sound. Squash feedback is immediate.
  Comments are separate lightweight lines, with no shared speech card or tail.
  Keep them inside the panel's horizontal footprint and outside its content.
  The main panel NEVER moves or changes its gap for toy feedback. Align the
  speech area's top with the badge portrait and flow down into the adjacent
  empty space; reduce rows when the viewport or a below-stacked panel limits it.
  Fix the emission point throughout a burst so older rows truly fall on screen.
  Up to three live rows fit the available height; displaced and expired rows
  retain presence for a 420ms downward fade, with a full unclipped exit runway.
  Live text stays readable in both themes; reduced motion removes displacement.
  Center the ordinary hint when it fits and clamp only at actual viewport edges.
  Hide it during presses/comments, then restore. Preserve the contributor's
  original decorative lines when requested; their jokes are never balance
  receipts or new tiers and cannot change accounting. Keyboard activation
  never emits decorative speech.
- The docked entry's icon IS the current central 梁子 state (one of the six, or
  the 待开梁 placeholder) — never a letter or an abstract logo.
- The entry is freely placeable: it can be dragged anywhere in the frame and the
  position persists per browser (a cosmetic preference, never an authority).
- Panel title: **今日梁案**
- 梁位 = the single public number = global `up_ratio`, printed with decimals.
- There is at most one Active case at a time. Normally one per business date;
  operators may archive today's case and open another on the same date (TEMP).
- Voting is strictly binary:
  - `up` -> UI: **夯**
  - `down` -> UI: **拉**

### Never reintroduce

The following are obsolete and must not return as Liangxiang product concepts:

- `稳`, neutral, steady, abstain, or any third vote option
- candidate / Candidate Ranking
- leaderboard / ranking / winner / Top-N / #1/#2/#3 梁位
- 大夯 / 偏夯 / 胶着 / 偏拉 / 大拉
- global `LiangScore`, 0–100 梁分, Bayesian prior
- `BallotLedger`, `LiangBallot`, 梁签 as the core voting-credit model
- 老梁
- old personal avatar progression `梁哥 -> 梁总 -> 梁神 -> 梁圣 -> 梁祖`
- personal Token / earned incense / remaining incense driving the central Liangzi state
- “vote must not reduce LiangQi” as an invariant
- cache-read 10% weighting

Do not mechanically delete unrelated generic words from dependencies or third-party code. Remove only obsolete Liangxiang business semantics.

Artwork exception: `牢梁` is intentionally allowed only as the decorative
plaque inside the `WAITING / 待开梁` portrait. It is never a state name, tier,
metric, or UI label. The six active portraits may likewise carry a small
in-art badge/plaque matching their authoritative state name. These embedded
marks are visual jokes, not data or accessible copy.

---

## 2. Frozen UI Structure

The expanded Liangxiang panel has **four visual regions**. Do not add a separate “personal growth tier” section.

### Region 1 — 今日梁案

Show the single current Active case.

Example:

```text
今日梁案
DeepSeek Harness 是夯还是拉
```

### Region 2 — Central core

```text
今日凝香 7 炷     [梁子 + 个人香火环]     下一炷 3,000 当量
                  梁位 83.021952% → 梁神
```

Rules:

- left overlay: personal `earned_incense_today` (`今日凝香` = 今天总共生成的香火)
- center (in-flow, geometrically centered in the panel): concrete Liangzi
  avatar, the 香火环, and the incense-mark overlay. These three MUST share
  the panel's horizontal centerline. Personal flanks are absolutely positioned
  and MUST NOT participate in in-flow width (`space-between` / unequal flex
  columns are forbidden here — 「今日凝香」 being wider than 「下一炷」 must
  never shove 梁子 sideways).
- remaining incense uses only its highest nonzero pictorial magnitude on
  the ring: 0–9 sticks below 10, 1–9 moons for tens below 100, or 1–9 suns
  for hundreds below 1000. Keep clear orbit spacing and the bottom gap;
  do not paint every lower-order remainder at once. At 1000+ the transient
  personal caption and exact accessible ring summary carry the amount;
  never add a second permanent balance badge. Ring fill remains confirmed
  next-incense progress, independent of available incense and Liangzi state.
- the panel 梁子 and the docked logo bob together. Only the figure layer
  translates; chrome / ring / page stay still. Cadence follows personal
  `liang_qi_fill` (0 = slow idle bob, approaching 1 = faster), never remaining
  incense or the global 梁位. Respect `prefers-reduced-motion`.
- right overlay: personal `tokens_to_next_incense` in **Pro 当量** (not raw
  Flash Token). Keep it a passive caption without a hover/focus model-rate
  table or competing popup. Exact values remain accessible. Accounting and
  published rule explanations use the same static Pro ×1 / Flash, other and
  unknown ×0.5 source; do not create an independent table.
- Live requests may add restrained smoke/glow inside the existing core;
  never replace the daily caption with a persistent activity label. Activity is not progress: never extrapolate numeric Token captions,
  fill a fake percentage or mint spendable incense. Only confirmed ring
  geometry may interpolate; preserve figure bob cadence. Reduced motion uses
  static activity. Do not persist activity or transmit stream content.
- visible 下一炷 当量 uses integer compact (`33K`, never `≈ 33.4K`) so the
  flank does not overlap 梁子. The screen-reader summary keeps the exact
  integer without adding a hover popup. 今日凝香 / 环上 overflow 仍可用一位小数。
- under the avatar: **exactly one** global number — 梁位 = `up_ratio`, printed with
  6 decimals (`LIANG_POSITION_DECIMALS`) — then a causal arrow to the 称呼
  (`梁位 83.021952% → 梁神`). The authoritative text label remains outside the
  portrait; the artwork may also contain the decorative matching badge allowed
  by the exception above.
- `down_ratio` gets **no** second big number: it is `1 − 梁位` and appears only in
  the tooltip and the screen-reader summary
- the printed 梁位 must be TRUNCATED, never rounded, so it can never read as
  having crossed a threshold the rendered Liangzi state has not crossed
- central Liangzi must not be replaced by a Gauge, Donut, Meter, or plain percentage card
- Liangzi state and the personal 香火环 are visually overlaid but semantically independent
- 梁位 and Liangzi state must come from the **same Global Snapshot/version**

Why one value with decimals: two complementary integer percentages made an
accepted vote look like it did nothing (`90%` before, `90%` after). One value
with decimals moves on every accepted vote, which is the point of spending
incense.

### Region 3 — Voting

```text
[ 夯 · 升梁 ]     [ 拉 · 降梁 ]
```

- exactly two buttons
- labels are `夯 · 升梁` / `拉 · 降梁` (direction + action); the two buttons
  are equal-width and visually aligned (`1fr / 1fr` grid)
- vote type remains strictly `up` / `down` — the extra 升梁/降梁 copy is not a
  third option
- vote availability depends only on authoritative `remaining_incense > 0`
- click spends one stick; a long press dumps every stick the incense token bucket will allow (500/min refill, bucket cap 500, single-request cap 500) in **one** `count` request — never a loop of HTTP votes
- the reserved feedback row stays 22px / 12px type: idle shows the local-only 梁号 (`梁小号：勤香 • 死夯梁`); a dump shows `已上香 · 夯 ×N（剩余 M 炷）`; an empty furnace shows `香炉空了，先去攒香` for 3s then returns to 梁小号. A short, operator-controlled important/emergency broadcast may temporarily replace the idle 梁小号 in this same row; transport/outage and vote feedback keep priority, the message is length/time bounded, and expiry automatically restores 梁小号. Long copy scrolls as a single-line loop while a subtle, fixed × at the front dismisses only that broadcast ID for this browser; a new broadcast ID appears normally. Reduced-motion keeps the full message accessible without continuous scrolling. Never put broadcasts in 今日梁案 or add a toast/fifth region. The 梁号 resets on the business date with 今日凝香. Vote buttons may sit at 38px to fund that row. Do not add a fifth region or a personal-growth section
- do not add a third placeholder or neutral action
- Read/roll local daily participation and 梁小号 only after a real Host frame
  confirms the business date. Startup's browser-date placeholder must never
  reset or persist these records, including on reload or in another tab.
- 梁小号 is passive text, not a button or focus stop. Do not restore its
  removed explanatory tooltip; broadcasts keep their separate dismiss control.
- do not add a separate full-width “可用香火 N 炷” row; remaining incense belongs inside the 香火环

### Region 4 — Social stats

```text
    三界香火        五行香客        梁股
     12,846          2,841        图标牍 图标祠
```

- 三界香火 = accepted votes for the current case (天/人/地香火汇于一炉)
- hovering 三界香火 shows that community pile on top and **此身香火**
  underneath: this installation's today/lifetime 夯拉 and the share of 三界香火
  (`占梁`). Local only, never a fifth region or a 梁位 percentage-point claim
- 五行香客 = unique users with at least one accepted vote for the current case/day (取经五众)
- the right edge is one compact two-row ritual-control column: direct `梁股`
  above bold icon + `牍` / icon + `祠`. Accessible names and custom short hints
  remain `梁股 · 香火市场`, `梁相案牍` and `进入梁祠`; all stay inside Region 4,
  never a fifth region. Preserve the primary market accent and quieter tool
  colors, the original statistics and core centerline. Closing a market returns
  to the real opening control for keyboard use; pointer closing blurs it.
  Escape never revives a stale hint or hover state. Compact statistics keep
  their full labels and exact accessible/tooltip values; large visual counts
  must fit their slots without shrinking the controls or overflowing
- routine Token claims, snapshots, reconnects and archive refresh are automatic;
  never present a routine manual-sync action
- 梁相案牍 opens a themed 2×2 utility drawer: 梁相主页、定时上香、在线模式/离线模式、
  当前版本. The direct main-panel market entry makes a duplicate drawer row
  unnecessary; omit it. The mode action always means switching to the other mode and requires
  explicit confirmation; network failure, reconnect, refresh and backend restart
  must never invoke it. 当前版本 opens a compact version-information dialog; the sound
  control has no long-press version gesture. `核对香火` remains under the collapsed
  `显示异常？` repair entry, outside the four main tiles. Its button spans the
  drawer content width, aligned with the outer edges of the 2×2 tiles; use a
  compact text row with natural wrapping, never the tiles' icon-column grid.
  It is repair-only: it must warn that unconfirmed local
  observation is discarded before rereading the server ledger
- destructive identity reset does not belong in this lightweight drawer; it
  requires a separate flow with explicit consequences and confirmation
- 进入梁祠 opens the read-only in-plugin calendar
- 进入梁祠 is not a vote, operator control, or external GitHub Pages link

### Opt-in timed incense (Issues #3/#5, PR #21)

- Default off. Reuse the existing utility tile and direction gesture; add no
  schedule panel, user interval setting or extra mode. Legacy day-end opt-in
  must be explicitly enabled again before expanding to daytime voting.
- The Host must run; the browser may close. Use the backend business clock and
  timezone online, the explicit local clock offline. After the balance reaches
  VOTE_COUNT_MAX, wait 10 minutes (independent of vote-rate tuning), then
  attempt one ordinary dump. Recheck the threshold after refreshing authority.
- At 23:59 make one additional closing dump even when less than a full request
  remains. Respect remaining incense, the existing authority budget and the
  per-request maximum. Best effort, never a promise to empty every balance.
  No per-stick queue, adaptive direction, vote privilege or rate-limit exemption.
- Right-click / keyboard context menu on 夯 or 拉 only saves the default direction
  and shows `定时上香：默认投夯/拉`. It never votes or enables the switch.
- Clicking the entire timed-incense tile toggles it; show `已开启` / `已关闭`
  and `保存中…`. Put cadence, closing time and direction
  in the existing hover/focus tooltip, never a permanent explanatory paragraph.
- Serialize manual and automatic intents. Manual work has priority and a 2s
  quiet window; recheck after refresh and persistence. Invalidate stale timers
  on date/case/mode changes or disable/re-enable, including asynchronous work.
- Keep one durable intent per mode. Persist its date, case, ID, direction, count
  and periodic/closing kind before sending. Uncertain/restart retries reuse
  the exact intent; finish it before creating a later batch or closing dump.
  Stop new attempts 5s before close and never replay yesterday into today.
- Never weaken backend transactions, idempotency or business-date checks.
- Count accepted automatic incense in the existing local participation and
  epithet displays. Persist actual quantities with the completed Host receipt;
  merge them with browser manual counts only at render time. Repeated frames,
  tabs and reloads must not append them to browser storage. Never infer an
  uncertain historical acceptance from a requested count or balance delta.

### Explicit online/offline separation

- Online/community is the default. Offline/local play is selected only by the
  first-run choice, the 梁相案牍 mode action, or the explicit boot default
  `LIANGXIANG_BACKEND_URL=local`. The first-run welcome waits for an explicit
  click; it must not auto-select a mode on a timer.
- The community vote bucket refills 500 incense per minute by default
  (`LIANGXIANG_VOTE_RATE_LIMIT`), capped at 500; one request also caps at 500.
- The Host persists the preference. A network outage keeps online selected,
  continues observing Token, locks 夯/拉, and reconnects automatically.
- Community identity, online claim projection and the shared session high-water
  marks live in `storages/liangxiang.json`.
- Offline daily usage, spend ledger, aggregates, votes, selected case and all
  local 梁祠 archives live in the separate, lazily-created
  `storages/liangxiang_local.json`.
- The modes never merge incense, votes, cases or archives. Session high-water
  marks are shared only to ensure one cumulative DSH usage segment cannot mint
  incense in both modes.
- Switching back online succeeds only after a valid backend bootstrap; failure
  leaves offline mode and its data untouched.

### 梁祠 — immutable history calendar

梁祠 is a plugin-local, read-only calendar with day, ISO-week (Monday–Sunday),
and calendar-month archives. It must not change the current case, personal
incense, voting availability, or any ledger.

- today always renders the dedicated `今日进行中` mark. It never renders a
  terminal Liangzi state and is excluded from current-week/current-month totals
- after business-date rollover, the backend combines every closed case from the
  ended business date into one immutable day archive
- the current week/month is a temporary projection through yesterday only. It
  is never written as a permanent archive; Monday/month-day 1 with no completed
  days renders `待积` and `--`
- a completed week/month is persisted idempotently on a later business date
- aggregation is `sum(up_votes) / sum(total_votes)`, not an unweighted average
  of daily percentages or Liangzi enum values
- zero-vote archive, missing archive, future date, and today are four distinct
  states. Zero votes derive `WAITING` with null ratios, never fake 50/50
- an archive stores raw counts and policy versions; ratio and Liangzi state are
  derived from the same counts and policy
- history uses an independent cold channel: first connection fetches the full
  archive once, normal snapshot/SSE traffic carries only scalar
  `archive_version`, and rollover fetches `after_version` deltas
- a history failure preserves the last-known-good archive and marks it
  `档案未更新`; it must never make today's case or voting unavailable
- the calendar is a centered modal, reuses the existing Liangzi artwork and
  theme tokens, uses only the 4/5/6 rows the month actually needs, and keeps a
  stable dialog height; six-row density may reduce artwork/spacing but must
  never squeeze or clip the authoritative Liangzi labels. It supports keyboard focus trapping/Escape/focus return, narrow
  viewport horizontal calendar scrolling, dark mode, reduced motion, and zoom
- GitHub Pages is explicitly outside the current implementation scope

### 走势 — host-observed 梁位 candles (read-only, derived)

`走势` draws how 梁位 moved during one business date. It is a picture of what
this installation observed, not a community ledger and not a trading product.

- For this local-observation channel, the only source is the running Host sampling its own authoritative wire state
  every second. This channel does not read the separate official market series, so an unobserved minute
  has no data and must never be interpolated, back-filled or smoothed.
- `虚线区间` means the Host was not running long enough to sample. It says
  「未统计」 (not seen), never 「无人投票」; votes cast inside such a gap still
  count toward every total. Both the SVG footer and the client footer keep that
  sentence, and the client readout says `未统计` for such a bar.
- A case change is a hard break: counts reset, the candle series restarts, and
  two cases are never bridged into one line. Same-day archives do not paint
  history that was never observed.
- One candle is one minute (`BARS_BUCKET_MS = 60_000`, at most 1440 per business
  date). Coarser views (`5m`/`15m`/`1h`/`1d`) are aggregated from raw counts by
  the Host, never from averaged percentages. The browser picks the interval from
  the visible span, offers `15分 / 1时 / 今日 / 全部`, and may zoom and pan by
  asking for another `from`/`to`; the picture always comes from the server so an
  embed and the panel cannot disagree.
- Derived data only. Nothing here may spend incense, vote, open, archive or
  close a case, alter an archive, or influence 梁位. Failure to sample or to
  serve a bar must never make today's case or voting unavailable.
- Storage is one small JSON file per business date under
  `$DSH_HOME/storages/liangxiang-bars/days/<business-date>.json`, written
  whole-file and atomically by the single Host writer. This is the one
  deliberate exception to `storages/*.json` single-layout domains: it is
  rebuildable derived data, so a bad day file is skipped, never fatal.
- Three read-only routes: `/liangxiang/api/bars` (JSON), `/liangxiang/api/bars.svg`
  (server-rendered picture for embeds and sharing), `/liangxiang/api/bars/meta`.
  The wire contract lives in `src/shared/bars-v1.ts` and is versioned separately
  from the main wire state; changing its shape requires a new version.
- The server picture is self-contained and inert: no scripts, no external
  references, no user-authored text, every label escaped, deterministic bytes so
  a content hash can cache it. A window that includes now is never cached.
- The current market candidate uses one `香火交易` drawer row and its unified
  chart window. The legacy observation component is retained as a reference,
  not mounted as a second window; old display preferences never reopen it.
  Observation routes and sampling remain read-only compatibility services.
- Retired by decision (2026-11-06): in-chart order tickets, conditional rules
  and any third-party extension surface inside the chart. Do not add them, do
  not design around them, and do not mention them in product copy.

---

## 3. Global Liangzi State

### State enum

```text
WAITING      -> 待开梁
XIAO_NAN_LIANG -> 小难梁
LIANG_GONG   -> 梁工
LIANG_ZONG   -> 梁总
LIANG_SHEN   -> 梁神
LIANG_SHENG  -> 梁圣
LIANG_ZU     -> 梁祖
```

`WAITING / 待开梁` is **not a voted tier**. It is only the zero-vote placeholder state.

### The only driver: global up ratio

```text
if total_votes == 0:
    liangzi_state = WAITING
else if up_ratio < 0.25:
    liangzi_state = XIAO_NAN_LIANG
else if up_ratio < 0.50:
    liangzi_state = LIANG_GONG
else if up_ratio < 0.70:
    liangzi_state = LIANG_ZONG
else if up_ratio < 0.85:
    liangzi_state = LIANG_SHEN
else if up_ratio < 0.95:
    liangzi_state = LIANG_SHENG
else:
    liangzi_state = LIANG_ZU
```

Current thresholds (approved 2026-10-18, Issue #2): the lower half is split at 25%; the upper half gets harder toward 梁祖:

| Global up ratio | Liangzi state |
|---|---|
| 0 votes | 待开梁 |
| `0% <= x < 25%` (with votes) | 小难梁 |
| `25% <= x < 50%` | 梁工 |
| `50% <= x < 70%` | 梁总 |
| `70% <= x < 85%` | 梁神 |
| `85% <= x < 95%` | 梁圣 |
| `>= 95%` | 梁祖 |

### Visual direction

The joke is “a normal person is gradually夯 into an ancestor”:

- 待开梁: low-presence, unlit placeholder
- 小难梁: pale-blue hoodie, small bow, bashful expression; the same adult 梁子 face
- 梁工: ordinary engineer / work badge
- 梁总: suit / executive presence
- 梁神: halo / mild levitation / starts becoming absurd
- 梁圣: holy light / 法相
- 梁祖: ancestor/master form / maximum 梁威

Artwork can change later. State semantics follow the versioned policy below.

The global visual master is **现代编年志 × 克制梁祠**: approximately 80% DSH
native desktop UI, 15% calendar/chronicle structure, and 5% ritual accents.
Warm gold and vermilion are punctuation, not background themes. The main panel,
welcome, tooltips, icons, and 梁祠 must look like one system; do not drift into
an ancient-fantasy game, dashboard card wall, glassmorphism, or palace UI.

### Rule-version compatibility

- Current policy `liangzi-v0.2-25-50-70-85-95` has six voted tiers plus 待开梁.
- Legacy `liangzi-v0.1-50-70-85-95` retains 梁工 below 50%. Existing cases keep
  their opening policy; newly opened cases use the current policy. A restart
  must not silently reinterpret an active case.
- Sealed day/week/month archives derive their figure and range text with their
  recorded policy. A newly sealed day uses its last case's rule; a week/month
  uses its latest covered day's rule after summing raw counts. No enum averaging.
- Current clients send `x-liangxiang-liangzi-policy` with the current policy id.
  Requests without that capability receive a legacy presentation (four boundaries,
  known enum/policy ids) of the same counts, sequence, balance and vote receipt.
  This is cosmetic negotiation, never authority or vote weight.

### Forbidden inputs

Central Liangzi state must never directly depend on:

- `effective_tokens_today`
- `earned_incense_today`
- `used_incense_today`
- `remaining_incense`
- `token_remainder`
- `tokens_to_next_incense`
- `liang_qi_fill`
- `liang_qi_intensity`

---

## 4. Personal 香火环 (`LiangQi` is an internal compatibility name)

The 香火环 is **personal** and has no personal tier. Existing `LiangQi` type,
field, and code identifiers may remain for compatibility, but product UI,
accessible copy, README, demos, and promotion must call it **香火环**, not 梁气.

It expresses only:

1. how many incense sticks the current user still has available to spend
2. how far the current user is from earning the next incense stick

### A. Remaining incense -> LiangQi intensity

```text
remaining_incense
```

drives presentation intensity such as:

- particle density
- flame count / density
- aura strength
- halo intensity
- micro-glow density

This is presentation only. Do not create new business tiers such as weak/medium/strong LiangQi.

Use a bounded presentation function if needed, e.g. clamp/log/sqrt, so large balances do not create uncontrolled animation.

### B. Token progress -> 香火环 fill

```text
token_remainder
= effective_tokens_today % token_per_incense

liang_qi_fill
= token_remainder / token_per_incense

tokens_to_next_incense
= token_per_incense - token_remainder
```

When `token_remainder == 0`:

```text
liang_qi_fill = 0
tokens_to_next_incense = token_per_incense
```

This means a full incense stick was just earned and accumulation for the next one has restarted.

### Integrated copy

Do not add a separate personal-growth row.

The two personal incense numbers flank the central 梁子 (Region 2): `earned_incense_today`
(今日凝香, today's total generated) on the left, `tokens_to_next_incense` on
the right. The ring's incense glyphs show `remaining_incense` (what is left to
spend). The ring fill is next-incense progress; its footer slot is reserved for
the global 梁位 value.

```text
今日凝香 7 炷   [环 + 梁子]   下一炷 3,000 当量
```

The ring/avatar/incense glyphs stay on the panel centerline; the two numbers are
overlays and must never become a separate full-width growth row.

### Effects of voting vs Token accumulation

If:

```text
remaining_incense = 5
token_remainder = 47,000
tokens_to_next_incense = 3,000
liang_qi_fill = 94%
```

then one accepted vote changes only the spendable stock:

```text
remaining_incense: 5 -> 4
```

The 香火环 intensity may reduce, but:

```text
token_remainder = 47,000
liang_qi_fill = 94%
tokens_to_next_incense = 3,000
```

must remain unchanged.

After another 3,000 effective tokens:

```text
earned_incense_today += 1
remaining_incense += 1
token_remainder -> 0
liang_qi_fill -> 0
tokens_to_next_incense -> token_per_incense
```

A short “凝香 / +N 炷” animation is allowed. `N` must be the actual incense
increase carried by that update, including updates that cross multiple sticks.
Respect reduced-motion.

---

## 5. Token -> Incense

Default policy:

```text
LIANG_TOKEN_PER_INCENSE = 50000
```

It must be configurable and must not be scattered as hard-coded literals.

### Effective Token product definition

```text
Effective Token = Input Token + Output Token
```

If the verified DSH provider-reported usage exposes:

```text
uncachedInputTokens
cacheReadTokens
cacheWriteTokens
outputTokens
```

normalize as:

```text
input_tokens_total
= uncachedInputTokens
+ cacheReadTokens
+ cacheWriteTokens

effective_tokens
= input_tokens_total
+ outputTokens
```

Rules:

- no old `cacheReadTokens * 0.1` weighting
- do not drop `cacheWriteTokens`
- if reasoning is already included in `outputTokens`, never add it again
- use provider-reported Token usage only
- do not use Context Occupancy for voting credit
- do not scrape/estimate Token counts from the UI
- do not mint 梁签

### Local model earning rate

After a billed request attempt closes, the Host scales its final provider
usage by that attempt's route/source IDs (never the session's latest model
or a display name). Static two-tier policy:

```text
DeepSeek Pro family (including future version IDs) → 1
DeepSeek Flash family (every version and alias)   → 0.5
missing / unknown / other model ids → 0.5
```

1 炷 is still `50,000` **Pro-equivalent** tokens. Half-rate routes need
100k raw tokens. Vote power remains 1 炷 = 1 vote; the backend claim is
already weighted and never sends model names or session content.

The single static rule source is `src/domain/incense-weight.ts`: match whole
DeepSeek route IDs by family, not model age, provider, display name or release
date. Do not fetch an upstream model catalog or add remote earning-rate
overrides. Stored or received rule metadata must not change these rates.
Host exposes the same rule data to Client for consistent explanations, without
restoring the removed main-panel hover table. Details:
`docs/INCENSE_POLICY.md`.

Streaming usage is provisional: current DSH's durable `assistant/message` or
`assistant/attempt` settles the attempt from its final provider sample. Legacy
chunks wait for a message, `llm/retry` or `step/end`. A durable per-session
settlement cursor prevents replay, restart and mode-switch double credit. First observations fence inherited and
pre-upgrade history. Never estimate missing usage or use a timer as finality.
Daily 10-stick gifts remain in the existing accounting/UI, with no separate
gift row or section.

### Personal accounting

```text
earned_incense_today
= floor(effective_tokens_today / token_per_incense)

used_incense_today
= accepted_up_votes_by_me + accepted_down_votes_by_me

remaining_incense
= earned_incense_today - used_incense_today

token_remainder
= effective_tokens_today % token_per_incense

liang_qi_fill
= token_remainder / token_per_incense

tokens_to_next_incense
= token_per_incense - token_remainder
```

Required invariants:

```text
used_incense_today >= 0
used_incense_today <= earned_incense_today
remaining_incense >= 0
accepted_up_votes_by_me + accepted_down_votes_by_me = used_incense_today
```

---

## 6. Voting Rules

Vote type is strictly:

```text
up   // 夯
down // 拉
```

Allowed:

- repeated `up`
- repeated `down`
- `up` then `down`
- arbitrary number of votes while incense remains

The user has **one shared incense pool** for both directions.

Example:

```text
remaining_incense = 5
```

means at most five additional accepted votes total, in any direction mix.

### One incense = one vote

```text
1 accepted vote = 1 used incense
```

No multiplier.

### Concurrency

If `remaining_incense = 1` and N different vote requests arrive concurrently:

```text
accepted <= 1
```

This must be guaranteed by the authoritative service/DB transaction, not by browser button disabling.

### Idempotency

Every vote intent must carry:

```text
request_id
```

For the same user and request ID:

- same payload retry -> return the same business result
- no second incense spend
- no second global vote
- no second unique-voter increment
- same request ID with conflicting payload -> reject as idempotency conflict

---

## 7. Global State

Global accepted votes define:

```text
up_votes
down_votes
total_incense = up_votes + down_votes
```

If `total_incense > 0`:

```text
up_ratio = up_votes / total_incense
down_ratio = down_votes / total_incense
liangzi_state = liangziPolicy(up_ratio)
```

If `total_incense == 0`:

```text
up_ratio = null
down_ratio = null
liangzi_state = WAITING
```

UI must show `--` / waiting semantics rather than fake 50/50.

### Unique voters

`unique_voters` means users with at least one accepted vote for the current daily case.

If one user casts 20 accepted votes:

```text
total_incense += 20
unique_voters += 1
```

---

## 8. State Separation

Do not use one catch-all `liangState` / `score` / `balance` object for everything.

### A. GlobalLiangState

At minimum:

```text
case_id
business_date
up_votes
down_votes
total_incense
unique_voters
up_ratio
down_ratio
liangzi_state
snapshot_at
snapshot_version
```

Responsible for:

- global 夯/拉 direction
- central Liangzi state
- global incense / unique voters

### B. PersonalLiangQiState

At minimum:

```text
effective_tokens_today
earned_incense_today
used_incense_today
remaining_incense
token_remainder
tokens_to_next_incense
liang_qi_fill
```

Presentation may derive:

```text
liang_qi_intensity = presentationFunction(remaining_incense)
```

Responsible only for personal spendable incense and next-incense progress.

### C. Vote transaction layer

Responsible for:

- identity
- request idempotency
- authoritative incense availability
- atomic spend
- vote record
- global aggregate update
- unique-voter update

Do not infer transaction authority from UI state.

---

## 9. Authority and Security

### Client is not authority

Production vote requests must not declare and ask the backend to trust:

- `user_id`
- `effective_tokens`
- `earned_incense`
- `used_incense`
- `remaining_incense`
- `liangzi_state`
- LiangQi state

A production vote body should contain only the minimum business intent, e.g.:

```text
case_id
vote_type
request_id
```

Identity must come from verified auth context.

Token eligibility must come from a server-verifiable Token authority.

Used/remaining incense must come from server vote records + authoritative Token accounting.

### DSH authority caveat

Do not confuse:

- a local Host-readable projection
- an anonymous identifier

with:

- server-verifiable authenticated identity
- server-verifiable Token authority

If the current pinned DSH does not provide a suitable verifiable identity/Token authority:

- do not invent an API
- do not promote `anonymous-user-id` to Auth
- do not quietly accept client self-reported Token/incense as secure production authority
- mark the production authority path as a **P0 open risk / BLOCKED**
- continue only with clearly labelled local/dev/staging adapters where appropriate
- do not claim the resulting mode is verified/secure usage voting

### Privacy

Never send/log raw:

- prompts
- model responses
- source code/session content
- file paths unless explicitly required for local diagnostics
- API keys / provider secrets
- raw credentials

Keep network payloads minimal.

---

## 10. Business Date

“Today” is a business concept.

Online production rules:

- server time is authoritative
- business timezone is explicit/configured
- backend returns `business_date`
- browser local date must not decide eligibility or rollover
- stale previous-day case IDs must be rejected

On rollover:

- new-day Token/incense accounting starts from the new business date
- new Active daily case/global stats are used
- yesterday's votes do not leak into today

Local-only/dev modes may use an explicit configurable BusinessDateProvider, but must not pretend it is production authority.

---

## 11. DSH Integration Rules

`../deepseek-harness` is a **read-only reference** unless the user explicitly changes that scope.

Do not patch DSH core to make Liangxiang work.

Before depending on any DSH API:

1. inspect the current pinned local DSH source/tests/docs
2. identify the exact source path and symbol
3. classify public vs internal/unstable
4. isolate unstable seams behind `compat/dsh` or equivalent adapters
5. record the tested DSH commit for RC/release

Do not guess DSH APIs from model memory.

DSH is Developer Preview; compatibility-breaking changes are expected.

For Token integration, explicitly verify:

- usage bucket meanings
- whether buckets are mutually exclusive
- reasoning inclusion in output
- usage chunk vs final replacement semantics
- replay/restart behavior
- pagination/compaction behavior
- multi-session aggregation
- business-date filtering

A local Token projection may drive local UX/diagnostics. It does **not** automatically become production vote authority.

---

## 12. Global Snapshot Behavior

Global ratios and Liangzi state should be snapshot-driven.

Rules:

- a vote can update the user's authoritative remaining incense immediately
- the published global snapshot refreshes on a cadence, and that cadence is
  **near real time by default (1s)**: a voter must see their own vote move 梁位
  within about a second, otherwise the loop stops feeling like voting
- online Host polling adopts the bootstrap cadence dynamically; local env is
  the offline/startup fallback. The browser keeps SSE and uses cadence only to
  throttle hover refresh; explicit panel-open refresh still bypasses it
- a deployment may raise the cadence for load reasons, but a cadence slow enough
  that a vote produces no visible feedback is a product bug, not a tuning choice
- no requirement for per-vote WebSocket broadcast in V0.1 (poll + SSE is enough)
- when rendering global state, `up_ratio`, `down_ratio`, and `liangzi_state` must belong to the same snapshot/version
- never compute a new Liangzi state from newer raw counts while showing stale percentages, or vice versa
- published snapshot history is bounded; only the newest row is ever served

This prevents impossible combinations such as showing 79% while rendering 梁圣.

---

## 13. Required P0 Tests

### Token boundary

For `TOKEN_PER_INCENSE = 50,000`:

```text
0         -> earned 0
49,999    -> 0
50,000    -> 1
99,999    -> 1
100,000   -> 2
500,000   -> 10
1,000,000 -> 20
```

DSH mapping example:

```text
uncachedInput = 10k
cacheRead     = 20k
cacheWrite    = 5k
output        = 15k

Input     = 35k
Effective = 50k
earned    = 1
```

### Liangzi thresholds

```text
0 total votes       -> 待开梁
24.999999% up       -> 小难梁
25% up              -> 梁工
49.999% up          -> 梁工
50% up              -> 梁总
69.999% up          -> 梁总
70% up              -> 梁神
84.999% up          -> 梁神
85% up              -> 梁圣
94.999% up          -> 梁圣
95% up              -> 梁祖
100% up             -> 梁祖
```

Changing personal Token/incense must not alter Liangzi state.

### LiangQi spend/progress independence

Given:

```text
remaining = 5
remainder = 47,000
fill = 94%
to_next = 3,000
```

one accepted vote must produce:

```text
remaining = 4
remainder = 47,000
fill = 94%
to_next = 3,000
```

### Repeated voting

With five available incense:

```text
up, up, up, up, up
```

all five may succeed; the sixth must fail.

Mixed direction is also valid:

```text
up, down, up
```

### Concurrent overspend

With `remaining = 1`, 10/100 concurrent distinct vote requests must result in at most one accepted vote.

### Idempotency

Same request ID + same payload:

```text
exactly one spend
exactly one vote
```

Same request ID + different payload:

```text
idempotency conflict
```

### Unique voter

First accepted vote by a user increments unique voters once; subsequent accepted votes from the same user do not.

### Zero votes

```text
up = 0
down = 0
ratios = null/null
liangzi_state = WAITING
```

No fake 50/50.

### Snapshot consistency

Ratios and Liangzi state rendered together must use the same snapshot/version.

### Day rollover

Verify server-authoritative business-date transition, stale case rejection, and no cross-day spend/stat leakage.

---

## 14. Accessibility and Motion

Required:

- keyboard navigation
- Enter/Space activation where appropriate
- Escape to close popover/panel
- focus-visible states
- accessible tooltip on keyboard focus
- meaningful aria labels
- disabled vote reason
- light/dark theme compatibility
- acceptable contrast and zoom behavior
- `prefers-reduced-motion` support

Animation may be playful but must not continuously flash or overwhelm the UI.

---

## 15. Engineering Discipline

For substantial work:

1. read this file first
2. read `docs/CURRENT_ARCHITECTURE.md`, then only the relevant current docs/source/tests
3. inspect the pinned DSH source before using DSH APIs
4. make a concrete implementation plan
5. implement the complete phase rather than leaving fake production claims
6. run typecheck/lint/unit/integration/UI/backend tests as applicable
7. fix failures before considering the phase complete
8. update docs when contracts/integration seams change

Maintain a concise visible checklist for ongoing multi-step work in
`docs/WORK_TRACKER.md`. Add new requests without dropping unfinished items;
mark each completed item with its verification evidence and show progress to
the user. Keep pending approval distinct from implementation and testing.
Reopen an item if a regression is found; never use checked boxes as a substitute
for the final build/install/backend gates.

### Client payload budget (reviewable project budget)

`scripts/check-client-budget.mjs` is a Liangxiang engineering review gate,
not a DSH size limit. When an approved feature reasonably needs more room,
report the raw/gzip increase, its cause and expected loading impact, then ask
the user to approve a revised budget. Do not silently raise or bypass the gate,
and do not spend repeated rounds shaving harmless bytes or removing approved
artwork, interactions or motion merely to preserve an old number. Keep the
current thresholds until approval, then update the script and evidence together.
Use readable KB/MB in user-facing reports and the checker's output (decimal
units: 1 KB = 1,000 bytes); exact byte counts may accompany private evidence.

### Version (HARD RULE — 用户可见改动必须升版本)

Every user-visible product change (UI, Host/Client behavior, install/upgrade
flow, or community backend contract) must bump `package.json` `version` and
`PLUGIN_VERSION` in the same change. Never ship new behavior under an old
version number. Keep both strings identical; `tests/manifest.spec.ts` guards
this. Historical changelog entries stay frozen.

Current explicit user exception (2026-10-12 model-rule/settlement batch): keep
the package/plugin/server numbers unchanged while this batch is developed and
commit/push the verified batch together. This is unreleased source, not a new
1.1.6 artifact. Before any formal publication/deployment, stamp the appropriate
new release/build identity and run the normal release gates.

Before preparing npm or GitHub release copy, read and follow
`.agents/skills/liangxiang-release-notes/SKILL.md`. The client update dialog
summarizes all user-visible benefits since the previous formal release in at
most four short promotional lines; backend/security/migration/test details stay
out of that dialog. Show only the current release, never queue unseen historical
notes; first-run guidance and manual reopening reuse the same current content.
Show the final copy to the user before requesting the
separately required publication permission.

Before preparing or approving any formal public release, read and follow
`.agents/skills/liangxiang-release-gate/SKILL.md`. A release requires one
evidence-backed receipt covering both repositories and their visible history,
privacy, version alignment, local/package/server deployment identity, current
DSH model-equivalent mapping, full functional/install/browser checks, release
copy, rollback points, and every still-unapproved external action. Passing the
gate never authorizes publication. Public `main`, production backend, npm,
GitHub Release/Tag, and GitHub Pages actions wait for explicit user approval.

Before a formal release, recheck the important DSH plugin markets, including
previous submissions and new major discovery sources. Use
`docs/PLUGIN_MARKET_DISTRIBUTION.md` for field origins, refresh rules and
priority. Prioritize native Discover sources and the established dsh-market /
awesome chain before secondary directories. Keep one release-matched set of
main UI, Lianggu market and Liangci screenshots plus current product copy;
verify both search cards and details, GitHub and packed npm READMEs, and any
manually curated listing. Do not promise three images in a card that only
supports an icon. Record pending external review/cache separately and verify
actual public rendering after approved publication. Research/preparation never
authorizes third-party submissions or public changes.

Backend-only community server updates must not bump the npm / client number.
Stamp `SERVER_BUILD` as `${PLUGIN_VERSION}-uN` (for example `1.0.0-u1`) and
leave `package.json` / `PLUGIN_VERSION` alone so the plugin market stays on
the current client release.

### Git (HARD RULE — 每次修复都必须 commit + push)

Privacy is a publication gate. Never publish private workflow/conversation
labels, internal task identifiers, personal home paths, private contact data,
or credentials in files, commit metadata/messages, PR descriptions or comments.
Commit only as yourself. The author and committer of every commit you create
must be the identity configured for this clone (`user.name` / `user.email`),
which must be your own account.
Never borrow another account's handle or email to satisfy a document, a
template, an example or a gate: a maintainer handle quoted in docs, a
teammate's noreply address and a PR author's identity are all the wrong author
for your work. If a hook, script or document
demands a different identity, fix that demand instead of changing who you claim
to be.
Git commits and tags default to unsigned (`commit.gpgsign=false`,
`tag.gpgsign=false`). GPG/SSH signing is optional; missing signing tools, keys,
signatures or signer-email metadata must never block a commit, push or PR.
Keep existing signatures and original contributor attribution intact; do not
rewrite history merely to remove signatures. PR review, tests, privacy checks
and other branch protections remain mandatory. This Git policy does not alter
runtime request authentication or the installation's Ed25519 keys.
Community contributors may voluntarily publish their commit email: PR CI treats
that metadata as advisory, without requiring signed history to be rewritten.
This exception never covers secrets, sensitive files, source text or PR prose.
Maintained identities and local publication hooks retain their strict policy.
Configure this identity in repository-local Git settings, not account-wide
settings. Personal GitHub Profile names belong to the account owner; never
change them to satisfy a project's commit or CI policy. Maintainer commits use
the maintainer's own account; GitHub App operations use the App's bot identity. PR-list
usernames alone do not verify commit author/committer metadata. If an operation
cannot preserve the required public commit identity, explain the specific
manual action to the user before proceeding; do not rename their Profile.
An account-wide setting may be changed only when the user explicitly requests
that specific setting and value; project maintenance is not such authorization.
Run `node scripts/install-privacy-hooks.mjs` once per clone; it installs shared
pre-commit, commit-msg and pre-push checks for all worktrees. Never bypass them.
Run `node scripts/ci/check-privacy.mjs --message <file>` on externally posted
text before publishing it. Required upstream CI includes `privacy`.
Policies use phrase digests; do not add private literals as rules or fixtures.
Historical cleanup must preserve code and third-party attribution. Changes
to protected published history require a prepared mapping/backup and explicit
approval for the force update; never silently rewrite another active checkout.

Community collaboration: `liang-today/dsh-liangxiang` uses `main` as its only
active integration branch. Every developer, including the maintainer, works in
a personal fork. Local `origin` and the default push remote must be the fork;
`upstream` fetches the community repository and has a disabled push URL.
Concurrent work uses separate worktrees/directories, never another checkout.

Create non-default feature branches from current upstream main, push to a
personal fork owned by the PR author (User, not an organization), and submit
PRs to upstream main. Sync main before merging. Required gates are
privacy, all three locked-dependency platforms, and full packed installation,
browser and isolated online smoke checks. All PR test jobs are read-only.
An administrator reviews and merges after checks; authors cannot approve their
own GitHub PRs, and a single-maintainer merge is not independent approval.
See `CONTRIBUTING.md` and `docs/CI.md`.

Personal pushes and post-merge pushes do not duplicate cloud PR checks. The
former dev-to-main controller is retired. Preserve existing published history;
dev has been retired after verifying that main contains its complete history.
Do not recreate community development branches: an active creation ruleset
requires feature branches to live in personal forks. Never force-push, bypass branch protection,
copy personal CLI tokens into CI or put write credentials in PR test jobs.
Repository fork-run approval uses `first_time_contributors_new_to_github`:
ordinary contributors run automatically, including first-time repository
contributors. GitHub still requires approval for new GitHub accounts making
their first contribution. Never claim that platform restriction is disabled,
or add privileged PR-code execution to avoid it.
Source integration does not authorize npm, Release/Tag, Pages or deployment.

After every completed change in this repository, **before considering the
task done**:

1. `git commit` with a descriptive message
2. `git push` to the tracked remote immediately, unless the user explicitly
   requests local-only work. A local-only instruction stops after the commit:
   no push, PR, release or deployment is implied.

Do not wait for the user to ask. Do not leave a finished fix uncommitted.
The original Prompt 4 / Prompt 11 line 「禁止 git push」is **overridden**.
Cursor rule: `.cursor/rules/git-commit-push.mdc`.

Never reintroduce a source-code community passphrase/defaults file. Community
admission secrets belong only in ignored `.env` files or protected process
environments; distributable bundles must contain no key.

### Version float (installed profile — intentional)

The shipped Host rewrites the DSH profile it is installed into so the
`dsh-liangxiang` dependency stays on the floating `latest` dist-tag and the
package is exempt from pnpm 11's 24h `minimumReleaseAge`. Leftover `beta`,
exact versions and tarball `file:` rows are rewritten to `latest`. Rules:

- only this package's dependency specifier and the `minimumReleaseAgeExclude`
  row in `pnpm-workspace.yaml` are touched; nothing else in the profile changes;
- startup only edits the manifest — it never runs `pnpm add` (`refresh: false`),
  so the running `node_modules` is never mutated;
- developer checkouts (`link:` / non-tarball `file:`) are left alone;
- set `LIANGXIANG_SKIP_NPM_FLOAT=1` to disable the rewrite entirely.

Implementation: `src/host/profile-npm-float.ts` + `tests/host-profile-npm-float.spec.ts`.

### Server migration: mainland availability before cutover (hard rule)

Before moving the public backend to a different server, IP or ingress route,
evaluate the candidate's real availability from mainland China. Keep formal
traffic on the current service while using an isolated candidate endpoint and
test database. Purchase, SSH access, healthy loopback responses, advertised
bandwidth, a UK probe or one cloud probe never constitute cutover acceptance.

Compare old and candidate endpoints with the same healthy probes and time
windows across mainland regions and China Telecom / China Unicom / China
Mobile, including an evening peak window. Verify DNS, TCP 443, strict TLS,
real HTTPS business reads, authenticated SSE continuity/reconnect and market
reads; evaluate the currently agreed concurrency target against isolated data.
Record coverage, success/error rates, latency percentiles, stream gaps and
server load; distinguish offline probes from endpoint failures. Never reduce
market update frequency or information to pass the evaluation.

Before changing public DNS, a production proxy/upstream, the authoritative
writer or a distributed default backend, provide a reviewable comparison and
an explicit go/no-go against acceptance criteria set before testing. Missing
mainland evidence or unresolved systematic carrier/region failures block the
cutover. An exception requires the user's explicit acceptance of the stated
gap/risk; buying a server is not permission to skip evaluation. Obtain the
specific cutover authorization; do not ask again if already clearly granted.
Preserve the old service, consistent ledger backup and a single-writer rollback
plan, then recheck mainland business access through the public domain after
cutover. DNS propagation and local health alone never prove nationwide recovery.
Detailed procedure: `docs/121-vps-deploy.md` §0.

### Staging deploy (hard rule)

Before every remote mutation, report the literal target IP, freshly verified
role, exact service and database paths, plus the protected production IP.
Recheck after every failover; "main" or "standby" alone is not a destination.
Keep actual deployment addresses in private operational receipts, not Git.

Integrated candidate testing requires the isolated Backend, Host and Client
to run the same candidate version and verified source/artifacts. Old-Backend
coverage is compatibility testing, never a substitute for that baseline.
Preserve existing test identities, balances, positions and pending intents;
take a consistent backup and compare migration results before resuming tests.

The community staging backend is deployed ONLY through `scripts/deploy.sh`, which
stamps `<prefix>/VERSION` with the deployed `git rev-parse --short HEAD`. Never
rsync/build/restart the backend by hand. After (or before) any server update,
run `scripts/deploy-check.sh` to confirm the server VERSION matches local HEAD;
if it does not, the server is stale and must be redeployed.

Still never, unless the user explicitly orders it:

- `npm publish`
- GitHub Release
- production / public deploy
- modifying the user's real DSH profile (dev discipline; the shipped Host's
  version-float rewrite above is the intentional, scoped exception)
- patching `../deepseek-harness`

Do not:

- patch `../deepseek-harness` without explicit instruction
- use DOM scraping for Token accounting
- use browser `localStorage` as the production vote ledger
- trust browser-reported balances
- maintain independent production balances per browser tab
- generate a new `request_id` after an uncertain network retry to escape idempotency
- add dependencies without need
- silently weaken the frozen security model just to keep development moving

Multiple tabs must converge on the same authoritative spend state.

Resource lifecycle must be clean:

- no duplicate polling per tab/instance when avoidable
- abort in-flight requests on dispose
- remove timers/listeners/subscriptions
- plugin unload must remove Liangxiang UI cleanly
- HMR must not multiply stateful resources

---

## 16. Release Claims

README, release notes, demos, and UI copy must match the actual trust model.

If production identity/Token authority is not verified, clearly label the mode local/dev/staging/community/soft-trust as appropriate.

Never claim cryptographically or server-verified usage voting unless the implementation truly provides it.

Core product description:

> **用 DSH 攒香火，一炷夯或拉，共同显出今日梁相。**

The conceptual loop is:

```text
DSH Input+Output Token
        -> personal incense
        -> spend incense on 夯/拉
        -> global ratio changes
        -> global 梁子 changes state
```

And independently:

```text
personal remaining incense
        -> 香火环 intensity
personal progress to next 50K
        -> 香火环 fill
```

These two flows meet visually around 梁子, but must remain separate in data and domain logic.

---

## 17. Final Semantic Sanity Check

Before completing any major Liangxiang change, be able to answer **yes** to all of these:

- Is voting still only 夯/拉?
- Is there still exactly one shared personal incense pool?
- Does one accepted vote consume exactly one incense?
- Is central 梁子 driven only by global up ratio?
- Does zero vote render 待开梁?
- Are the six current states exactly 小难梁/梁工/梁总/梁神/梁圣/梁祖?
- Is the 香火环 personal rather than global?
- Does remaining incense control 香火环 intensity?
- Does Token remainder control 香火环 fill?
- Can spending incense reduce 香火环 intensity without rewinding Token progress?
- Are “5 炷 / 再 3,000 当量” shown as 香火环 overlays rather than a separate personal tier section?
- Does the ring/avatar/incense-dot cluster sit on the panel centerline, unmoved by flank copy width?
- Are the two vote buttons labelled `夯 · 升梁` / `拉 · 降梁` and equal-width?
- Are global ratios and Liangzi state from the same snapshot/version?
- Is Effective Token still Input + Output?
- Are cache-read and cache-write both counted as Input under the verified current DSH mapping?
- Are static Pro ×1 and Flash/other/unknown ×0.5 selected from the same rule data as the tooltip, without sending model names to the server?
- Are requests settled from final provider usage with their own route, and replay/restart/mode-switch protected by the shared settlement cursor?
- Is the client prevented from self-authorizing production vote capacity?
- Are concurrency and idempotency enforced by the authoritative layer?
- Does today render only 今日进行中 and stay out of every historical aggregate?
- Are current week/month results temporary through yesterday and never persisted?
- Are completed day/week/month archives immutable, idempotent, and weighted by raw vote counts?
- Does normal snapshot/SSE traffic carry only `archive_version`, never the history arrays?
- Does a history failure preserve last-known-good history without affecting today's voting loop?
- Are obsolete ranking/winner/third-option/personal-avatar concepts absent?

If any answer is no, the implementation is not aligned with 梁相 V0.1.

# AGENTS.md — 梁标 V0.1

> This file defines the permanent product and engineering rules for the Liangbiao repository.
> It applies to Cursor, Codex, and any other coding agent working in this repo.
> If old code, tests, docs, prompts, comments, or mock data conflict with this file, this file wins.
> For the full execution plan, also read `docs/LIANGBIAO_CURSOR_MASTER_R3.md` when present.

---

## 1. Product Contract

### Product identity

- Product name: **梁标**
- 梁文锋 is referred to as **梁子** in product UI/copy.
- DSH WebUI entry Hover / Focus text: **今日梁位**
- The docked entry's icon IS the current central 梁子 state (one of the five, or
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

The following are obsolete and must not return as Liangbiao product concepts:

- `稳`, neutral, steady, abstain, or any third vote option
- candidate / Candidate Ranking
- leaderboard / ranking / winner / Top-N / #1/#2/#3 梁位
- 大夯 / 偏夯 / 胶着 / 偏拉 / 大拉
- global `LiangScore`, 0–100 梁分, Bayesian prior
- `BallotLedger`, `LiangBallot`, 梁签 as the core voting-credit model
- 小难梁 / 牢梁 / 老梁
- old personal avatar progression `梁哥 -> 梁总 -> 梁神 -> 梁圣 -> 梁祖`
- personal Token / earned incense / remaining incense driving the central Liangzi state
- “vote must not reduce LiangQi” as an invariant
- cache-read 10% weighting

Do not mechanically delete unrelated generic words from dependencies or third-party code. Remove only obsolete Liangbiao business semantics.

---

## 2. Frozen UI Structure

The expanded Liangbiao panel has **four visual regions**. Do not add a separate “personal growth tier” section.

### Region 1 — 今日梁案

Show the single current Active case.

Example:

```text
今日梁案
DeepSeek Harness 是夯还是拉
```

### Region 2 — Central core

```text
今日香火 7 炷     [梁子 + 个人梁气环]     下一炷 3,000 当量
                  梁位 83.021952% → 梁神
```

Rules:

- left overlay: personal `earned_incense_today` (`今日香火` = 今天总共生成的香火)
- center (in-flow, geometrically centered in the panel): concrete Liangzi
  avatar, the 梁气 ring, and the incense-mark overlay. These three MUST share
  the panel's horizontal centerline. Personal flanks are absolutely positioned
  and MUST NOT participate in in-flow width (`space-between` / unequal flex
  columns are forbidden here — 「今日香火」 being wider than 「下一炷」 must
  never shove 梁子 sideways).
- remaining incense on the ring is pictorial place-value on **separate orbits**
  (炷=stick ones, 月=moon tens, 日=sun hundreds, each 0–9). Glyphs sit on
  almost-full orbits with a bottom gap for the 梁位 pill — not 2px dots on a
  cramped top arc. A moon never occupies a stick slot.
  ≥1000 炷 falls back to a compact numeral on the ring. The ring fill is
  next-incense progress; the 炷/月/日 marks are remaining incense. The two
  flanks are small captions of those same two facts — they must not compete
  with the ring as a second copy of the same information.
- the panel 梁子 and the docked logo bob together. Only the figure layer
  translates; chrome / ring / page stay still. Cadence follows personal
  `liang_qi_fill` (0 = still, approaching 1 = faster), never remaining
  incense or the global 梁位. Respect `prefers-reduced-motion`.
- right overlay: personal `tokens_to_next_incense` in **Pro 当量** (not raw
  Flash Token). Hover/focus on 下一炷 shows the model-weight table
  (Pro ×1 / Flash ×0.5 / 其它 ×1).
- visible 下一炷 当量 uses integer compact (`33K`, never `≈ 33.4K`) so the
  flank does not overlap 梁子. Hover title and the screen-reader summary keep
  the exact integer. 今日香火 / 环上 overflow 仍可用一位小数。
- under the avatar: **exactly one** global number — 梁位 = `up_ratio`, printed with
  6 decimals (`LIANG_POSITION_DECIMALS`) — then a causal arrow to the 称呼
  (`梁位 83.021952% → 梁神`). The 称呼 is not painted on the portrait.
- `down_ratio` gets **no** second big number: it is `1 − 梁位` and appears only in
  the tooltip and the screen-reader summary
- the printed 梁位 must be TRUNCATED, never rounded, so it can never read as
  having crossed a threshold the rendered Liangzi state has not crossed
- central Liangzi must not be replaced by a Gauge, Donut, Meter, or plain percentage card
- Liangzi state and LiangQi are visually overlaid but semantically independent
- 梁位 and Liangzi state must come from the **same Global Snapshot/version**

Why one value with decimals: two complementary integer percentages made an
accepted vote look like it did nothing (`90%` before, `90%` after). One value
with decimals moves on every accepted vote, which is the point of spending
incense.

### Region 3 — Voting

```text
[ 夯：升梁！ ]     [ 拉：降梁！ ]
```

- exactly two buttons
- labels are `夯：升梁！` / `拉：降梁！` (direction + action); the two buttons
  are equal-width and visually aligned (`1fr / 1fr` grid)
- vote type remains strictly `up` / `down` — the extra 升梁/降梁 copy is not a
  third option
- vote availability depends only on authoritative `remaining_incense > 0`
- do not add a third placeholder or neutral action
- do not add a separate full-width “可用香火 N 炷” row; remaining incense belongs inside LiangQi

### Region 4 — Social stats

```text
三界香火 12,846     五行香客 2,841     上达天听
```

- 三界香火 = accepted votes for the current case (天/人/地香火汇于一炉)
- 五行香客 = unique users with at least one accepted vote for the current case/day (取经五众)
- 上达天听 sits on the same row as a small ritual control (confirm before sync). Not a fifth region.

---

## 3. Global Liangzi State

### State enum

```text
WAITING      -> 待开梁
LIANG_GONG   -> 梁工
LIANG_ZONG   -> 梁总
LIANG_SHEN   -> 梁神
LIANG_SHENG  -> 梁圣
LIANG_ZU     -> 梁祖
```

`WAITING / 待开梁` is **not a sixth tier**. It is only the zero-vote placeholder state.

### The only driver: global up ratio

```text
if total_votes == 0:
    liangzi_state = WAITING
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

Frozen thresholds — the lower half is 梁工; the upper half gets harder toward 梁祖:

| Global up ratio | Liangzi state |
|---|---|
| 0 votes | 待开梁 |
| `< 50%` | 梁工 |
| `50% <= x < 70%` | 梁总 |
| `70% <= x < 85%` | 梁神 |
| `85% <= x < 95%` | 梁圣 |
| `>= 95%` | 梁祖 |

### Visual direction

The joke is “a normal person is gradually夯 into an ancestor”:

- 待开梁: low-presence, unlit placeholder
- 梁工: ordinary engineer / work badge
- 梁总: suit / executive presence
- 梁神: halo / mild levitation / starts becoming absurd
- 梁圣: holy light / 法相
- 梁祖: ancestor/master form / maximum 梁威

Artwork can change later. State semantics cannot.

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

## 4. Personal LiangQi

LiangQi is **personal** and has no personal tier.

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

### B. Token progress -> LiangQi ring fill

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

The two LiangQi numbers flank the central 梁子 (Region 2): `earned_incense_today`
(今日香火, today's total generated) on the left, `tokens_to_next_incense` on
the right. The ring's incense glyphs show `remaining_incense` (what is left to
spend). The ring fill is next-incense progress; its footer slot is reserved for
the global 梁位 value.

```text
今日香火 7 炷   [环 + 梁子]   下一炷 3,000 当量
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

LiangQi intensity may reduce, but:

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

A short “凝香 / +1 炷” animation is allowed. Respect reduced-motion.

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

After Effective Token is computed for one usage **delta**, the Host scales it
by the DSH route model id (exact id, never a display name):

```text
deepseek-v4-pro    → 1
deepseek-v4-flash  → 0.5
missing / unknown  → 1   (the unit is Pro-equivalent)
```

1 炷 is still `50,000` **Pro-equivalent** tokens. Flash needs ~100k raw
tokens for one stick. Vote power is unchanged (1 炷 = 1 vote). The daily
claim sent to the backend is already weighted; do not send model names.

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

Do not patch DSH core to make Liangbiao work.

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
2. read the relevant current docs/source/tests
3. inspect the pinned DSH source before using DSH APIs
4. make a concrete implementation plan
5. implement the complete phase rather than leaving fake production claims
6. run typecheck/lint/unit/integration/UI/backend tests as applicable
7. fix failures before considering the phase complete
8. update docs when contracts/integration seams change

### Git (HARD RULE — 每次修复都必须 commit + push)

After every completed change in this repository, **before considering the
task done**:

1. `git commit` with a descriptive message
2. `git push` to the tracked remote immediately

Do not wait for the user to ask. Do not leave a finished fix uncommitted.
The original Prompt 4 / Prompt 11 line 「禁止 git push」is **overridden**.
Cursor rule: `.cursor/rules/git-commit-push.mdc`.

Never commit `src/host/staging-defaults.ts` (community passphrase).

### Staging deploy (hard rule)

The community staging backend is deployed ONLY through `scripts/deploy.sh`, which
stamps `<prefix>/VERSION` with the deployed `git rev-parse --short HEAD`. Never
rsync/build/restart the backend by hand. After (or before) any server update,
run `scripts/deploy-check.sh` to confirm the server VERSION matches local HEAD;
if it does not, the server is stale and must be redeployed.

Still never, unless the user explicitly orders it:

- `npm publish`
- GitHub Release
- production / public deploy
- modifying the user's real DSH profile
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
- plugin unload must remove Liangbiao UI cleanly
- HMR must not multiply stateful resources

---

## 16. Release Claims

README, release notes, demos, and UI copy must match the actual trust model.

If production identity/Token authority is not verified, clearly label the mode local/dev/staging/community/soft-trust as appropriate.

Never claim cryptographically or server-verified usage voting unless the implementation truly provides it.

Core product description:

> **用 DSH 攒香火，投下“夯”或“拉”，共同决定今日风向。**

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
        -> LiangQi intensity
personal progress to next 50K
        -> LiangQi ring fill
```

These two flows meet visually around 梁子, but must remain separate in data and domain logic.

---

## 17. Final Semantic Sanity Check

Before completing any major Liangbiao change, be able to answer **yes** to all of these:

- Is voting still only 夯/拉?
- Is there still exactly one shared personal incense pool?
- Does one accepted vote consume exactly one incense?
- Is central 梁子 driven only by global up ratio?
- Does zero vote render 待开梁?
- Are the five states exactly 梁工/梁总/梁神/梁圣/梁祖?
- Is LiangQi personal rather than global?
- Does remaining incense control LiangQi intensity?
- Does Token remainder control LiangQi ring fill?
- Can spending incense reduce LiangQi intensity without rewinding Token progress?
- Are “5 炷 / 再 3,000 当量” shown as LiangQi overlays rather than a separate personal tier section?
- Does the ring/avatar/incense-dot cluster sit on the panel centerline, unmoved by flank copy width?
- Are the two vote buttons labelled `夯：升梁！` / `拉：降梁！` and equal-width?
- Are global ratios and Liangzi state from the same snapshot/version?
- Is Effective Token still Input + Output?
- Are cache-read and cache-write both counted as Input under the verified current DSH mapping?
- Is Flash earning incense at half Pro rate locally (Pro-equivalent claim), without sending model names to the server?
- Is the client prevented from self-authorizing production vote capacity?
- Are concurrency and idempotency enforced by the authoritative layer?
- Are obsolete ranking/winner/third-option/personal-avatar concepts absent?

If any answer is no, the implementation is not aligned with 梁标 V0.1.

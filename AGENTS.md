# Liangbiao Project Instructions

## Mission

Build `dsh-liangbiao`, a DeepSeek Harness WebUI plugin.

The product name is `梁标`.
The hover tooltip is exactly `今日梁位`.

The plugin converts eligible DeepSeek Harness token usage into 梁气,
mints 梁签, and lets users repeatedly vote 夯 or 拉 on one active 梁案.

## Product contract

The following requirements are frozen unless the user explicitly changes them:

1. Phase 1 is a DSH WebUI plugin only.
2. Do not build a native desktop pet, system tray app, cursor follower, WeChat mini-program, comment system, or event feed in v0.1.
3. Only one active 梁案 is displayed at a time.
4. Users may mint and spend multiple 梁签.
5. One accepted vote consumes exactly one 梁签.
6. 香火 means total accepted votes.
7. 香客 means unique participating installations.
8. The hover text must remain `今日梁位`.
9. The plugin must continue to render in offline mode.
10. Target-model eligibility must never be inferred from a display label or guessed model name.

## Effective token formula

Use this default formula:

effectiveTokens =
  uncachedInputTokens
  + outputTokens
  + floor(cacheReadTokens * 0.1)

Rules:

- cacheWriteTokens have zero weight in v0.1.
- Reasoning tokens must not be added separately when already included in outputTokens.
- Apply a configurable per-request contribution cap.
- `tokensPerBallot` belongs to the active 梁案 configuration.
- Carry token remainder forward inside the same 梁案.
- Reset 梁气 and unspent 梁签 when the active 梁案 changes.
- Do not retroactively award 梁气 for usage that occurred before the plugin established the 梁案 baseline.

## DSH source of truth

The authoritative DSH source checkout is expected at:

`../deepseek-harness`

Adjust the path only if the local workspace uses another location.

DeepSeek Harness is rapidly changing. Never invent or assume a DSH API.

Before using any DSH service, event, projection, slot, package manifest field,
remote API, persistence mechanism, or lifecycle hook:

1. Search the current local DSH source.
2. Read the nearest DSH `AGENTS.md`.
3. Read the relevant package README and tests.
4. Find at least one first-party implementation.
5. Record the exact source file and symbol in the relevant design document.
6. Prefer public package exports and documented extension points.
7. Stop and report the gap if only a private internal API can satisfy the requirement.

Never modify the `../deepseek-harness` repository as part of Liangbiao development.

Do not patch DSH core.
Do not monkey-patch DOM elements.
Do not query DSH internal React component trees.
Do not copy private source files into Liangbiao.

All unstable DSH integration code must be isolated behind a compatibility adapter.

## Architecture boundaries

Use these logical layers:

- `domain`: pure TypeScript Liangqi, ballot, case, score and title logic.
- `host`: DSH token observation, persistence, networking and ballot ownership.
- `client`: DSH WebUI rendering and user interaction.
- `shared`: serializable contracts shared by host and client.
- `compat/dsh`: the only layer allowed to directly depend on unstable DSH APIs.
- `backend`: serverless voting backend, added only after the local loop works.

The host owns the authoritative local state:

- token high-water marks
- 梁气
- 梁签
- pending votes
- anonymous installation identity
- cached remote snapshot

The browser client is a view and command surface.
Do not make browser localStorage the authoritative ballot ledger.

All backend network calls should originate from the host plugin where possible,
not directly from the browser client.

## Privacy and security

Never log or transmit:

- prompts
- model outputs
- code
- file contents
- file paths
- API keys
- credentials
- raw session logs
- exact raw token history

Never commit secrets or real endpoints with credentials.

Validate all remote data.
Use timeouts, cancellation and bounded retries.
Every vote submission must have an idempotency key.

The token-to-ballot mechanism is a soft-trust community mechanism,
not cryptographic proof of model usage. Do not claim otherwise.

## UI rules

The default compact 梁标 must:

- look visually docked to the right side of DSH WebUI
- avoid covering the composer, navigation or important controls
- remain keyboard accessible
- show `今日梁位` on hover/focus
- open one compact details panel on click
- respect reduced-motion settings
- support current DSH light and dark themes
- avoid continuous flashing or distracting animation

梁气环 visual stages:

- 0–69%: restrained cool tone
- 70–89%: warmer tone
- 90–99%: vermilion/red tension
- 100%: one short completion animation, then a stable ready state

Use original placeholder artwork or CSS/SVG shapes.
Do not copy third-party 梁文锋 frames or unlicensed artwork.

## Engineering rules

- TypeScript strict mode.
- Avoid `any`; document every unavoidable unsafe cast.
- Keep domain logic independent from React and DSH.
- Prefer small modules and named exports.
- Validate external payloads at boundaries.
- Add tests with every behavior change.
- Do not add dependencies when a small local implementation is sufficient.
- Code identifiers and technical comments should be English.
- Product copy may be Chinese.
- No unresolved release-blocking TODOs.
- No silent catch blocks.
- No unbounded polling, timers or retries.

## Milestone protocol

Work on exactly one milestone per conversation.

Before editing:

1. Inspect the current repository and relevant DSH source.
2. Restate the milestone scope.
3. Produce a concrete implementation plan.
4. Identify uncertain DSH APIs.
5. Do not proceed to later milestones.

After editing, report:

1. Files changed.
2. Key design decisions.
3. Commands executed.
4. Exact test results.
5. Remaining risks.
6. Whether every acceptance criterion passed.
7. The Git commit that should be created.

Do not automatically start the next milestone.
Do not publish to npm, deploy a backend, push Git changes, or create a release
without an explicit user instruction.

/**
 * Local-only 梁号. The community ledger never stores this; the browser
 * remembers personal 夯/拉 counts and paints a two-part epithet in the
 * already-reserved vote-feedback row.
 *
 *   dedication (how much you have spent) · stance (how you vote)
 *   e.g. 勤香·死夯梁 / 旁观·闲梁 / 焚尽·铁拉梁
 */
export interface LocalEpithetRecord {
  up: number
  down: number
}

export const EMPTY_LOCAL_EPITHET: LocalEpithetRecord = { up: 0, down: 0 }

export interface LocalEpithet {
  dedication: string
  stance: string
  /** `勤香·死夯梁` — one voice, two facts. */
  label: string
  spent: number
}

function dedicationFor(spent: number): string {
  if (spent <= 0) return '旁观'
  if (spent <= 4) return '试手'
  if (spent <= 19) return '日课'
  if (spent <= 49) return '勤香'
  if (spent <= 99) return '倾炉'
  if (spent <= 249) return '焚尽'
  return '香疯'
}

function stanceFor(up: number, down: number): string {
  const total = up + down
  if (total <= 0) return '闲梁'
  const ratio = up / total
  if (ratio >= 0.88) return '死夯梁'
  if (ratio >= 0.68) return '铁夯梁'
  if (ratio >= 0.55) return '偏夯梁'
  if (ratio > 0.45) return '骑墙梁'
  if (ratio >= 0.32) return '偏拉梁'
  if (ratio >= 0.12) return '铁拉梁'
  return '死拉梁'
}

export function deriveLocalEpithet(record: LocalEpithetRecord): LocalEpithet {
  const up = Number.isFinite(record.up) ? Math.max(0, Math.floor(record.up)) : 0
  const down = Number.isFinite(record.down) ? Math.max(0, Math.floor(record.down)) : 0
  const spent = up + down
  const dedication = dedicationFor(spent)
  const stance = stanceFor(up, down)
  return { dedication, stance, label: `${dedication}·${stance}`, spent }
}

export function recordLocalEpithetVote(
  record: LocalEpithetRecord,
  voteType: 'up' | 'down',
  spent: number,
): LocalEpithetRecord {
  const add = Number.isFinite(spent) ? Math.max(0, Math.floor(spent)) : 0
  if (add === 0) return { up: record.up, down: record.down }
  return voteType === 'up'
    ? { up: record.up + add, down: record.down }
    : { up: record.up, down: record.down + add }
}

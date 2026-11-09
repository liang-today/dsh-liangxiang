import type { ReactElement } from 'react'

/** Lucide icon geometry (ISC license), matching the approved update sheet. */
const marks = {
  close: <><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></>,
  wallet: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></>,
  market: <><path d="M12 16v5"></path><path d="M16 14.639V21"></path><path d="M20 10.656V21"></path><path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"></path><path d="M4 18.463V21"></path><path d="M8 14.656V21"></path></>,
  waves: <><path d="M2 12q2.5 2 5 0t5 0 5 0 5 0"></path><path d="M2 19q2.5 2 5 0t5 0 5 0 5 0"></path><path d="M2 5q2.5 2 5 0t5 0 5 0 5 0"></path></>,
  down: <><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></>,
  up: <><path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path></>,
  right: <><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></>,
} as const

export function ReleaseNotesIcon({ name }: { name: keyof typeof marks }): ReactElement {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{marks[name]}</svg>
}

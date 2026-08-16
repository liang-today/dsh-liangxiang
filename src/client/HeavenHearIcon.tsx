/**
 * Compact 上达天听 mark: 南天门 + 祥云 + 一纸奏折上达.
 * currentColor so hover/focus follow the control, readable at 14px.
 */
import type { ReactElement } from 'react'

export function HeavenHearIcon({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      data-liangbiao-heaven-icon=""
    >
      {/* 祥云 */}
      <path
        fill="currentColor"
        opacity="0.45"
        d="M2.2 6.2c.2-1 1.1-1.7 2.2-1.7.4-1 1.4-1.6 2.5-1.4.5-.7 1.5-1 2.3-.7.9-.6 2.1-.3 2.7.6.9.1 1.6.9 1.6 1.8 0 .8-.5 1.4-1.2 1.7H3.4c-.8-.2-1.3-.9-1.2-1.3z"
      />
      {/* 南天门屋顶 */}
      <path fill="currentColor" d="M4.1 7.4 8 5.2l3.9 2.2H4.1z" />
      <rect fill="currentColor" x="4.6" y="7.4" width="6.8" height="0.7" rx="0.2" />
      {/* 门柱 */}
      <rect fill="currentColor" x="5.3" y="8.1" width="0.9" height="2.4" rx="0.2" />
      <rect fill="currentColor" x="9.8" y="8.1" width="0.9" height="2.4" rx="0.2" />
      {/* 奏折上达 */}
      <path
        fill="currentColor"
        d="M7.1 14.2c.1-.9.3-1.8.7-2.6.2-.4.8-.6 1.2-.4l.9.4c.4.2.6.7.4 1.1-.3.8-.6 1.6-.8 2.4-.1.4-.5.6-.9.5l-.9-.3c-.4-.1-.6-.6-.6-1.1z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeLinecap="round"
        d="M8.2 11.2c.1-.8.2-1.6.2-2.3"
        opacity="0.7"
      />
    </svg>
  )
}

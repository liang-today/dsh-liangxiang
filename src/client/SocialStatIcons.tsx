/**
 * Region 4 marks, same vocabulary as 上达天听's 南天门:
 * 三界香火 = 天/人/地香火汇于一炉; 五行香客 = 取经五众。
 * currentColor, readable at ~18px.
 */
import type { ReactElement } from 'react'

export function ThreeRealmsIncenseIcon({ size = 18 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      data-liangxiang-incense-icon=""
    >
      {/* 三缕青烟：天 / 人 / 地 */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.55"
        d="M4.6 6.6c-.8-1.2.6-1.8-.1-3M8 6.2c.9-1.4-.7-2.1.2-3.6M11.4 6.6c.8-1.2-.6-1.8.1-3"
      />
      {/* 香炉沿 */}
      <rect fill="currentColor" x="2.6" y="7.6" width="10.8" height="1.1" rx="0.4" />
      {/* 炉身 */}
      <path fill="currentColor" d="M4 8.7h8l-.9 3.4H4.9z" />
      {/* 三足鼎 */}
      <rect fill="currentColor" x="4.1" y="12.1" width="1.2" height="2.2" rx="0.3" />
      <rect fill="currentColor" x="7.4" y="12.1" width="1.2" height="2.2" rx="0.3" />
      <rect fill="currentColor" x="10.7" y="12.1" width="1.2" height="2.2" rx="0.3" />
    </svg>
  )
}

export function FivePhasePilgrimIcon({ size = 18 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      data-liangxiang-voter-icon=""
    >
      {/* 唐僧光圈：五行土居中 */}
      <circle
        cx="8"
        cy="4.1"
        r="1.55"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.7"
        opacity="0.45"
      />
      {/* 取经五众：悟空 / 八戒 / 唐僧 / 沙僧 / 龙马，头+身 */}
      <circle fill="currentColor" cx="2.3" cy="5.6" r="1.05" />
      <path fill="currentColor" d="M1.15 7.1h2.3l.35 5.4H.8z" />
      <circle fill="currentColor" cx="5.15" cy="5.2" r="1.1" />
      <path fill="currentColor" d="M3.95 6.75h2.4l.3 5.85H3.65z" />
      <circle fill="currentColor" cx="8" cy="4.55" r="1.2" />
      <path fill="currentColor" d="M6.7 6.15h2.6l.25 6.7H6.45z" />
      <circle fill="currentColor" cx="10.85" cy="5.2" r="1.1" />
      <path fill="currentColor" d="M9.65 6.75h2.4l.3 5.85h-3z" />
      <circle fill="currentColor" cx="13.7" cy="5.6" r="1.05" />
      <path fill="currentColor" d="M12.55 7.1h2.3l.35 5.4h-3z" />
    </svg>
  )
}

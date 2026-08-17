import type { CSSProperties, ReactElement } from 'react'

export function LiangciIcon({ size = 15, style }: { size?: number, style?: CSSProperties }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d="M5.5 3.5h13v17h-13z" />
      <path d="M8.5 2v4M15.5 2v4M5.5 8h13" />
      <path d="M8.5 11.5h2M13.5 11.5h2M8.5 15.5h2M13.5 15.5h2" />
      <path d="M3 20.5h18" />
    </svg>
  )
}

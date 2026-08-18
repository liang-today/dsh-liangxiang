/** Small currentColor marks for the 梁相案牍 utility drawer. */
import type { ReactElement } from 'react'

interface IconProps {
  size?: number
}

export function ArchiveDeskIcon({ size = 14 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" data-liangxiang-utility-icon="desk">
      <path fill="currentColor" opacity=".3" d="M2.2 3.1h11.6v9.8H2.2z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" d="M2.2 3.1h11.6v9.8H2.2zM5.1 3.1v9.8M8 5.6h3.4M8 8h3.4M8 10.4h2.1" />
      <path fill="currentColor" d="M3.2 5h.9v.9h-.9zm0 2.5h.9v.9h-.9zm0 2.5h.9v.9h-.9z" />
    </svg>
  )
}

export function HomepageIcon({ size = 19 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" data-liangxiang-utility-icon="home">
      <path fill="currentColor" opacity=".22" d="m3 9 7-5.7L17 9v7.7H3z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" d="m2.6 9.2 7.4-6 7.4 6M4.2 8v8.4h11.6V8M8 16.4v-4.8h4v4.8" />
      <circle cx="10" cy="7.4" r="1.25" fill="currentColor" />
    </svg>
  )
}

export function RestorePositionIcon({ size = 19 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" data-liangxiang-utility-icon="restore">
      <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.35" opacity=".45" />
      <path fill="currentColor" d="M10 4.6 12 9l-2 1.4L8 9z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2" />
    </svg>
  )
}

export function VersionSealIcon({ size = 19 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" data-liangxiang-utility-icon="version">
      <path fill="currentColor" opacity=".2" d="M5.3 3.1h9.4v13.8H5.3z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" d="M5.3 3.1h9.4v13.8H5.3zM7.5 6.1h5M7.5 8.8h5" />
      <rect x="7.2" y="11.3" width="5.6" height="3.2" rx=".8" fill="currentColor" />
    </svg>
  )
}

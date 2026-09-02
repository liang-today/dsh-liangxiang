import type { ReactElement } from 'react'

import { WELCOME_DISMISS } from '../shared/index.ts'
import { QqGroupCard } from './QqGroupCard.tsx'
import {
  RELEASE_NOTES_ITEMS,
  RELEASE_NOTES_THANKS,
  RELEASE_NOTES_TITLE,
} from './release-notes.ts'
import { color, font } from './theme.ts'

export interface ReleaseNotesDialogProps {
  onClose: () => void
}

/**
 * The single update-notes surface used by first install, automatic upgrades,
 * and 梁相案牍 → 当前版本. Keep all release presentation in this component so
 * entry points can never drift into visually or semantically different pages.
 */
export function ReleaseNotesDialog({ onClose }: ReleaseNotesDialogProps): ReactElement {
  return (
    <div
      data-liangxiang-release-notes-backdrop=""
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: '12px',
        borderRadius: '18px',
        background: 'rgba(10, 8, 7, 0.32)',
        backdropFilter: 'blur(4px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={RELEASE_NOTES_TITLE}
        tabIndex={-1}
        autoFocus
        data-liangxiang-release-notes=""
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          event.preventDefault()
          event.currentTarget.querySelector<HTMLButtonElement>('[data-liangxiang-release-notes-close]')?.focus()
        }}
        style={{
          width: '100%',
          minHeight: 0,
          overflowY: 'auto',
          padding: '15px 16px 14px',
          border: `1px solid color-mix(in srgb, ${color.ritualGold} 36%, ${color.border})`,
          borderRadius: '14px',
          background: `linear-gradient(180deg, color-mix(in srgb, ${color.ritualGold} 10%, ${color.bgLayer}), ${color.bgLayer})`,
          boxShadow: '0 18px 42px rgba(0, 0, 0, 0.28)',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      >
        <strong style={{ display: 'block', color: color.textPrimary, fontSize: '17px', letterSpacing: '0.5px', textAlign: 'center' }}>
          {RELEASE_NOTES_TITLE}
        </strong>
        <ul
          data-liangxiang-release-notes-items=""
          style={{ margin: '12px 0 0', paddingLeft: '19px', color: color.textSecondary, fontSize: '11px', lineHeight: 1.52 }}
        >
          {RELEASE_NOTES_ITEMS.map((item) => <li key={item} style={{ marginTop: '5px' }}>{item}</li>)}
        </ul>
        <QqGroupCard context="release-notes" />
        <p
          data-liangxiang-release-notes-thanks=""
          style={{ margin: '11px 0 0', color: color.textTertiary, fontSize: '10px', lineHeight: 1.5, textAlign: 'center' }}
        >
          {RELEASE_NOTES_THANKS}
        </p>
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <button
            type="button"
            data-liangxiang-release-notes-close=""
            onClick={onClose}
            style={{
              minWidth: '92px',
              padding: '7px 14px',
              border: 'none',
              borderRadius: '8px',
              background: color.buttonPrimaryFill,
              color: color.buttonPrimaryText,
              font: `600 11px/16px ${font.family}`,
              cursor: 'pointer',
            }}
          >
            {WELCOME_DISMISS}
          </button>
        </div>
      </div>
    </div>
  )
}

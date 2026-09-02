import type { ReactElement } from 'react'
import { QQ_GROUP_QR_CODE_DATA_URL } from './qq-group-qrcode.ts'
import { RELEASE_NOTES_QQ, RELEASE_NOTES_QQ_INVITE } from './release-notes.ts'
import { color } from './theme.ts'

export type QqGroupCardContext = 'welcome' | 'release-notes'

/**
 * The single QQ-group presentation shared by first-run guidance and update
 * notes. Keep image, copy and visual treatment here so the two entry points
 * cannot drift again.
 */
export function QqGroupCard({ context }: { context: QqGroupCardContext }): ReactElement {
  const cardContextAttribute = context === 'welcome'
    ? { 'data-liangxiang-welcome-qq': '' }
    : { 'data-liangxiang-release-notes-qq': '' }
  const imageContextAttribute = context === 'welcome'
    ? { 'data-liangxiang-welcome-qq-qrcode': '' }
    : { 'data-liangxiang-release-notes-qq-qrcode': '' }

  return (
    <div
      {...cardContextAttribute}
      data-liangxiang-qq-card=""
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        marginTop: context === 'release-notes' ? '12px' : 0,
        padding: '8px 10px',
        border: `1px solid color-mix(in srgb, ${color.ritualGold} 30%, ${color.border})`,
        borderRadius: '10px',
        background: `color-mix(in srgb, ${color.ritualGold} 8%, transparent)`,
        boxSizing: 'border-box',
      }}
    >
      <img
        {...imageContextAttribute}
        src={QQ_GROUP_QR_CODE_DATA_URL}
        alt="梁相 QQ 群 453683905 二维码"
        data-liangxiang-qq-qrcode=""
        width={72}
        height={72}
        style={{
          flex: '0 0 auto',
          display: 'block',
          width: '72px',
          height: '72px',
          padding: '3px',
          borderRadius: '8px',
          background: '#ffffff',
          boxSizing: 'border-box',
        }}
      />
      <span style={{ minWidth: 0, textAlign: 'left' }}>
        <strong style={{ display: 'block', color: color.ritualEmberText, fontSize: '13px' }}>{RELEASE_NOTES_QQ}</strong>
        <span style={{ display: 'block', marginTop: '4px', color: color.textSecondary, fontSize: '10px', lineHeight: 1.45 }}>{RELEASE_NOTES_QQ_INVITE}</span>
      </span>
    </div>
  )
}

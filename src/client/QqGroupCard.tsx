import type { MouseEventHandler, ReactElement } from 'react'
import { QQ_GROUP_QR_CODE_DATA_URL } from './qq-group-qrcode.ts'
import { RELEASE_NOTES_GROUP_NAME, RELEASE_NOTES_GROUP_NUMBER, RELEASE_NOTES_QQ, RELEASE_NOTES_QQ_INVITE } from './release-notes.ts'
import { color } from './theme.ts'

export type QqGroupCardContext = 'welcome' | 'release-notes'

/**
 * The single QQ-group presentation shared by first-run guidance and update
 * notes. Keep image, copy and visual treatment here so the two entry points
 * cannot drift again.
 */
export function QqGroupCard({ context, onEnlarge }: { context: QqGroupCardContext, onEnlarge?: MouseEventHandler<HTMLButtonElement> }): ReactElement {
  if (context === 'release-notes') return (
    <div className="u-community-row" data-liangxiang-release-notes-qq="" data-liangxiang-qq-card="" aria-label={RELEASE_NOTES_QQ}>
      <button type="button" className="u-qr-button" aria-label="放大QQ群二维码" onClick={onEnlarge}>
        <img data-liangxiang-release-notes-qq-qrcode="" data-liangxiang-qq-qrcode="" src={QQ_GROUP_QR_CODE_DATA_URL} alt="梁相上香QQ群453683905二维码" width={78} height={78} />
      </button>
      <div><b>{RELEASE_NOTES_GROUP_NAME}</b><strong>{RELEASE_NOTES_GROUP_NUMBER}</strong><p>出梁案 · 晒梁位<br />催更新 · 许个愿</p></div>
    </div>
  )
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
        marginTop: 0,
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
        alt="梁相上香QQ群453683905二维码"
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

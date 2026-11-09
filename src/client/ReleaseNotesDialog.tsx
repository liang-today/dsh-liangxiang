import type { KeyboardEvent, MouseEvent, ReactElement } from 'react'
import { LIANGZI_ART } from './liangzi-art.ts'
import { MAIN_POND_GRASS, MAIN_POND_WHALE } from './main-pond-art.ts'
import { QqGroupCard } from './QqGroupCard.tsx'
import { QQ_GROUP_QR_CODE_DATA_URL } from './qq-group-qrcode.ts'
import { ReleaseNotesIcon } from './ReleaseNotesIcon.tsx'
import {
  RELEASE_NOTES_CONTRIBUTORS, RELEASE_NOTES_DISPLAY_VERSION, RELEASE_NOTES_GROUP_NAME, RELEASE_NOTES_GROUP_NUMBER,
  RELEASE_NOTES_HIGHLIGHTS, RELEASE_NOTES_SLOGAN, RELEASE_NOTES_THANKS_SUFFIX, RELEASE_NOTES_TITLE,
} from './release-notes.ts'
import { RELEASE_NOTES_CSS } from './release-notes-styles.ts'

export interface ReleaseNotesDialogProps { onClose: () => void }

// Stable presentation-only DOM handlers preserve scroll/focus and an enlarged
// QR across ordinary Host frames. No timers, listeners, storage or authority.
function mounted(element: HTMLDivElement | null): void { element?.focus({ preventScroll: true }) }
function sheet(element: Element): HTMLElement | null { return element.closest('[data-liangxiang-release-notes]') }
function setQr(root: HTMLElement, open: boolean): void {
  const view = root.querySelector<HTMLElement>('.u-qr-view')!
  const content = root.querySelector<HTMLElement>('.u-base')!
  view.hidden = !open
  content.inert = open
  if (open) content.setAttribute('aria-hidden', 'true')
  else content.removeAttribute('aria-hidden')
  root.querySelector<HTMLButtonElement>(open ? '.u-close-qr' : '.u-qr-button')?.focus({ preventScroll: true })
}
function enlarge(event: MouseEvent<HTMLButtonElement>): void { const root = sheet(event.currentTarget); if (root) setQr(root, true) }
function jump(event: MouseEvent<HTMLButtonElement>): void {
  const root = sheet(event.currentTarget)!
  const scroller = root.querySelector<HTMLElement>('.u-scroll')!
  const target = root.querySelector<HTMLElement>(`[data-update-section="${event.currentTarget.dataset.target}"]`)
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
  const top = target ? target.offsetTop - scroller.offsetTop : 0
  scroller.scrollTo({ top, behavior: reduced ? 'instant' : 'smooth' })
  if (event.detail === 0) (target ?? scroller).focus({ preventScroll: true })
}

/** The same approved 256×384 sheet for upgrades and 案牍 → 当前版本. */
export function ReleaseNotesDialog({ onClose }: ReleaseNotesDialogProps): ReactElement {
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const root = event.currentTarget
    const qr = root.querySelector<HTMLElement>('.u-qr-view')!
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      if (!qr.hidden) setQr(root, false)
      else onClose()
    }
    if (event.key !== 'Tab') return
    const scope = qr.hidden ? root.querySelector<HTMLElement>('.u-base')! : qr
    const stops = [...scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const first = stops[0], last = stops.at(-1)
    const active = root.ownerDocument.activeElement
    if (event.shiftKey && (active === first || !scope.contains(active))) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (active === last || !scope.contains(active))) { event.preventDefault(); first?.focus() }
  }
  return (
    <div className="liangxiang-rn" data-liangxiang-release-notes-backdrop="">
      <style>{RELEASE_NOTES_CSS}</style>
      <div className="u-dialog" role="dialog" aria-modal="true" aria-label={RELEASE_NOTES_TITLE} tabIndex={-1} autoFocus ref={mounted} onKeyDown={keys} data-liangxiang-release-notes="">
        <div className="u-base">
          <header><h2>梁相 <span>{RELEASE_NOTES_DISPLAY_VERSION}</span></h2><p className="u-caption">香火能攒了<br />梁股开盘了</p><button type="button" className="u-close" aria-label="关闭更新介绍" onClick={onClose}><ReleaseNotesIcon name="close" /></button></header>
          <div className="u-scroll" role="region" aria-label="更新亮点、社群和玩法" tabIndex={-1} data-liangxiang-release-notes-scroll="">
            <section className="u-intro">
              <div className="u-hero" aria-hidden="true"><div className="u-wave back" /><div className="u-wave" /><span className="u-ring" /><img className="u-figure" src={LIANGZI_ART.liang_zong} alt="" /><img className="u-fish" src={MAIN_POND_WHALE} alt="" /><img className="u-grass" src={MAIN_POND_GRASS} alt="" /><span className="u-bubble" /></div>
              <div className="u-copy"><h3 className="u-slogan">{RELEASE_NOTES_SLOGAN}</h3>
                <ul className="u-benefits" data-liangxiang-release-notes-items="">{RELEASE_NOTES_HIGHLIGHTS.map(item => <li key={item.title}><ReleaseNotesIcon name={item.icon} /><p><b>{item.title}</b>　{item.copy}</p></li>)}</ul>
              </div>
            </section>
            <section className="u-section" data-update-section="rules" tabIndex={-1} aria-label="梁股怎么玩"><h3>猜午夜梁位，涨还是跌。</h3><ol><li><p>选早、午、晚盘，投香火选方向：<b>做多盼涨，做空盼跌。</b></p></li><li><p>封盘一小时后定梁位；<b>午夜收盘，与它比高低。</b></p></li><li><p>赢家拿回本金，再分输方香火；持平、单边或取消，原额退香。</p></li></ol><div className="u-times"><span>早盘 07—11 点</span><span>午盘 12—16 点</span><span>晚盘 17—21 点</span></div><p className="u-note">封盘前可改、可撤；封盘后仍能上香争梁位。<br />香火社区玩法，无现金交易。</p></section>
            <section className="u-section" data-update-section="community" tabIndex={-1} aria-label="社群"><h3>众香成势，一起来玩。</h3><QqGroupCard context="release-notes" onEnlarge={enlarge} /></section>
            <section className="u-section" data-update-section="thanks" tabIndex={-1} aria-label="鸣谢"><h3>特别鸣谢</h3><p data-liangxiang-release-notes-thanks="">{RELEASE_NOTES_CONTRIBUTORS.slice(0, 2).join('、')}、<br />{RELEASE_NOTES_CONTRIBUTORS.slice(2).join('、')}</p><p className="u-thanks-line">{RELEASE_NOTES_THANKS_SUFFIX}</p><button type="button" className="u-back" data-target="top" onClick={jump}>回到更新介绍 <ReleaseNotesIcon name="up" /></button></section>
          </div>
          <nav aria-label="了解新版"><button type="button" data-target="rules" onClick={jump}>梁股怎么玩 <ReleaseNotesIcon name="down" /></button><button type="button" data-target="community" onClick={jump}>社群 <ReleaseNotesIcon name="down" /></button><button type="button" data-target="thanks" onClick={jump}>鸣谢 <ReleaseNotesIcon name="down" /></button></nav>
          <footer><button type="button" className="u-primary" data-liangxiang-release-notes-close="" onClick={onClose}>开始体验 <ReleaseNotesIcon name="right" /></button></footer>
        </div>
        <div className="u-qr-view" hidden><button type="button" className="u-close-qr" aria-label="收起二维码" onClick={event => { const root = sheet(event.currentTarget); if (root) setQr(root, false) }}><ReleaseNotesIcon name="close" /></button><h3>{RELEASE_NOTES_GROUP_NAME}</h3><img src={QQ_GROUP_QR_CODE_DATA_URL} alt="放大的QQ群二维码" width={190} height={190} /><strong>{RELEASE_NOTES_GROUP_NUMBER}</strong><p>出梁案、晒梁位、催更新。</p></div>
      </div>
    </div>
  )
}

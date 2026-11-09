/** Approved compact update sheet. Scoped chrome; no Host or accounting state. */
const scope = '.liangxiang-rn'
export const RELEASE_NOTES_CSS = `
${scope}{--u-paper:light-dark(#fbfdff,#202b3a);--u-ink:light-dark(#293950,#e6eef9);--u-link:light-dark(#4f72b8,#adc8ff);--u-sub:light-dark(#62748d,#b3c4dd);--u-line:light-dark(#d6e2f1,#425976);--u-blue:light-dark(#5276bd,#adc8ff);--u-soft:light-dark(#edf4ff,#2b3c55);--u-water:light-dark(#c8dcf8,#304d76);--u-deep:light-dark(#9ebfeb,#4b6f9e);--u-button:light-dark(#5475b8,#a9c5fa);--u-button-ink:light-dark(#fff,#192c47);font:12px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--u-ink);color-scheme:inherit}
${scope} *{box-sizing:border-box}${scope} [hidden]{display:none!important}
${scope} .u-dialog{width:256px;height:384px;max-width:100%;background:var(--u-paper);border:1px solid var(--u-line);border-radius:18px;box-shadow:0 10px 28px light-dark(#304c7414,#0003);display:flex;flex-direction:column;overflow:hidden;position:relative;outline:none}
${scope} button{font:inherit;border:0;color:inherit}${scope} button:focus-visible{outline:2px solid var(--u-blue);outline-offset:2px}${scope} svg{width:14px;height:14px;flex-shrink:0}
${scope} header{height:44px;flex-shrink:0;padding:9px 12px 7px;display:flex;align-items:center;justify-content:space-between}
${scope} h2{margin:0;font-size:20px;font-weight:600;line-height:26px;letter-spacing:-.035em}${scope} h2 span{color:var(--u-link);font-size:19px;margin-left:3px}
${scope} .u-caption{font-size:11px;line-height:1.4;color:var(--u-link);margin-left:auto;margin-right:8px}${scope} .u-slogan{font-size:13px;letter-spacing:-.06em;white-space:nowrap}
${scope} .u-times{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--u-sub);font-size:11px;margin-top:14px}${scope} .u-thanks-line{margin-top:10px}${scope} [data-update-section="thanks"] .u-back{margin-top:14px}${scope} [data-update-section="rules"] li b{display:inline;font-size:11px}
${scope} .u-close,${scope} .u-close-qr{display:grid;place-items:center;width:26px;height:26px;background:transparent;color:var(--u-sub);border-radius:7px}
${scope} .u-close:hover,${scope} .u-close-qr:hover{background:var(--u-soft)}
${scope} .u-scroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--u-line) transparent;overscroll-behavior:contain;scroll-behavior:smooth}
${scope} .u-hero{height:80px;background:var(--u-soft);position:relative;overflow:hidden}
${scope} .u-wave{position:absolute;inset:30px -15% -60px;background:var(--u-water);border-radius:48% 50% 0 0;transform:rotate(-3deg)}${scope} .u-wave.back{background:var(--u-deep);inset:23px -20% -40px;transform:rotate(4deg);opacity:.42}
${scope} .u-ring{position:absolute;width:66px;height:66px;border:2px solid var(--u-blue);border-radius:50%;left:calc(38% - 33px);top:6px;opacity:.85}
${scope} .u-figure{position:absolute;width:65px;height:65px;object-fit:contain;left:calc(38% - 32px);top:7px}${scope} .u-fish{position:absolute;object-fit:contain;width:64px;height:42px;left:68%;top:37px;transform:rotate(-6deg)}${scope} .u-grass{position:absolute;object-fit:contain;width:24px;height:35px;left:7px;bottom:-5px}${scope} .u-bubble{position:absolute;width:6px;height:6px;border:1px solid var(--u-blue);border-radius:50%;left:81%;top:25px;opacity:.6}
${scope} .u-copy{padding:12px 12px 8px}${scope} h3{font-size:14px;line-height:1.5;font-weight:600;margin:0 0 11px;letter-spacing:-.035em}
${scope} p{font-size:11px;line-height:1.65;margin:0;color:var(--u-sub)}${scope} b{font-weight:500;color:var(--u-ink)}
${scope} nav{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--u-line);padding:6px 12px;flex-shrink:0}${scope} nav button,${scope} .u-back{padding:3px 0;background:transparent;color:var(--u-link);font-size:12px;font-weight:500;display:flex;align-items:center;gap:3px}${scope} nav svg{width:12px;height:12px}
${scope} .u-section{border-top:1px solid var(--u-line);padding:15px 12px;scroll-margin-top:0}${scope} .u-section h3{font-size:13px;margin-bottom:14px}
${scope} .u-community-row{display:grid;grid-template-columns:86px 1fr;gap:10px;align-items:center}${scope} .u-qr-button{padding:3px;background:#fff;border:1px solid var(--u-line);border-radius:8px;line-height:0}${scope} .u-qr-button img{width:78px;height:78px;display:block;object-fit:contain}
${scope} .u-community-row b{font-size:11px;display:block}${scope} .u-community-row strong{display:block;color:var(--u-link);font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;margin:3px 0 5px;letter-spacing:.01em}
${scope} h4{font-size:12px;font-weight:600;margin:0 0 6px}
${scope} ol{padding-left:16px;margin:0;display:grid;gap:14px}${scope} ol li b{font-size:12px;display:block;margin-bottom:4px}${scope} .u-note{margin:16px 0}
${scope} footer{padding:9px 12px 11px;flex-shrink:0;border-top:1px solid var(--u-line);background:var(--u-paper)}${scope} .u-primary{width:100%;height:34px;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--u-button);color:var(--u-button-ink);border-radius:10px;font-size:13px;font-weight:500}${scope} .u-primary:hover{filter:brightness(1.07)}
${scope} .u-qr-view{position:absolute;inset:0;background:var(--u-paper);padding:30px 14px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}${scope} .u-close-qr{position:absolute;right:10px;top:10px}${scope} .u-qr-view h3{margin:0;font-size:16px}${scope} .u-qr-view img{display:block;width:190px;height:190px;object-fit:contain;background:#fff;border-radius:8px}${scope} .u-qr-view strong{font-size:20px;color:var(--u-link);font-variant-numeric:tabular-nums}
@media(prefers-reduced-motion:reduce){${scope} .u-scroll{scroll-behavior:auto}}
${scope}{position:absolute;inset:-1px auto auto -1px;width:256px;max-width:calc(100% + 2px);z-index:6}
${scope} .u-dialog{max-height:calc(100dvh - 24px)}
${scope} .u-base{height:100%;display:flex;flex-direction:column;min-height:0}
${scope} .u-benefits{list-style:none;margin:0;padding:0;display:block}
${scope} .u-benefits > li{display:flex;gap:7px;align-items:flex-start;margin:9px 0}
${scope} .u-benefits > li svg{color:var(--u-link);margin-top:2px}
`

import { font } from '../theme.ts'
import { MARKET_MOTION_CSS, marketCss } from './market-motion-style.ts'
import { COMPANION_CSS } from './MarketFishCompanion.tsx'

export const MARKET_DIALOG_CSS = marketCss(`
[data-~backdrop]{background-image:radial-gradient(#a6b7cf0b .8px,transparent 1px);background-size:16px 16px}
[data-~dialog]{
 --~control:28px;--~gap:6px;--~top:10px;--~summary:200px;
 --~paper:light-dark(#fdfcf9,#25292f);
 --~paper-2:light-dark(#edf1f6,#2e343d);
 --~ink:light-dark(#30394b,#e6eaf1);
 --~sub:light-dark(#58667b,#b4bfce);
 --~border:light-dark(#ced7e3,#46505d);
 --~gold:#dca858;
 --~vermilion:light-dark(#b95440,#e39479);
 --~slate:light-dark(#667f9c,#9fb6d2);
 --~blue:#536fa8;
 --~blue-text:light-dark(#38568a,#b4c8f4);
 --~water-top:light-dark(#668bdd,#6c8bd8);
 --~water-bottom:light-dark(#a1bbea,#50769e);
 --~chart-text:var(--~sub);
 --~future-bg:light-dark(#edf0f3,#30353d);
 box-sizing:border-box;position:relative;display:flex;flex-direction:column;
 width:min(800px,100%);height:min(512px,calc(100dvh - 24px));max-height:calc(100dvh - 24px);
 padding:var(--~top) 16px 7px;overflow:auto;scrollbar-width:thin;
 background:var(--~paper);color:var(--~ink);
 border:1px solid var(--~border);border-radius:16px;
 box-shadow:0 3px 0 #1c293523,0 16px 42px #08172338;
 font:13px ${font.family};font-variant-numeric:tabular-nums;color-scheme:inherit;outline:none
}
[data-~dialog][data-fullscreen=true]{width:100%;height:calc(100dvh - 24px)}
[data-~dialog] *{box-sizing:border-box}
[data-~dialog] [hidden]{display:none!important}
[data-~dialog][data-animated=false] *{animation:none!important;transition:none!important}
[data-~dialog] :is(button,input){font:inherit}
[data-~dialog] button{min-height:30px;padding:5px 9px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
[data-~dialog] button:disabled{opacity:.42;cursor:default}
[data-~dialog] button:hover:not(:disabled){background:color-mix(in srgb,var(--~blue) 8%,var(--~paper))}
[data-~dialog] :is(button,input,summary,svg):focus-visible{outline:2px solid var(--~blue);outline-offset:3px}
.~header{display:grid;grid-template-columns:var(--~summary) minmax(0,1fr) 64px;align-items:center;gap:8px;flex:none;height:74px;margin-bottom:var(--~gap)}
.~header-copy{min-width:0;align-self:start}
.~header h2{display:flex;align-items:center;gap:8px;margin:0 0 4px;white-space:nowrap;font-size:20px;font-weight:650;line-height:1.2}
.~header h2 i{width:4px;height:4px;border-radius:50%;background:var(--~blue);opacity:.7}
.~header h2 small{font-size:14px;font-weight:500;color:var(--~sub)}
.~wallet{display:grid;grid-template-columns:4em minmax(0,1fr) 1em;align-items:baseline;width:min(var(--~summary),100%);gap:1px 5px;line-height:20px;white-space:nowrap;font-size:10px;color:var(--~sub)}
.~wallet-label{min-width:0}
.~wallet strong{justify-self:end;font-size:17px;font-weight:600;color:var(--~blue-text)}
.~wallet small{font-size:inherit}
[data-~dialog] .~companion-trigger{align-self:start;display:flex;align-items:center;justify-content:center;padding:4px 0 0;min-width:0;height:100px;border:0;background:none;text-align:left;overflow:visible}
[data-~dialog] button.~companion-trigger:hover:not(:disabled){background:transparent}
.~companion-trigger .~companion{width:100%;flex:1;padding-left:0}
.~companion-trigger .~companion-speech{padding:0;background:none;font-size:11px;line-height:1.4}
.~window-controls{display:grid;gap:var(--~gap);align-self:start;width:64px}
.~window-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
[data-~dialog] .~motion{display:flex;gap:4px;align-items:center;justify-content:center;white-space:nowrap;width:100%;height:var(--~control);min-height:var(--~control);margin-top:4px;padding:0;font-size:12px;color:var(--~blue-text)}
[data-~dialog] button.~motion:hover:not(:disabled){background:transparent}
.~motion>span:first-child{font-size:17px}
.~clock{text-align:center;font-size:10px;line-height:13px;white-space:nowrap;color:var(--~sub)}
.~dried-fish{filter:grayscale(1);transform:rotate(-18deg)}
[data-~dialog] :is(.~close,.~fullscreen){display:grid;place-items:center;padding:0;width:var(--~control);height:var(--~control);min-width:0;min-height:var(--~control);color:var(--~sub);border:1px solid var(--~border);border-radius:9px;background:var(--~paper-2);box-shadow:0 2px 0 #111a261c}
:is(.~close,.~fullscreen)>svg{display:block;width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
[data-animated=true] .~window-controls button{transition:transform 160ms ease,background 160ms ease}
.~window-controls button:active:not(:disabled){transform:translateY(2px)}
.~a11y{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;white-space:nowrap}
.~status{position:absolute;z-index:7;left:16px;right:16px;bottom:43px;display:flex;align-items:center;gap:8px;padding:7px 10px;max-height:75px;overflow:auto;border:1px solid var(--~border);border-radius:9px;background:var(--~paper-2);color:var(--~ink);font-size:12px;line-height:1.5;box-shadow:0 3px 12px #081d4620;pointer-events:none}
.~status:empty{display:none}
.~status button{pointer-events:auto;flex:none;font-size:11px;min-height:25px;padding:3px 6px;color:var(--~blue-text)}
.~loading,.~empty{flex:1;display:grid;place-items:center;color:var(--~sub);font-size:12px}
.~chart{display:flex;flex-direction:column;flex:1;min-height:250px;overflow:hidden}
.~chart-toolbar{display:flex;align-items:center;justify-content:space-between;gap:4px;width:min(var(--~summary),100%);flex:none;height:var(--~control);white-space:nowrap}
.~chart-toolbar>div{display:flex;align-items:center;gap:3px;flex:none}
[data-~dialog] .~chart-toolbar button{min-height:27px;padding:3px 7px;font-size:11px;color:var(--~sub)}
[data-~dialog] button[data-selected=true]{background:var(--~paper-2);color:var(--~blue-text)}
[data-~dialog] .~chart-window{color:var(--~sub);font-size:11px;cursor:default}
.~chart-quotes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) 1.1fr;gap:12px;flex:none;min-height:42px;padding:4px 0 7px;border-bottom:1px solid var(--~border);text-align:center}
.~chart-quotes span{display:block;margin-bottom:2px;font-size:11px;color:var(--~sub)}
.~chart-quotes b{font-size:12px;font-weight:600;white-space:nowrap}
.~chart-scroll{position:relative;flex:1;min-height:140px;overflow:hidden}
.~chart-scroll>svg{width:100%;height:100%;display:block}
.~chart-tip{position:absolute;z-index:3;pointer-events:none;padding:6px 8px;border:1px solid var(--~border);border-radius:7px;background:var(--~paper);color:var(--~ink);font-size:11px;line-height:16px;box-shadow:0 2px 8px #081d461c}
.~chart-tip>b,.~chart-tip>span{display:block}
.~stage-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;flex:none;height:46px;margin-top:4px;padding:3px;background:var(--~paper-2);border-radius:10px}
[data-~dialog] .~stage-tabs button{padding:0;min-width:0;min-height:40px;border-radius:8px;color:var(--~sub)}
.~stage-tabs .~button-face{display:grid;align-content:center;gap:2px;height:40px;padding:3px 5px;white-space:nowrap;text-align:center}
.~stage-tabs :is(strong,small){display:flex;align-items:center;justify-content:center;min-width:0;gap:5px;font-size:11px;font-weight:500}
.~stage-tabs b{font-size:12px;font-weight:650;color:var(--~ink)}
.~stage-tabs time,.~stage-tabs em{font-size:10px;font-style:normal;font-weight:400;color:var(--~sub)}
.~stage-tabs small>strong{display:block;color:var(--~blue-text)}
.~stage-tabs svg{width:12px;height:12px;flex:none;fill:none;stroke:var(--~blue-text);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
[data-~dialog] .~stage-tabs [aria-selected=true]{background:var(--~paper);color:var(--~blue-text);box-shadow:0 1px 2px #081d461f,inset 0 -2px 0 var(--~blue)}
.~stage-tabs [aria-selected=true] b{color:var(--~blue-text)}
.~stage{flex:none;height:56px}
.~batch{height:56px;padding:10px 0 8px;min-width:0}
.~order{display:grid;grid-template-columns:minmax(138px,1fr) minmax(105px,145px) minmax(161px,190px);gap:9px;align-items:center;height:36px}
.~direction{display:grid;grid-template-columns:1fr 1fr;gap:3px;max-width:230px;padding:2px;background:var(--~paper-2);border:1px solid var(--~border);border-radius:10px}
[data-~dialog] .~direction button{min-height:30px;min-width:0;padding:0;border-radius:7px;color:var(--~sub);border:1px solid transparent}
.~direction .~button-face{display:flex;justify-content:center;align-items:center;min-height:29px;padding:4px 8px;white-space:nowrap}
[data-~dialog] .~direction [aria-pressed=true]{background:var(--~paper);color:var(--~blue-text);border-color:color-mix(in srgb,var(--~blue) 40%,var(--~border));box-shadow:0 2px 0 #1827421c}
.~amount{display:grid;grid-template-columns:16px minmax(0,1fr) 11px;align-items:center;gap:5px;height:36px;padding:0 8px;border:1px solid var(--~border);border-radius:10px;background:var(--~paper);color:var(--~sub);box-shadow:inset 0 1px 2px #162e4710}
.~amount>svg{width:16px;height:18px;fill:none;stroke:var(--~blue-text);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.~amount>span{font-size:11px;white-space:nowrap}
.~amount input{width:100%;min-width:0;height:32px;padding:2px 0;border:0;background:transparent;color:var(--~ink);font-size:15px!important;text-align:center;outline-offset:1px!important;appearance:textfield}
.~amount input::-webkit-inner-spin-button,.~amount input::-webkit-outer-spin-button{appearance:none;margin:0}
.~order-actions{display:grid;grid-template-columns:minmax(90px,1fr) 62px;gap:7px;height:36px}
[data-~dialog] .~action{min-width:0;height:34px;min-height:34px;padding:0;border:1px solid var(--~border);background:var(--~paper-2);border-radius:10px;box-shadow:0 2px 0 color-mix(in srgb,var(--~border) 80%,transparent)}
.~action .~button-face{display:flex;justify-content:center;align-items:center;height:33px;min-height:33px;padding:4px 7px;border-radius:9px;background:linear-gradient(180deg,#ffffff0c,transparent);box-shadow:inset 0 1px 0 #ffffff15;transform:translateY(-1px);font-size:12px;white-space:nowrap}
[data-~dialog] .~primary{background:#4a639b;color:#fff;border-color:#4a639b;box-shadow:0 2px 0 #354b7c}
[data-~dialog] .~primary:hover:not(:disabled){background:#526da8}
[data-~dialog] .~withdraw{color:var(--~blue-text)}
[data-~dialog] button:active:not(:disabled)>.~button-face{transform:translateY(1px) scale(.98)}
[data-animated=true] .~button-face{transition:transform 180ms cubic-bezier(.2,.8,.3,1.3),background 120ms ease}
.~footer{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:center;gap:12px;position:sticky;bottom:-7px;z-index:5;flex:none;height:46px;margin:0;padding-top:5px;background:var(--~paper);border-top:1px solid var(--~border);font-size:11px;color:var(--~sub)}
.~footer-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;min-width:0}
[data-~dialog] .~footer-metrics>button{display:grid;grid-template-rows:minmax(15px,1fr) 19px;min-width:0;min-height:37px;padding:0;text-align:left;white-space:nowrap}
.~metric-label{display:flex;align-items:center;gap:4px;font-size:10px;font-weight:400;line-height:15px;color:var(--~sub)}
.~metric-label b{font-weight:600;color:var(--~ink)}
.~footer-metrics button>strong{display:flex;align-items:baseline;gap:4px;font-size:13px;line-height:19px;font-weight:600;color:var(--~ink)}
.~footer-metrics button>strong>small{font-size:11px;font-weight:400;color:var(--~sub)}
.~pool>strong{color:var(--~blue-text)!important}
.~connection{display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:400;white-space:nowrap}
.~connection svg{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.~footer-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding-left:10px;border-left:1px solid var(--~border);min-width:0}
[data-~dialog] .~footer-actions>button{min-width:0;min-height:30px;padding:3px 0;font-size:11px;white-space:nowrap;color:var(--~sub)}
.~popover{position:absolute;z-index:8;right:0;bottom:52px;width:min(430px,100%);max-height:min(370px,calc(100dvh - 160px));padding:13px 15px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--~border);border-radius:13px;background:var(--~paper);color:var(--~ink);box-shadow:0 7px 24px #081d4630}
.~popover-heading{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:28px;font-size:14px;background:var(--~paper)}
.~history-nav{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;background:var(--~paper)}
[data-~dialog] .~popover-heading button{display:grid;place-items:center;min-width:27px;min-height:27px;padding:0;font-size:19px}
.~popover p{margin:6px 0;font-size:12px;line-height:1.65}
.~howto{list-style:none;counter-reset:steps;margin:9px 0;padding:0;display:grid;gap:12px}
.~howto>li{counter-increment:steps;position:relative;padding-left:29px}
.~howto>li::before{content:counter(steps);position:absolute;left:0;top:0;display:grid;place-items:center;width:21px;height:21px;border-radius:7px;background:var(--~paper-2);color:var(--~blue-text);font-size:12px;font-weight:600}
.~howto b{font-size:13px}
.~rule-times{display:flex;gap:8px;margin-top:7px}
.~rule-times>span{display:flex;gap:7px;padding:4px 7px;border:1px solid var(--~border);border-radius:7px;font-size:11px;color:var(--~sub)}
.~rule-times strong{font-weight:550;color:var(--~blue-text)}
.~rule-sides{display:grid;gap:3px;font-size:12px;color:var(--~blue-text)}
.~rule-example{padding:8px 10px;border-left:2px solid var(--~blue);border-radius:3px 9px 9px 3px;background:var(--~paper-2)}
.~rule-example>b{font-size:12px;color:var(--~blue-text)}
.~rule-example p{margin:3px 0 0}
.~rule-note{color:var(--~sub)}
.~rule-trust{display:block;padding-top:8px;border-top:1px solid var(--~border);font-size:10px;line-height:1.6;color:var(--~sub)}
.~receipt summary>span{min-width:0}
.~receipt summary small{display:block}
.~receipt summary>strong{white-space:nowrap}
.~receipt{padding:8px 0;border-bottom:1px solid var(--~border);font-size:11px}
.~receipt small{font-size:11px;color:var(--~sub)}
${MARKET_MOTION_CSS}
${COMPANION_CSS}
@media(max-width:600px){
 .~header{height:162px;grid-template-columns:minmax(0,1fr) 64px;grid-template-rows:74px 88px;gap:0 8px}
 .~header h2{font-size:18px;gap:6px;margin-bottom:4px}
 .~header h2 small{font-size:12px}
 [data-~dialog] .~companion-trigger{grid-column:1/-1;grid-row:2;height:88px}
 .~companion-trigger .~companion{padding-left:0;height:88px;grid-template-columns:84px minmax(0,1fr)}
 .~companion-trigger .~companion>svg{width:84px;height:88px}
 .~window-controls{grid-column:2;grid-row:1}
 .~footer{height:auto;min-height:46px;grid-template-columns:1fr;gap:3px}
 .~footer-actions{border-left:0;padding-left:0;grid-template-columns:max-content max-content;justify-content:end;gap:16px}
}
@media(max-width:520px){
 [data-~dialog]{--~top:9px;height:min(600px,calc(100dvh - 24px));padding:var(--~top) 12px 7px;border-radius:13px}
 .~wallet strong{font-size:15px}
 .~chart{min-height:225px}
 .~chart-quotes{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
 .~chart-quote-time{display:none}
 .~chart-quotes b{font-size:11px}
 .~stage-tabs .~button-face{padding:0 4px}
 .~stage,.~batch{height:91px}
 .~order{grid-template-columns:1fr 1fr;grid-template-rows:36px 35px;gap:6px 8px;height:77px}
 .~direction{max-width:none}
 .~order-actions{grid-column:1/-1;grid-template-columns:1fr 85px}
 .~status{left:12px;right:12px}
 .~footer{gap:7px}
 .~footer-metrics{gap:8px}
 .~footer-actions{padding-left:5px;gap:3px}
 [data-~dialog] .~footer-actions>button{font-size:10px}
}
@media(max-width:380px){
 [data-~dialog]{height:min(610px,calc(100dvh - 24px));padding:var(--~top) 10px 6px}
 .~header h2{font-size:16px}
 .~header h2 small{font-size:11px}
 .~header h2 i{width:3px;height:3px}
 .~wallet{font-size:9px}
 .~wallet strong{font-size:12px}
 .~chart-toolbar{gap:4px}
 [data-~dialog] .~chart-toolbar button{padding:3px 5px}
 .~stage-tabs [data-has-position=true] em,.~stage-tabs svg{display:none}
 .~stage-tabs :is(strong,small){gap:3px;font-size:10px}
 .~stage-tabs b{font-size:11px}
 .~chart-quotes b{font-size:10px}
 .~footer{gap:4px;font-size:10px}
 .~footer-metrics button>strong{font-size:11px}
 .~metric-label{font-size:9px}
 .~footer-metrics{gap:6px}
 .~metric-label{gap:2px}
 .~footer-metrics .~pool:last-child .~metric-label{flex-wrap:wrap;gap:0 2px}
 .~connection{font-size:9px}
 [data-~dialog] .~footer-actions>button{min-height:22px;padding:0}
}
@media(prefers-reduced-motion:reduce){[data-~dialog] *,[data-~dialog] *::before,[data-~dialog] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`)

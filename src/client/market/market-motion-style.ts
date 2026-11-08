import type { FishAction } from './fish-feedback.ts'

export interface FishMotion { frames: Keyframe[], duration: number, accent: 'none' | 'bubbles' | 'stamp' }

// A pose is [x, y, rotation, scaleX, scaleY]; omitted axes retain their identity.
type Pose = [number?, number?, number?, number?, number?]
type MotionSpec = [duration: number, accent: 0 | 1 | 2, ...poses: Pose[]]
const MOTIONS: Record<Exclude<FishAction, 'idle'>, MotionSpec> = {
  long: [800, 0, [0,-6,-7,1.03], [1,-3,-3]],
  short: [950, 1, [2,6,10,.98,1.03], [3,3,5]],
  confirmed: [950, 2, [0,-1,-2], [0,3,4,1.02,.97], [0,-1,-2], [0,2,2]],
  withdraw: [1_000, 0, [-6,1,-8,.96,1], [-3,-2,3]],
  submit: [900, 0, [2,-1,-3], [3,1,2], [2,-1,-3]],
  batch1: [900, 0, [-1,-4,-8], [1,-2,2]],
  batch2: [1_000, 0, [3,0,6], [-2,-1,-5]],
  batch3: [900, 0, [0,-2,-3,1.05,1.02], [1,1,4]],
  'zoom-in': [750, 0, [0,-2,0,1.09], [0,-1,0,1.05]],
  'zoom-out': [800, 0, [0,2,0,.89], [0,1,0,.94]],
  'mode-candles': [950, 0, [0,-2,-4], [0,-2,4], [0,-2,-2]],
  'mode-tide': [1_200, 0, [-4,1,-6], [4,-1,6]],
  history: [1_050, 0, [-3,0,-12], [-3,-1,-8]],
  rules: [1_200, 0, [1,-1,10], [1,-1,10], [0,1,-2]],
  motion: [800, 1, [0,0,-5,1.02], [0,0,6,1.02], [0,0,-4]],
  fullscreen: [950, 0, [0,-2,0,1.08,.98], [0,-2,-3,1.04]],
  restore: [900, 0, [0,2,0,.93,1.04], [0,1,3,.97]],
  amount: [750, 0, [2,2,7], [0,2,3]],
  pan: [900, 0, [5,0,3], [1,0,-3]],
  inspect: [850, 0, [3,-2,-4,1.04], [3,-1,-2]],
  reset: [950, 0, [-4,0,-5], [2,0,4]],
  report: [1_200, 1, [0,-8,-7,1.06], [0,-4,6,1.04], [0,2,4,.99,1.02], [0,-2,-2]],
  periodic: [1_200, 0, [0,-1,-2], [0,1,2]],
  error: [650, 0, [-3], [3], [-2], [2]],
  pool: [950, 1, [-4,4,-5], [4,-3,5]],
  position: [850, 0, [0,-5,12], [2,-2,-4]],
  newer: [750, 0, [7,-1,4]],
  older: [750, 0, [-7,-1,-4]],
  dismiss: [650, 0, [0,4,9,.95,1.05]],
  retry: [1_050, 1, [-4,0,-6], [4,0,6], [0,-3]],
  receipt: [900, 2, [3,-3,-9], [0,1,3]],
}

/** Local acting directions, independent of the confirmed position's surface/dive pose. */
export function fishMotion(action: FishAction): FishMotion | null {
  if (action === 'idle') return null
  const [duration, accent, ...poses] = MOTIONS[action]
  return { duration, accent: (['none', 'bubbles', 'stamp'] as const)[accent], frames: [[], ...poses, []].map(([x=0,y=0,r=0,sx=1,sy=sx]) => ({ transform: `translate(${x}px,${y}px) rotate(${r}deg) scale(${sx},${sy})` })) }
}

/** Two complete small loops in screen pixels, then rest ready to swim home. */
export function fishLoadingFrames(x: number, y: number, radius: number): Keyframe[] {
  const frames: Keyframe[] = [{ transform: 'translate(0px,0px) rotate(0deg)' }]
  for (let step = 0; step <= 16; step++) {
    const angle = step * Math.PI / 4
    frames.push({ transform: `translate(${Math.round(x + Math.sin(angle) * radius)}px,${Math.round(y - Math.cos(angle) * radius * .5)}px) rotate(${Math.round(Math.sin(angle) * 7)}deg)` })
  }
  frames.push({ transform: `translate(${Math.round(x)}px,${Math.round(y)}px) rotate(0deg)` })
  return frames
}

/** Source-only selector shorthand, expanded once at module initialization into the existing namespace. */
export function marketClass(suffix: string): string { return 'liangxiang-market-' + suffix }

export function marketCss(css: string): string { return css.replaceAll('.~', '.liangxiang-market-').replaceAll('[data-~', '[data-liangxiang-market-').replaceAll('--~', '--liangxiang-market-') }

export const MARKET_MOTION_CSS = marketCss(`
.~current-whale{animation:none!important;transition:none}
.~whale-swim{transform-box:fill-box;transform-origin:50% 60%}
.~current-whale[data-motion=true] .~whale-swim{animation:liangxiang-market-body-swim 4.2s ease-in-out infinite}
.~current-whale[data-pose=dive][data-motion=true] .~whale-swim{animation-duration:3.2s}
.~whale-breath,.~whale-ripple{transform-box:fill-box;transform-origin:center}
.~current-whale[data-motion=true] .~whale-breath{animation:liangxiang-market-breathe 3.8s ease-in-out infinite}
.~current-whale[data-motion=true] .~whale-tail{animation:liangxiang-market-tail 2.4s ease-in-out infinite}
.~current-whale[data-motion=true] .~whale-hair{animation:liangxiang-market-hair 3.1s ease-in-out infinite}
.~current-whale[data-pose=dive][data-motion=true] .~whale-tail{animation-duration:1.65s}
.~current-whale[data-motion=true] .~whale-ripple{animation:liangxiang-market-ripple 3.4s ease-in-out infinite}
.~current-whale[data-pose=dive][data-motion=true] .~whale-bubble{animation:liangxiang-market-dive-bubble 2.7s ease-out infinite}
.~water-motion[data-motion=true] .~water-back{animation:liangxiang-market-water-drift 8s ease-in-out infinite}
.~companion-accent{transform-box:fill-box;transform-origin:center;pointer-events:none}
.~companion-accent[data-accent=bubbles] circle{opacity:0}
.~companion-accent[data-accent=stamp]{opacity:0}
.~companion-danmaku{position:absolute;grid-column:2;grid-row:1;left:0;right:6px;top:50%;transform:translateY(-50%);display:grid;grid-template-columns:minmax(0,1fr);gap:3px;pointer-events:none;z-index:5}
.~companion-danmaku>span{display:block;max-width:100%;width:max-content;color:var(--~blue-text);font-size:11px;line-height:1.35;white-space:normal;overflow-wrap:anywhere;text-shadow:0 1px var(--~paper)}
.~companion[data-speech-motion=true] .~companion-danmaku>span{animation:liangxiang-market-danmaku 4.8s ease-out both}
.~companion-loading-label{font-size:10px;font-weight:600;fill:var(--~blue-text)}
@keyframes liangxiang-market-body-swim{0%,100%{transform:translate(0px,1px) rotate(-1deg)}35%{transform:translate(2px,-3px) rotate(1deg)}70%{transform:translate(-2px,-1px) rotate(-1deg)}}
@keyframes liangxiang-market-danmaku{0%{transform:translate(0,5px);opacity:0}8%,75%{opacity:1}100%{transform:translate(6px,-13px);opacity:0}}
@keyframes liangxiang-market-breathe{0%,100%{transform:scale(.92,1);opacity:.65}50%{transform:scale(1.14,1.12);opacity:1}}
@keyframes liangxiang-market-tail{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(16deg)}}
@keyframes liangxiang-market-hair{0%,100%{transform:rotate(3deg)}50%{transform:rotate(-7deg)}}
@keyframes liangxiang-market-ripple{0%,100%{transform:scaleX(.84);opacity:.5}50%{transform:scaleX(1.2);opacity:1}}
@keyframes liangxiang-market-dive-bubble{0%{transform:translateY(4px);opacity:.2}25%{opacity:.9}100%{transform:translate(3px,-20px);opacity:0}}
@keyframes liangxiang-market-water-drift{0%,100%{transform:translateX(-9px);opacity:.5}50%{transform:translateX(9px);opacity:1}}
@media(prefers-reduced-motion:reduce){.~current-whale *,.~water-motion *{animation:none!important;transition:none!important}}
`)

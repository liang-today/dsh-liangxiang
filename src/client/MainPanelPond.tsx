import { useEffect, useRef, type CSSProperties, type ReactElement, type Ref, type RefObject } from 'react'
import { MAIN_POND_GRASS, MAIN_POND_WHALE } from './main-pond-art.ts'

const WATER_CAP = 1_000
const FISH_MIN = 100
const POND_HEIGHT = 128
const VISIT_MS = 7_250
const BUBBLE_RISE_MS = 1_100
const BUBBLE_POP_MS = 1_750

/** Cosmetic geometry only: never a second balance, progress estimate, or tier. */
export function mainPondGeometry(remainingIncense: number): {
  waterDrop: number, waterDepth: number, plantGrowth: number, fishTop: number, fishEligible: boolean,
} {
  const stock = Number.isFinite(remainingIncense) ? Math.max(0, remainingIncense) : 0
  const depth = POND_HEIGHT * Math.sqrt(Math.min(1, stock / WATER_CAP))
  const waterDrop = POND_HEIGHT - depth
  // A complete small plant grows from the bottom. Clipping alone would expose
  // only the tips of a full-size plant in shallow water.
  const plantGrowth = Math.max(0, Math.min(1, Math.sqrt(stock / FISH_MIN), (depth - 5) / 27))
  // Pass below the flank numbers, in the quiet band above the plant roots.
  // Shallow water still lowers the whole fish beneath the moving surface.
  const fishTop = Math.min(102, Math.max(POND_HEIGHT - 48, waterDrop + 12))
  return { waterDrop, waterDepth: depth, plantGrowth, fishTop, fishEligible: stock > FISH_MIN }
}

export interface MainPanelPondProps {
  remainingIncense: number
  reducedMotion: boolean
  /** Panel visibility and overlays only; request activity is deliberately unrelated. */
  active?: boolean
  /** Cosmetic only; never restarts the fish lifecycle or changes water depth. */
  streamingActive?: boolean
  pondRef?: Ref<HTMLDivElement>
}

export const MAIN_PANEL_POND_CSS = `
[data-@P]{position:absolute;inset:0;pointer-events:none;overflow:visible;
 --liangxiang-pond-blue:var(--liangxiang-main-blue,light-dark(#5879bf,#a5c1ff));
 --liangxiang-pond-water:var(--liangxiang-main-water,light-dark(#88b9ed,#689ed2));
 --liangxiang-pond-paper:var(--liangxiang-main-paper,light-dark(#fbfdff,#202b3a));
 --liangxiang-pond-stone:light-dark(#8da4be,#8aa1bd);
 --liangxiang-pond-stone-edge:light-dark(#6f8aa8,#a7bbd3);
 --liangxiang-pond-stone-light:light-dark(#d9e6f3,#b8cce0)}
[data-@P] [hidden]{display:none!important}
[data-@P-water],[data-@P-actors]{position:absolute;left:-11px;top:8px;width:calc(100% + 22px);height:128px;overflow:hidden;pointer-events:none}
[data-@P-water]{z-index:0;opacity:var(--liangxiang-pond-presence,1)}
.@P-tide{position:absolute;inset:0;transform:translateY(var(--liangxiang-pond-drop,128px));transition:transform 1.05s cubic-bezier(.2,.7,.25,1)}
.@P-water{position:absolute;top:-8px;left:-20px;width:calc(100% + 40px);height:150px;overflow:visible}
.@P-wave-back,.@P-wave-front{fill:var(--liangxiang-pond-water)}
.@P-wave-back{opacity:.19;animation:@P-back 11s ease-in-out infinite alternate}
.@P-wave-front{opacity:.2;animation:@P-front 7s ease-in-out infinite alternate}
.@P-gleam{fill:none;stroke:color-mix(in srgb,var(--liangxiang-pond-paper) 75%,var(--liangxiang-pond-water));stroke-width:1;opacity:.55;animation:@P-front 7s ease-in-out infinite alternate}
[data-@P-plants]{position:absolute;inset:0;clip-path:inset(clamp(0px,calc(var(--liangxiang-pond-drop,128px) + 5px),128px) 0 0 0);transition:clip-path 1.05s cubic-bezier(.2,.7,.25,1);z-index:1;pointer-events:none}
.@P-grass{position:absolute;bottom:-2px;left:7px;width:calc(22px * (.62 + .38 * var(--liangxiang-pond-growth,0)));height:calc(27px * var(--liangxiang-pond-growth,0));opacity:.52;transform-origin:50% 100%;animation:@P-grass 9s ease-in-out infinite alternate;transition:width 1.05s ease,height 1.05s cubic-bezier(.2,.7,.25,1)}
.@P-grass[data-side=right]{left:auto;right:6px;width:calc(20px * (.62 + .38 * var(--liangxiang-pond-growth,0)));height:calc(25px * var(--liangxiang-pond-growth,0));animation-duration:11s;animation-delay:-4s}
.@P-grass img{display:block;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}
.@P-grass[data-side=right] img{transform:scaleX(-1)}
.@P-stones{position:absolute;bottom:0;left:8px;width:19px;height:5px;opacity:.43;z-index:2}
.@P-stones[data-side=right]{left:auto;right:7px}
.@P-stones i{position:absolute;bottom:0;display:block;background:radial-gradient(ellipse at 35% 23%,color-mix(in srgb,var(--liangxiang-pond-stone-light) 70%,transparent) 0 9%,transparent 18%),var(--liangxiang-pond-stone);border:.55px solid var(--liangxiang-pond-stone-edge);border-radius:48% 55% 43% 51%;box-sizing:border-box}
.@P-stones i:first-child{left:0;width:8px;height:3.3px;transform:rotate(8deg)}
.@P-stones i:last-child{left:7px;width:10px;height:4.2px;transform:rotate(-7deg)}
[data-@P-actors]{z-index:2}
.@P-fish{position:absolute;left:0;top:var(--liangxiang-pond-fish-top,102px);width:36px;height:25px;opacity:0;transition:top 1.05s cubic-bezier(.2,.7,.25,1)}
.@P-fish-body{position:relative;display:block;width:36px;height:25px;transform-origin:70% 65%}
.@P-fish img{display:block;width:36px;height:25px;object-fit:contain;pointer-events:none;user-select:none}
[data-@P-head]{position:absolute;left:26px;top:6px;width:0;height:0}
[data-@P][data-fish=true] .@P-fish{animation:@P-fish 6.4s linear both}
.@P-fish-body[data-puff=true]{animation:@P-puff .48s ease-in-out both}
/* This is a sibling foreground, never a high-z child trapped behind Liangzi. */
[data-@P-bubbles]{position:absolute;inset:0;z-index:4;overflow:visible;pointer-events:none}
.@P-bubble{position:absolute;width:10px;height:10px}
.@P-bubble-orb{position:absolute;inset:0;display:block;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--liangxiang-pond-blue) 65%,var(--liangxiang-pond-paper));border-radius:50%;background:radial-gradient(circle at 30% 26%,color-mix(in srgb,var(--liangxiang-pond-paper) 72%,transparent) 0 12%,transparent 24%),color-mix(in srgb,var(--liangxiang-pond-water) 12%,transparent)}
.@P-pop{position:absolute;left:-6px;top:3px;display:block;box-sizing:border-box;width:22px;height:4px;opacity:0;border:1px solid var(--liangxiang-pond-blue);border-radius:50%}
[data-liangxiang-stream-ripple]{opacity:.14;animation:@P-ring 3s ease-out infinite}
.@P-bubble[data-stage=rise] .@P-pop{display:none}
.@P-bubble[data-stage=pop] .@P-bubble-orb{display:none}
.@P-bubble[data-stage=pop] .@P-pop{animation:@P-ring 1.5s ease-out both}
.@P-bubble[data-stage=pop] .@P-pop:last-child{animation-delay:.25s}
[data-@P][data-available=false] *{animation-play-state:paused!important}
[data-@P][data-available=false]~* [data-liangxiang-stream-activity]{animation-play-state:paused!important}
[data-@P][data-motion=false] *,[data-@P][data-active=false] *{animation:none!important;transition:none!important}
[data-@P][data-motion=false] :is([data-@P-actors],[data-@P-bubbles]){display:none}
@keyframes @P-back{from{transform:translateX(-7px)}to{transform:translateX(8px)}}
@keyframes @P-front{from{transform:translateX(8px)}to{transform:translateX(-8px)}}
@keyframes @P-grass{from{transform:skewX(-2.5deg)}to{transform:skewX(2.5deg)}}
@keyframes @P-fish{0%{opacity:0;transform:translateX(-36px)}8%{opacity:.24}30%,75%{opacity:.28}92%{opacity:.24}100%{opacity:0;transform:translateX(272px)}}
@keyframes @P-puff{0%{transform:translateY(0) rotate(0deg) scale(1)}24%{transform:translateY(0) rotate(2deg) scale(1.06,.94)}42%{transform:translateY(-4px) rotate(-8deg) scale(.98,1.04)}72%{transform:translateY(-2px) rotate(-3deg) scale(1.01,.99)}100%{transform:translateY(0) rotate(0deg) scale(1)}}
@keyframes @P-ring{0%{opacity:0;transform:scale(.2)}15%{opacity:.2}100%{opacity:0;transform:scale(1.6)}}
@media(prefers-reduced-motion:reduce){[data-@P] *{animation:none!important;transition:none!important}[data-@P] :is([data-@P-actors],[data-@P-bubbles]){display:none}}
`.replaceAll('@P', 'liangxiang-main-pond')

/** No hooks or state: authority is supplied by the existing Host projection. */
export function MainPanelPond({ remainingIncense, reducedMotion, active = true, streamingActive = false, pondRef }: MainPanelPondProps): ReactElement {
  const geometry = mainPondGeometry(remainingIncense)
  const style = {
    '--liangxiang-pond-drop': `${geometry.waterDrop}px`,
    '--liangxiang-pond-growth': geometry.plantGrowth,
    '--liangxiang-pond-fish-top': `${geometry.fishTop}px`,
    '--liangxiang-pond-presence': geometry.waterDepth > 0 ? 1 : 0,
  } as CSSProperties
  return <div ref={pondRef} data-liangxiang-main-pond="" data-motion={!reducedMotion} data-active={active}
    data-fish="false" data-water-drop={geometry.waterDrop} data-plant-growth={geometry.plantGrowth}
    aria-hidden="true" style={style}>
    <style>{MAIN_PANEL_POND_CSS}</style>
    <div data-liangxiang-main-pond-water="">
      <div className="liangxiang-main-pond-tide"><svg className="liangxiang-main-pond-water" viewBox="0 0 260 150" preserveAspectRatio="none">
        <path className="liangxiang-main-pond-wave-back" d="M-30 10 C0 4 26 16 61 10 S112 4 147 10 S201 16 244 10 S286 4 300 10 V170H-30Z" />
        <path className="liangxiang-main-pond-wave-front" d="M-30 13 C4 7 34 19 75 13 S129 7 172 13 S229 19 283 13 V170H-30Z" />
        <path className="liangxiang-main-pond-gleam" d="M-30 13 C4 7 34 19 75 13 S129 7 172 13 S229 19 283 13" />
      </svg>{streamingActive && active && geometry.waterDepth > 0 && ['18%', '82%'].map((left, index) =>
        <i key={left} className="liangxiang-main-pond-pop" data-liangxiang-stream-ripple="" style={{ left, animationDelay: `${index * -1.5}s` }} />)}</div>
      <div data-liangxiang-main-pond-plants="">{(['left', 'right'] as const).map(side => <span key={side}>
        <span className="liangxiang-main-pond-grass" data-side={side}><img src={MAIN_POND_GRASS} alt="" draggable={false} /></span>
        <span className="liangxiang-main-pond-stones" data-side={side}><i /><i /></span>
      </span>)}</div>
    </div>
    <div data-liangxiang-main-pond-actors=""><span className="liangxiang-main-pond-fish"><span className="liangxiang-main-pond-fish-body">
      <img src={MAIN_POND_WHALE} alt="" draggable={false} /><span data-liangxiang-main-pond-head="" />
    </span></span></div>
    <div data-liangxiang-main-pond-bubbles="">{(['left', 'right'] as const).map(side => <span key={side} data-side={side} className="liangxiang-main-pond-bubble" hidden>
      <i className="liangxiang-main-pond-bubble-orb" /><i className="liangxiang-main-pond-pop" /><i className="liangxiang-main-pond-pop" />
    </span>)}</div>
  </div>
}

/** Sample the rendered SVG water line, including theme zoom and wave translation. */
function surfaceAt(root: HTMLElement, path: SVGPathElement, screenX: number): number {
  const fallback = 13 + Number(root.dataset.waterDrop ?? 128)
  try {
    const matrix = path.getScreenCTM()
    if (!matrix) return fallback
    let low = 0, high = path.getTotalLength()
    for (let i = 0; i < 18; i++) {
      const mid = (low + high) / 2, point = path.getPointAtLength(mid)
      if (matrix.a * point.x + matrix.c * point.y + matrix.e < screenX) low = mid
      else high = mid
    }
    const point = path.getPointAtLength((low + high) / 2)
    return matrix.b * point.x + matrix.d * point.y + matrix.f - root.getBoundingClientRect().top
  } catch { return fallback }
}

/** One disposable local scene, also used by lifecycle tests without a Host. */
export function attachMainPanelPond(root: HTMLDivElement, {
  remainingIncense, reducedMotion, active = true,
}: Omit<MainPanelPondProps, 'pondRef'>, seen: { current: boolean } = { current: false }): () => void {
    const fishEligible = mainPondGeometry(remainingIncense).fishEligible
    const body = root.querySelector<HTMLElement>('.liangxiang-main-pond-fish-body')
    const travel = root.querySelector<HTMLElement>('.liangxiang-main-pond-fish')
    const head = root.querySelector<HTMLElement>('[data-liangxiang-main-pond-head]')
    const surface = root.querySelector<SVGPathElement>('.liangxiang-main-pond-gleam')
    if (!body || !travel || !head || !surface) return () => undefined
    const bubbles = Array.from(root.querySelectorAll<HTMLElement>('.liangxiang-main-pond-bubble'))
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const animations = new Set<Animation>()
    let disposed = false, inView = true, visiting = false, generation = 0
    let scheduled: ReturnType<typeof setTimeout> | null = null
    const canRun = (): boolean => !disposed && active && fishEligible && !reducedMotion && !media.matches && !document.hidden && inView && root.isConnected
    const later = (callback: () => void, delay: number): ReturnType<typeof setTimeout> => {
      const timer = setTimeout(() => { timers.delete(timer); callback() }, delay)
      timers.add(timer)
      return timer
    }
    const stopVisit = (): void => {
      generation++;visiting = false;scheduled = null
      timers.forEach(clearTimeout);timers.clear()
      animations.forEach(animation => animation.cancel());animations.clear()
      root.dataset.fish = 'false';delete body.dataset.puff
      for (const bubble of bubbles) { bubble.hidden = true;delete bubble.dataset.stage }
    }
    const emitBubble = (side: 'left' | 'right', id: number): void => {
      if (id !== generation || !canRun()) return
      const bubble = bubbles.find(node => node.dataset.side === side)
      const orb = bubble?.querySelector<HTMLElement>('.liangxiang-main-pond-bubble-orb')
      if (!bubble || !orb || typeof bubble.animate !== 'function') return
      const origin = root.getBoundingClientRect(), source = head.getBoundingClientRect()
      const x = source.left - origin.left, y = source.top - origin.top - 2
      const waterY = surfaceAt(root, surface, source.left)
      bubble.style.left = `${x - 5}px`;bubble.style.top = `${y - 5}px`
      bubble.hidden = false;bubble.dataset.stage = 'rise'
      bubble.dataset.birthX = x.toFixed(2);bubble.dataset.birthY = y.toFixed(2);bubble.dataset.surfaceY = waterY.toFixed(2)
      const rise = bubble.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${waterY - y}px)` }], { duration: BUBBLE_RISE_MS, easing: 'cubic-bezier(.25,.55,.4,1)', fill: 'forwards' })
      const grow = orb.animate([{ transform: 'scale(.3)', opacity: .42 }, { transform: 'scale(1)', opacity: .72 }], { duration: BUBBLE_RISE_MS, easing: 'ease-out', fill: 'forwards' })
      animations.add(rise);animations.add(grow)
      void rise.finished.then(() => {
        if (id !== generation || !canRun()) return
        const currentWater = surfaceAt(root, surface, root.getBoundingClientRect().left + x)
        bubble.style.top = `${y - 5 + currentWater - waterY}px`
        bubble.dataset.surfaceY = currentWater.toFixed(2);bubble.dataset.stage = 'pop'
        later(() => { if (id === generation) bubble.hidden = true }, BUBBLE_POP_MS)
      }).catch(() => undefined)
    }
    const puff = (side: 'left' | 'right', id: number): void => {
      if (id !== generation || !canRun()) return
      delete body.dataset.puff;void body.offsetWidth;body.dataset.puff = 'true'
      later(() => { if (id === generation) delete body.dataset.puff }, 480)
      later(() => emitBubble(side, id), 180)
    }
    const schedule = (): void => {
      root.dataset.available = String(active && !reducedMotion && !media.matches && !document.hidden && inView)
      if (!canRun()) { stopVisit();return }
      if (visiting || scheduled !== null) return
      scheduled = later(() => {
        scheduled = null
        if (!canRun()) return
        stopVisit();void travel.offsetWidth
        visiting = true;seen.current = true;root.dataset.fish = 'true'
        const id = generation
        // The same head gesture emits farther outside the ring on each side.
        // A 200ms travel shift moves each true head anchor outward by ~9.6px.
        later(() => puff('left', id), 1_220);later(() => puff('right', id), 4_120)
        later(() => { stopVisit();schedule() }, VISIT_MS)
      }, seen.current ? 24_000 + Math.random() * 18_000 : 6_000 + Math.random() * 4_000)
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      const entry = entries[0]
      inView = !!entry?.isIntersecting && entry.intersectionRatio >= .3
      schedule()
    }, { threshold: [0, .3] })
    observer?.observe(root)
    document.addEventListener('visibilitychange', schedule)
    media.addEventListener('change', schedule)
    schedule()
    return () => {
      disposed = true;stopVisit();observer?.disconnect()
      document.removeEventListener('visibilitychange', schedule);media.removeEventListener('change', schedule)
    }
}

/** The Badge owns this lifecycle; Panel remains a hook-free presentational view. */
export function useMainPanelPond({ remainingIncense, reducedMotion, active = true }: Omit<MainPanelPondProps, 'pondRef'>): RefObject<HTMLDivElement> {
  const pondRef = useRef<HTMLDivElement>(null)
  const seen = useRef(false)
  const fishEligible = mainPondGeometry(remainingIncense).fishEligible
  useEffect(() => {
    const root = pondRef.current
    if (!root) return
    return attachMainPanelPond(root, { remainingIncense, reducedMotion, active }, seen)
  }, [active, reducedMotion, fishEligible])
  return pondRef
}

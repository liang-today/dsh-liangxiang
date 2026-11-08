import { useId, type ReactElement } from 'react'
import type { PositionMood } from './chart-model.ts'

const BLUE = 'var(--liangxiang-market-blue, #4d6bfe)'
// These silhouettes only separate pieces of the original illustration. They
// never replace its face, and no moving decoration is a financial data point.
const TAIL = 'M184 157Q204 169 219 157L246 132V183Q230 204 201 193L183 182Z'
const HAIR = 'M24 135Q44 147 58 145L54 177Q46 198 26 208L10 193L7 167Z'

/** The dry face uses vector clipping, avoiding a low-resolution animated mask surface. */
export function MarketWhaleFigure({ x, y, width, height, waterY, mood, animated, src }: {
  x: number, y: number, width: number, height: number, waterY: number,
  mood: PositionMood, animated: boolean, src: string,
}): ReactElement {
  const id = `liangxiang-market-whale-${useId().replace(/:/g, '')}`
  const dive = mood === 'behind' || mood === 'lost'
  const pose = dive ? 'dive' : mood === 'ahead' || mood === 'won' ? 'surface' : 'neutral'
  const sx = width / 246, sy = height / 256, cx = x + width / 2
  const line = Math.max(y, Math.min(y + height, waterY))
  const partTransform = `translate(${x} ${y})scale(${sx} ${sy})`
  const art = { href: src, x, y, width, height, preserveAspectRatio: 'none' }
  // Tint belongs to each cut-out, so its alpha silhouette follows that piece's
  // local rotation instead of leaving a blue copy of the resting tail behind.
  const tint = (part: string): ReactElement => <rect data-liangxiang-market-underwater-tint="" data-tint-part={part} x={x} y={line} width={width} height={Math.max(0, y + height - line)} fill={dive ? '#327ccc' : '#65b1ef'} opacity={dive ? '.58' : '.35'} mask={`url(#${id}-alpha)`} />
  return <g className="liangxiang-market-current-whale" data-pose={pose} data-motion={animated} data-liangxiang-market-whale-figure="" opacity={mood === 'waiting' ? '.88' : '1'}>
    <defs>
      <clipPath id={`${id}-tail`}><path d={TAIL} transform={partTransform} /></clipPath>
      <clipPath id={`${id}-hair`}><path d={HAIR} transform={partTransform} /></clipPath>
      <clipPath id={`${id}-body`}><path d={`M0 0H246V256H0Z${TAIL}${HAIR}`} transform={partTransform} clipRule="evenodd" /></clipPath>
      <clipPath id={`${id}-dry`}><rect x={x - 5} y={y - 5} width={width + 10} height={Math.max(0, line - y + 5)} /></clipPath>
      <clipPath id={`${id}-wet`}><rect x={x - 5} y={line} width={width + 10} height={Math.max(0, y + height - line + 5)} /></clipPath>
      <linearGradient id={`${id}-depth`} gradientUnits="userSpaceOnUse" x1="0" y1={line} x2="0" y2={Math.max(line + 1, y + height)}>
        <stop stopColor="white" stopOpacity={dive ? '.94' : '.9'} /><stop offset=".42" stopColor="white" stopOpacity={dive ? '.57' : '.28'} /><stop offset="1" stopColor="white" stopOpacity=".025" />
      </linearGradient>
      <mask id={`${id}-occlusion`} maskUnits="userSpaceOnUse" x={x - 5} y={y - 5} width={width + 10} height={height + 10}>
        <rect x={x - 5} y={y - 5} width={width + 10} height={Math.max(0, line - y + 5)} fill="white" />
        <rect x={x - 5} y={line} width={width + 10} height={Math.max(0, y + height - line + 5)} fill={`url(#${id}-depth)`} />
      </mask>
      <mask id={`${id}-alpha`} maskUnits="userSpaceOnUse" x={x} y={y} width={width} height={height} style={{ maskType: 'alpha' }}><image {...art} /></mask>
    </defs>
    <g className="liangxiang-market-whale-swim">
    <g data-liangxiang-market-whale-piece="body" clipPath={`url(#${id}-body)`}>
      <g data-liangxiang-market-steady-face="" clipPath={`url(#${id}-dry)`}><image data-liangxiang-market-whale-art="" {...art} /></g>
      <g clipPath={`url(#${id}-wet)`} mask={`url(#${id}-occlusion)`} data-liangxiang-market-water-occlusion={pose}><image {...art} />{tint('body')}</g>
    </g>
    <g mask={`url(#${id}-occlusion)`}>
        <g className="liangxiang-market-companion-sway">
        <g className="liangxiang-market-whale-tail" data-liangxiang-market-whale-piece="tail" clipPath={`url(#${id}-tail)`} style={{ transformOrigin: `${x + 188 * sx}px ${y + 176 * sy}px` }}><image {...art} />{tint('tail')}</g>
        </g>
        <g className="liangxiang-market-whale-hair" data-liangxiang-market-whale-piece="hair" clipPath={`url(#${id}-hair)`} style={{ transformOrigin: `${x + 49 * sx}px ${y + 144 * sy}px` }}><image {...art} />{tint('hair')}</g>
    </g>
    </g>
    {mood !== 'waiting' && <g className="liangxiang-market-whale-ripples" data-liangxiang-market-water-front="">
      <ellipse className="liangxiang-market-whale-breath" cx={cx} cy={waterY + 4} rx={width * .37} ry="5" fill={BLUE} fillOpacity=".1" />
      <path className="liangxiang-market-whale-ripple" d={`M${cx - width * .43} ${waterY + 1}q${width * .15} 7 ${width * .28} 2m${width * .3} 0q${width * .13} 4 ${width * .28} -2`} fill="none" stroke={BLUE} strokeOpacity=".43" strokeWidth="1.6" strokeLinecap="round" />
      <path d={`M${cx - width * .24} ${waterY + 2}q${width * .24} 7 ${width * .48} 0`} fill="none" stroke="#d7f1ff" strokeOpacity=".8" strokeWidth="1.8" strokeLinecap="round" />
    </g>}
    {dive && <g className="liangxiang-market-whale-bubbles" data-liangxiang-market-dive-bubbles="">{[0, 1, 2].map(index => <circle key={index} className="liangxiang-market-whale-bubble" cx={cx + width * .3 + index * 6} cy={waterY + 4 - index * 12} r={3.8 - index * .8} fill="#c9edff" fillOpacity=".35" stroke="#69a9ed" strokeWidth="1.3" style={{ animationDelay: `${index * .85}s` }} />)}</g>}
  </g>
}

/** Bounded, local water texture clipped to confirmed water, never to a guess. */
export function WaterMotion({ areaPath, animated }: { areaPath: string, animated: boolean }): ReactElement {
  const id = `liangxiang-market-water-${useId().replace(/:/g, '')}`
  return <g className="liangxiang-market-water-motion" data-motion={animated} aria-hidden="true" pointerEvents="none">
    <defs><clipPath id={id}><path d={areaPath} /></clipPath></defs>
    <g clipPath={`url(#${id})`}>
      <g className="liangxiang-market-water-back" fill="none" stroke="#b6dcff" strokeWidth="2" strokeLinecap="round" opacity=".26"><path d="M-18 125Q100 99 212 126T450 123T700 130" /><path d="M-25 221Q92 194 231 223T488 218T779 226" /></g>
      <path className="liangxiang-market-water-glint" d="M40 173Q170 139 293 169T560 168" fill="none" stroke="#d4edff" strokeWidth="3" strokeLinecap="round" opacity=".24" />
      <g className="liangxiang-market-water-specks" fill="#c1e2ff" opacity=".42">{[[92, 203, 2], [270, 272, 1.6], [428, 163, 1.8], [594, 260, 2.3]].map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} />)}</g>
    </g>
  </g>
}

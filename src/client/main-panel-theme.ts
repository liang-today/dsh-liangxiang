/** The approved blue pond palette, scoped to the panel, dock, feedback and history. */
export const MAIN_PANEL_THEME_CSS = `
[data-liangxiang-panel], [data-liangxiang-badge], [data-liangxiang-feedback], [data-liangci-dialog] {
  --liangxiang-main-paper: light-dark(#fbfdff, #202b3a);
  --liangxiang-main-soft: light-dark(#eff5fe, #2b3c55);
  --liangxiang-main-ink: light-dark(#293950, #e6eef9);
  --liangxiang-main-sub: light-dark(#62748d, #b3c4dd);
  --liangxiang-main-line: light-dark(#d6e2f1, #425976);
  --liangxiang-main-blue: light-dark(#5879bf, #a5c1ff);
  --liangxiang-main-deep: light-dark(#365990, #c0d5ff);
  --liangxiang-main-fill: light-dark(#5575bd, #405d98);
  --liangxiang-main-water: light-dark(#9dc6f6, #5f94d7);
  --liangxiang-gold: var(--liangxiang-main-blue);
  --liangxiang-ember: var(--liangxiang-main-fill);
  --liangxiang-ember-readable: var(--liangxiang-main-deep);
  --liangxiang-cool: var(--liangxiang-main-sub);
  color-scheme: inherit;
}`

export const mainColor = {
  paper: 'var(--liangxiang-main-paper)',
  soft: 'var(--liangxiang-main-soft)',
  ink: 'var(--liangxiang-main-ink)',
  sub: 'var(--liangxiang-main-sub)',
  line: 'var(--liangxiang-main-line)',
  blue: 'var(--liangxiang-main-blue)',
  deep: 'var(--liangxiang-main-deep)',
  fill: 'var(--liangxiang-main-fill)',
  water: 'var(--liangxiang-main-water)',
} as const

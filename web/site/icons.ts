// Lucide icons (ISC License, https://lucide.dev/license), 24 x 24, drawn as round 1.75 px strokes and inlined so no page
// loads an icon font or image from another origin. One set in core/shared/design/icons.json: tools/icon/build.mjs writes
// the same glyphs as the Android vector drawables ic_sym_*.xml, so both apps show the same icons (ADR 0054).
import iconSet from '@outage/shared/design/icons.json' with { type: 'json' };
export const ICON_PATHS = iconSet.icons;

export type IconName = keyof typeof ICON_PATHS;

/** One icon as inline SVG. Decorative unless a label is given. Stroke attributes are set here so CSS only sizes it. */
export function icon(name: IconName, cls = 'ico', label?: string): string {
  const a11y = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${iconSet.stroke}" stroke-linecap="round" stroke-linejoin="round"${a11y}><path d="${ICON_PATHS[name]}"/></svg>`;
}

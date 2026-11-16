// Material Icons (Apache License 2.0, https://github.com/google/material-design-icons), 24 x 24, inlined so no page
// loads an icon font or image from another origin. One set in core/shared/design/icons.json: tools/icon/build.mjs writes
// the same glyphs as the Android vector drawables ic_sym_*.xml, so both apps show the same icons.
import iconSet from '@outage/shared/design/icons.json' with { type: 'json' };
export const ICON_PATHS = iconSet.icons;

export type IconName = keyof typeof ICON_PATHS;

/** One icon as inline SVG. Decorative unless a label is given. */
export function icon(name: IconName, cls = 'ico', label?: string): string {
  const a11y = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  return `<svg class="${cls}" viewBox="0 0 24 24"${a11y}><path d="${ICON_PATHS[name]}"/></svg>`;
}

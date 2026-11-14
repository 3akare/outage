// Every dynamic string that reaches HTML goes through escapeHtml (R11.2, W8).

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escapes text for use in element content and in double- or single-quoted attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'`]/g, (ch) => ENTITIES[ch] ?? ch);
}

/** Escapes text for XML (sitemap). Same set as HTML minus the backtick entity. */
export function escapeXml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

/** A same-site path or an https URL; anything else (javascript:, data:, protocol-relative) becomes null. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

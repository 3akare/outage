// The stylesheet every page shares, and the old web-app addresses. /app, /app/insights and /app/settings used to be a
// real-data copy of the phone app (ADR 0027). ADR 0049 folds them into the app in the browser at /app/simulate, so a
// person without an Android phone meets one app, not two. The old addresses redirect there, /app/insights too. Real data stays public on
// the area pages and in /api/map.json, which the phone reads.
import { APP_CSS } from './design.ts';
import type { Rendered } from '../../site/headers.ts';
import { SIMULATE_PATH } from '../simulate/simulate.ts';

export const LEGACY_APP_PATHS = ['/app', '/app/insights', '/app/settings'] as const;

export const renderAppCss = (): Rendered => ({ status: 200, contentType: 'text/css; charset=utf-8', body: APP_CSS, ttlSeconds: 3600 });

export const redirectToApp = (): Rendered => ({
  status: 301,
  contentType: 'text/plain; charset=utf-8',
  body: '',
  ttlSeconds: 0,
  headers: { Location: SIMULATE_PATH },
});

// W6 (web-and-area-pages task 10): the Judge page and its API always say "Simulated replay", real routes never read the
// replay, and /judge never reads the public index (R6.2, R6.8, R1.3, R6.3, R6.7, R6.9).
import appJs from '../public/js/app.js?raw';
import replayFile from '@outage/shared/fixtures/replay.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import { explanationLines, provenanceText, type ReplayData } from '../ui/simulate/replay.ts';
import { handleWeb, type WebDeps } from '../routes.ts';
import { AREAS, NOW, SITE, YABA } from './web-helpers.ts';

const REPLAY = replayFile as unknown as ReplayData;
const SENTINEL = 'ZZSENTINELZZ';
const planted: ReplayData = {
  ...REPLAY,
  phones: [{ alias: SENTINEL, role: 'SIMULATED_NEIGHBOR' }],
  frames: REPLAY.frames.map((f, i) => (i === 0 ? { ...f, events: [{ alias: SENTINEL, type: 'ARMED' }] } : f)),
};

function setup(replay: ReplayData | null) {
  const counts = { index: 0, replay: 0 };
  const index: IndexReader = {
    async views() {
      counts.index++;
      return [];
    },
  };
  const d: WebDeps = {
    site: SITE,
    install: null,
    areas: AREAS,
    index,
    cache: new PageCache({ now: () => NOW }),
    replay: () => {
      counts.replay++;
      return replay;
    },
    now: () => NOW,
  };
  return { d, counts };
}
const get = (path: string) => new Request(`https://outage.test${path}`);
const text = async (path: string, replay: ReplayData | null = planted) => {
  const s = setup(replay);
  const res = await handleWeb(get(path), s.d);
  return { res, body: await res.text(), ...s };
};

describe('W6 simulated separation', () => {
  it('W6_simulated_separation: /app/simulate carries the banner in the HTML, never reads the index or the replay, and the API is labelled', async () => {
    const page = await text('/app/simulate');
    expect(page.res.status).toBe(200);
    expect(page.body).toMatch(/<div class="sim-banner" role="note">.*Simulation: simulated data, not live\./);
    expect(page.body).toContain('<title>Simulation: the Outage app in your browser');
    expect(page.counts.index).toBe(0);
    expect(page.counts.replay).toBe(0);
    const api = await text('/api/v1/public/judge/replay');
    const data = JSON.parse(api.body);
    expect(data.simulated).toBe(true);
    expect(data.label).toBe('Simulated replay');
    expect(api.counts.index).toBe(0);
  });

  it('W6_simulated_separation: a missing replay is a labelled 404 from the API', async () => {
    const api = await text('/api/v1/public/judge/replay', null);
    expect(api.res.status).toBe(404);
    expect(JSON.parse(api.body).simulated).toBe(true);
  });

  it('W6_simulated_separation: real routes never read the replay', async () => {
    const paths = [
      '/',
      '/app',
      '/app/insights',
      '/install',
      '/privacy',
      '/nope',
      '/robots.txt',
      '/sitemap.xml',
      `/area/${YABA.slug}`,
      `/c/${YABA.cells[0]}`,
      '/api/map.json',
      '/api/v1/public/map',
      `/api/v1/public/area/${YABA.slug}`,
      `/api/v1/public/cell/${YABA.cells[0]}/outages`,
    ];
    for (const p of paths) {
      const { body, counts } = await text(p);
      expect(counts.replay, p).toBe(0);
      expect(body, p).not.toContain(SENTINEL);
      expect(body, p).not.toContain('simulated data, not live');
    }
  });
});

describe('Simulation page', () => {
  it('/judge is a 301 to /app/simulate', async () => {
    const { res } = await text('/judge');
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('/app/simulate');
  });

  it('the app with its navigation bar, one simulate button, and an external same-origin script', async () => {
    const res = await handleWeb(get('/app/simulate'), setup(REPLAY).d);
    const body = await res.text();
    expect(body).toContain('This is the Outage Android app running in your browser.');
    expect(body).toContain('<nav class="rail"');
    expect(body).toContain('<script type="module" src="/js/app.js">');
    expect(new TextEncoder().encode(body).length).toBeLessThan(30 * 1024);
  });

  it('the script reads only the replay endpoint and has plain labels for every step', async () => {
    const body = appJs;
    expect(body).toContain('/api/v1/public/judge/replay');
    expect(body).not.toContain('/api/map.json');
    for (const label of ['Power is on', 'Power may be out', 'Power is out', 'Power is back']) expect(body).toContain(label);
    expect(body).toContain('Simulate again');
    expect(body.match(/id="go"/g)?.length).toBe(1);
  });

  it('the sitemap lists the simulation and not /judge', async () => {
    const { body } = await text('/sitemap.xml');
    expect(body).toContain('/app/simulate');
    expect(body).not.toContain('/judge');
  });

  it('R6.3: honest device count and not-live wording', () => {
    expect(provenanceText(REPLAY)).toBe('0 real devices recorded this outage. This replay is built from a made-up test recording, not live.');
    const recorded = { ...REPLAY, source: 'RECORDED' as const, recordedDevices: 1 };
    expect(provenanceText(recorded)).toBe('1 real device recorded this outage. This is a replay of a recording, not live.');
  });

  it('R6.4: the replay has every state and explanations with the numbers', () => {
    const states = new Set(REPLAY.frames.map((f) => f.cells[0]?.state));
    for (const s of ['NORMAL', 'POSSIBLE', 'CONFIRMED', 'RESTORED']) expect(states.has(s as never)).toBe(true);
    const x = REPLAY.frames.find((f) => f.explanation)?.explanation;
    expect(x && explanationLines(x).length).toBeGreaterThanOrEqual(3);
  });

  it('the service worker caches only the simulation paths', async () => {
    const sw = await handleWeb(get('/judge-sw.js'), setup(REPLAY).d);
    expect(sw.headers.get('Content-Type')).toContain('javascript');
    const b = await sw.text();
    expect(b).toContain("'/app/simulate'");
    expect(b).toContain('/api/v1/public/judge/replay');
    expect(b).not.toContain("'/judge'");
    expect(sw.headers.get('Content-Security-Policy')).toContain("worker-src 'self'");
  });
});

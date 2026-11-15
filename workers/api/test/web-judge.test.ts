// W6 (web-and-area-pages task 10): the Judge page and its API always say "Simulated replay", real routes never read the
// replay, and /judge never reads the public index (R6.2, R6.8, R1.3, R6.3, R6.7, R6.9).
import replayFile from '@outage/shared/fixtures/replay.json' with { type: 'json' };
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PageCache } from '../src/web/cache.ts';
import type { IndexReader } from '../src/web/index-reader.ts';
import { explanationLines, provenanceText, type ReplayData, renderJudgePage } from '../src/web/judge.ts';
import { handleWeb, type WebDeps } from '../src/web/routes.ts';
import { NUM_RUNS } from './runs.ts';
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
  it('W6_simulated_separation: /judge and its API carry the label, and /judge never reads the index', async () => {
    const page = await text('/judge');
    expect(page.res.status).toBe(200);
    expect(page.body).toContain('<title>Simulated replay: Outage simulation</title>');
    expect(page.body).toContain('<div class="banner" role="note">Simulated replay</div>');
    expect(page.counts.index).toBe(0);
    const api = await text('/api/v1/public/judge/replay');
    const data = JSON.parse(api.body);
    expect(data.simulated).toBe(true);
    expect(data.label).toBe('Simulated replay');
    expect(api.counts.index).toBe(0);
  });

  it('W6_simulated_separation: the label survives a missing replay and never hides behind the script', async () => {
    const page = await text('/judge', null);
    expect(page.body).toContain('Replay not built.');
    expect(page.body).toContain('class="banner"');
    const api = await text('/api/v1/public/judge/replay', null);
    expect(api.res.status).toBe(404);
    expect(JSON.parse(api.body).simulated).toBe(true);
  });

  it('W6_simulated_separation: real routes never read the replay', async () => {
    const paths = [
      '/',
      '/install',
      '/privacy',
      '/nope',
      '/robots.txt',
      '/sitemap.xml',
      `/area/${YABA.slug}`,
      `/c/${YABA.cells[0]}`,
      '/api/v1/public/map',
      `/api/v1/public/area/${YABA.slug}`,
      `/api/v1/public/cell/${YABA.cells[0]}/outages`,
    ];
    for (const p of paths) {
      const { body, counts } = await text(p);
      expect(counts.replay, p).toBe(0);
      expect(body, p).not.toContain(SENTINEL);
      expect(body, p).not.toContain('Simulated replay');
    }
  });

  it('W6_simulated_separation: for any frame set the page is labeled and escapes aliases', () => {
    const alias = fc.string({ minLength: 1, maxLength: 12 });
    fc.assert(
      fc.property(fc.array(fc.record({ alias, tMs: fc.nat(10_000_000) }), { minLength: 1, maxLength: 8 }), (rows) => {
        const r: ReplayData = {
          ...REPLAY,
          frames: rows.map((x) => ({ tMs: x.tMs, cells: [{ state: 'NORMAL' as const }], events: [{ alias: `<script>${x.alias}`, type: 'ARMED' }] })),
        };
        const out = renderJudgePage(SITE, r).body;
        expect(out).toContain('<title>Simulated replay');
        expect(out).toContain('class="banner"');
        expect(out.match(/<script/g)?.length).toBe(1); // an alias can never add a tag
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Judge page content', () => {
  it('R6.9 and R6.3: three-line idea, honest device count, not live', async () => {
    const { body } = await text('/judge', REPLAY);
    expect(body).toContain('Phones charging stop charging at the same second when power dies.');
    expect(provenanceText(REPLAY)).toBe('0 real devices recorded this outage. This replay is built from a made-up test recording, not live.');
    expect(body).toContain('0 real devices recorded this outage.');
    const recorded = { ...REPLAY, source: 'RECORDED' as const, recordedDevices: 1 };
    expect(provenanceText(recorded)).toBe('1 real device recorded this outage. This is a replay of a recording, not live.');
  });

  it('R6.4 and R6.5: every state appears, the spot-only step is labeled simulated, explanations show the numbers', async () => {
    const { body } = await text('/judge', REPLAY);
    for (const label of ['Power on', 'Possible power cut', 'Power cut', 'Power is back', 'Your spot only']) expect(body).toContain(label);
    expect(body).toContain('a simulated phone, not a real one');
    expect(body).toMatch(/3 of 10 armed phones stopped charging within 90 s/);
    expect(body).toContain('Restore check:');
    const x = REPLAY.frames.find((f) => f.explanation)?.explanation;
    expect(x && explanationLines(x).length).toBeGreaterThanOrEqual(3);
  });

  it('R6.1 and R6.7: controls, one nonce-marked script, no network fetch, service worker for refresh', async () => {
    const res = await handleWeb(get('/judge'), setup(REPLAY).d);
    const body = await res.text();
    for (const id of ['play', 'pause', 'restart']) expect(body).toContain(`id="${id}"`);
    for (const sp of ['1', '2', '4']) expect(body).toContain(`data-speed="${sp}"`);
    expect(body.match(/<script/g)?.length).toBe(1);
    expect(body).not.toContain('fetch(');
    const nonce = /nonce-([^']+)'/.exec(res.headers.get('Content-Security-Policy') ?? '')?.[1];
    expect(body).toContain(`<script nonce="${nonce}">`);
    expect(res.headers.get('Content-Security-Policy')).toContain("worker-src 'self'");
    const sw = await handleWeb(get('/judge-sw.js'), setup(REPLAY).d);
    expect(sw.headers.get('Content-Type')).toContain('javascript');
    const swBody = await sw.text();
    expect(swBody).toContain("u.pathname!=='/judge'");
  });

  it('R1.3: the real home and area pages show "Your spot only" only in the legend', async () => {
    const { body } = await text('/areas');
    expect(body.split('Your spot only').length - 1).toBe(1);
  });

  it('the state attribute of every step is one of the five known states', async () => {
    const { body } = await text('/judge', REPLAY);
    const states = [...body.matchAll(/class="step"[^>]*data-state="([A-Z_]+)"/g)].map((m) => m[1]);
    expect(states.length).toBe(REPLAY.frames.length);
    for (const s of states) expect(['NORMAL', 'POSSIBLE', 'CONFIRMED', 'RESTORED', 'SPOT_ONLY']).toContain(s);
  });

  it('the page stays under the 30 KB budget', async () => {
    const { body } = await text('/judge', REPLAY);
    expect(new TextEncoder().encode(body).length).toBeLessThan(30 * 1024);
  });
});

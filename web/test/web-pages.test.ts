import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellToParent } from 'h3-js';
import { finalize } from '../site/headers.ts';
import { renderAreaPage, renderCellPage, renderHomePage, renderInstallPage, renderNotFound, renderPrivacyPage, formatOffset } from '../areas/pages.ts';
import type { PublicScopeView } from '../api/public-index/public-view.ts';
import { areaStatus, END_UNKNOWN_AFTER_MS, formatClock, historyForCells, RESTORED_DISPLAY_MS, statusJson } from '../site/status.ts';
import { stateText } from '../site/strings.ts';
import { AREAS, bodyOf, cellView, confirmedNow, HOUR, IKEJA, NOW, parentView, SITE, view, MAINLAND } from './web-helpers.ts';

const runs = Number(process.env.FC_NUM_RUNS ?? 100);
const cell0 = MAINLAND.cells[0] as string;
const cell1 = MAINLAND.cells[1] as string;

const statusOf = (html: string) => /<section id="status"[^>]*?(?: data-state="([A-Z_]+)")?[^>]*>/.exec(html)?.[0] ?? '';

// Arbitrary public views over Lagos Mainland and Ikeja cells, optionally parent-scoped.
const arbView: fc.Arbitrary<PublicScopeView> = fc
  .record({
    cells: fc.subarray([...MAINLAND.cells, ...IKEJA.cells], { minLength: 1, maxLength: 4 }),
    parent: fc.boolean(),
    precision: fc.constantFrom('CELL', 'LINKED', 'COARSE' as const),
    status: fc.constantFrom('NORMAL', 'POSSIBLE', 'CONFIRMED' as const),
    open: fc.boolean(),
    openAgoH: fc.integer({ min: 0, max: 30 }),
    restoredAgoH: fc.option(fc.integer({ min: 0, max: 60 }), { nil: undefined }),
  })
  .map((r) =>
    view({
      scopeKind: r.parent ? 'PARENT' : 'CELL',
      precision: r.precision,
      boundary: r.parent ? [cellToParent(r.cells[0] as string, 7)] : r.cells,
      status: r.status,
      openOutage: r.open ? { startMs: NOW - r.openAgoH * HOUR, level: r.status === 'CONFIRMED' ? 'CONFIRMED' : 'POSSIBLE', precision: r.precision } : undefined,
      lastRestoredAtMs: r.restoredAgoH === undefined ? undefined : NOW - r.restoredAgoH * HOUR,
      history30d: [{ startMs: NOW - 5 * HOUR, endMs: NOW - 4 * HOUR, level: 'CONFIRMED', precision: r.precision }],
    }),
  );

describe('W1 page without script', () => {
  it('W1_page_without_script: area page shows title, label, sentence and install link for any status', () => {
    fc.assert(
      fc.property(fc.array(arbView, { maxLength: 5 }), (views) => {
        const out = bodyOf(renderAreaPage({ site: SITE, area: MAINLAND, views, nowMs: NOW }));
        const status = areaStatus(MAINLAND, views, NOW);
        expect(out).toContain('<title>Is there power in Lagos Mainland right now?</title>');
        expect(out).toContain('<h1>Is there power in Lagos Mainland right now?</h1>');
        expect(out).toContain(SITE.apkUrl);
        expect(out).toContain('href="/app/simulate"');
        expect(out).toContain('rel="canonical"');
        expect(out).toContain('name="description"');
        if (status.kind === 'NO_COVERAGE') expect(out).toContain('No phones here yet. Install Outage to be the first.');
        else {
          expect(out).toContain(`>${stateText(status.kind).label}<`);
          expect(out).toContain(stateText(status.kind).sentence);
          expect(out).toContain('3+ phones');
        }
      }),
      { numRuns: runs },
    );
  });

  it('W1_page_without_script: the only script is optional and carries the nonce; the status is in HTML', () => {
    const out = renderAreaPage({ site: SITE, area: MAINLAND, views: [cellView(cell0, confirmedNow())], nowMs: NOW }).body;
    expect(out.match(/<script/g)?.length).toBe(1);
    expect(out).toContain('<script nonce="__OUTAGE_NONCE__">');
    expect(out).toContain('Power cut');
  });

  it('W1_page_without_script: install button falls back to /install when no APK link is configured', () => {
    const out = renderAreaPage({ site: { ...SITE, apkUrl: null }, area: MAINLAND, views: [], nowMs: NOW }).body;
    expect(out).toContain('href="/install"');
  });

  it('W1_page_without_script: area with no public status says so and shows no status, boundary or count', () => {
    const out = bodyOf(renderAreaPage({ site: SITE, area: MAINLAND, views: [], nowMs: NOW }));
    expect(out).toContain('No phones here yet. Install Outage to be the first.');
    expect(statusOf(out)).not.toContain('data-state=');
    expect(out).not.toContain('3+ phones');
    expect(out).not.toContain('Last 30 days');
    expect(out).not.toContain('<script');
    expect(out).toContain(SITE.apkUrl);
  });

  it('W1_page_without_script: unavailable index shows the message with a short TTL', () => {
    const r = renderAreaPage({ site: SITE, area: MAINLAND, views: null, nowMs: NOW });
    expect(r.body).toContain('Status is not available right now.');
    expect(r.ttlSeconds).toBeLessThanOrEqual(5);
    expect(r.body).toContain('href="/app/simulate"');
  });

  it('W1_page_without_script: wider scope shows the precision label', () => {
    const out = renderAreaPage({ site: SITE, area: MAINLAND, views: [parentView(cell0, { status: 'POSSIBLE' })], nowMs: NOW }).body;
    expect(out).toContain('Based on a wider area');
    const cellOut = renderAreaPage({ site: SITE, area: MAINLAND, views: [cellView(cell0, { status: 'POSSIBLE' })], nowMs: NOW }).body;
    expect(cellOut).not.toContain('Based on a wider area');
  });

  it('W1_page_without_script: history lists start, end or unknown, level and precision; since time in catalog offset', () => {
    const open = cellView(cell0, { ...confirmedNow(NOW - 2 * HOUR), history30d: [{ startMs: NOW - 50 * HOUR, endMs: null, level: 'POSSIBLE', precision: 'LINKED' }] });
    const out = renderAreaPage({ site: SITE, area: MAINLAND, views: [open], nowMs: NOW }).body;
    expect(out).toContain('Last 30 days');
    expect(out).toContain('to unknown');
    expect(out).toContain('Linked nearby areas');
    expect(out).toMatch(/Since \d+ [A-Z][a-z]{2}, \d+:\d\d [ap]\.m\./);
    expect(out).toContain('(UTC+1)');
    expect(out).toContain('11:00 a.m.'); // NOW is 12:00 UTC, so 13:00 local; the outage began 2 h earlier: 11:00 local
  });

  it('W1_page_without_script: unknown outage end after 12 hours is shown as End unknown', () => {
    const v = cellView(cell0, confirmedNow(NOW - END_UNKNOWN_AFTER_MS - HOUR));
    expect(renderAreaPage({ site: SITE, area: MAINLAND, views: [v], nowMs: NOW }).body).toContain('End unknown');
  });

  it('W1_page_without_script: home page has hero, Judge button, install button, map and list', () => {
    const out = renderHomePage({ site: SITE, areas: AREAS, views: [cellView(cell0, confirmedNow())], nowMs: NOW }).body;
    expect(out).toContain('Your phone charger is a power-grid sensor.');
    expect(out).toContain('href="/app/simulate"');
    expect(out).toContain('<svg class="map"');
    expect(out).toContain('<a href="/area/lagos-mainland">Lagos Mainland</a>: Power cut');
    expect(out).toContain('<a href="/area/ikeja">Ikeja</a>: No phones here yet');
  });

  it('W1_page_without_script: home with no listed areas still offers Judge mode and install', () => {
    const out = renderHomePage({ site: SITE, areas: [], views: [], nowMs: NOW }).body;
    expect(out).toContain('href="/app/simulate"');
    expect(out).toContain('Install Outage');
    expect(out).not.toContain('<svg class="map"'); // no map without areas; the brand mark is the only picture
  });

  it('W1_page_without_script: unknown slug page lists areas and the install button', () => {
    const r = renderNotFound({ site: SITE, areas: AREAS });
    expect(r.status).toBe(404);
    expect(r.body).toContain('/area/lagos-mainland');
    expect(r.body).toContain('Install Outage');
  });

  it('W1_page_without_script: install page has link, version, size, checksum, Android-only note and steps', () => {
    const sha = 'ab'.repeat(32);
    const r = renderInstallPage({ site: SITE, install: { apkUrl: SITE.apkUrl as string, version: '0.1.0', sizeBytes: 5_242_880, sha256: sha } });
    expect(r.body).toContain(SITE.apkUrl);
    expect(r.body).toContain('Version: 0.1.0');
    expect(r.body).toContain('Size: 5.0 MB');
    expect(r.body).toContain(sha);
    expect(r.body).toContain('Android only for now');
    expect(r.body).toContain('href="/app/simulate"');
    expect(r.body).toContain('Allow from this source');
    const none = renderInstallPage({ site: SITE, install: null });
    expect(none.body).toContain('not published yet');
    expect(none.body).toContain('Android only for now');
  });

  it('W1_page_without_script: privacy page states collected, public and delete', () => {
    const out = renderPrivacyPage({ site: SITE }).body;
    expect(out).toContain('What Outage collects');
    expect(out).toContain('What is public');
    expect(out).toContain('Delete my data');
    expect(out).toContain('no cookies');
  });

  it('W1_page_without_script: area page stays under 30 KB with a full history', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({ startMs: NOW - (i + 1) * 15 * HOUR, endMs: NOW - (i + 1) * 15 * HOUR + HOUR, level: 'CONFIRMED' as const, precision: 'COARSE' as const }));
    const r = renderAreaPage({ site: SITE, area: MAINLAND, views: [parentView(cell0, { status: 'CONFIRMED', ...confirmedNow(), history30d: history })], nowMs: NOW });
    expect(new TextEncoder().encode(r.body).length).toBeLessThan(30 * 1024);
  });
});

describe('W2 public privacy', () => {
  it('W2_public_privacy: no install ID, push token, small count or foreign boundary in any page', () => {
    const outsider = IKEJA.cells[3] as string;
    fc.assert(
      fc.property(fc.array(arbView, { maxLength: 5 }), (views) => {
        // A view built by buggy code could carry extra fields; renderers must never print them.
        const tainted = views.map((v) => ({ ...v, installId: 'INSTALL-SECRET-1', pushToken: 'PUSH-SECRET-2', members: 1 }) as PublicScopeView);
        const outputs = [
          renderAreaPage({ site: SITE, area: MAINLAND, views: tainted, nowMs: NOW }),
          renderCellPage({ site: SITE, cell: cell0, views: tainted, nowMs: NOW, areas: AREAS }),
          renderHomePage({ site: SITE, areas: [MAINLAND], views: tainted, nowMs: NOW }),
        ].map((r) => r.body);
        for (const out of outputs) {
          expect(out).not.toMatch(/INSTALL-SECRET|PUSH-SECRET/);
          expect(out).not.toMatch(/\b[0-2] phones?\b/);
          expect(out).not.toMatch(/\bmembers?\b/i);
          // Ikeja is not in the pages above, so none of its cells may appear.
          expect(out).not.toContain(outsider);
        }
        // The home page with only Lagos Mainland listed never draws a cell outside Lagos Mainland, even if a view covers it.
        expect(outputs[2]).not.toContain(IKEJA.centreCell);
      }),
      { numRuns: runs },
    );
  });

  it('W2_public_privacy: the area JSON shape holds counts of nothing and no cells', () => {
    const j = statusJson(areaStatus(MAINLAND, [cellView(cell0, confirmedNow())], NOW));
    expect(Object.keys(j).sort()).toEqual(['endUnknown', 'precision', 'sinceMs', 'state']);
  });

  it('W2_public_privacy: the page script is static and has no request data', () => {
    const a = renderAreaPage({ site: SITE, area: MAINLAND, views: [cellView(cell0, confirmedNow())], nowMs: NOW }).body;
    const b = renderAreaPage({ site: SITE, area: IKEJA, views: [cellView(IKEJA.cells[0] as string, confirmedNow())], nowMs: NOW }).body;
    const script = (s: string) => /<script[^>]*>([\s\S]*?)<\/script>/.exec(s)?.[1];
    expect(script(a)).toBe(script(b));
  });

  it('W2_public_privacy: dynamic strings are escaped in pages', () => {
    const evil = { ...MAINLAND, name: '<img src=x onerror=alert(1)>', slug: 'a"b' };
    const out = renderAreaPage({ site: SITE, area: evil, views: [], nowMs: NOW }).body + renderHomePage({ site: SITE, areas: [evil], views: [], nowMs: NOW }).body + renderNotFound({ site: SITE, areas: [evil] }).body;
    expect(out).not.toContain('<img');
    expect(out).not.toContain('a"b');
    const bad = renderInstallPage({ site: SITE, install: { apkUrl: 'javascript:alert(1)', version: '<b>1</b>', sizeBytes: 1, sha256: 'zz' } });
    expect(bad.body).not.toContain('javascript:');
    expect(bad.body).not.toContain('<b>1');
  });
});

describe('W3 five states', () => {
  it('W3_five_states: every status is exactly one of Normal, Possible, Confirmed, Restored or no coverage; spot-only never', () => {
    fc.assert(
      fc.property(fc.array(arbView, { maxLength: 6 }), (views) => {
        const s = areaStatus(MAINLAND, views, NOW);
        expect(['NO_COVERAGE', 'NORMAL', 'POSSIBLE', 'CONFIRMED', 'RESTORED']).toContain(s.kind);
        const out = renderAreaPage({ site: SITE, area: MAINLAND, views, nowMs: NOW }).body;
        const block = /<section id="status"[^>]*>/.exec(out)?.[0] ?? '';
        expect(block).not.toContain('SPOT_ONLY');
        const m = /data-state="([A-Z_]+)"/.exec(block);
        if (s.kind === 'NO_COVERAGE') expect(m).toBeNull();
        else expect(m?.[1]).toBe(s.kind);
        // "Your spot only" appears only as a legend entry that says it is private to one phone.
        const occurrences = out.split('Your spot only').length - 1;
        expect(occurrences).toBe(1);
        expect(out).toContain('This state stays on one phone. It is never shown for an area.');
      }),
      { numRuns: runs },
    );
  });

  it('W3_five_states: highest of covering views wins, ordered Confirmed, Possible, Restored, Normal', () => {
    const restored = cellView(cell0, { lastRestoredAtMs: NOW - HOUR });
    const possible = cellView(cell1, { status: 'POSSIBLE', openOutage: { startMs: NOW - HOUR, level: 'POSSIBLE', precision: 'CELL' } });
    const confirmed = cellView(MAINLAND.cells[2] as string, confirmedNow());
    const normal = cellView(MAINLAND.cells[3] as string);
    expect(areaStatus(MAINLAND, [normal, restored], NOW).kind).toBe('RESTORED');
    expect(areaStatus(MAINLAND, [normal, restored, possible], NOW).kind).toBe('POSSIBLE');
    expect(areaStatus(MAINLAND, [restored, possible, confirmed, normal], NOW).kind).toBe('CONFIRMED');
    expect(areaStatus(MAINLAND, [normal], NOW).kind).toBe('NORMAL');
    expect(areaStatus(MAINLAND, [], NOW).kind).toBe('NO_COVERAGE');
  });

  it('W3_five_states: restored shows for 24 hours then the area is Normal', () => {
    const at = (ago: number) => areaStatus(MAINLAND, [cellView(cell0, { lastRestoredAtMs: NOW - ago })], NOW).kind;
    expect(at(RESTORED_DISPLAY_MS - 1)).toBe('RESTORED');
    expect(at(RESTORED_DISPLAY_MS)).toBe('NORMAL');
    expect(at(-1)).toBe('NORMAL'); // a restore time in the future (clock skew) is not shown
  });

  it('W3_five_states: best precision among the views giving the top level', () => {
    const coarse = parentView(cell0, { status: 'CONFIRMED', ...confirmedNow() });
    const cellV = cellView(cell0, confirmedNow());
    const linked = view({ scopeKind: 'GROUP', precision: 'LINKED', boundary: [cell0, cell1], ...confirmedNow() });
    const s = (v: PublicScopeView[]) => areaStatus(MAINLAND, v, NOW);
    expect(s([coarse, linked])).toMatchObject({ kind: 'CONFIRMED', precision: 'LINKED' });
    expect(s([coarse, linked, cellV])).toMatchObject({ precision: 'CELL' });
    // a calmer precise view does not hide a worse wider one
    expect(s([cellView(cell0), coarse])).toMatchObject({ kind: 'CONFIRMED', precision: 'COARSE' });
  });

  it('W3_five_states: a parent boundary covers every child cell, a view elsewhere covers nothing', () => {
    expect(areaStatus(MAINLAND, [parentView(cell0, { status: 'POSSIBLE' })], NOW).kind).toBe('POSSIBLE');
    expect(areaStatus(MAINLAND, [cellView(IKEJA.centreCell, confirmedNow())], NOW).kind).toBe('NO_COVERAGE');
  });

  it('W3_five_states: legend shows all five labels and sentences, and Pidgin Restored when asked', () => {
    const out = renderAreaPage({ site: SITE, area: MAINLAND, views: [], nowMs: NOW }).body;
    for (const label of ['Power on', 'Your spot only', 'Possible power cut', 'Power cut', 'Power is back']) expect(out).toContain(label);
    const pcm = renderAreaPage({ site: SITE, area: MAINLAND, views: [cellView(cell0, { lastRestoredAtMs: NOW - HOUR })], nowMs: NOW, lang: 'pcm' }).body;
    expect(pcm).toContain('Light don come!');
  });

  it('W3_five_states: history window keeps 30 days, newest first, without duplicates', () => {
    const dup = { startMs: NOW - 3 * HOUR, endMs: null, level: 'CONFIRMED' as const, precision: 'CELL' as const };
    const v = cellView(cell0, {
      ...confirmedNow(NOW - 3 * HOUR),
      history30d: [dup, { startMs: NOW - 40 * 24 * HOUR, endMs: NOW - 39 * 24 * HOUR, level: 'POSSIBLE', precision: 'CELL' }, { startMs: NOW - 10 * HOUR, endMs: NOW - 9 * HOUR, level: 'POSSIBLE', precision: 'CELL' }],
    });
    const h = historyForCells(MAINLAND.cells, [v], NOW);
    expect(h.map((o) => o.startMs)).toEqual([NOW - 3 * HOUR, NOW - 10 * HOUR]);
  });

  it('W3_five_states: clock and offset formatting', () => {
    expect(formatClock(Date.UTC(2026, 0, 1, 13, 14), 60)).toBe('2:14 p.m.');
    expect(formatClock(Date.UTC(2026, 0, 1, 23, 5), 60)).toBe('12:05 a.m.');
    expect(formatClock(Date.UTC(2026, 0, 1, 11, 0), 60)).toBe('12:00 p.m.');
    expect(formatOffset(60)).toBe('UTC+1');
    expect(formatOffset(-330)).toBe('UTC-5:30');
  });
});

describe('W9 cell page indistinguishable', () => {
  it('W9_cell_page_indistinguishable: a cell with no public scope gives the same bytes whatever else is in the index', () => {
    const target = IKEJA.cells[5] as string;
    const empty = renderCellPage({ site: SITE, cell: target, views: [], nowMs: NOW, areas: AREAS }).body;
    fc.assert(
      fc.property(fc.array(arbView, { maxLength: 6 }), (views) => {
        // Drop any view that covers the target; what remains is "a cell with no public scope" in a busy index.
        const others = views.filter((v) => areaStatus({ cells: [target] }, [v], NOW).kind === 'NO_COVERAGE');
        const a = renderCellPage({ site: SITE, cell: target, views: others, nowMs: NOW, areas: AREAS });
        expect(a.body).toBe(empty);
        expect(a.status).toBe(200);
      }),
      { numRuns: runs },
    );
  });

  it('W9_cell_page_indistinguishable: invitation text, noindex, no status block data', () => {
    const r = renderCellPage({ site: SITE, cell: cell0, views: [], nowMs: NOW, areas: AREAS });
    expect(r.noindex).toBe(true);
    expect(r.body).toContain('name="robots" content="noindex"');
    expect(r.body).toContain('No phones here yet. Install Outage to be the first.');
    expect(statusOf(r.body)).not.toContain('data-state=');
    const res = finalize(r);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('W9_cell_page_indistinguishable: a covered cell shows its status; invalid cells get the plain 404', () => {
    const covered = renderCellPage({ site: SITE, cell: cell0, views: [cellView(cell0, confirmedNow())], nowMs: NOW, areas: AREAS });
    expect(covered.body).toContain('data-state="CONFIRMED"');
    for (const bad of ['', 'abc', 'not-a-cell', '8a1f2b3c4d5e6ff', cellToParent(cell0, 7), cell0.toUpperCase()]) {
      const r = renderCellPage({ site: SITE, cell: bad, views: [], nowMs: NOW, areas: AREAS });
      expect(r.status).toBe(404);
      expect(r.body).not.toContain(bad || '\u0000');
    }
  });
});

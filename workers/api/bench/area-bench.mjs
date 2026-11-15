// Benchmark for area-cells task 12: startup (cold load of state from SQLite) and CPU per ingest batch and per alarm
// of the area actor's pure parts, on real SQLite (node:sqlite) behind a small SqlStorage shim.
// Usage: npm run bench -w workers/api. Not part of `npm test`: timings depend on the machine, and this is not workerd.
// Free plan CPU limit, 10 ms per invocation: https://developers.cloudflare.com/workers/platform/limits/#cpu-time
// Durable Objects follow it: https://developers.cloudflare.com/durable-objects/platform/limits/#can-i-increase-durable-objects-cpu-limit
import { mkdtempSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { childrenOf, neighborsOf, parentOf, res7Parent } from '@outage/shared';
import { AreaModel, areaConfig } from '../src/area/model.ts';
import { AreaCore } from '../src/area/core.ts';
import { SqlAreaStore, SqlModelStore } from '../src/area/store.ts';
import { CONFIG } from '../src/config.ts';

const MIN = 60_000;
const HOUR = 3_600_000;
const T0 = 1_800_000_000_000;
const BUDGET_MS = 10;
const RUNS = 100;
const WARMUP = 10;
const PER_CELL = (process.env.PER_CELL ?? '30,100').split(',').map(Number);
// A Yaba res 8 cell from the area catalog (a public centre cell, not a person's location).
const CELL = '88589c9861fffff';
const PARENT = res7Parent(CELL);
const CELLS = childrenOf(PARENT);

/** The part of the Durable Object SqlStorage API that area/store.ts uses, over node:sqlite. */
function shim(db) {
  return {
    exec(query, ...bindings) {
      const stmt = db.prepare(query);
      if (stmt.columns().length > 0) {
        const rows = stmt.all(...bindings);
        return { toArray: () => rows, rowsWritten: 0 };
      }
      const r = stmt.run(...bindings);
      return { toArray: () => [], rowsWritten: Number(r.changes) };
    },
  };
}
const txn = (db) => (fn) => {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: q(0.5), p95: q(0.95), max: s[s.length - 1] };
};
const fmt = (st) => `median ${st.median.toFixed(2)} ms, p95 ${st.p95.toFixed(2)} ms, max ${st.max.toFixed(2)} ms`;

// neighborsOf loads h3-js on first use, so the first call includes the module load (design section 11).
const t1 = performance.now();
const neighbors = new Map();
for (const c of CELLS) neighbors.set(c, await neighborsOf(c));
const neighborsFirst = performance.now() - t1;
const t2 = performance.now();
for (const c of CELLS) await neighborsOf(c);
const neighborsWarm = performance.now() - t2;

const cfg = () => areaConfig(neighbors, childrenOf, parentOf, CONFIG.STATE_FLUSH_MS);
const TUNABLES = { ...CONFIG, BUCKET_CAPACITY: 1_000_000, MAX_BATCH_EVENTS: 1000 };

function open(file) {
  const db = new DatabaseSync(file);
  // A Durable Object commits to local SQLite off the request's CPU path (replication is asynchronous), so an fsync per
  // commit would measure the disk, not the actor: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
  db.exec('PRAGMA synchronous = OFF; PRAGMA journal_mode = MEMORY');
  const sql = shim(db);
  const store = new SqlAreaStore(sql);
  const model = new AreaModel(PARENT, new SqlModelStore(sql, txn(db)), cfg());
  return { db, store, model, core: new AreaCore(store, model, TUNABLES) };
}

const ev = (id, seq, type, cellId, t) => ({
  installId: id,
  seq,
  type,
  cell: cellId,
  eventTimeMs: t,
  confidence: 'HIGH',
  schedulingDelayMs: null,
});

/** Builds a populated actor: perCell phones armed in every cell, then three days of a short cut and restore in the first cell. */
async function populate(file, perCell) {
  const a = open(file);
  const phones = [];
  CELLS.forEach((c, ci) => {
    for (let i = 0; i < perCell; i++) phones.push({ id: `b${ci}-${i}`, cell: c, seq: 0 });
  });
  const send = (items, now) => a.core.ingest({ parent: PARENT, receiveTimeMs: now, events: items });
  let now = T0;
  for (const p of phones) await send([ev(p.id, ++p.seq, 'ARMED', p.cell, now - 30 * MIN)], now);
  for (let day = 0; day < 3; day++) {
    const cut = T0 + day * 24 * HOUR + HOUR;
    const group = phones.filter((x) => x.cell === CELLS[0]);
    for (const p of group) await send([ev(p.id, ++p.seq, 'UNPLUG', p.cell, cut)], cut);
    for (const p of group) await send([ev(p.id, ++p.seq, 'REPLUG', p.cell, cut + 20 * MIN)], cut + 20 * MIN);
    now = cut + 20 * MIN;
  }
  a.core.flush();
  a.model.tick(now);
  a.model.flush();
  const count = (q) => a.db.prepare(q).get().n;
  const rows = count('SELECT COUNT(*) AS n FROM area_model');
  const detection = count('SELECT COUNT(*) AS n FROM detection_event');
  const bytes = count('SELECT COALESCE(SUM(LENGTH(json)),0) AS n FROM area_model');
  a.db.close();
  return { phones, now, rows, detection, bytes };
}

console.log(`Machine: ${cpus()[0].model}, ${cpus().length} cores, Node ${process.version}. Local, not workerd, not production.`);
console.log(`Budget: ${BUDGET_MS} ms CPU per invocation (Workers Free).`);
console.log(
  `neighborsOf for the 7 cells (loads h3-js): first ${neighborsFirst.toFixed(1)} ms, warm ${neighborsWarm.toFixed(2)} ms`,
);

for (const perCell of PER_CELL) {
  const dir = mkdtempSync(join(tmpdir(), 'area-bench-'));
  const file = join(dir, 'actor.sqlite');
  const built = await populate(file, perCell);
  console.log(
    `\n== ${perCell} phones per cell, ${perCell * CELLS.length} phones; ${built.rows} area_model rows (${(built.bytes / 1024).toFixed(0)} KB json), ${built.detection} detection rows`,
  );

  // Startup: open the database, create tables if missing, load every model row, rebuild state.
  const startup = [];
  const loadOnly = [];
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const s = performance.now();
    const db = new DatabaseSync(file);
    const sql = shim(db);
    new SqlAreaStore(sql);
    const ms = new SqlModelStore(sql, txn(db));
    const l0 = performance.now();
    new AreaModel(PARENT, ms, cfg());
    const e = performance.now();
    if (i >= WARMUP) {
      startup.push(e - s);
      loadOnly.push(e - l0);
    }
    db.close();
  }
  console.log(`startup (open, tables, load, rebuild): ${fmt(stats(startup))}`);
  console.log(`  of which AreaModel load and rebuild:  ${fmt(stats(loadOnly))}`);

  // Ingest on a warm actor: a batch of 20 state events from one phone, and one UNPLUG into a populated cell.
  const a = open(file);
  const quiet = built.phones.find((p) => p.cell === CELLS[3]);
  const noisy = built.phones.filter((p) => p.cell === CELLS[1]);
  let now = built.now + HOUR;
  const batch = [];
  const single = [];
  for (let i = 0; i < WARMUP + RUNS; i++) {
    now += 2 * MIN;
    const events = [];
    for (let k = 0; k < 20; k++) events.push(ev(quiet.id, ++quiet.seq, k % 2 ? 'REPLUG' : 'UNPLUG', quiet.cell, now + k * 1000));
    let s = performance.now();
    await a.core.ingest({ parent: PARENT, receiveTimeMs: now, events });
    let e = performance.now();
    if (i >= WARMUP) batch.push(e - s);
    const p = noisy[i % noisy.length];
    now += 2 * MIN;
    s = performance.now();
    await a.core.ingest({ parent: PARENT, receiveTimeMs: now, events: [ev(p.id, ++p.seq, 'UNPLUG', p.cell, now)] });
    e = performance.now();
    if (i >= WARMUP) single.push(e - s);
    a.model.drainOutbox();
  }
  console.log(`ingest, 20-event batch from one phone: ${fmt(stats(batch))}`);
  console.log(`ingest, one UNPLUG into a populated cell: ${fmt(stats(single))}`);

  // Alarm: flush the armed-state buffer, prune check, reducer tick, model flush (write-behind), report and outbox drain.
  const alarm = [];
  for (let i = 0; i < WARMUP + RUNS; i++) {
    now += 10 * MIN;
    const p = noisy[(i * 7) % noisy.length];
    await a.core.ingest({ parent: PARENT, receiveTimeMs: now, events: [ev(p.id, ++p.seq, 'REPLUG', p.cell, now)] });
    const s = performance.now();
    a.core.flush();
    if (now >= a.core.pruneDueMs(now)) a.core.prune(now);
    const tick = a.model.tickDueMs();
    if (tick !== null && tick <= now) a.model.tick(now);
    a.model.flush();
    a.core.drainReport(now);
    a.model.drainOutbox();
    const e = performance.now();
    if (i >= WARMUP) alarm.push(e - s);
  }
  console.log(`alarm (flush, tick, model flush, drain): ${fmt(stats(alarm))}`);
  const cold = stats(startup).p95 + Math.max(stats(batch).p95, stats(single).p95, stats(alarm).p95);
  console.log(`cold call (startup p95 + the slowest of ingest or alarm p95): ${cold.toFixed(2)} ms vs ${BUDGET_MS} ms budget`);
  a.db.close();
  rmSync(dir, { recursive: true, force: true });
}

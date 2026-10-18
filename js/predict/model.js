/**
 * Předzápasový model z veřejného repa robertzechovsky639-ui/tenis.
 * Načítá model.js, model.json, žebříček hráčů a jen ty shardy, které zápas potřebuje.
 * Když hráč v modelu není, vrátí null a o patro výš nastoupí Elo nebo žebříček.
 */

import { pragueDayNumber } from '../util.js';
import { playerKey } from '../util.js';

const PAGES = 'https://robertzechovsky639-ui.github.io/tenis';
const RAW = 'https://raw.githubusercontent.com/robertzechovsky639-ui/tenis/main';
const SURF = { Hard: 0, Clay: 1, Grass: 2, Carpet: 3 };

const state = {
  ready: false,
  error: '',
  TM: null,
  model: null,
  meta: null,
  idx: null,
  online: null,
  live: null,
  serverPreds: null,
  shards: new Map(),
  shardLoads: new Map(),
  matcher: null,
  byKey: new Map(),
};

let boot = null;
let livePromise = Promise.resolve();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (globalThis.TM?.Model) {
      resolve(globalThis.TM);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => (globalThis.TM ? resolve(globalThis.TM) : reject(new Error('model.js bez TM')));
    script.onerror = () => reject(new Error('model.js se nepodařilo načíst'));
    document.head.appendChild(script);
  });
}

async function fetchJSON(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

class Matcher {
  constructor() {
    this.full = new Map();
    this.sur = new Map();
  }

  put(map, key, id, recency) {
    const current = map.get(key);
    if (!current || recency > current[1]) map.set(key, [id, recency]);
  }

  add(id, gender, name, recency) {
    const parts = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!parts.length) return;
    this.put(this.full, `${gender}|${[...parts].sort().join(' ')}`, id, recency);
    const key = playerKey(name);
    const [sur, ini] = key.split('|');
    if (sur && ini) this.put(this.sur, `${gender}|${sur}|${ini}`, id, recency);
  }

  match(gender, name) {
    const parts = String(name || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const full = this.full.get(`${gender}|${[...parts].sort().join(' ')}`);
    if (full) return full[0];
    const key = playerKey(name);
    const [sur, ini] = key.split('|');
    const hit = sur && ini ? this.sur.get(`${gender}|${sur}|${ini}`) : null;
    return hit ? hit[0] : null;
  }
}

function stripLive(raw) {
  if (!raw || raw.base !== 'liveml1' || !Array.isArray(raw.w)) return null;
  const keep = ['base', 'score', 'core', 'diffs', 'ctx', 'scale', 'w', 'w0', 'gw', 'gw0', 'sw', 'sw0', 'nw', 'nw0', 'nscore', 'n', 'gn', 'sn', 'nn'];
  const out = {};
  for (const key of keep) if (raw[key] != null) out[key] = raw[key];
  return out;
}

async function loadLiveWeights() {
  try {
    const cached = localStorage.getItem('tenis-live:live-weights');
    if (cached) state.live = JSON.parse(cached);
  } catch { /* cache je jen zkratka */ }
  try {
    const raw = await fetchJSON(`${RAW}/state/live_online.json?t=${Math.floor(Date.now() / 300000)}`);
    const slim = stripLive(raw);
    if (slim) {
      state.live = slim;
      try { localStorage.setItem('tenis-live:live-weights', JSON.stringify(slim)); } catch { /* plné úložiště */ }
    }
  } catch { /* zůstanou poslední váhy nebo Markov */ }
  try {
    state.serverPreds = await fetchJSON(`${RAW}/state/live_preds.json?t=${Math.floor(Date.now() / 60000)}`);
  } catch { /* serverové procento je doplněk */ }
}

export function predictionStatus() {
  if (state.error) return { phase: 'error', label: state.error };
  if (!state.ready) return { phase: 'loading', label: 'Načítá se model Tenis…' };
  if (state.live?.w) return { phase: 'live-ml', label: 'Předzápas: LightGBM z tenis.github.io. Živě: jeho váhy skóre, přepočet při každém výsledku.' };
  return { phase: 'model', label: 'Předzápas: LightGBM z tenis.github.io. Živě: bodový model od této šance.' };
}

export function startModel() {
  if (!boot) boot = (async () => {
    try {
      const [TM, model, meta, idx, online] = await Promise.all([
        loadScript(`${PAGES}/model.js`),
        fetchJSON(`${PAGES}/data/model.json`),
        fetchJSON(`${PAGES}/data/meta.json`),
        fetchJSON(`${PAGES}/data/players.json`),
        fetchJSON(`${RAW}/state/online.json`).catch(() => fetchJSON(`${PAGES}/data/online.json`)),
      ]);
      state.TM = TM;
      state.model = new TM.Model(model);
      if (online?.w && online.cols) state.model.m.online = online;
      state.meta = meta;
      state.idx = idx;
      state.online = online;
      state.matcher = new Matcher();
      state.byKey = new Map();
      for (let i = 0; i < idx.n.length; i += 1) {
        state.matcher.add(i, idx.g[i], idx.n[i], -(idx.l[i] || 0));
        const key = `${idx.g[i]}|${playerKey(idx.n[i])}`;
        if (!state.byKey.has(key)) state.byKey.set(key, i);
      }
      state.ready = true;
      livePromise = loadLiveWeights();
    } catch (error) {
      state.error = 'Model Tenis se nepodařilo stáhnout, platí žebříček a bodový model.';
      console.warn(error);
    }
    return state;
  })();
  return boot;
}

function eloProbability(ia, ib, surface) {
  const { idx } = state;
  const surfaceIndex = SURF[surface] ?? 0;
  const eloA = idx.e[ia];
  const eloB = idx.e[ib];
  const sA = idx.se[ia]?.[surfaceIndex] ?? eloA;
  const sB = idx.se[ib]?.[surfaceIndex] ?? eloB;
  const diff = 0.5 * (eloA - eloB) + 0.5 * (sA - sB);
  return 1 / (1 + Math.pow(10, -diff / 400));
}

export function whenLiveWeights() {
  return boot ? boot.then(() => livePromise) : livePromise;
}

async function ensureShards(ids) {
  const nsh = state.meta.nsh || 16;
  const needed = [...new Set(ids.filter((id) => id != null).map((id) => id % nsh))];
  await Promise.all(needed.map(async (shard) => {
    if (state.shards.has(shard)) return;
    if (!state.shardLoads.has(shard)) {
      state.shardLoads.set(shard, fetchJSON(`${PAGES}/data/st/${shard}.json`).then((payload) => {
        state.shards.set(shard, payload);
        return payload;
      }));
    }
    await state.shardLoads.get(shard);
  }));
}

function playerState(index) {
  const { TM, idx, meta, shards } = state;
  const shard = shards.get(index % (meta.nsh || 16));
  const row = shard?.[String(index)];
  const player = row ? TM.decode(row, idx.g[index], meta.day_end) : TM.newPlayer(idx.g[index]);
  player.elo = idx.e[index];
  player.se = idx.se[index].slice();
  player.n = idx.k[index];
  player.sn = idx.sk[index].slice();
  player.gelo = idx.ge?.[index] ?? player.elo;
  player.gse = (idx.gse?.[index] || player.se).slice();
  if (idx.r[index]) player.rank = idx.r[index];
  return player;
}

function h2h(aIndex, bIndex, playerA) {
  const record = playerA?.h2h?.[bIndex] || playerA?.h2h?.[String(bIndex)];
  return record ? [record[0], record[1]] : [0, 0];
}

export function matchIndexes(match) {
  if (!state.matcher) return [null, null];
  return [0, 1].map((side) => state.matcher.match(match.gender, match.players[side].name));
}

export function prematchElo(match) {
  if (!state.ready) return null;
  const [ia, ib] = matchIndexes(match);
  if (ia == null || ib == null) return null;
  return {
    p: eloProbability(ia, ib, match.surface),
    kind: 'elo',
    indexes: [ia, ib],
  };
}

export async function prematchModel(match) {
  if (!state.ready) return null;
  const [ia, ib] = matchIndexes(match);
  if (ia == null || ib == null) return null;
  const elo = eloProbability(ia, ib, match.surface);
  try {
    await ensureShards([ia, ib]);
    const A = playerState(ia);
    const B = playerState(ib);
    const day = pragueDayNumber();
    const surface = SURF[match.surface] ?? 0;
    const ctx = {
      day,
      dayA: state.TM.refDay(A, day, state.meta.gap_start || 0),
      dayB: state.TM.refDay(B, day, state.meta.gap_start || 0),
      surface,
      lvl_code: match.levelCode || 4,
      is_qual: match.qualifying ? 1 : 0,
      best_of: match.bestOf || 3,
      rankA: state.idx.r[ia] || A.rank,
      rankB: state.idx.r[ib] || B.rank,
    };
    const record = h2h(ia, ib, A);
    const features = state.TM.feats(A, B, ctx, record);
    const result = state.model.predict(features);
    return {
      p: result.p,
      kind: 'model',
      x: features,
      indexes: [ia, ib],
      elo: elo,
      h2h: record,
      profile: {
        a: { spw: A.spw, rpw: A.rpw, ace: A.ace, df: A.df },
        b: { spw: B.spw, rpw: B.rpw, ace: B.ace, df: B.df },
      },
    };
  } catch (error) {
    console.warn(error);
    return { p: elo, kind: 'elo', indexes: [ia, ib], elo };
  }
}

function serverSnapshot(match, indexes) {
  const by = state.serverPreds?.by;
  if (!by || !state.idx || indexes[0] == null || indexes[1] == null) return null;
  const idA = state.idx.id[indexes[0]];
  const idB = state.idx.id[indexes[1]];
  if (!idA || !idB) return null;
  const aIsSmall = String(idA) < String(idB);
  const day = Math.floor(match.start / 1000 / 86400) + (((match.start / 1000) % 86400) > 22 * 3600 ? 1 : 0);
  const key = `${day}|${aIsSmall ? idA : idB}|${aIsSmall ? idB : idA}`;
  const row = by[key];
  if (!row || row.p == null) return null;
  return aIsSmall ? row.p : 1 - row.p;
}

export function liveAdjustment(match, prematch) {
  const live = state.live;
  if (!live?.w || !prematch?.x || !state.model) return null;
  const expected = live.score.length + live.core.length * live.diffs.length + live.core.length * live.ctx.length;
  if (live.w.length !== expected) return null;
  const [ia, ib] = prematch.indexes;
  const idA = state.idx.id[ia];
  const idB = state.idx.id[ib];
  const aIsSmall = String(idA) < String(idB);
  const names = live.diffs;
  const featureIndex = new Map(state.model.F.map((name, index) => [name, index]));
  let diffs = names.map((name) => prematch.x[featureIndex.get(name)] || 0);
  let pSide = prematch.p;
  if (!aIsSmall) {
    diffs = diffs.map((value) => -value);
    pSide = 1 - pSide;
  }
  const score = scoreFeatures(match, aIsSmall, live);
  const phi = phiVector(score, diffs, contextOf(match), live);
  const z = dotCap(live.w, phi, 1.15);
  const adjusted = z ? expitLocal(logitLocal(pSide) + z) : pSide;
  return aIsSmall ? adjusted : 1 - adjusted;
}

function contextOf(match) {
  return {
    bo5: match.bestOf === 5 ? 1 : 0,
    woman: match.gender === 'W' ? 1 : 0,
    clay: match.surface === 'Clay' ? 1 : 0,
    grass: match.surface === 'Grass' ? 1 : 0,
    qual: match.qualifying ? 1 : 0,
    lvl: (match.levelCode || 0) / 6,
  };
}

function pointToken(value) {
  const text = String(value ?? '').toUpperCase();
  if (text === 'A' || text === 'AD') return 4;
  if (text === '15') return 1;
  if (text === '30') return 2;
  if (text === '40') return 3;
  if (text === '0') return 0;
  const number = Number(text);
  return Number.isFinite(number) && number <= 4 ? number : 0;
}

function scoreFeatures(match, aIsSmall, live) {
  let sa = 0;
  let sb = 0;
  for (const set of match.sets || []) {
    if (set.a > set.b) sa += 1;
    else if (set.b > set.a) sb += 1;
  }
  const current = match.current || { a: 0, b: 0 };
  const ga = current.a || 0;
  const gb = current.b || 0;
  const inTB = ga === 6 && gb === 6;
  let pa = 0;
  let pb = 0;
  let ta = 0;
  let tb = 0;
  if (inTB) {
    ta = current.tbA ?? pointToken(match.points?.a);
    tb = current.tbB ?? pointToken(match.points?.b);
  } else if (match.points) {
    pa = pointToken(match.points.a);
    pb = pointToken(match.points.b);
  }
  const srvHome = match.server === 1 ? 1 : match.server === 2 ? -1 : 0;
  const home = { sa, sb, ga, gb, pa, pb, ta, tb, srv: srvHome };
  const side = aIsSmall ? home : {
    sa: sb, sb: sa, ga: gb, gb: ga, pa: pb, pb: pa, ta: tb, tb: ta, srv: srvHome ? -srvHome : 0,
  };
  const blank = !inTB && side.sa === 0 && side.sb === 0 && side.ga === 0 && side.gb === 0 && side.pa === 0 && side.pb === 0 && side.ta === 0 && side.tb === 0;
  const map = {};
  for (const key of live.score) map[key] = 0;
  if (blank) return map;
  map.ds = side.sa - side.sb;
  map.d1 = (side.sa === 1) - (side.sb === 1);
  map.d2 = (side.sa === 2) - (side.sb === 2);
  map.dg = inTB ? 0 : side.ga - side.gb;
  map.late = inTB ? 0 : (side.ga >= 5) - (side.gb >= 5);
  map.dp = inTB ? 0 : (side.pa - side.pb) / 4;
  map.dtb = inTB ? (side.ta - side.tb) / 7 : 0;
  map.srv = side.srv;
  map.hold = 0;
  map.brk = 0;
  map.bp = 0;
  if (!inTB && side.srv) {
    const aGame = side.pa >= 3 && side.pa > side.pb;
    const bGame = side.pb >= 3 && side.pb > side.pa;
    if (side.srv < 0 && aGame) map.bp = 1;
    else if (side.srv > 0 && bGame) map.bp = -1;
  }
  if (!inTB) {
    for (let games = 1; games <= 6; games += 1) map[`g${games}`] = (side.ga === games) - (side.gb === games);
    for (let points = 1; points <= 4; points += 1) map[`p${points}`] = (side.pa === points) - (side.pb === points);
  }
  return map;
}

function phiVector(score, diffs, ctx, live) {
  const scaled = diffs.map((value, index) => Math.abs(value) / (live.scale[index] || 1));
  const out = live.score.map((key) => score[key] || 0);
  for (const core of live.core) {
    const value = score[core] || 0;
    for (const item of scaled) out.push(value * item);
    for (const key of live.ctx) out.push(value * (ctx[key] || 0));
  }
  return out;
}

function dotCap(weights, vector, cap) {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) if (vector[i] && weights[i]) sum += weights[i] * vector[i];
  return Math.min(cap, Math.max(-cap, sum));
}

function logitLocal(probability) {
  const value = Math.min(1 - 1e-6, Math.max(1e-6, probability));
  return Math.log(value / (1 - value));
}

function expitLocal(value) {
  if (value > 20) return 1 - 1e-9;
  if (value < -20) return 1e-9;
  return 1 / (1 + Math.exp(-value));
}

export function serverLive(match, indexes) {
  return serverSnapshot(match, indexes);
}

export function modelNames(indexes) {
  if (!state.idx || indexes?.some((index) => index == null)) return null;
  return [state.idx.n[indexes[0]], state.idx.n[indexes[1]]];
}

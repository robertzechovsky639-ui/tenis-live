const PAGES = 'https://robertzechovsky639-ui.github.io/tenis';
const RAW = 'https://raw.githubusercontent.com/robertzechovsky639-ui/tenis/main';
const js = await (await fetch(`${PAGES}/model.js`)).text();
const module = { exports: {} };
const wrapped = new Function('self', 'module', 'exports', `${js}\n; return (module.exports && module.exports.Model) ? module.exports : self.TM;`);
const TM = wrapped(globalThis, module, module.exports);
if (!TM?.Model) throw new Error('model.js nevrátil TM');
const [modelJson, meta, idx, online] = await Promise.all([
  fetch(`${PAGES}/data/model.json`).then((r) => r.json()),
  fetch(`${PAGES}/data/meta.json`).then((r) => r.json()),
  fetch(`${PAGES}/data/players.json`).then((r) => r.json()),
  fetch(`${RAW}/state/online.json`).then((r) => r.json()),
]);
const model = new TM.Model(modelJson);
model.m.online = online;
const find = (name) => idx.n.findIndex((item) => item === name);
const a = find('Jannik Sinner');
const b = find('Carlos Alcaraz');
if (a < 0 || b < 0) throw new Error('hráči v indexu nejsou');
const loadShard = async (index) => fetch(`${PAGES}/data/st/${index % meta.nsh}.json`).then((r) => r.json());
const shardA = await loadShard(a);
const shardB = a % meta.nsh === b % meta.nsh ? shardA : await loadShard(b);
const player = (index, shard) => {
  const row = shard[String(index)];
  const decoded = TM.decode(row, idx.g[index], meta.day_end);
  decoded.elo = idx.e[index];
  decoded.se = idx.se[index].slice();
  decoded.n = idx.k[index];
  decoded.sn = idx.sk[index].slice();
  decoded.gelo = idx.ge[index];
  decoded.gse = idx.gse[index].slice();
  if (idx.r[index]) decoded.rank = idx.r[index];
  return decoded;
};
const A = player(a, shardA);
const B = player(b, shardB);
const day = meta.day_end;
const ctx = {
  day,
  dayA: TM.refDay(A, day, meta.gap_start),
  dayB: TM.refDay(B, day, meta.gap_start),
  surface: 0,
  lvl_code: 5,
  is_qual: 0,
  best_of: 3,
  rankA: idx.r[a],
  rankB: idx.r[b],
};
const record = A.h2h[b] || A.h2h[String(b)] || [0, 0];
const features = TM.feats(A, B, ctx, record);
const result = model.predict(features);
console.log(JSON.stringify({
  p: Number(result.p.toFixed(3)),
  elo: Number(result.elo.toFixed(3)),
  h2h: record,
  sinnerElo: idx.e[a],
  alcarazElo: idx.e[b],
}));
if (!(result.p > 0.15 && result.p < 0.85)) throw new Error(`šance mimo rozsah ${result.p}`);

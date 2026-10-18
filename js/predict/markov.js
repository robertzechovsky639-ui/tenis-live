/**
 * Bodový Markovův model zápasu. Předzápasová šance je kotva:
 * na 0:0 (neznámé podání) vyjde právě ona, se skóre se posouvá.
 * Není to natrénovaný model, jen pravidla tenisu (gem, set, tiebreak, zápas).
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function logit(probability) {
  const value = clamp(probability, 1e-6, 1 - 1e-6);
  return Math.log(value / (1 - value));
}

function expit(value) {
  if (value > 20) return 1 - 1e-9;
  if (value < -20) return 1e-9;
  return 1 / (1 + Math.exp(-value));
}

export function holdP(pointWin) {
  const lose = 1 - pointWin;
  const deuce = (pointWin * pointWin) / (pointWin * pointWin + lose * lose);
  return (pointWin ** 4) * (1 + 4 * lose + 10 * lose * lose) + 20 * (pointWin ** 3) * (lose ** 3) * deuce;
}

function gameWin(a, b, pointWin, memo = new Map()) {
  const lose = 1 - pointWin;
  const deuce = (pointWin * pointWin) / (pointWin * pointWin + lose * lose);
  const rec = (x, y) => {
    if (x >= 4 && x - y >= 2) return 1;
    if (y >= 4 && y - x >= 2) return 0;
    if (x >= 3 && y >= 3) {
      if (x === y) return deuce;
      if (x === y + 1) return pointWin + lose * deuce;
      return pointWin * deuce;
    }
    const key = `${x},${y}`;
    if (memo.has(key)) return memo.get(key);
    const value = pointWin * rec(x + 1, y) + lose * rec(x, y + 1);
    memo.set(key, value);
    return value;
  };
  return rec(a, b);
}

function tbServerIsA(index, aFirst) {
  if (index <= 0) return aFirst;
  const pair = Math.floor((index - 1) / 2);
  return pair % 2 === 1 ? aFirst : !aFirst;
}

function tiebreakWin(a, b, aServes, pA, pB, memo) {
  if (a >= 7 && a - b >= 2) return 1;
  if (b >= 7 && b - a >= 2) return 0;
  if (a + b > 40) return a === b ? (aServes ? pA : 1 - pB) : (a > b ? 1 : 0);
  const key = `${a},${b},${aServes ? 1 : 0}`;
  if (memo.has(key)) return memo.get(key);
  const point = aServes ? pA : 1 - pB;
  const played = a + b;
  const aFirst = tbServerIsA(played, true) === aServes;
  const nextA = tbServerIsA(played + 1, aFirst);
  const value = point * tiebreakWin(a + 1, b, nextA, pA, pB, memo) + (1 - point) * tiebreakWin(a, b + 1, nextA, pA, pB, memo);
  memo.set(key, value);
  return value;
}

function matchWin(sa, sb, ga, gb, aToServe, need, pA, pB, matchMemo, tbMemo) {
  if (sa >= need) return 1;
  if (sb >= need) return 0;
  if ((ga >= 6 && ga - gb >= 2) || (ga === 7 && gb === 6)) {
    return matchWin(sa + 1, sb, 0, 0, aToServe, need, pA, pB, matchMemo, tbMemo);
  }
  if ((gb >= 6 && gb - ga >= 2) || (gb === 7 && ga === 6)) {
    return matchWin(sa, sb + 1, 0, 0, aToServe, need, pA, pB, matchMemo, tbMemo);
  }
  const key = `${sa},${sb},${ga},${gb},${aToServe ? 1 : 0}`;
  if (matchMemo.has(key)) return matchMemo.get(key);
  let value;
  if (ga === 6 && gb === 6) {
    const setP = tiebreakWin(0, 0, aToServe, pA, pB, tbMemo);
    value = setP * matchWin(sa + 1, sb, 0, 0, !aToServe, need, pA, pB, matchMemo, tbMemo)
      + (1 - setP) * matchWin(sa, sb + 1, 0, 0, !aToServe, need, pA, pB, matchMemo, tbMemo);
  } else {
    const gameP = aToServe ? holdP(pA) : 1 - holdP(pB);
    value = gameP * matchWin(sa, sb, ga + 1, gb, !aToServe, need, pA, pB, matchMemo, tbMemo)
      + (1 - gameP) * matchWin(sa, sb, ga, gb + 1, !aToServe, need, pA, pB, matchMemo, tbMemo);
  }
  matchMemo.set(key, value);
  return value;
}

function fromGames(sa, sb, ga, gb, aPts, bPts, tbA, tbB, inTB, aServes, need, pA, pB) {
  const matchMemo = new Map();
  const tbMemo = new Map();
  if (inTB) {
    const played = tbA + tbB;
    const aFirst = tbServerIsA(played, true) === aServes;
    const setP = tiebreakWin(tbA, tbB, aServes, pA, pB, tbMemo);
    return setP * matchWin(sa + 1, sb, 0, 0, !aFirst, need, pA, pB, matchMemo, tbMemo)
      + (1 - setP) * matchWin(sa, sb + 1, 0, 0, !aFirst, need, pA, pB, matchMemo, tbMemo);
  }
  const point = aServes ? pA : 1 - pB;
  const gameP = gameWin(aPts, bPts, point);
  return gameP * matchWin(sa, sb, ga + 1, gb, !aServes, need, pA, pB, matchMemo, tbMemo)
    + (1 - gameP) * matchWin(sa, sb, ga, gb + 1, !aServes, need, pA, pB, matchMemo, tbMemo);
}

function fitServe(p0, bestOf, serveBase) {
  const need = (bestOf + 1) / 2;
  const at = (gap) => {
    const pA = clamp(serveBase + gap, 0.5, 0.84);
    const pB = clamp(serveBase - gap, 0.5, 0.84);
    return (fromGames(0, 0, 0, 0, 0, 0, 0, 0, false, true, need, pA, pB)
      + fromGames(0, 0, 0, 0, 0, 0, 0, 0, false, false, need, pA, pB)) / 2;
  };
  let low = -0.34;
  let high = 0.34;
  for (let step = 0; step < 28; step += 1) {
    const mid = (low + high) / 2;
    if (at(mid) < p0) low = mid;
    else high = mid;
  }
  const gap = (low + high) / 2;
  const pA = clamp(serveBase + gap, 0.5, 0.84);
  const pB = clamp(serveBase - gap, 0.5, 0.84);
  return { pA, pB, m0: at(gap), need };
}

function pointIndex(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim().toUpperCase();
  if (text === 'A' || text === 'AD' || text === '50') return 4;
  if (text === '0' || text === '0.0') return 0;
  if (text === '15' || text === '15.0') return 1;
  if (text === '30' || text === '30.0') return 2;
  if (text === '40' || text === '40.0') return 3;
  return null;
}

export function readScoreState(match) {
  let sa = 0;
  let sb = 0;
  for (const set of match.sets || []) {
    const winner = (set.a > set.b) ? 1 : (set.b > set.a ? 2 : 0);
    if (winner === 1) sa += 1;
    else if (winner === 2) sb += 1;
  }
  const current = match.current;
  if (!current) {
    return { sa, sb, ga: 0, gb: 0, aPts: 0, bPts: 0, tbA: 0, tbB: 0, inTB: false, serverKnown: match.server === 1 || match.server === 2 };
  }
  const ga = current.a || 0;
  const gb = current.b || 0;
  const inTB = ga === 6 && gb === 6;
  let aPts = 0;
  let bPts = 0;
  let tbA = 0;
  let tbB = 0;
  if (inTB) {
    const fromExtra = current.tbA != null || current.tbB != null;
    if (fromExtra) {
      tbA = current.tbA || 0;
      tbB = current.tbB || 0;
    } else if (match.points) {
      tbA = Number(match.points.a) || 0;
      tbB = Number(match.points.b) || 0;
    }
  } else if (match.points) {
    const ia = pointIndex(match.points.a);
    const ib = pointIndex(match.points.b);
    if (ia != null && ib != null) {
      aPts = ia;
      bPts = ib;
    }
  }
  return { sa, sb, ga, gb, aPts, bPts, tbA, tbB, inTB, serverKnown: match.server === 1 || match.server === 2 };
}

/**
 * @param {number} p0 šance hráče A před zápasem
 * @param {object} state výstup readScoreState
 * @param {number} bestOf 3 nebo 5
 * @param {number} server 1 = A podává, 2 = B, 0 = nevíme
 * @param {boolean} woman nižší bod na podání u žen
 */
export function markovWin(p0, state, bestOf = 3, server = 0, woman = false) {
  if (p0 == null || !(p0 > 0) || !(p0 < 1)) return null;
  const fit = fitServe(p0, bestOf, woman ? 0.57 : 0.64);
  const once = (aServes) => fromGames(
    state.sa, state.sb, state.ga, state.gb, state.aPts, state.bPts, state.tbA, state.tbB, state.inTB, aServes, fit.need, fit.pA, fit.pB,
  );
  const raw = server === 1 ? once(true) : server === 2 ? once(false) : (once(true) + once(false)) / 2;
  return expit(logit(p0) + logit(raw) - logit(fit.m0));
}

export function liveMarkov(match, p0) {
  if (p0 == null) return null;
  if (match.status !== 'live' && match.status !== 'suspended') return p0;
  const state = readScoreState(match);
  return markovWin(p0, state, match.bestOf || 3, match.server || 0, match.gender === 'W');
}

/** Kontrolní body pro graf: před zápasem a po každém dohraném setu. */
export function setCheckpoints(match, p0) {
  if (p0 == null) return [];
  const points = [{ label: 'Před zápasem', p: p0 }];
  let sa = 0;
  let sb = 0;
  (match.sets || []).forEach((set, index) => {
    if (set.a > set.b) sa += 1;
    else if (set.b > set.a) sb += 1;
    const state = { sa, sb, ga: 0, gb: 0, aPts: 0, bPts: 0, tbA: 0, tbB: 0, inTB: false };
    const p = markovWin(p0, state, match.bestOf || 3, 0, match.gender === 'W');
    points.push({ label: `Po ${index + 1}. setu ${sa}:${sb}`, p });
  });
  if (match.status === 'live') {
    const now = liveMarkov(match, p0);
    points.push({ label: 'Teď', p: now });
  }
  return points;
}

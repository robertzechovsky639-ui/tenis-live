/** Doplní ke každému zápasu předzápasovou a živou šanci. */

import { liveMarkov, setCheckpoints } from './markov.js';
import {
  liveAdjustment,
  matchIndexes,
  prematchElo,
  prematchModel,
  serverLive,
  startModel,
  whenLiveWeights,
} from './model.js';

export function rankProbability(rankA, rankB) {
  if (!rankA || !rankB || rankA <= 0 || rankB <= 0) return null;
  const weightA = Math.pow(rankA, 0.7);
  const weightB = Math.pow(rankB, 0.7);
  return weightB / (weightA + weightB);
}

function remember(match, probability) {
  if (probability == null || match.status !== 'live') return;
  const key = `tenis-live:hist:${match.id}`;
  let samples = [];
  try { samples = JSON.parse(sessionStorage.getItem(key) || '[]'); } catch { samples = []; }
  const last = samples.at(-1);
  if (!last || Math.abs(last.p - probability) >= 0.004) {
    samples.push({ t: Date.now(), p: probability });
    if (samples.length > 60) samples = samples.slice(-60);
    try { sessionStorage.setItem(key, JSON.stringify(samples)); } catch { /* soukromý režim */ }
  }
  match.predictionSamples = samples;
}

function fill(match) {
  const elo = prematchElo(match);
  const fromRank = rankProbability(match.players[0].rank, match.players[1].rank);
  const prematch = match._pre?.p ?? elo?.p ?? fromRank;
  let kind = 'none';
  if (match._pre?.kind === 'model') kind = 'model';
  else if (elo) kind = 'elo';
  else if (fromRank != null) kind = 'rank';
  let live = prematch;
  let liveKind = kind;
  if ((match.status === 'live' || match.status === 'suspended') && prematch != null) {
    const adjusted = match._pre ? liveAdjustment(match, match._pre) : null;
    if (adjusted != null) {
      live = adjusted;
      liveKind = 'live-ml';
    } else {
      const indexes = match._pre?.indexes || (elo ? matchIndexes(match) : [null, null]);
      const server = serverLive(match, indexes);
      if (server != null) {
        live = server;
        liveKind = 'server';
      } else {
        live = liveMarkov(match, prematch);
        liveKind = 'markov';
      }
    }
  }
  match.prediction = {
    pre: prematch,
    live,
    kind,
    liveKind,
    h2h: match._pre?.h2h || null,
    profile: match._pre?.profile || null,
    checkpoints: prematch != null ? setCheckpoints(match, prematch) : [],
  };
  remember(match, live);
}

export async function annotateMatches(matches, onPhase) {
  await startModel();
  if (onPhase) onPhase();
  for (const match of matches) fill(match);
  if (onPhase) onPhase();
  const pending = matches.filter((match) => match.status !== 'canceled' && match.status !== 'walkover');
  await Promise.all(pending.map(async (match) => {
    const full = await prematchModel(match);
    if (full) match._pre = full;
    fill(match);
  }));
  if (onPhase) onPhase();
  whenLiveWeights().then(() => {
    for (const match of matches) fill(match);
    if (onPhase) onPhase();
  }).catch(() => {});
}

export function refreshLiveNumbers(matches) {
  for (const match of matches) fill(match);
}

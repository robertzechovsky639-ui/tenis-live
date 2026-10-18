/** 365scores veřejný web JSON. ATP, WTA, Challenger i WTA 125. CORS *, bez klíče. */

import { bestOf, levelCode, roundLabel, surfaceFromText } from '../levels.js';
import { flagUrl } from '../flags.js';
import { getJSON, setWinner, shortName } from '../util.js';

const BASE = 'https://webws.365scores.com/web/games/allscores/';

const TOUR_BY_COUNTRY = {
  88: 'atp',
  87: 'wta',
  301: 'challenger',
  302: 'wta',
};

function dmy(ymd) {
  const [year, month, day] = ymd.split('-');
  return `${day}/${month}/${year}`;
}

function mapStatus(game) {
  const text = `${game.statusText || ''} ${game.shortStatusText || ''}`;
  if (/walk.?over|w\.?\s*o\.?/i.test(text)) return 'walkover';
  if (/retir/i.test(text)) return 'retired';
  if (/cancel|postpon|abandon/i.test(text)) return 'canceled';
  if (/suspend|delay|interrupt/i.test(text)) return 'suspended';
  if (game.statusGroup === 3) return 'live';
  if (game.statusGroup === 4) return 'finished';
  if (game.statusGroup === 2) return 'scheduled';
  return '';
}

function pointText(value) {
  if (value == null || value < 0) return null;
  if (Number(value) === 50) return 'A';
  return String(Math.trunc(Number(value)));
}

function asSet(stage) {
  const set = {
    a: Number(stage.homeCompetitorScore),
    b: Number(stage.awayCompetitorScore),
    tbA: stage.homeCompetitorExtraScore == null ? null : Number(stage.homeCompetitorExtraScore),
    tbB: stage.awayCompetitorExtraScore == null ? null : Number(stage.awayCompetitorExtraScore),
  };
  if (!Number.isFinite(set.a) || !Number.isFinite(set.b) || set.a < 0 || set.b < 0) return null;
  if (set.tbA != null && set.tbA < 0) set.tbA = null;
  if (set.tbB != null && set.tbB < 0) set.tbB = null;
  return set;
}

export function parse365Payload(payload) {
  const countries = new Map((payload?.countries || []).map((country) => [country.id, country.name]));
  const competitions = new Map((payload?.competitions || []).map((competition) => [competition.id, competition]));
  const matches = [];
  for (const game of payload?.games || []) {
    const competition = competitions.get(game.competitionId);
    const tour = TOUR_BY_COUNTRY[competition?.countryId];
    if (!tour) continue;
    const home = game.homeCompetitor;
    const away = game.awayCompetitor;
    if (!home?.name || !away?.name) continue;
    if (/[/]/.test(home.name + away.name) || /^(tbd|tba|bye)$/i.test(home.name) || /^(tbd|tba|bye)$/i.test(away.name)) continue;
    const status = mapStatus(game);
    if (!status) continue;
    const setStages = (game.stages || []).filter((stage) => /^S\d$/i.test(stage.shortName || ''));
    const sets = [];
    let current = null;
    setStages.forEach((stage) => {
      const set = asSet(stage);
      if (!set) return;
      if (stage.isEnded || setWinner(set) || (status !== 'live' && status !== 'suspended')) sets.push(set);
      else current = set;
    });
    if ((status === 'finished' || status === 'retired' || status === 'walkover') && current) {
      sets.push(current);
      current = null;
    }
    const gameStage = (game.stages || []).find((stage) => /game|point/i.test(`${stage.shortName || ''} ${stage.name || ''}`));
    let points = null;
    if ((status === 'live' || status === 'suspended') && gameStage) {
      const a = pointText(gameStage.homeCompetitorScore);
      const b = pointText(gameStage.awayCompetitorScore);
      if (a != null && b != null) points = { a, b };
    }
    let server = 0;
    if (home.inPossession) server = 1;
    else if (away.inPossession) server = 2;
    const display = game.competitionDisplayName || '';
    const qualifying = /qualif/i.test(`${game.stageName || ''} ${display}`);
    const wta125 = competition?.countryId === 302 || /125/.test(competition?.name || '');
    const code = wta125 ? 3 : levelCode(tour, `${competition?.name || ''} ${display}`);
    const gender = tour === 'wta' || competition?.countryId === 302 ? 'W' : 'M';
    const rankOf = (side) => (side.rankings || []).find((rank) => /atp|wta/i.test(rank.name || ''))?.position ?? null;
    const countryName = (side) => countries.get(side.countryId) || '';
    const makePlayer = (side) => ({
      id: String(side.id || ''),
      name: side.name,
      short: shortName(side.name),
      country: countryName(side),
      flag: flagUrl(countryName(side)),
      rank: rankOf(side),
    });
    let winner = 0;
    if (home.isWinner) winner = 1;
    else if (away.isWinner) winner = 2;
    else if (game.winner === 1 || game.winner === 2) winner = game.winner;
    matches.push({
      id: `s365-${game.id}`,
      tour: competition?.countryId === 302 ? 'wta' : tour,
      gender,
      tournament: competition?.name || game.competitionDisplayName || 'Turnaj',
      round: roundLabel(qualifying ? (game.stageName || 'Qualifications') : (game.roundName || game.stageName || ''), qualifying),
      surface: surfaceFromText(display),
      levelCode: code,
      qualifying,
      bestOf: bestOf(code, gender, qualifying),
      start: Date.parse(game.startTime || '') || 0,
      status,
      statusText: game.statusText || '',
      court: game.venue?.name || '',
      players: [makePlayer(home), makePlayer(away)],
      sets,
      current: status === 'live' || status === 'suspended' ? current : null,
      points,
      server,
      winner,
      stats: null,
      sources: ['365scores'],
      external: { s365: String(game.id) },
      badge: wta125 ? 'WTA 125' : '',
    });
  }
  return matches;
}

export async function fetch365Window(fromYmd, toYmd) {
  const params = new URLSearchParams({
    appTypeId: '5',
    langId: '1',
    timezoneName: 'Europe/Prague',
    userCountryId: '1',
    sports: '3',
    startDate: dmy(fromYmd),
    endDate: dmy(toYmd),
    showOdds: 'false',
    onlyMajorGames: 'false',
    withTop: 'true',
  });
  const payload = await getJSON(`${BASE}?${params}`);
  return parse365Payload(payload);
}

function h2hScore(game) {
  if (Array.isArray(game.scores) && game.scores.length) {
    return game.scores.map((row) => {
      const left = row.homeCompetitorScore ?? row.home ?? row.score_first;
      const right = row.awayCompetitorScore ?? row.away ?? row.score_second;
      return left == null || right == null ? '' : `${left}-${right}`;
    }).filter(Boolean).join(' ');
  }
  return (game.stages || [])
    .filter((stage) => /^S\d$/i.test(stage.shortName || ''))
    .map((stage) => `${stage.homeCompetitorScore}-${stage.awayCompetitorScore}`)
    .join(' ');
}

export async function fetch365H2H(gameId) {
  const payload = await getJSON(`https://webws.365scores.com/web/games/h2h/?appTypeId=5&langId=1&timezoneName=Europe%2FPrague&gameId=${encodeURIComponent(gameId)}`);
  const games = payload?.game?.h2hGames || [];
  return games
    .filter((game) => String(game.id) !== String(gameId))
    .map((game) => ({
      id: game.id,
      when: game.startTime || '',
      tournament: game.competitionDisplayName || '',
      home: game.homeCompetitor?.name || '',
      away: game.awayCompetitor?.name || '',
      score: h2hScore(game),
      winner: game.winner || (game.homeCompetitor?.isWinner ? 1 : game.awayCompetitor?.isWinner ? 2 : 0),
    }));
}

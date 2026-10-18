/** ESPN veřejné scoreboard JSON. ATP a WTA, CORS *. */

import { bestOf, levelCode, roundLabel, surfaceFromText } from '../levels.js';
import { getJSON, setWinner, shortName } from '../util.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/tennis';

function athleteId(athlete) {
  const href = (athlete?.links || []).find((link) => /\/id\/\d+/.test(link.href || ''))?.href || '';
  const match = href.match(/\/id\/(\d+)/);
  return match ? match[1] : athlete?.id || '';
}

function mapStatus(type = {}) {
  const name = type.name || '';
  if (name.includes('WALKOVER')) return 'walkover';
  if (name.includes('RETIRED')) return 'retired';
  if (name.includes('CANCEL') || name.includes('POSTPONE') || name.includes('ABANDON')) return 'canceled';
  if (name.includes('SUSPEND') || name.includes('DELAY')) return 'suspended';
  if (type.state === 'in' || name.includes('IN_PROGRESS')) return 'live';
  if (type.state === 'post' || type.completed) return 'finished';
  return 'scheduled';
}

function parseSet(home, away) {
  const set = {
    a: Number(home?.value),
    b: Number(away?.value),
    tbA: home?.tiebreak == null ? null : Number(home.tiebreak),
    tbB: away?.tiebreak == null ? null : Number(away.tiebreak),
  };
  if (!Number.isFinite(set.a) || !Number.isFinite(set.b)) return null;
  return set;
}

function playerFrom(competitor) {
  const athlete = competitor.athlete || {};
  const name = athlete.displayName || athlete.fullName || athlete.shortName || '';
  return {
    id: athleteId(athlete),
    name,
    short: athlete.shortName || shortName(name),
    country: athlete.flag?.alt || '',
    flag: athlete.flag?.href || '',
    rank: null,
  };
}

export function parseEspnScoreboard(payload, tour) {
  const matches = [];
  for (const event of payload?.events || []) {
    const tournament = event.shortName || event.name || 'Turnaj';
    const surface = surfaceFromText(`${event.name || ''} ${JSON.stringify(event.venue || {})}`);
    for (const grouping of event.groupings || []) {
      const slug = grouping.grouping?.slug || grouping.grouping?.id || '';
      if (!String(slug).includes('singles')) continue;
      for (const competition of grouping.competitions || []) {
        const people = [...(competition.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        if (people.length < 2) continue;
        const players = [playerFrom(people[0]), playerFrom(people[1])];
        if (!players[0].name || !players[1].name) continue;
        if (players.some((player) => /^(tbd|tba|bye)$/i.test(player.name) || player.name.includes('/'))) continue;
        const gender = tour === 'wta' ? 'W' : 'M';
        const qualifying = /qualif/i.test(competition.round?.displayName || competition.type?.text || '');
        const code = levelCode(tour, tournament);
        const status = mapStatus(competition.status?.type);
        const rawSets = [];
        const count = Math.max(people[0].linescores?.length || 0, people[1].linescores?.length || 0);
        for (let index = 0; index < count; index += 1) {
          const set = parseSet(people[0].linescores?.[index], people[1].linescores?.[index]);
          if (set) rawSets.push(set);
        }
        const sets = [];
        let current = null;
        rawSets.forEach((set, index) => {
          const done = setWinner(set) || (status !== 'live' && status !== 'suspended' && index < rawSets.length - 1);
          if (done && (status !== 'live' || index < rawSets.length - 1 || setWinner(set))) sets.push(set);
          else current = set;
        });
        if (status === 'live' && sets.length === rawSets.length) current = null;
        if ((status === 'finished' || status === 'retired' || status === 'walkover') && current && !setWinner(current)) {
          sets.push(current);
          current = null;
        }
        let winner = 0;
        people.forEach((person, index) => {
          if (person.winner) winner = index + 1;
        });
        const stats = readStats(people);
        matches.push({
          id: `espn-${tour}-${competition.id}`,
          tour,
          gender,
          tournament,
          round: roundLabel(competition.round?.displayName || '', qualifying),
          surface,
          levelCode: code,
          qualifying,
          bestOf: bestOf(code, gender, qualifying),
          start: Date.parse(competition.date || competition.startDate || event.date || '') || 0,
          status,
          statusText: competition.status?.type?.shortDetail || competition.status?.type?.detail || '',
          court: competition.venue?.court || '',
          players,
          sets,
          current: status === 'live' || status === 'suspended' ? current : null,
          points: null,
          server: 0,
          winner,
          stats,
          sources: ['espn'],
          external: { espn: String(competition.id) },
        });
      }
    }
  }
  return matches;
}

function readStats(people) {
  const rows = new Map();
  people.forEach((person, side) => {
    for (const stat of person.statistics || []) {
      const name = stat.displayName || stat.name || stat.abbreviation;
      if (!name) continue;
      const row = rows.get(name) || { name, a: '', b: '' };
      row[side === 0 ? 'a' : 'b'] = stat.displayValue || stat.value || '';
      rows.set(name, row);
    }
  });
  return rows.size ? [...rows.values()] : null;
}

export async function fetchEspnWindow(fromYmd, toYmd) {
  const dates = `${fromYmd.replaceAll('-', '')}-${toYmd.replaceAll('-', '')}`;
  const tours = ['atp', 'wta'];
  const settled = await Promise.allSettled(tours.map(async (tour) => {
    const payload = await getJSON(`${BASE}/${tour}/scoreboard?dates=${dates}`);
    return parseEspnScoreboard(payload, tour);
  }));
  const matches = [];
  const errors = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') matches.push(...result.value);
    else errors.push(`${tours[index]}: ${result.reason?.message || result.reason}`);
  });
  return { matches, errors };
}

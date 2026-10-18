/** Žebříčky dvouhry ATP a WTA z ESPN. */

import { flagUrl } from '../flags.js';
import { getJSON } from '../util.js';

export function parseRankings(payload) {
  const block = (payload?.rankings || [])[0];
  return (block?.ranks || []).map((row) => {
    const athlete = row.athlete || {};
    const country = athlete.flag?.alt || athlete.citizenship || athlete.birthPlace?.country || '';
    return {
      rank: row.current,
      previous: row.previous,
      points: row.points,
      name: athlete.displayName || `${athlete.firstName || ''} ${athlete.lastName || ''}`.trim(),
      short: athlete.shortname || athlete.shortName || '',
      id: String(athlete.id || ''),
      country,
      flag: flagUrl(country, athlete.flag?.href || ''),
      updated: block?.update || '',
    };
  }).filter((row) => row.name);
}

export async function fetchRankings(tour) {
  const payload = await getJSON(`https://site.web.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`);
  return parseRankings(payload);
}

/** Úroveň turnaje pro model (stejné kódy jako engine Tenis: 6 slam, 5 tisícovka, 4 tour, 3 challenger). */

const SLAMS = ['australian open', 'french open', 'roland garros', 'wimbledon', 'us open'];
const THOUSAND = [
  'indian wells', 'miami', 'monte carlo', 'monte-carlo', 'madrid', 'rome', 'montreal', 'toronto',
  'cincinnati', 'shanghai', 'paris', 'doha', 'dubai', 'beijing', 'wuhan', 'guadalajara', 'canada',
];

export function surfaceFromText(text) {
  const value = String(text ?? '').toLowerCase();
  if (value.includes('clay') || value.includes('antuk')) return 'Clay';
  if (value.includes('grass') || value.includes('tráv')) return 'Grass';
  if (value.includes('carpet') || value.includes('kober')) return 'Carpet';
  if (value.includes('hard') || value.includes('tvrd')) return 'Hard';
  return '';
}

export function surfaceLabel(surface) {
  return { Hard: 'tvrdý', Clay: 'antuka', Grass: 'tráva', Carpet: 'koberec' }[surface] || '';
}

export function levelCode(tour, name) {
  const text = String(name ?? '').toLowerCase();
  if (tour === 'challenger') return 3;
  if (SLAMS.some((item) => text.includes(item))) return 6;
  if (text.includes('1000') || text.includes('masters') || THOUSAND.some((item) => text.includes(item))) {
    if (tour === 'atp' && ['doha', 'dubai', 'beijing', 'wuhan'].some((item) => text.includes(item))) return 4;
    return 5;
  }
  if (text.includes('125')) return 3;
  return 4;
}

export function bestOf(level, gender, qualifying) {
  return level === 6 && gender === 'M' && !qualifying ? 5 : 3;
}

const ROUNDS = {
  final: 'Finále',
  semifinal: 'Semifinále',
  'semi-final': 'Semifinále',
  quarterfinal: 'Čtvrtfinále',
  'quarter-final': 'Čtvrtfinále',
  'round of 16': 'Osmifinále',
  'round of 32': 'Šestnáctifinále',
  'round of 64': 'Třicetidva',
  'round of 128': '1. kolo',
  '1st round': '1. kolo',
  '2nd round': '2. kolo',
  '3rd round': '3. kolo',
  '4th round': '4. kolo',
  'round 1': '1. kolo',
  'round 2': '2. kolo',
  'round 3': '3. kolo',
  'round 4': '4. kolo',
  'qualifying 1st round': 'Kvalifikace, 1. kolo',
  'qualifying 2nd round': 'Kvalifikace, 2. kolo',
  'qualifying final': 'Kvalifikace, finále',
  qualifications: 'Kvalifikace',
  qualification: 'Kvalifikace',
  round: 'Kolo',
};

export function roundLabel(round, qualifying) {
  const raw = String(round ?? '').trim();
  const mapped = ROUNDS[raw.toLowerCase()];
  if (qualifying && (!raw || raw.toLowerCase() === 'round')) return 'Kvalifikace';
  return mapped || raw;
}

export function tourLabel(tour) {
  return { atp: 'ATP', wta: 'WTA', challenger: 'Challenger' }[tour] || tour;
}

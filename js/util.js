/** Text, data a čas v Europe/Prague. Čisté funkce, bez DOM. */

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const PARTICLES = new Set(['de', 'del', 'della', 'di', 'da', 'dos', 'van', 'von', 'der', 'den', 'la', 'le', 'st', 'saint']);

export function tokens(name) {
  return fold(name).split(' ').filter(Boolean);
}

export function surnameKey(name) {
  const parts = tokens(name);
  if (!parts.length) return '';
  let index = parts.length - 1;
  while (index > 0 && PARTICLES.has(parts[index - 1])) index -= 1;
  return parts.slice(index).join('');
}

export function initial(name) {
  const parts = tokens(name);
  if (!parts.length) return '';
  if (parts[0].length === 1) return parts[0];
  return parts[0][0];
}

/** Stabilní klíč hráče napříč „Jannik Sinner“ a „J. Sinner“. */
export function playerKey(name) {
  const sur = surnameKey(name);
  const ini = initial(name);
  return sur ? `${sur}|${ini}` : '';
}

export function shortName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  if (/^[A-Za-z]\.$/.test(parts[0])) return parts.join(' ');
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

export function samePlayers(a, b, c, d) {
  const left = [playerKey(a), playerKey(b)].filter(Boolean).sort().join('~');
  const right = [playerKey(c), playerKey(d)].filter(Boolean).sort().join('~');
  return Boolean(left) && left === right;
}

export function pragueParts(ms = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const bag = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return {
    ymd: `${bag.year}-${bag.month}-${bag.day}`,
    hm: `${bag.hour}:${bag.minute}`,
  };
}

export function pragueYMD(ms = Date.now()) {
  return pragueParts(ms).ymd;
}

export function addDays(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Pořadové číslo pražského kalendářního dne od 1970-01-01 (stejně jako model Tenis). */
export function pragueDayNumber(ms = Date.now()) {
  const [year, month, day] = pragueYMD(ms).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function formatTime(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatDayLabel(ymd, today) {
  if (ymd === today) return 'Dnes';
  if (ymd === addDays(today, -1)) return 'Včera';
  if (ymd === addDays(today, 1)) return 'Zítra';
  const [year, month, day] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatDayNumber(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function pct(probability) {
  if (probability == null || Number.isNaN(probability)) return '–';
  return `${Math.round(probability * 100)} %`;
}

export async function getJSON(url, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function setWinner(set) {
  if (!set) return 0;
  const a = +set.a;
  const b = +set.b;
  if (a >= 6 && a - b >= 2) return 1;
  if (b >= 6 && b - a >= 2) return 2;
  if (a === 7 && b === 6) return 1;
  if (b === 7 && a === 6) return 2;
  return 0;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

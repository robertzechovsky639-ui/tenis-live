/** Anglický název země ze zdrojů → ISO2 pro vlajku. */

const ISO = {
  argentina: 'ar', australia: 'au', austria: 'at', belgium: 'be', bolivia: 'bo',
  'bosnia and herzegovina': 'ba', 'bosnia herzegovina': 'ba', brazil: 'br', bulgaria: 'bg',
  canada: 'ca', chile: 'cl', china: 'cn', 'china pr': 'cn', colombia: 'co', croatia: 'hr',
  czechia: 'cz', 'czech republic': 'cz', denmark: 'dk', ecuador: 'ec', finland: 'fi',
  france: 'fr', georgia: 'ge', germany: 'de', 'great britain': 'gb', greece: 'gr',
  'hong kong': 'hk', hungary: 'hu', india: 'in', indonesia: 'id', israel: 'il', italy: 'it',
  japan: 'jp', jordan: 'jo', kazakhstan: 'kz', latvia: 'lv', lebanon: 'lb', lithuania: 'lt',
  malaysia: 'my', mexico: 'mx', moldova: 'md', monaco: 'mc', montenegro: 'me', morocco: 'ma',
  netherlands: 'nl', 'new zealand': 'nz', norway: 'no', peru: 'pe', poland: 'pl', portugal: 'pt',
  romania: 'ro', russia: 'ru', serbia: 'rs', slovakia: 'sk', slovenia: 'si', 'south africa': 'za',
  'south korea': 'kr', korea: 'kr', spain: 'es', sweden: 'se', switzerland: 'ch', taiwan: 'tw',
  'chinese taipei': 'tw', thailand: 'th', tunisia: 'tn', turkey: 'tr', turkiye: 'tr',
  ukraine: 'ua', 'united kingdom': 'gb', 'united states': 'us', usa: 'us', uruguay: 'uy',
  uzbekistan: 'uz',
};

export function isoFromCountry(name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return '';
  if (ISO[key]) return ISO[key];
  if (/^[a-z]{2}$/.test(key)) return key;
  return '';
}

export function flagUrl(countryOrIso, explicit) {
  if (explicit) return explicit;
  const iso = isoFromCountry(countryOrIso);
  return iso ? `https://flagcdn.com/w40/${iso}.png` : '';
}

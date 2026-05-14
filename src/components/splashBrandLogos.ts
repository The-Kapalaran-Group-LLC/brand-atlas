export type ContinentName =
  | 'North America'
  | 'Europe'
  | 'Asia'
  | 'South America'
  | 'Africa'
  | 'Oceania';

export type MarkerCandidatePoint = {
  lat: number;
  lon: number;
  variant: number;
  continentIndex: number;
};

export type BrandLogoMarker = {
  brand: string;
  continent: ContinentName;
  lat: number;
  lon: number;
  logoDomain: string;
  logoUrl: string;
  ticker: string;
  monogram: string;
  wordmark: string;
  styleVariant: number;
};

export const CONTINENT_BRANDS: Record<ContinentName, string[]> = {
  'North America': [
    'Google',
    'Apple',
    'Microsoft',
    'Amazon',
    'Coca-Cola',
  ],
  Europe: [
    'Volkswagen',
    'Adidas',
    'IKEA',
    'LEGO',
    'Nestlé',
  ],
  Asia: [
    'Samsung',
    'Toyota',
    'Sony',
    'TikTok',
    'Nintendo',
  ],
  'South America': [
    'MercadoLibre',
    'LATAM Airlines',
    'Havaianas',
    'Nubank',
    'Petrobras',
  ],
  Africa: [
    'MTN',
    'Vodacom',
    'Ethiopian Airlines',
    'Safaricom',
    'DSTV',
  ],
  Oceania: [
    'Qantas',
    'Woolworths',
    'BHP',
    'Coles',
    'Canva',
  ],
};

const CONTINENT_INDEX: Record<ContinentName, number> = {
  'North America': 0,
  'South America': 1,
  Europe: 2,
  Africa: 3,
  Asia: 4,
  Oceania: 5,
};

const normalizeLon = (lon: number): number => {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
};

const isCanadaOrAlaska = (lat: number, lon: number): boolean => {
  const safeLon = normalizeLon(lon);
  const inCanadaBand = lat >= 49 && safeLon >= -170 && safeLon <= -52;
  const inAlaskaBand = lat >= 52 && (safeLon <= -128 || safeLon >= 170);
  return inCanadaBand || inAlaskaBand;
};

export const BRAND_LOGO_DOMAINS: Record<string, string> = {
  Google: 'google.com',
  Apple: 'apple.com',
  Microsoft: 'microsoft.com',
  Amazon: 'amazon.com',
  'Coca-Cola': 'coca-cola.com',
  "McDonald's": 'mcdonalds.com',
  Disney: 'disney.com',
  Nike: 'nike.com',
  Netflix: 'netflix.com',
  Meta: 'meta.com',
  Walmart: 'walmart.com',
  Tesla: 'tesla.com',
  NVIDIA: 'nvidia.com',
  Starbucks: 'starbucks.com',
  Ford: 'ford.com',
  Volkswagen: 'vw.com',
  Adidas: 'adidas.com',
  IKEA: 'ikea.com',
  LEGO: 'lego.com',
  'Nestlé': 'nestle.com',
  BMW: 'bmw.com',
  Zara: 'zara.com',
  'Mercedes-Benz': 'mercedes-benz.com',
  Spotify: 'spotify.com',
  Shell: 'shell.com',
  "L'Oreal": 'loreal.com',
  'H&M': 'hm.com',
  Siemens: 'siemens.com',
  'Deutsche Telekom': 'telekom.com',
  Airbus: 'airbus.com',
  Samsung: 'samsung.com',
  Toyota: 'toyota.com',
  Sony: 'sony.com',
  TikTok: 'tiktok.com',
  Nintendo: 'nintendo.com',
  Honda: 'honda.com',
  Alibaba: 'alibabagroup.com',
  Panasonic: 'panasonic.com',
  Uniqlo: 'uniqlo.com',
  Hyundai: 'hyundai.com',
  Tencent: 'tencent.com',
  TSMC: 'tsmc.com',
  Canon: 'canon.com',
  Lenovo: 'lenovo.com',
  'LG Electronics': 'lg.com',
  MercadoLibre: 'mercadolibre.com',
  'LATAM Airlines': 'latamairlines.com',
  Havaianas: 'havaianas.com',
  Nubank: 'nubank.com.br',
  Petrobras: 'petrobras.com.br',
  Embraer: 'embraer.com',
  Corona: 'coronausa.com',
  JBS: 'jbs.com.br',
  'Guarana Antarctica': 'guaranaantarctica.com.br',
  YPF: 'ypf.com',
  Vale: 'vale.com',
  Ambev: 'ambev.com.br',
  Gerdau: 'gerdau.com',
  'Banco do Brasil': 'bb.com.br',
  'Itau Unibanco': 'itau.com.br',
  MTN: 'mtn.com',
  Vodacom: 'vodacom.com',
  'Ethiopian Airlines': 'ethiopianairlines.com',
  Safaricom: 'safaricom.co.ke',
  DSTV: 'dstv.com',
  'Standard Bank': 'standardbank.com',
  'South African Airways': 'flysaa.com',
  'Dangote Cement': 'dangotecement.com',
  Jumia: 'jumia.com',
  Shoprite: 'shoprite.co.za',
  'M-Pesa': 'mpesa.africa',
  Naspers: 'naspers.com',
  FirstRand: 'firstrand.co.za',
  Sanlam: 'sanlam.com',
  'Attijariwafa Bank': 'attijariwafabank.com',
  Qantas: 'qantas.com',
  Woolworths: 'woolworths.com.au',
  BHP: 'bhp.com',
  Coles: 'coles.com.au',
  Canva: 'canva.com',
  'Rip Curl': 'ripcurl.com',
  'Commonwealth Bank': 'commbank.com.au',
  Atlassian: 'atlassian.com',
  Vegemite: 'vegemite.com.au',
  'Air New Zealand': 'airnewzealand.co.nz',
  Billabong: 'billabong.com',
  'Rio Tinto': 'riotinto.com',
  'Bunnings Warehouse': 'bunnings.com.au',
  'Macquarie Group': 'macquarie.com',
  Telstra: 'telstra.com.au',
};

export const buildBrandLogoUrl = (brand: string): string => {
  const domain = BRAND_LOGO_DOMAINS[brand] || 'example.com';
  return `https://logo.clearbit.com/${domain}?size=256`;
};

export const BRAND_TICKERS: Record<string, string> = {
  Google: 'GOOGL',
  Apple: 'AAPL',
  Microsoft: 'MSFT',
  Amazon: 'AMZN',
  'Coca-Cola': 'KO',
  Volkswagen: 'VOW3.DE',
  Adidas: 'ADS.DE',
  IKEA: 'PRIVATE',
  LEGO: 'PRIVATE',
  'Nestlé': 'NESN.SW',
  Samsung: '005930.KS',
  Toyota: '7203.T',
  Sony: '6758.T',
  TikTok: 'PRIVATE',
  Nintendo: '7974.T',
  MercadoLibre: 'MELI',
  'LATAM Airlines': 'LTM.SN',
  Havaianas: 'ALPA4.SA',
  Nubank: 'NU',
  Petrobras: 'PBR',
  MTN: 'MTN.JO',
  Vodacom: 'VOD.JO',
  'Ethiopian Airlines': 'PRIVATE',
  Safaricom: 'SCOM',
  DSTV: 'MCG.JO',
  Qantas: 'QAN.AX',
  Woolworths: 'WOW.AX',
  BHP: 'BHP.AX',
  Coles: 'COL.AX',
  Canva: 'PRIVATE',
};

export const getBrandTicker = (brand: string): string => BRAND_TICKERS[brand] || 'N/A';

const brandWords = (brand: string): string[] => (
  brand
    .replace(/-/g, ' ')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
);

export const getBrandAbbreviation = (brand: string): string => {
  const words = brandWords(brand);
  if (words.length === 0) return 'N/A';
  if (words.length === 1) {
    const solo = words[0].toUpperCase();
    return solo.length <= 5 ? solo : solo.slice(0, 4);
  }
  const initials = words
    .slice(0, 4)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');
  return initials || words[0].slice(0, 4).toUpperCase();
};

export const getDisplayTickerCopy = (brand: string): string => {
  const rawTicker = getBrandTicker(brand);
  if (rawTicker === 'PRIVATE' || /\d/.test(rawTicker) || rawTicker.includes('.')) {
    return getBrandAbbreviation(brand);
  }
  return rawTicker;
};

const STOP_WORDS = new Set(['and', 'the', 'group', 'holdings', 'bank', 'airlines', 'electronics', 'warehouse']);

const hashString = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const pickReadableWordmark = (brand: string): string => {
  const compact = brand.replace(/[^a-zA-Z0-9\s&-]/g, '').trim();
  if (compact.length <= 14) return compact;
  const firstWord = compact.split(/\s+/)[0] || compact;
  if (firstWord.length <= 12) return firstWord;
  return firstWord.slice(0, 11);
};

export const getBrandMonogram = (brand: string): string => {
  const normalizedBrand = brand
    .replace(/'s\b/gi, '')
    .replace(/'/g, '');
  const cleaned = normalizedBrand
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'BR';

  const tokens = cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token.toLowerCase()));

  if (tokens.length === 0) return cleaned.slice(0, 3).toUpperCase();
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase();

  const initialLetters = tokens.slice(0, 3).map((token) => token[0]?.toUpperCase() || '').join('');
  return initialLetters || 'BR';
};

const distanceDeg = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const dLat = a.lat - b.lat;
  const dLonRaw = Math.abs(a.lon - b.lon);
  const dLon = Math.min(dLonRaw, 360 - dLonRaw);
  return Math.hypot(dLat, dLon);
};

const pickPointForBrand = (
  rng: () => number,
  candidates: MarkerCandidatePoint[],
  used: Array<{ lat: number; lon: number }>,
): MarkerCandidatePoint | null => {
  if (candidates.length === 0) return null;

  const minDistance = 5;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const point = candidates[Math.floor(rng() * candidates.length)];
    const overlaps = used.some((other) => distanceDeg(other, point) < minDistance);
    if (!overlaps) return point;
  }

  return candidates[Math.floor(rng() * candidates.length)] ?? null;
};

const ALL_CONTINENT_POINTS = (pointsByContinent: Record<ContinentName, MarkerCandidatePoint[]>) => (
  (Object.values(pointsByContinent).flat() as MarkerCandidatePoint[])
);

export const buildBrandLogoMarkers = (
  candidatePoints: MarkerCandidatePoint[],
  seed = 0x4c4f474f,
): BrandLogoMarker[] => {
  const pointsByContinent: Record<ContinentName, MarkerCandidatePoint[]> = {
    'North America': [],
    Europe: [],
    Asia: [],
    'South America': [],
    Africa: [],
    Oceania: [],
  };

  for (const point of candidatePoints) {
    for (const [continent, index] of Object.entries(CONTINENT_INDEX) as Array<[ContinentName, number]>) {
      if (point.continentIndex === index) {
        pointsByContinent[continent].push(point);
      }
    }
  }

  const allCandidates = ALL_CONTINENT_POINTS(pointsByContinent);
  const usedPoints: Array<{ lat: number; lon: number }> = [];
  const markers: BrandLogoMarker[] = [];

  for (const [continent, brands] of Object.entries(CONTINENT_BRANDS) as Array<[ContinentName, string[]]>) {
    for (const brand of brands) {
      const localSeed = seed ^ hashString(`${continent}:${brand}`);
      const rng = createRng(localSeed);
      const localCandidates = pointsByContinent[continent];
      const eligibleLocalCandidates = continent === 'North America'
        ? localCandidates.filter((candidate) => !isCanadaOrAlaska(candidate.lat, candidate.lon))
        : localCandidates;
      const point = pickPointForBrand(rng, eligibleLocalCandidates, usedPoints)
        ?? (continent === 'North America' ? null : pickPointForBrand(rng, allCandidates, usedPoints));
      if (!point) continue;

      usedPoints.push({ lat: point.lat, lon: point.lon });
      const logoDomain = BRAND_LOGO_DOMAINS[brand] || 'example.com';
      markers.push({
        brand,
        continent,
        lat: point.lat,
        lon: point.lon,
        logoDomain,
        logoUrl: buildBrandLogoUrl(brand),
        ticker: getDisplayTickerCopy(brand),
        monogram: getBrandMonogram(brand),
        wordmark: pickReadableWordmark(brand),
        styleVariant: hashString(brand) % 7,
      });
    }
  }

  return markers;
};

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
    "McDonald's",
    'Disney',
    'Nike',
    'Netflix',
    'Meta',
    'Walmart',
    'Tesla',
    'NVIDIA',
    'Starbucks',
    'Ford',
  ],
  Europe: [
    'Volkswagen',
    'Adidas',
    'IKEA',
    'LEGO',
    'Nestle',
    'BMW',
    'Zara',
    'Mercedes-Benz',
    'Spotify',
    'Shell',
    "L'Oreal",
    'H&M',
    'Siemens',
    'Deutsche Telekom',
    'Airbus',
  ],
  Asia: [
    'Samsung',
    'Toyota',
    'Sony',
    'TikTok',
    'Nintendo',
    'Honda',
    'Alibaba',
    'Panasonic',
    'Uniqlo',
    'Hyundai',
    'Tencent',
    'TSMC',
    'Canon',
    'Lenovo',
    'LG Electronics',
  ],
  'South America': [
    'MercadoLibre',
    'LATAM Airlines',
    'Havaianas',
    'Nubank',
    'Petrobras',
    'Embraer',
    'Corona',
    'JBS',
    'Guarana Antarctica',
    'YPF',
    'Vale',
    'Ambev',
    'Gerdau',
    'Banco do Brasil',
    'Itau Unibanco',
  ],
  Africa: [
    'MTN',
    'Vodacom',
    'Ethiopian Airlines',
    'Safaricom',
    'DSTV',
    'Standard Bank',
    'South African Airways',
    'Dangote Cement',
    'Jumia',
    'Shoprite',
    'M-Pesa',
    'Naspers',
    'FirstRand',
    'Sanlam',
    'Attijariwafa Bank',
  ],
  Oceania: [
    'Qantas',
    'Woolworths',
    'BHP',
    'Coles',
    'Canva',
    'Rip Curl',
    'Commonwealth Bank',
    'Atlassian',
    'Vegemite',
    'Air New Zealand',
    'Billabong',
    'Rio Tinto',
    'Bunnings Warehouse',
    'Macquarie Group',
    'Telstra',
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
  const cleaned = brand
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'BR';

  const tokens = cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
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
      const point = pickPointForBrand(rng, localCandidates, usedPoints)
        ?? pickPointForBrand(rng, allCandidates, usedPoints);
      if (!point) continue;

      usedPoints.push({ lat: point.lat, lon: point.lon });
      markers.push({
        brand,
        continent,
        lat: point.lat,
        lon: point.lon,
        monogram: getBrandMonogram(brand),
        wordmark: pickReadableWordmark(brand),
        styleVariant: hashString(brand) % 7,
      });
    }
  }

  return markers;
};

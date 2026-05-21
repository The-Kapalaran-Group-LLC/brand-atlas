import { useEffect, useRef, useState } from 'react';
import {
  getFrameDeltaMs,
  getSmoothedFrameDeltaMs,
  getNextQualityStep,
  getRenderStride,
  getStripeClusterDensity,
} from './splashGlobePerf';

type GlobePoint = {
  x: number;
  y: number;
  z: number;
  lat: number;
  lon: number;
  variant: number;
};

type GeoJsonFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

type GeoJsonData = {
  features?: GeoJsonFeature[];
};

type GlobeOutlineLine = {
  points: GlobePoint[];
  variant: number;
};

type FillDensityOptions = {
  populationWeighted?: boolean;
  populationHotspots?: boolean;
  variantByContinent?: boolean;
};

type GlobeBuildQuality = 'fast' | 'full';
type Rng = () => number;

const GLOBE_RADIUS = 220;
const MASK_WIDTH = 2048;
const MASK_HEIGHT = 1024;
const DEFAULT_START_LONGITUDE = 121;
const AUTO_ROTATE_SPEED = 0.176;
const AXIS_TILT_DEG = 23.4;
const DEPTH = 600;
const INDIGO_GRADIENT_STOPS: Array<[number, number, number]> = [
  [244, 153, 220],
  [138, 122, 255],
  [76, 40, 232],
  [24, 12, 156],
];

const normalizeLon = (lon: number): number => {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
};

const lonToMaskX = (lon: number): number => ((lon + 180) / 360) * (MASK_WIDTH - 1);
const latToMaskY = (lat: number): number => ((90 - lat) / 180) * (MASK_HEIGHT - 1);

const getContinentIndex = (lat: number, lon: number): number => {
  const safeLon = normalizeLon(lon);
  if (lat < -58) return 6; // Antarctica

  // North America
  if (lat >= 7 && safeLon >= -170 && safeLon <= -50) return 0;
  // South America
  if (lat < 13 && lat >= -58 && safeLon >= -92 && safeLon <= -30) return 1;
  // Europe
  if (lat >= 35 && lat <= 72 && safeLon >= -12 && safeLon <= 45) return 2;
  // Africa
  if (lat >= -36 && lat <= 37 && safeLon >= -20 && safeLon <= 55) return 3;
  // Oceania
  if (lat >= -50 && lat <= 22 && (safeLon >= 110 || safeLon <= -150)) return 5;
  // Asia (default eastern hemisphere landmass bucket)
  if (lat >= 0 && safeLon >= 45 && safeLon <= 180) return 4;
  if (lat >= -10 && safeLon >= 25 && safeLon < 110) return 4;

  // Fallbacks for edge/island areas
  if (safeLon < -30) return lat >= 0 ? 0 : 1;
  if (lat >= 20) return 4;
  return 3;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const gradientColorAt = (t: number, brightness = 1): string => {
  const safeT = clamp(t, 0, 1);
  const scaled = safeT * (INDIGO_GRADIENT_STOPS.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(INDIGO_GRADIENT_STOPS.length - 1, index + 1);
  const localT = scaled - index;
  const from = INDIGO_GRADIENT_STOPS[index];
  const to = INDIGO_GRADIENT_STOPS[nextIndex];
  const r = Math.round(clamp(lerp(from[0], to[0], localT) * brightness, 0, 255));
  const g = Math.round(clamp(lerp(from[1], to[1], localT) * brightness, 0, 255));
  const b = Math.round(clamp(lerp(from[2], to[2], localT) * brightness, 0, 255));
  return `rgb(${r} ${g} ${b})`;
};

const readNumericProperty = (properties: Record<string, unknown> | undefined, keys: string[]): number | null => {
  if (!properties) return null;
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replaceAll(',', ''));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
};

const getFeaturePopulation = (feature: GeoJsonFeature): number | null => readNumericProperty(feature.properties, [
  'POP_EST',
  'pop_est',
  'POPULATION',
  'population',
  'POP2020',
  'POP2019',
  'POP2000',
  'pop',
]);

const getFeatureContinentKey = (feature: GeoJsonFeature, fallback: string): string => {
  const properties = feature.properties;
  const value = properties?.CONTINENT
    ?? properties?.continent
    ?? properties?.REGION_UN
    ?? properties?.region_un
    ?? properties?.REGION_WB
    ?? properties?.region_wb;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
};

type PopulationHub = {
  lat: number;
  lon: number;
  weight: number;
};

type LatLon = {
  lat: number;
  lon: number;
};

const POPULATION_HUBS: PopulationHub[] = [
  { lat: 35.68, lon: 139.76, weight: 1.0 }, // Tokyo
  { lat: 31.23, lon: 121.47, weight: 0.95 }, // Shanghai
  { lat: 28.61, lon: 77.21, weight: 0.92 }, // Delhi
  { lat: 23.13, lon: 113.26, weight: 0.88 }, // Guangzhou
  { lat: 14.60, lon: 120.98, weight: 0.9 }, // Manila
  { lat: -6.21, lon: 106.85, weight: 0.9 }, // Jakarta
  { lat: 19.07, lon: 72.88, weight: 0.86 }, // Mumbai
  { lat: 24.86, lon: 67.01, weight: 0.8 }, // Karachi
  { lat: 30.04, lon: 31.24, weight: 0.78 }, // Cairo
  { lat: 6.52, lon: 3.38, weight: 0.76 }, // Lagos
  { lat: 40.71, lon: -74.01, weight: 0.82 }, // New York
  { lat: 34.05, lon: -118.24, weight: 0.72 }, // Los Angeles
  { lat: 19.43, lon: -99.13, weight: 0.74 }, // Mexico City
  { lat: -23.55, lon: -46.63, weight: 0.74 }, // Sao Paulo
  { lat: -34.60, lon: -58.38, weight: 0.65 }, // Buenos Aires
  { lat: 51.51, lon: -0.13, weight: 0.68 }, // London
  { lat: 48.86, lon: 2.35, weight: 0.66 }, // Paris
  { lat: 55.76, lon: 37.62, weight: 0.62 }, // Moscow
  { lat: 41.01, lon: 28.97, weight: 0.66 }, // Istanbul
  { lat: 24.71, lon: 46.67, weight: 0.56 }, // Riyadh
  { lat: 33.57, lon: -7.59, weight: 0.48 }, // Casablanca
  { lat: -26.20, lon: 28.05, weight: 0.54 }, // Johannesburg
  { lat: -33.87, lon: 151.21, weight: 0.5 }, // Sydney
  { lat: 37.57, lon: 126.98, weight: 0.7 }, // Seoul
  { lat: 22.32, lon: 114.17, weight: 0.7 }, // Hong Kong
];

// Explicit Pacific island anchors to ensure tiny island nations are represented
// as single visible dots even when coarse geojson/fill sampling misses them.
const PACIFIC_ISLAND_DOTS: LatLon[] = [
  // Western / Micronesia
  { lat: 13.44, lon: 144.79 }, // Guam
  { lat: 15.19, lon: 145.75 }, // Saipan (Northern Mariana Islands)
  { lat: 7.35, lon: 134.46 }, // Palau
  { lat: 9.52, lon: 138.12 }, // Yap
  { lat: 6.92, lon: 158.16 }, // Pohnpei
  { lat: 7.45, lon: 151.84 }, // Chuuk
  { lat: 5.33, lon: 163.02 }, // Kosrae
  { lat: 7.12, lon: 171.06 }, // Majuro (Marshall Islands)
  { lat: 9.08, lon: 167.33 }, // Kwajalein Atoll
  { lat: 1.87, lon: 173.00 }, // Kiribati (Gilbert)
  { lat: -0.53, lon: 166.93 }, // Nauru
  { lat: 1.45, lon: 172.98 }, // Tarawa

  // Equatorial remote North Pacific islands
  { lat: 19.71, lon: 166.63 }, // Wake Island
  { lat: 16.75, lon: -169.53 }, // Johnston Atoll
  { lat: 5.88, lon: -162.08 }, // Palmyra Atoll
  { lat: 0.80, lon: -176.62 }, // Howland Island
  { lat: 0.19, lon: -176.48 }, // Baker Island
  { lat: -0.37, lon: -159.99 }, // Kiritimati (Christmas Island, Kiribati)
  { lat: -3.86, lon: -171.74 }, // Tokelau area
  { lat: 28.20, lon: -177.35 }, // Midway Atoll
  { lat: 21.31, lon: -157.86 }, // Hawaii (Oahu)
  { lat: 19.64, lon: -155.55 }, // Hawaii (Big Island)

  // Melanesia / Coral Sea
  { lat: -9.44, lon: 147.18 }, // Port Moresby (PNG)
  { lat: -5.84, lon: 144.28 }, // PNG highlands anchor
  { lat: -9.43, lon: 160.04 }, // Honiara (Solomon Islands)
  { lat: -8.10, lon: 156.84 }, // Western Solomons
  { lat: -17.74, lon: 168.31 }, // Port Vila (Vanuatu)
  { lat: -16.13, lon: 167.43 }, // Espiritu Santo (Vanuatu)
  { lat: -22.28, lon: 166.46 }, // Noumea (New Caledonia)
  { lat: -21.50, lon: 165.50 }, // New Caledonia north
  { lat: -17.82, lon: 177.98 }, // Viti Levu (Fiji)
  { lat: -16.78, lon: 179.34 }, // Vanua Levu (Fiji)
  { lat: -8.52, lon: 179.20 }, // Tuvalu

  // Polynesia core
  { lat: -13.84, lon: -171.75 }, // Samoa
  { lat: -14.28, lon: -170.70 }, // American Samoa
  { lat: -13.30, lon: -176.20 }, // Wallis and Futuna
  { lat: -21.18, lon: -175.20 }, // Tonga (Tongatapu)
  { lat: -18.65, lon: -173.98 }, // Tonga north
  { lat: -21.24, lon: -159.78 }, // Cook Islands (Rarotonga)
  { lat: -19.05, lon: -169.87 }, // Niue
  { lat: -17.54, lon: -149.56 }, // Tahiti / Society Islands
  { lat: -16.50, lon: -151.74 }, // Bora Bora / Leeward
  { lat: -23.12, lon: -134.97 }, // Mangareva / Gambier
  { lat: -9.76, lon: -139.03 }, // Marquesas (Nuku Hiva)
  { lat: -14.27, lon: -170.70 }, // Central Samoa arc
  { lat: -21.20, lon: -159.70 }, // Southern Cooks arc
  { lat: -17.67, lon: -149.40 }, // Society arc

  // Far South / Eastern Pacific islands visible on reference
  { lat: -25.07, lon: -130.10 }, // Pitcairn Islands
  { lat: 10.30, lon: -109.22 }, // Clipperton Island
];

const wrappedLonDistance = (a: number, b: number): number => {
  const direct = Math.abs(a - b);
  return Math.min(direct, 360 - direct);
};

const populationHotspotDensity = (lat: number, lon: number): number => {
  let sum = 0;
  for (const hub of POPULATION_HUBS) {
    const dLat = lat - hub.lat;
    const dLon = wrappedLonDistance(lon, hub.lon);
    const dist = Math.hypot(dLat, dLon);
    const radius = 15;
    const influence = Math.exp(-(dist * dist) / (2 * radius * radius));
    sum += influence * hub.weight;
  }
  return clamp(sum, 0, 1.8);
};

const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const toCartesian = (lat: number, lon: number, variant = 0): GlobePoint => {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const cosLat = Math.cos(latRad);

  return {
    x: GLOBE_RADIUS * cosLat * Math.sin(lonRad),
    y: GLOBE_RADIUS * Math.sin(latRad),
    z: GLOBE_RADIUS * cosLat * Math.cos(lonRad),
    lat,
    lon,
    variant,
  };
};


type SplashGridProps = {
  sizeMultiplier?: number;
  qualityMode?: 'auto' | 'fast';
  startLongitude?: number;
  interactive?: boolean;
  usePreRenderedLoop?: boolean;
};

type PrecomputedSplashDotData = {
  version?: number;
  continentFill?: number[];
  countryFill?: number[];
};

const REMOTE_COUNTRIES_GEOJSON_URLS = [
  'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json',
  'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
];
const COUNTRIES_GEOJSON_CACHE_KEY = 'splash_globe_countries_geojson_v1';
const COUNTRIES_GEOJSON_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const COUNTRIES_REMOTE_FAILURE_KEY = 'splash_globe_countries_remote_failure_ts_v1';
const COUNTRIES_REMOTE_RETRY_BACKOFF_MS = 1000 * 60 * 60 * 6; // 6 hours
const PRE_RENDERED_GLOBE_LOOP_SRC = '/assets/menupage-globe-loop.gif';

let cachedLandGeoJson: GeoJsonData | null = null;
let cachedCountriesGeoJson: GeoJsonData | null = null;
let cachedPrecomputedSplashDots: PrecomputedSplashDotData | null = null;

const readCachedCountriesGeoJson = (): GeoJsonData | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COUNTRIES_GEOJSON_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: GeoJsonData };
    if (!parsed?.data) return null;
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    if (Date.now() - savedAt > COUNTRIES_GEOJSON_CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(COUNTRIES_GEOJSON_CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.log('[SplashGlobe] Failed to read cached countries geojson', error);
    return null;
  }
};

const writeCachedCountriesGeoJson = (geoJson: GeoJsonData) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COUNTRIES_GEOJSON_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      data: geoJson,
    }));
    window.localStorage.removeItem(COUNTRIES_REMOTE_FAILURE_KEY);
    console.log('[SplashGlobe] Cached countries geojson in localStorage');
  } catch (error) {
    console.log('[SplashGlobe] Failed to cache countries geojson in localStorage', error);
  }
};

const readRemoteFailureTimestamp = (): number => {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(COUNTRIES_REMOTE_FAILURE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const writeRemoteFailureTimestamp = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COUNTRIES_REMOTE_FAILURE_KEY, String(Date.now()));
};

export function SplashGrid({
  sizeMultiplier = 1,
  qualityMode = 'auto',
  startLongitude = DEFAULT_START_LONGITUDE,
  interactive = false,
  usePreRenderedLoop = false,
}: SplashGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLiveMode, setIsLiveMode] = useState(!usePreRenderedLoop);

  useEffect(() => {
    setIsLiveMode(!usePreRenderedLoop);
  }, [usePreRenderedLoop]);

  useEffect(() => {
    if (!isLiveMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = MASK_WIDTH;
    maskCanvas.height = MASK_HEIGHT;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    let maskPixels: Uint8ClampedArray | null = null;
    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let elapsedSeconds = 0;
    let lastFrameNow = 0;
    let smoothedDeltaMs: number | null = null;
    let qualitySampleAccumulatorMs = 0;
    let adaptiveQualityStep = qualityMode === 'fast' ? 2 : 0;
    let isMobileViewport = false;
    let dragYaw = 0;
    let dragPitch = 0;
    let isPointerDown = false;
    let activePointerId: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let pointerMoved = false;
    let suppressNextClick = false;

    let generationReady = false;
    let landGeoJsonRef: GeoJsonData | null = null;
    let countryGeoJsonRef: GeoJsonData | null = null;

    const continentOutlineLines: GlobeOutlineLine[] = [];
    const continentFillPoints: GlobePoint[] = [];
    const countryOutlineLines: GlobeOutlineLine[] = [];
    const countryFillPoints: GlobePoint[] = [];
    const oceanPoints: GlobePoint[] = [];

    const resize = () => {
      const dprCap = qualityMode === 'fast' ? 1.25 : 2;
      dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      isMobileViewport = width <= 640;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      console.log('[SplashGlobe] resize', { width, height, dpr });
    };

    const drawRing = (ring: number[][]) => {
      if (!ring || ring.length === 0) return;
      let prevLon = ring[0]?.[0] ?? 0;
      const firstX = lonToMaskX(prevLon);
      const firstY = latToMaskY(ring[0]?.[1] ?? 0);
      maskCtx.moveTo(firstX, firstY);

      for (let i = 1; i < ring.length; i += 1) {
        const lon = ring[i]?.[0] ?? 0;
        const lat = ring[i]?.[1] ?? 0;
        const delta = Math.abs(lon - prevLon);
        const x = lonToMaskX(lon);
        const y = latToMaskY(lat);

        if (delta > 180) {
          maskCtx.moveTo(x, y);
        } else {
          maskCtx.lineTo(x, y);
        }

        prevLon = lon;
      }

      maskCtx.closePath();
    };

    const buildLandMask = (geojson: GeoJsonData) => {
      maskCtx.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
      maskCtx.fillStyle = '#000';
      maskCtx.fillRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
      maskCtx.fillStyle = '#fff';

      const features = Array.isArray(geojson.features) ? geojson.features : [];
      for (const feature of features) {
        const geometry = feature.geometry;
        if (!geometry?.type || !geometry.coordinates) continue;

        if (geometry.type === 'Polygon') {
          const polygon = geometry.coordinates as number[][][];
          maskCtx.beginPath();
          for (const ring of polygon) drawRing(ring);
          maskCtx.fill('evenodd');
          continue;
        }

        if (geometry.type === 'MultiPolygon') {
          const multiPolygon = geometry.coordinates as number[][][][];
          for (const polygon of multiPolygon) {
            maskCtx.beginPath();
            for (const ring of polygon) drawRing(ring);
            maskCtx.fill('evenodd');
          }
        }
      }

      maskPixels = maskCtx.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT).data;
      console.log('[SplashGlobe] land mask built', { features: features.length });
    };

    const landAt = (lat: number, lon: number): boolean => {
      if (!maskPixels) return false;
      const safeLat = Math.max(-90, Math.min(90, lat));
      const safeLon = normalizeLon(lon);
      const x = Math.max(0, Math.min(MASK_WIDTH - 1, Math.round(lonToMaskX(safeLon))));
      const y = Math.max(0, Math.min(MASK_HEIGHT - 1, Math.round(latToMaskY(safeLat))));
      const idx = (y * MASK_WIDTH + x) * 4;
      return maskPixels[idx] > 20;
    };

    const sampleRingToLine = (ring: number[][], sampleStepDeg: number, variant: number): GlobeOutlineLine | null => {
      if (!Array.isArray(ring) || ring.length < 2) return null;
      const points: GlobePoint[] = [];

      for (let i = 1; i < ring.length; i += 1) {
        const a = ring[i - 1];
        const b = ring[i];
        const lonA = (a?.[0] as number) ?? 0;
        const latA = (a?.[1] as number) ?? 0;
        const lonB = (b?.[0] as number) ?? 0;
        const latB = (b?.[1] as number) ?? 0;

        let dLon = lonB - lonA;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        const dLat = latB - latA;
        const seg = Math.max(Math.abs(dLon), Math.abs(dLat));
        const steps = Math.max(1, Math.ceil(seg / sampleStepDeg));

        for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
          const t = stepIndex / steps;
          const lon = lonA + dLon * t;
          const lat = latA + dLat * t;
          points.push({ ...toCartesian(lat, lon, variant), lat, lon, variant });
        }
      }
      if (points.length < 2) return null;
      return { points, variant };
    };

    const unwrapRingLongitudes = (ring: number[][]): number[][] => {
      if (!Array.isArray(ring) || ring.length === 0) return [];
      const unwrapped: number[][] = [];
      let prevLon = (ring[0]?.[0] as number) ?? 0;
      unwrapped.push([prevLon, (ring[0]?.[1] as number) ?? 0]);
      for (let i = 1; i < ring.length; i += 1) {
        let lon = (ring[i]?.[0] as number) ?? 0;
        const lat = (ring[i]?.[1] as number) ?? 0;
        let delta = lon - prevLon;
        if (delta > 180) lon -= 360;
        if (delta < -180) lon += 360;
        unwrapped.push([lon, lat]);
        prevLon = lon;
      }
      return unwrapped;
    };

    const normalizeLonToRange = (lon: number, minLon: number, maxLon: number): number => {
      let adjusted = lon;
      while (adjusted < minLon) adjusted += 360;
      while (adjusted > maxLon) adjusted -= 360;
      return adjusted;
    };

    const pointInRing = (lon: number, lat: number, ring: number[][]): boolean => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const intersects = yi > lat !== yj > lat
          && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-9) + xi;
        if (intersects) inside = !inside;
      }
      return inside;
    };

    const appendFillDotsFromPolygon = (
      polygon: number[][][],
      output: GlobePoint[],
      sampleStepDeg: number,
      jitterDeg: number,
      keepChance: number,
      variant: number,
      maxPoints: number,
      reduceAntarctica: boolean,
      rng: Rng,
      localDensityFn?: (lat: number, lon: number) => number,
    ) => {
      if (!Array.isArray(polygon) || polygon.length === 0) return;
      const rings = polygon
        .map(unwrapRingLongitudes)
        .filter((ring) => Array.isArray(ring) && ring.length >= 3);
      if (rings.length === 0) return;

      const outer = rings[0];
      const holeRings = rings.slice(1);
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const [lon, lat] of outer) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const lonSpan = Math.max(1e-6, maxLon - minLon);
      const latSpan = Math.max(1e-6, maxLat - minLat);
      const approxGridCells = (lonSpan * latSpan) / Math.max(1e-6, sampleStepDeg * sampleStepDeg);
      const desiredPoints = approxGridCells * keepChance;
      const maxAttempts = Math.ceil(desiredPoints * 6);

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (output.length >= maxPoints) return;

        const lat = minLat + rng() * latSpan;
        const lon = minLon + rng() * lonSpan;
        const localDensity = localDensityFn ? localDensityFn(lat, lon) : 0;
        const localKeepChance = clamp(keepChance * (0.5 + localDensity * 0.9), 0.05, 0.995);
        if (rng() > localKeepChance) continue;

        const lonInRange = normalizeLonToRange(lon, minLon, maxLon);
        if (!pointInRing(lonInRange, lat, outer)) continue;
        if (holeRings.some((ring) => pointInRing(lonInRange, lat, ring))) continue;

        const clusterDensity = getStripeClusterDensity(lat, lonInRange);
        const clusteredKeepChance = clamp(
          localKeepChance * (0.2 + Math.pow(clusterDensity, 1.1) * 2.8),
          0.04,
          0.995,
        );
        if (rng() > clusteredKeepChance) continue;

        const jitteredLat = lat + (rng() - 0.5) * jitterDeg * 1.4;
        const jitteredLon = lonInRange + (rng() - 0.5) * jitterDeg * 1.4;

        if (reduceAntarctica && jitteredLat < -62 && rng() > 0.12) continue;

        const wrappedLon = normalizeLon(jitteredLon);
        output.push({
          ...toCartesian(jitteredLat, wrappedLon, variant),
          lat: jitteredLat,
          lon: wrappedLon,
          variant,
        });
      }
    };

    const appendOutlineLinesFromGeoJson = (
      geojson: GeoJsonData,
      output: GlobeOutlineLine[],
      sampleStepDeg: number,
      variantOffset = 0,
    ) => {
      const features = Array.isArray(geojson.features) ? geojson.features : [];
      for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
        const feature = features[featureIndex];
        const geometry = feature.geometry;
        if (!geometry?.type || !geometry.coordinates) continue;
        const variant = featureIndex + variantOffset;

        if (geometry.type === 'Polygon') {
          const polygon = geometry.coordinates as number[][][];
          for (const ring of polygon) {
            const line = sampleRingToLine(ring, sampleStepDeg, variant);
            if (line) output.push(line);
          }
          continue;
        }

        if (geometry.type === 'MultiPolygon') {
          const multi = geometry.coordinates as number[][][][];
          for (const polygon of multi) {
            for (const ring of polygon) {
              const line = sampleRingToLine(ring, sampleStepDeg, variant);
              if (line) output.push(line);
            }
          }
        }
      }
    };

    const appendFillDotsFromGeoJson = (
      geojson: GeoJsonData,
      output: GlobePoint[],
      sampleStepDeg: number,
      jitterDeg: number,
      keepChance: number,
      maxPoints: number,
      reduceAntarctica: boolean,
      rng: Rng,
      variantOffset = 0,
      options: FillDensityOptions = {},
    ) => {
      const features = Array.isArray(geojson.features) ? geojson.features : [];
      const populations = features.map((feature) => getFeaturePopulation(feature)).filter((v): v is number => v != null);
      const minPop = populations.length > 0 ? Math.min(...populations) : null;
      const maxPop = populations.length > 0 ? Math.max(...populations) : null;
      const minLog = minPop ? Math.log10(minPop) : 0;
      const maxLog = maxPop ? Math.log10(maxPop) : 1;
      const logRange = Math.max(1e-6, maxLog - minLog);
      const continentVariantMap = new Map<string, number>();

      for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
        if (output.length >= maxPoints) break;
        const feature = features[featureIndex];
        const geometry = feature.geometry;
        if (!geometry?.type || !geometry.coordinates) continue;
        let variant = featureIndex + variantOffset;
        if (options.variantByContinent) {
          const key = getFeatureContinentKey(feature, `region-${featureIndex % 8}`);
          const existing = continentVariantMap.get(key);
          if (existing != null) {
            variant = existing;
          } else {
            variant = variantOffset + continentVariantMap.size;
            continentVariantMap.set(key, variant);
          }
        }

        let adjustedStep = sampleStepDeg;
        let adjustedKeepChance = keepChance;
        const localDensityFn = options.populationHotspots
          ? (lat: number, lon: number) => populationHotspotDensity(lat, lon)
          : undefined;

        if (options.populationWeighted) {
          const population = getFeaturePopulation(feature);
          const normalized = population && minPop && maxPop
            ? clamp((Math.log10(population) - minLog) / logRange, 0, 1)
            : 0.35;
          const stepScale = 1.25 - normalized * 0.65;
          const chanceScale = 0.55 + normalized * 0.95;
          adjustedStep = sampleStepDeg * stepScale;
          adjustedKeepChance = clamp(keepChance * chanceScale, 0.08, 0.98);
        }

        if (geometry.type === 'Polygon') {
          appendFillDotsFromPolygon(
            geometry.coordinates as number[][][],
            output,
            adjustedStep,
            jitterDeg,
            adjustedKeepChance,
            variant,
            maxPoints,
            reduceAntarctica,
            rng,
            localDensityFn,
          );
          continue;
        }

        if (geometry.type === 'MultiPolygon') {
          const multi = geometry.coordinates as number[][][][];
          for (const polygon of multi) {
            if (output.length >= maxPoints) break;
            appendFillDotsFromPolygon(
              polygon,
              output,
              adjustedStep,
              jitterDeg,
              adjustedKeepChance,
              variant,
              maxPoints,
              reduceAntarctica,
              rng,
              localDensityFn,
            );
          }
        }
      }
    };

    const applyPackedFillPoints = (packed: number[] | undefined, output: GlobePoint[]) => {
      if (!Array.isArray(packed) || packed.length < 3) return;
      output.length = 0;
      for (let i = 0; i + 2 < packed.length; i += 3) {
        const lat = packed[i];
        const lon = packed[i + 1];
        const variant = packed[i + 2];
        output.push({
          ...toCartesian(lat, lon, variant),
          lat,
          lon,
          variant,
        });
      }
    };

    const buildEarthPoints = (
      quality: GlobeBuildQuality = 'full',
      precomputedDots?: PrecomputedSplashDotData | null,
    ) => {
      const isFast = quality === 'fast';
      const rng = createRng(isFast ? 0x5eed1234 : 0x5eed5678);
      continentOutlineLines.length = 0;
      continentFillPoints.length = 0;
      countryOutlineLines.length = 0;
      countryFillPoints.length = 0;
      oceanPoints.length = 0;

      const landData = landGeoJsonRef ?? { features: [] };
      appendOutlineLinesFromGeoJson(landData, continentOutlineLines, isFast ? 0.52 : 0.22, 0);
      const canUsePackedFastDots = isFast
        && !!precomputedDots
        && Array.isArray(precomputedDots.continentFill)
        && Array.isArray(precomputedDots.countryFill)
        && precomputedDots.continentFill.length > 0
        && precomputedDots.countryFill.length > 0;

      if (canUsePackedFastDots) {
        appendOutlineLinesFromGeoJson(landData, countryOutlineLines, 0.66, 300);
        applyPackedFillPoints(precomputedDots?.continentFill, continentFillPoints);
        applyPackedFillPoints(precomputedDots?.countryFill, countryFillPoints);
      } else if (countryGeoJsonRef) {
        appendOutlineLinesFromGeoJson(countryGeoJsonRef, countryOutlineLines, isFast ? 0.58 : 0.24, 300);
        appendFillDotsFromGeoJson(
          countryGeoJsonRef,
          continentFillPoints,
          isFast ? 1.56 : 0.86,
          0.08,
          isFast ? 0.3 : 0.42,
          isFast ? 28000 : 100000,
          true,
          rng,
          25,
          { populationWeighted: true, variantByContinent: true },
        );
        appendFillDotsFromGeoJson(
          countryGeoJsonRef,
          countryFillPoints,
          isFast ? 1.34 : 0.7,
          0.08,
          isFast ? 0.36 : 0.5,
          isFast ? 42000 : 170000,
          true,
          rng,
          300,
          { populationWeighted: true, populationHotspots: true, variantByContinent: false },
        );
      } else {
        appendOutlineLinesFromGeoJson(landData, countryOutlineLines, isFast ? 0.66 : 0.42, 300);
        appendFillDotsFromGeoJson(
          landData,
          continentFillPoints,
          isFast ? 1.22 : 0.64,
          0.08,
          isFast ? 0.36 : 0.58,
          isFast ? 32000 : 105000,
          true,
          rng,
          25,
          { populationHotspots: true },
        );
        appendFillDotsFromGeoJson(
          landData,
          countryFillPoints,
          isFast ? 1.46 : 0.92,
          0.1,
          isFast ? 0.3 : 0.46,
          isFast ? 38000 : 112000,
          true,
          rng,
          300,
          { populationHotspots: true },
        );
      }

      const oceanTarget = isFast ? 900 : 3000;
      const oceanAttempts = oceanTarget * 20;
      for (let attempt = 0; attempt < oceanAttempts && oceanPoints.length < oceanTarget; attempt += 1) {
        const lat = -86 + rng() * (82 - -86);
        const lon = -180 + rng() * 360;
        if (landAt(lat, lon)) continue;
        const clusterDensity = getStripeClusterDensity(lat * 0.92 + 6.5, lon * 1.04 - 13);
        const nearCoast = (
          landAt(lat + 1.1, lon)
          || landAt(lat - 1.1, lon)
          || landAt(lat, lon + 1.1)
          || landAt(lat, lon - 1.1)
        );
        const oceanKeepChance = clamp(
          (nearCoast ? 0.22 : 0.08) + Math.pow(clusterDensity, 1.15) * (nearCoast ? 1.34 : 1.06),
          0.02,
          0.95,
        );
        if (rng() > oceanKeepChance) continue;
        const jitteredLat = lat + (rng() - 0.5) * 0.55;
        const jitteredLon = lon + (rng() - 0.5) * 0.55;
        oceanPoints.push({ ...toCartesian(jitteredLat, jitteredLon, 0), lat: jitteredLat, lon: jitteredLon, variant: 0 });
      }

      // Add one guaranteed dot for each Pacific island anchor.
      for (const island of PACIFIC_ISLAND_DOTS) {
        const variant = 700 + getContinentIndex(island.lat, island.lon);
        countryFillPoints.push({
          ...toCartesian(island.lat, island.lon, variant),
          lat: island.lat,
          lon: island.lon,
          variant,
        });
      }

      generationReady = true;
      console.log('[SplashGlobe] points generated', {
        quality,
        continentOutlineLines: continentOutlineLines.length,
        continentFill: continentFillPoints.length,
        countryOutlineLines: countryOutlineLines.length,
        countryFill: countryFillPoints.length,
        ocean: oceanPoints.length,
      });
    };

    const colorForMode = (
      mode: 'continentFill' | 'continentOutline' | 'countryFill' | 'countryOutline' | 'ocean',
      point: { lat: number; lon: number; variant: number },
      rotatedX = 0,
      rotatedY = 0,
      rotatedZ = 0,
    ) => {
      if (mode === 'ocean') return 'rgb(199 210 254)';
      const continentIndex = getContinentIndex(point.lat, point.lon);
      if (continentIndex === 6) {
        if (mode === 'countryOutline') return 'rgb(129 140 248)';
        if (mode === 'continentOutline') return 'rgb(165 180 252)';
        if (mode === 'countryFill') return 'rgb(199 210 254)';
        return 'rgb(224 231 255)';
      }
      const xNorm = (rotatedX / GLOBE_RADIUS + 1) * 0.5;
      const yNorm = 1 - (rotatedY / GLOBE_RADIUS + 1) * 0.5;
      const frontNorm = clamp((rotatedZ / GLOBE_RADIUS + 1) * 0.5, 0, 1);
      const continentShift = (continentIndex - 3) * 0.03;
      const swirlBias = (rotatedX * 0.65 + rotatedY * 0.35) / (GLOBE_RADIUS * 1.45);
      // Anchor the strongest color handoff at the front-center of the globe.
      const centerDistance = Math.hypot(xNorm - 0.5, yNorm - 0.5);
      const isFront = frontNorm > 0.5;
      const centerFrontMask = isFront ? Math.exp(-Math.pow(centerDistance / 0.28, 2)) : 0;
      const centerTransition = (frontNorm - 0.5) * 0.64 * centerFrontMask;
      const baseT = clamp(
        xNorm * 0.82 + yNorm * 0.12 + continentShift + swirlBias * 0.13 + centerTransition,
        0,
        1,
      );
      // Keep the near hemisphere predominantly purple while softly rolling the
      // far hemisphere toward a smooth pink cast for depth separation.
      const frontWeight = Math.pow(frontNorm, 1.15);
      const purpleForwardT = clamp(0.28 + baseT * 0.46, 0, 1);
      // Blend cool and rosy far-side tones so pink appears when the hemisphere
      // rotates away, but transitions smoothly as it comes forward.
      const coolFarSideT = clamp(0.058 + xNorm * 0.042 + yNorm * 0.022, 0.045, 0.165);
      const rosyFarSideT = clamp(0.03 + xNorm * 0.028 + yNorm * 0.018, 0.022, 0.11);
      const farSideWeight = Math.pow(1 - frontNorm, 1.24);
      const farSideBlendT = lerp(coolFarSideT, rosyFarSideT, farSideWeight * 0.82);
      const depthBiasedT = lerp(farSideBlendT, purpleForwardT, frontWeight);
      const gradientT = Math.pow(depthBiasedT, 0.78);
      if (mode === 'countryFill') return gradientColorAt(gradientT, 1.14);
      if (mode === 'countryOutline') return 'rgb(129 140 248)';
      if (mode === 'continentOutline') return gradientColorAt(gradientT, 1.28);
      return gradientColorAt(gradientT, 1.38);
    };

    const drawPoints = (
      sourcePoints: GlobePoint[],
      cx: number,
      cy: number,
      cosY: number,
      sinY: number,
      cosX: number,
      sinX: number,
      mode: 'continentFill' | 'continentOutline' | 'countryFill' | 'countryOutline' | 'ocean',
      globeScale: number,
      stride: number,
      hemisphere: 'back' | 'front',
    ) => {
      const rotateAndProjectPoint = (point: GlobePoint) => {
        const x1 = point.x * cosY + point.z * sinY;
        const z1 = -point.x * sinY + point.z * cosY;
        const y2 = point.y * cosX - z1 * sinX;
        const z2 = point.y * sinX + z1 * cosX;
        if (z2 < -GLOBE_RADIUS * 0.999) return null;
        const scale = DEPTH / (DEPTH - z2);
        return { x: x1, y: y2, z: z2, scale };
      };

      const hemisphereStride = hemisphere === 'back'
        ? Math.max(1, Math.floor(stride * 0.52))
        : stride;
      for (let i = 0; i < sourcePoints.length; i += hemisphereStride) {
        const point = sourcePoints[i];
        const projected = rotateAndProjectPoint(point);
        if (!projected) continue;
        if (hemisphere === 'front' && projected.z < 0) continue;
        if (hemisphere === 'back' && projected.z >= 0) continue;

        const depthAlpha = Math.max(
          0.08,
          Math.min(0.96, (projected.z + GLOBE_RADIUS) / (GLOBE_RADIUS * 2) + 0.22),
        );
        const sizeBase = mode === 'ocean' ? 0.9 : (mode === 'continentFill' ? 1.32 : mode === 'countryFill' ? 1.46 : 1.02);
        const size = Math.max(0.52, sizeBase * projected.scale) * globeScale;
        const dotDiameter = size * 0.5;
        const dotRadius = Math.max(mode === 'ocean' ? 0.34 : 0.45, dotDiameter * 0.5);

        const frontAlphaBase = mode === 'ocean'
          ? depthAlpha * 0.34
          : mode === 'continentFill'
            ? depthAlpha * 1.0
            : mode === 'countryFill'
              ? depthAlpha * 1.12
              : mode === 'countryOutline'
                ? depthAlpha * 0.92
                : depthAlpha * 1.04;
        const hemisphereAlpha = hemisphere === 'back'
          ? (() => {
            const backBase = frontAlphaBase * (mode === 'ocean' ? 0.58 : mode === 'continentFill' ? 0.72 : 0.66);
            // Keep far-side fill present enough to avoid a center "donut" hole.
            const minBackAlpha = mode === 'ocean' ? 0.14 : mode === 'continentFill' ? 0.22 : 0.2;
            return Math.min(1, Math.max(minBackAlpha, backBase));
          })()
          : Math.min(1, frontAlphaBase);
        ctx.globalAlpha = hemisphereAlpha;

        ctx.fillStyle = colorForMode(mode, point, projected.x, projected.y, projected.z);
        const px = cx + projected.x * projected.scale * globeScale;
        const py = cy - projected.y * projected.scale * globeScale;
        if (dotRadius <= 0.95) {
          const side = dotRadius * 1.7;
          ctx.fillRect(px - side * 0.5, py - side * 0.5, side, side);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawLines = (
      lines: GlobeOutlineLine[],
      cx: number,
      cy: number,
      cosY: number,
      sinY: number,
      cosX: number,
      sinX: number,
      mode: 'continentOutline' | 'countryOutline',
      globeScale: number,
      pointStride: number,
    ) => {
      const rotateAndProjectPoint = (point: GlobePoint, minVisibleZ: number) => {
        const x1 = point.x * cosY + point.z * sinY;
        const z1 = -point.x * sinY + point.z * cosY;
        const y2 = point.y * cosX - z1 * sinX;
        const z2 = point.y * sinX + z1 * cosX;
        if (z2 <= minVisibleZ) return null;
        const scale = DEPTH / (DEPTH - z2);
        return { x: x1, y: y2, z: z2, scale };
      };
      const snapToPixel = (value: number) => (isMobileViewport ? value : Math.round(value) + 0.5);

      // Keep geopolitical outlines intentionally very thin so they read as subtle structure.
      const lineWidthBase = mode === 'countryOutline' ? 0.66 : 0.13;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 2;
      for (const line of lines) {
        let started = false;
        let visibleSegments = 0;
        let zAccum = 0;
        let xAccum = 0;
        let yAccum = 0;
        ctx.beginPath();

        for (let i = 0; i < line.points.length; i += pointStride) {
          const point = line.points[i];
          const projected = rotateAndProjectPoint(point, -GLOBE_RADIUS * 0.96);
          if (!projected) {
            started = false;
            continue;
          }

          const px = cx + projected.x * projected.scale * globeScale;
          const py = cy - projected.y * projected.scale * globeScale;
          const sx = snapToPixel(px);
          const sy = snapToPixel(py);
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
            visibleSegments += 1;
            zAccum += projected.z;
            xAccum += projected.x;
            yAccum += projected.y;
          }
        }

        if (visibleSegments === 0) continue;

        const avgZ = zAccum / Math.max(1, visibleSegments);
        const avgX = xAccum / Math.max(1, visibleSegments);
        const avgY = yAccum / Math.max(1, visibleSegments);
        const depthAlpha = Math.max(0.2, Math.min(0.95, (avgZ + GLOBE_RADIUS) / (GLOBE_RADIUS * 2) + 0.25));
        ctx.globalAlpha = mode === 'countryOutline' ? depthAlpha * 1.0 : depthAlpha * 0.82;
        const samplePoint = line.points[0] ?? { lat: 0, lon: 0, variant: line.variant };
        ctx.strokeStyle = colorForMode(mode, samplePoint, avgX, avgY, avgZ);
        const minWidth = mode === 'countryOutline' ? 0.58 : 0.1;
        ctx.lineWidth = Math.max(minWidth, lineWidthBase * globeScale);
        ctx.stroke();
      }
    };

    const getLayout = () => {
      const perspectiveMax = DEPTH / (DEPTH - GLOBE_RADIUS);
      const projectedRadiusMax = GLOBE_RADIUS * perspectiveMax;
      // Keep the full globe visible while filling as much of the viewport as possible.
      const targetRadius = Math.min(width, height) * 0.49 * sizeMultiplier;
      const globeScale = targetRadius / projectedRadiusMax;
      const cx = width * 0.5;
      const cy = height * 0.5;
      return { cx, cy, globeScale };
    };

    const frame = (now: number) => {
      if (lastFrameNow === 0) lastFrameNow = now;
      const rawDeltaMs = now - lastFrameNow;
      lastFrameNow = now;
      smoothedDeltaMs = getSmoothedFrameDeltaMs(rawDeltaMs, smoothedDeltaMs);
      const frameDeltaMs = smoothedDeltaMs;
      elapsedSeconds += frameDeltaMs * 0.001;
      qualitySampleAccumulatorMs += getFrameDeltaMs(rawDeltaMs);
      if (qualitySampleAccumulatorMs >= 80) {
        const qualityDeltaMs = isMobileViewport
          ? Math.min(qualitySampleAccumulatorMs, 30)
          : qualitySampleAccumulatorMs;
        adaptiveQualityStep = getNextQualityStep(adaptiveQualityStep, qualityDeltaMs);
        qualitySampleAccumulatorMs = 0;
      }

      ctx.clearRect(0, 0, width, height);

      if (!generationReady) {
        animationFrameId = requestAnimationFrame(frame);
        return;
      }

      const { cx, cy, globeScale } = getLayout();

      const rotY = (-startLongitude * Math.PI) / 180 + elapsedSeconds * AUTO_ROTATE_SPEED + dragYaw;
      const rotX = (AXIS_TILT_DEG * Math.PI) / 180 + dragPitch;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const oceanStride = getRenderStride(adaptiveQualityStep, 'ocean');
      const continentFillStride = getRenderStride(adaptiveQualityStep, 'continentFill');
      const countryFillStride = getRenderStride(adaptiveQualityStep, 'countryFill');
      const countryOutlineStride = getRenderStride(adaptiveQualityStep, 'countryOutline');
      const continentOutlineStride = getRenderStride(adaptiveQualityStep, 'continentOutline');

      for (const hemisphere of ['back', 'front'] as const) {
        drawPoints(
          oceanPoints,
          cx,
          cy,
          cosY,
          sinY,
          cosX,
          sinX,
          'ocean',
          globeScale,
          oceanStride,
          hemisphere,
        );
        drawPoints(
          continentFillPoints,
          cx,
          cy,
          cosY,
          sinY,
          cosX,
          sinX,
          'continentFill',
          globeScale,
          continentFillStride,
          hemisphere,
        );
        drawPoints(
          countryFillPoints,
          cx,
          cy,
          cosY,
          sinY,
          cosX,
          sinX,
          'countryFill',
          globeScale,
          countryFillStride,
          hemisphere,
        );

        if (hemisphere === 'front') {
          drawLines(
            countryOutlineLines,
            cx,
            cy,
            cosY,
            sinY,
            cosX,
            sinX,
            'countryOutline',
            globeScale,
            countryOutlineStride,
          );
          drawLines(
            continentOutlineLines,
            cx,
            cy,
            cosY,
            sinY,
            cosX,
            sinX,
            'continentOutline',
            globeScale,
            continentOutlineStride,
          );
        }
      }

      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(frame);
    };

    const init = async () => {
      try {
        if (!cachedPrecomputedSplashDots) {
          try {
            console.log('[SplashGlobe] loading /splash-globe-fast.json');
            const dotsResponse = await fetch('/splash-globe-fast.json', { cache: 'force-cache' });
            if (dotsResponse.ok) {
              cachedPrecomputedSplashDots = (await dotsResponse.json()) as PrecomputedSplashDotData;
              console.log('[SplashGlobe] precomputed splash dots loaded');
            } else {
              console.log('[SplashGlobe] precomputed splash dots not found; runtime generation will be used');
            }
          } catch (precomputeError) {
            console.log('[SplashGlobe] precomputed splash dots load skipped', precomputeError);
          }
        }

        if (!cachedLandGeoJson) {
          console.log('[SplashGlobe] loading /land.geojson');
          const landResponse = await fetch('/land.geojson', { cache: 'force-cache' });
          if (!landResponse.ok) {
            throw new Error(`land.geojson load failed: ${landResponse.status}`);
          }
          cachedLandGeoJson = (await landResponse.json()) as GeoJsonData;
        }

        const landGeoJson = cachedLandGeoJson;
        landGeoJsonRef = landGeoJson;
        buildLandMask(landGeoJson);
        buildEarthPoints('fast', cachedPrecomputedSplashDots);

        if (qualityMode === 'fast') {
          return;
        }

        void (async () => {
          try {
            if (!cachedCountriesGeoJson) {
              const cachedLocalStorageGeoJson = readCachedCountriesGeoJson();
              if (cachedLocalStorageGeoJson) {
                cachedCountriesGeoJson = cachedLocalStorageGeoJson;
                console.log('[SplashGlobe] countries geojson loaded (localStorage cache)');
              }
            }

            if (!cachedCountriesGeoJson) {
              const countriesResponse = await fetch('/countries.geojson', { cache: 'force-cache' });
              if (countriesResponse.ok) {
                cachedCountriesGeoJson = (await countriesResponse.json()) as GeoJsonData;
                console.log('[SplashGlobe] countries geojson loaded (local file)');
                writeCachedCountriesGeoJson(cachedCountriesGeoJson);
              } else {
                console.log('[SplashGlobe] countries.geojson not found locally; trying remote fallbacks');
                const lastFailureTs = readRemoteFailureTimestamp();
                const shouldSkipRemoteRetry = Date.now() - lastFailureTs < COUNTRIES_REMOTE_RETRY_BACKOFF_MS;
                if (shouldSkipRemoteRetry) {
                  console.log('[SplashGlobe] skipping remote countries retry due to recent failure', {
                    lastFailureTs,
                  });
                } else {
                  for (const url of REMOTE_COUNTRIES_GEOJSON_URLS) {
                    try {
                      const remoteResponse = await fetch(url, { cache: 'force-cache' });
                      if (!remoteResponse.ok) {
                        console.log('[SplashGlobe] remote countries source failed', {
                          url,
                          status: remoteResponse.status,
                        });
                        continue;
                      }
                      cachedCountriesGeoJson = (await remoteResponse.json()) as GeoJsonData;
                      console.log('[SplashGlobe] countries geojson loaded (remote fallback)', { url });
                      writeCachedCountriesGeoJson(cachedCountriesGeoJson);
                      break;
                    } catch (remoteError) {
                      console.log('[SplashGlobe] remote countries source error', { url, remoteError });
                    }
                  }
                  if (!cachedCountriesGeoJson) {
                    writeRemoteFailureTimestamp();
                  }
                }
                if (!cachedCountriesGeoJson) {
                  console.log('[SplashGlobe] no countries geojson available; using land features for country layer fallback');
                }
              }
            }

            if (cachedCountriesGeoJson) {
              countryGeoJsonRef = cachedCountriesGeoJson;
              console.log('[SplashGlobe] countries geojson loaded');
            }
          } catch (countryError) {
            console.log('[SplashGlobe] countries outline load skipped', countryError);
          }

          window.setTimeout(() => buildEarthPoints('full'), 0);
        })();
      } catch (error) {
        console.log('[SplashGlobe] initialization error', error);
      }
    };

    resize();
    init();
    animationFrameId = requestAnimationFrame(frame);

    const handlePointerDown = (event: PointerEvent) => {
      if (!interactive) return;
      isPointerDown = true;
      activePointerId = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      pointerMoved = false;
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!interactive || !isPointerDown || activePointerId !== event.pointerId) return;
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        pointerMoved = true;
      }
      dragYaw += dx * 0.0065;
      dragPitch = clamp(dragPitch - dy * 0.0034, -0.42, 0.42);
    };

    const handlePointerUpOrCancel = (event: PointerEvent) => {
      if (!interactive || activePointerId !== event.pointerId) return;
      isPointerDown = false;
      activePointerId = null;
      if (pointerMoved) suppressNextClick = true;
      pointerMoved = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!interactive) return;
      if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUpOrCancel);
    canvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    canvas.addEventListener('click', handleClickCapture, true);
    window.addEventListener('resize', resize);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUpOrCancel);
      canvas.removeEventListener('pointercancel', handlePointerUpOrCancel);
      canvas.removeEventListener('click', handleClickCapture, true);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [sizeMultiplier, qualityMode, startLongitude, interactive, isLiveMode]);

  const showPreRenderedLoop = usePreRenderedLoop && !isLiveMode;
  const activateLiveMode = () => {
    if (!showPreRenderedLoop) return;
    console.log('[SplashGlobe] switching from pre-rendered loop to live canvas mode');
    setIsLiveMode(true);
  };

  return (
    <>
      {showPreRenderedLoop && (
        <>
          <img
            src={PRE_RENDERED_GLOBE_LOOP_SRC}
            alt=""
            aria-hidden="true"
            data-testid="splash-globe-preview"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          {interactive && (
            <button
              type="button"
              data-testid="splash-globe-activate-live"
              aria-label="Enable interactive globe"
              className="absolute inset-0 h-full w-full cursor-grab bg-transparent"
              onPointerDown={activateLiveMode}
              onClick={activateLiveMode}
            />
          )}
        </>
      )}
      {!showPreRenderedLoop && (
        <canvas
          ref={canvasRef}
          data-testid="splash-globe-canvas"
          data-quality-mode={qualityMode}
          className="absolute inset-0 h-full w-full"
          style={{
            touchAction: interactive ? 'none' : 'auto',
            cursor: interactive ? 'grab' : 'default',
            userSelect: 'none',
          }}
        />
      )}
    </>
  );
}

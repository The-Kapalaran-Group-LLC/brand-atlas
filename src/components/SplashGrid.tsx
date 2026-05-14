import { useEffect, useRef } from 'react';
import {
  getFrameDeltaMs,
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
const START_LONGITUDE = 121;
const AUTO_ROTATE_SPEED = 0.176;
const AXIS_TILT_DEG = 23.4;
const DEPTH = 600;
const CONTINENT_INDIGO_COLORS = [
  'rgb(128 105 255)', // North America
  'rgb(146 114 255)', // South America
  'rgb(162 123 255)', // Europe
  'rgb(178 132 255)', // Africa
  'rgb(194 141 255)', // Asia
  'rgb(210 150 255)', // Oceania
  'rgb(226 159 255)', // Antarctica
] as const;
const CONTINENT_INDIGO_DARK_COLORS = [
  'rgb(89 62 233)', // North America
  'rgb(104 70 235)', // South America
  'rgb(117 78 238)', // Europe
  'rgb(129 86 240)', // Africa
  'rgb(141 94 242)', // Asia
  'rgb(154 103 245)', // Oceania
  'rgb(167 112 247)', // Antarctica
] as const;

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
  onGlobeReady?: () => void;
};

export function SplashGrid({ sizeMultiplier = 1, onGlobeReady }: SplashGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
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
    let adaptiveQualityStep = 0;

    let generationReady = false;
    let hasNotifiedReady = false;
    let landGeoJsonRef: GeoJsonData | null = null;
    let countryGeoJsonRef: GeoJsonData | null = null;

    const continentOutlineLines: GlobeOutlineLine[] = [];
    const continentFillPoints: GlobePoint[] = [];
    const countryOutlineLines: GlobeOutlineLine[] = [];
    const countryFillPoints: GlobePoint[] = [];
    const oceanPoints: GlobePoint[] = [];

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
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

    const buildEarthPoints = (quality: GlobeBuildQuality = 'full') => {
      const isFast = quality === 'fast';
      const rng = createRng(isFast ? 0x5eed1234 : 0x5eed5678);
      continentOutlineLines.length = 0;
      continentFillPoints.length = 0;
      countryOutlineLines.length = 0;
      countryFillPoints.length = 0;
      oceanPoints.length = 0;

      const landData = landGeoJsonRef ?? { features: [] };
      appendOutlineLinesFromGeoJson(landData, continentOutlineLines, isFast ? 0.36 : 0.22, 0);

      if (countryGeoJsonRef) {
        appendOutlineLinesFromGeoJson(countryGeoJsonRef, countryOutlineLines, isFast ? 0.38 : 0.24, 300);
        appendFillDotsFromGeoJson(
          countryGeoJsonRef,
          continentFillPoints,
          isFast ? 1.2 : 0.86,
          0.08,
          isFast ? 0.32 : 0.42,
          isFast ? 52000 : 100000,
          true,
          rng,
          25,
          { populationWeighted: true, variantByContinent: true },
        );
        appendFillDotsFromGeoJson(
          countryGeoJsonRef,
          countryFillPoints,
          isFast ? 1.05 : 0.7,
          0.08,
          isFast ? 0.36 : 0.5,
          isFast ? 82000 : 170000,
          true,
          rng,
          300,
          { populationWeighted: true, populationHotspots: true, variantByContinent: false },
        );
      } else {
        appendOutlineLinesFromGeoJson(landData, countryOutlineLines, isFast ? 0.52 : 0.42, 300);
        appendFillDotsFromGeoJson(
          landData,
          continentFillPoints,
          isFast ? 0.96 : 0.64,
          0.08,
          isFast ? 0.4 : 0.58,
          isFast ? 58000 : 105000,
          true,
          rng,
          25,
          { populationHotspots: true },
        );
        appendFillDotsFromGeoJson(
          landData,
          countryFillPoints,
          isFast ? 1.2 : 0.92,
          0.1,
          isFast ? 0.3 : 0.46,
          isFast ? 52000 : 112000,
          true,
          rng,
          300,
          { populationHotspots: true },
        );
      }

      const oceanTarget = isFast ? 1600 : 3000;
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

      generationReady = true;
      if (!hasNotifiedReady) {
        hasNotifiedReady = true;
        onGlobeReady?.();
      }
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
    ) => {
      if (mode === 'ocean') return 'rgb(156 182 238)';
      const continentIndex = getContinentIndex(point.lat, point.lon);
      if (mode === 'countryFill') return CONTINENT_INDIGO_DARK_COLORS[continentIndex];
      return CONTINENT_INDIGO_COLORS[continentIndex];
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
    ) => {
      const rotateAndProjectPoint = (point: GlobePoint, minVisibleZ: number) => {
        const x1 = point.x * cosY + point.z * sinY;
        const z1 = -point.x * sinY + point.z * cosY;
        const y2 = point.y * cosX - z1 * sinX;
        const z2 = point.y * sinX + z1 * cosX;
        if (z2 < minVisibleZ) return null;
        const scale = DEPTH / (DEPTH - z2);
        return { x: x1, y: y2, z: z2, scale };
      };

      const startIndex = 0;
      for (let i = startIndex; i < sourcePoints.length; i += stride) {
        const point = sourcePoints[i];
        const projected = rotateAndProjectPoint(point, -GLOBE_RADIUS * 0.98);
        if (!projected) continue;

        const depthAlpha = Math.max(
          0.08,
          Math.min(0.96, (projected.z + GLOBE_RADIUS) / (GLOBE_RADIUS * 2) + 0.22),
        );
        const sizeBase = mode === 'ocean' ? 0.9 : (mode === 'continentFill' ? 1.32 : mode === 'countryFill' ? 1.46 : 1.02);
        const size = Math.max(0.52, sizeBase * projected.scale) * globeScale;
        const dotDiameter = size * 0.5;
        const dotRadius = Math.max(mode === 'ocean' ? 0.34 : 0.45, dotDiameter * 0.5);

        if (mode === 'ocean') ctx.globalAlpha = Math.min(1, depthAlpha * 0.34);
        else if (mode === 'continentFill') ctx.globalAlpha = Math.min(1, depthAlpha * 0.72);
        else if (mode === 'countryFill') ctx.globalAlpha = Math.min(1, depthAlpha * 0.98);
        else if (mode === 'countryOutline') ctx.globalAlpha = Math.min(1, depthAlpha * 0.78);
        else ctx.globalAlpha = Math.min(1, depthAlpha * 0.92);

        ctx.fillStyle = colorForMode(mode, point);
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

      const lineWidthBase = mode === 'countryOutline' ? 0.38 : 0.34;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const line of lines) {
        let started = false;
        let visibleSegments = 0;
        let zAccum = 0;
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
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
            visibleSegments += 1;
            zAccum += projected.z;
          }
        }

        if (visibleSegments === 0) continue;

        const avgZ = zAccum / Math.max(1, visibleSegments);
        const depthAlpha = Math.max(0.2, Math.min(0.95, (avgZ + GLOBE_RADIUS) / (GLOBE_RADIUS * 2) + 0.25));
        ctx.globalAlpha = mode === 'countryOutline' ? depthAlpha * 0.72 : depthAlpha * 0.82;
        const samplePoint = line.points[0] ?? { lat: 0, lon: 0, variant: line.variant };
        ctx.strokeStyle = colorForMode(mode, samplePoint);
        const minWidth = mode === 'countryOutline' ? 0.45 : 0.24;
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
      return { cx, cy, targetRadius, globeScale };
    };

    const frame = (now: number) => {
      if (lastFrameNow === 0) lastFrameNow = now;
      const rawDeltaMs = now - lastFrameNow;
      lastFrameNow = now;
      const frameDeltaMs = getFrameDeltaMs(rawDeltaMs);
      elapsedSeconds += frameDeltaMs * 0.001;
      adaptiveQualityStep = getNextQualityStep(adaptiveQualityStep, rawDeltaMs);

      ctx.clearRect(0, 0, width, height);

      if (!generationReady) {
        animationFrameId = requestAnimationFrame(frame);
        return;
      }

      const { cx, cy, globeScale } = getLayout();

      const rotY = (-START_LONGITUDE * Math.PI) / 180 + elapsedSeconds * AUTO_ROTATE_SPEED;
      const rotX = (AXIS_TILT_DEG * Math.PI) / 180;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const oceanStride = getRenderStride(adaptiveQualityStep, 'ocean');
      const continentFillStride = getRenderStride(adaptiveQualityStep, 'continentFill');
      const countryFillStride = getRenderStride(adaptiveQualityStep, 'countryFill');
      const countryOutlineStride = getRenderStride(adaptiveQualityStep, 'countryOutline');
      const continentOutlineStride = getRenderStride(adaptiveQualityStep, 'continentOutline');

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
      );
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

      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(frame);
    };

    const init = async () => {
      try {
        console.log('[SplashGlobe] loading /land.geojson');
        const landResponse = await fetch('/land.geojson', { cache: 'no-store' });
        if (!landResponse.ok) {
          throw new Error(`land.geojson load failed: ${landResponse.status}`);
        }

        const landGeoJson = (await landResponse.json()) as GeoJsonData;
        landGeoJsonRef = landGeoJson;
        buildLandMask(landGeoJson);
        buildEarthPoints('fast');

        void (async () => {
          try {
            const countriesResponse = await fetch('/countries.geojson', { cache: 'no-store' });
            if (countriesResponse.ok) {
              countryGeoJsonRef = (await countriesResponse.json()) as GeoJsonData;
              console.log('[SplashGlobe] countries geojson loaded');
            } else {
              console.log('[SplashGlobe] countries.geojson not found; using land features for region-like country layer');
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

    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [onGlobeReady, sizeMultiplier]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="splash-globe-canvas"
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: 'auto', cursor: 'default', userSelect: 'none' }}
    />
  );
}

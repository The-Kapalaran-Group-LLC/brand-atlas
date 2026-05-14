import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStripeClusterDensity } from '../src/components/splashGlobePerf.ts';

const OUTPUT_FILE = 'public/splash-globe-fast.json';
const LAND_GEOJSON_FILE = 'public/land.geojson';
const RNG_SEED = 0x5eed1234;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeLon = (lon) => {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
};

const createRng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const POPULATION_HUBS = [
  { lat: 35.68, lon: 139.76, weight: 1.0 },
  { lat: 31.23, lon: 121.47, weight: 0.95 },
  { lat: 28.61, lon: 77.21, weight: 0.92 },
  { lat: 23.13, lon: 113.26, weight: 0.88 },
  { lat: 14.6, lon: 120.98, weight: 0.9 },
  { lat: -6.21, lon: 106.85, weight: 0.9 },
  { lat: 19.07, lon: 72.88, weight: 0.86 },
  { lat: 24.86, lon: 67.01, weight: 0.8 },
  { lat: 30.04, lon: 31.24, weight: 0.78 },
  { lat: 6.52, lon: 3.38, weight: 0.76 },
  { lat: 40.71, lon: -74.01, weight: 0.82 },
  { lat: 34.05, lon: -118.24, weight: 0.72 },
  { lat: 19.43, lon: -99.13, weight: 0.74 },
  { lat: -23.55, lon: -46.63, weight: 0.74 },
  { lat: -34.6, lon: -58.38, weight: 0.65 },
  { lat: 51.51, lon: -0.13, weight: 0.68 },
  { lat: 48.86, lon: 2.35, weight: 0.66 },
  { lat: 55.76, lon: 37.62, weight: 0.62 },
  { lat: 41.01, lon: 28.97, weight: 0.66 },
  { lat: 24.71, lon: 46.67, weight: 0.56 },
  { lat: 33.57, lon: -7.59, weight: 0.48 },
  { lat: -26.2, lon: 28.05, weight: 0.54 },
  { lat: -33.87, lon: 151.21, weight: 0.5 },
  { lat: 37.57, lon: 126.98, weight: 0.7 },
  { lat: 22.32, lon: 114.17, weight: 0.7 },
];

const wrappedLonDistance = (a, b) => {
  const direct = Math.abs(a - b);
  return Math.min(direct, 360 - direct);
};

const populationHotspotDensity = (lat, lon) => {
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

const unwrapRingLongitudes = (ring) => {
  if (!Array.isArray(ring) || ring.length === 0) return [];
  const unwrapped = [];
  let prevLon = ring[0]?.[0] ?? 0;
  unwrapped.push([prevLon, ring[0]?.[1] ?? 0]);
  for (let i = 1; i < ring.length; i += 1) {
    let lon = ring[i]?.[0] ?? 0;
    const lat = ring[i]?.[1] ?? 0;
    const delta = lon - prevLon;
    if (delta > 180) lon -= 360;
    if (delta < -180) lon += 360;
    unwrapped.push([lon, lat]);
    prevLon = lon;
  }
  return unwrapped;
};

const normalizeLonToRange = (lon, minLon, maxLon) => {
  let adjusted = lon;
  while (adjusted < minLon) adjusted += 360;
  while (adjusted > maxLon) adjusted -= 360;
  return adjusted;
};

const pointInRing = (lon, lat, ring) => {
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

const buildLandPolygons = (geojson) => {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const polygons = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry?.type || !geometry.coordinates) continue;
    const addPolygon = (polygon) => {
      const rings = polygon
        .map(unwrapRingLongitudes)
        .filter((ring) => Array.isArray(ring) && ring.length >= 3);
      if (rings.length === 0) return;
      const outer = rings[0];
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
      polygons.push({ minLon, maxLon, minLat, maxLat, outer, holes: rings.slice(1) });
    };

    if (geometry.type === 'Polygon') addPolygon(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) addPolygon(polygon);
    }
  }
  return polygons;
};

const isLandPoint = (lat, lon, polygons) => {
  for (const polygon of polygons) {
    if (lat < polygon.minLat || lat > polygon.maxLat) continue;
    const adjustedLon = normalizeLonToRange(lon, polygon.minLon, polygon.maxLon);
    if (adjustedLon < polygon.minLon || adjustedLon > polygon.maxLon) continue;
    if (!pointInRing(adjustedLon, lat, polygon.outer)) continue;
    if (polygon.holes.some((ring) => pointInRing(adjustedLon, lat, ring))) continue;
    return true;
  }
  return false;
};

const topUpWithLandSampling = (
  output,
  targetPoints,
  rng,
  polygons,
  jitterDeg,
  clusterBias,
  localDensityFn,
  variantBase,
) => {
  const maxAttempts = targetPoints * 80;
  for (let attempt = 0; attempt < maxAttempts && (output.length / 3) < targetPoints; attempt += 1) {
    const lat = -82 + rng() * 154;
    const lon = -180 + rng() * 360;
    if (!isLandPoint(lat, lon, polygons)) continue;
    const hotspot = localDensityFn ? localDensityFn(lat, lon) : 0;
    const cluster = getStripeClusterDensity(lat, lon);
    const keepChance = clamp((0.12 + hotspot * 0.24 + Math.pow(cluster, 1.2) * clusterBias), 0.04, 0.98);
    if (rng() > keepChance) continue;
    const jitteredLat = lat + (rng() - 0.5) * jitterDeg;
    const jitteredLon = normalizeLon(lon + (rng() - 0.5) * jitterDeg);
    const variant = variantBase + Math.floor(rng() * 7);
    output.push(
      Number(jitteredLat.toFixed(4)),
      Number(jitteredLon.toFixed(4)),
      variant,
    );
  }
};

const appendFillDotsFromPolygon = (
  polygon,
  output,
  sampleStepDeg,
  jitterDeg,
  keepChance,
  variant,
  maxPoints,
  reduceAntarctica,
  rng,
  localDensityFn,
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
    if ((output.length / 3) >= maxPoints) return;

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

    output.push(
      Number(jitteredLat.toFixed(4)),
      Number(normalizeLon(jitteredLon).toFixed(4)),
      variant,
    );
  }
};

const appendFillDotsFromGeoJson = (
  geojson,
  output,
  sampleStepDeg,
  jitterDeg,
  keepChance,
  maxPoints,
  reduceAntarctica,
  rng,
  variantOffset = 0,
  localDensityFn,
) => {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
    if ((output.length / 3) >= maxPoints) break;
    const feature = features[featureIndex];
    const geometry = feature.geometry;
    if (!geometry?.type || !geometry.coordinates) continue;
    const variant = featureIndex + variantOffset;

    if (geometry.type === 'Polygon') {
      appendFillDotsFromPolygon(
        geometry.coordinates,
        output,
        sampleStepDeg,
        jitterDeg,
        keepChance,
        variant,
        maxPoints,
        reduceAntarctica,
        rng,
        localDensityFn,
      );
      continue;
    }

    if (geometry.type === 'MultiPolygon') {
      const multi = geometry.coordinates;
      for (const polygon of multi) {
        if ((output.length / 3) >= maxPoints) break;
        appendFillDotsFromPolygon(
          polygon,
          output,
          sampleStepDeg,
          jitterDeg,
          keepChance,
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

const run = async () => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const landPath = path.join(repoRoot, LAND_GEOJSON_FILE);
  const outputPath = path.join(repoRoot, OUTPUT_FILE);

  console.log('[splash-precompute] reading land geojson from', landPath);
  const landRaw = await readFile(landPath, 'utf8');
  const landGeoJson = JSON.parse(landRaw);
  const rng = createRng(RNG_SEED);
  const landPolygons = buildLandPolygons(landGeoJson);

  const continentFill = [];
  const countryFill = [];

  appendFillDotsFromGeoJson(
    landGeoJson,
    continentFill,
    1.22,
    0.08,
    0.36,
    32000,
    true,
    rng,
    25,
    populationHotspotDensity,
  );

  appendFillDotsFromGeoJson(
    landGeoJson,
    countryFill,
    1.46,
    0.1,
    0.3,
    38000,
    true,
    rng,
    300,
    populationHotspotDensity,
  );

  topUpWithLandSampling(continentFill, 22000, rng, landPolygons, 0.14, 0.64, populationHotspotDensity, 25);
  topUpWithLandSampling(countryFill, 32000, rng, landPolygons, 0.18, 0.72, populationHotspotDensity, 300);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    seed: RNG_SEED,
    continentFill,
    countryFill,
  };

  await writeFile(outputPath, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log('[splash-precompute] wrote precomputed file', {
    outputPath,
    continentFillPoints: continentFill.length / 3,
    countryFillPoints: countryFill.length / 3,
  });
};

run().catch((error) => {
  console.error('[splash-precompute] failed', error);
  process.exitCode = 1;
});

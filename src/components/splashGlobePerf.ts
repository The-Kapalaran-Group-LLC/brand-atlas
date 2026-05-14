export const MIN_FRAME_DELTA_MS = 8;
export const MAX_FRAME_DELTA_MS = 40;
export const MAX_QUALITY_STEP = 5;

export type GlobeRenderMode =
  | 'continentFill'
  | 'continentOutline'
  | 'countryFill'
  | 'countryOutline'
  | 'ocean';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getFrameDeltaMs = (rawDeltaMs: number): number => {
  if (!Number.isFinite(rawDeltaMs) || rawDeltaMs <= 0) {
    return 16.67;
  }
  return clamp(rawDeltaMs, MIN_FRAME_DELTA_MS, MAX_FRAME_DELTA_MS);
};

export const getNextQualityStep = (currentStep: number, rawDeltaMs: number): number => {
  const step = clamp(Math.round(currentStep), 0, MAX_QUALITY_STEP);

  if (rawDeltaMs >= 40) return clamp(step + 2, 0, MAX_QUALITY_STEP);
  if (rawDeltaMs >= 26) return clamp(step + 1, 0, MAX_QUALITY_STEP);
  if (rawDeltaMs <= 14) return clamp(step - 1, 0, MAX_QUALITY_STEP);
  return step;
};

export const getRenderStride = (qualityStep: number, mode: GlobeRenderMode): number => {
  const step = clamp(Math.round(qualityStep), 0, MAX_QUALITY_STEP);

  if (mode === 'countryFill') return Math.min(3, 1 + step);
  if (mode === 'continentFill') return Math.min(3, 1 + Math.floor(step * 0.7));
  if (mode === 'countryOutline') return 1 + Math.floor(step * 0.7);
  if (mode === 'continentOutline') return 1 + Math.floor(step * 0.5);
  return Math.max(1, Math.floor((step + 2) / 2));
};

export const getInertiaDamping = (deltaMs: number): number => {
  const normalized = getFrameDeltaMs(deltaMs) / 16.67;
  return Math.pow(0.94, normalized);
};

const fract = (value: number) => value - Math.floor(value);

const hash2d = (x: number, y: number): number => {
  const dot = x * 127.1 + y * 311.7;
  return fract(Math.sin(dot) * 43758.5453123);
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const valueNoise2d = (x: number, y: number): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = x - x0;
  const ty = y - y0;
  const sx = smoothstep(0, 1, tx);
  const sy = smoothstep(0, 1, ty);

  const n00 = hash2d(x0, y0);
  const n10 = hash2d(x1, y0);
  const n01 = hash2d(x0, y1);
  const n11 = hash2d(x1, y1);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
};

const worley2d = (x: number, y: number): { nearest: number; edge: number } => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let nearest = Infinity;
  let secondNearest = Infinity;

  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const cx = ix + ox;
      const cy = iy + oy;
      const fx = cx + hash2d(cx + 31.4, cy - 47.2);
      const fy = cy + hash2d(cx - 19.7, cy + 13.6);
      const distance = Math.hypot(fx - x, fy - y);
      if (distance < nearest) {
        secondNearest = nearest;
        nearest = distance;
      } else if (distance < secondNearest) {
        secondNearest = distance;
      }
    }
  }

  const edge = clamp((secondNearest - nearest) * 2.1, 0, 1);
  return { nearest, edge };
};

export const getStripeClusterDensity = (lat: number, lon: number): number => {
  const latN = (lat + 90) / 180;
  const lonN = (lon + 180) / 360;
  const macro = valueNoise2d(latN * 1.65 + 7.1, lonN * 1.95 - 2.7);
  const detail = valueNoise2d(latN * 9.4 - 3.2, lonN * 8.7 + 4.8);
  const worley = worley2d(latN * 7.2 + 1.5, lonN * 8.4 - 0.6);
  const cellCore = 1 - smoothstep(0.18, 0.58, worley.nearest);
  const cellEdge = smoothstep(0.2, 0.95, worley.edge);
  const bands = 0.5 + 0.5 * Math.sin((lonN * 7.6 + latN * 3.1 + macro * 1.9) * Math.PI);

  const mixed = clamp(
    cellCore * 0.62
      + cellEdge * 0.18
      + macro * 0.16
      + detail * 0.08
      + bands * 0.12
      - 0.12,
    0,
    1,
  );
  const clustered = smoothstep(0.52, 0.94, mixed);
  return clamp(Math.pow(clustered, 1.75), 0, 1);
};

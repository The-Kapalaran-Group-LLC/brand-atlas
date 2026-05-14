import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { GifFrame, GifUtil, GifCodec } from 'gifwrap';

const WIDTH = 900;
const HEIGHT = 506;
const FRAME_COUNT = 120;
const FPS = 12;
const FRAME_DELAY_CS = Math.max(1, Math.round(100 / FPS));
const GLOBE_RADIUS = 220;
const DEPTH = 600;
const AXIS_TILT_DEG = 23.4;
const START_LONGITUDE = -74.006;
const SIZE_MULTIPLIER = 1.25;

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'public', 'assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'menupage-globe-loop.gif');
const DATA_FILE = path.join(ROOT, 'public', 'splash-globe-fast.json');

const INDIGO_GRADIENT_STOPS = [
  [255, 86, 210],
  [176, 78, 255],
  [76, 40, 232],
  [24, 12, 156],
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const gradientColorAt = (t, brightness = 1) => {
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
  return { r, g, b, hex: rgbToHex(r, g, b) };
};

const parseTriplets = (flatArray, stride) => {
  const points = [];
  for (let i = 0; i < flatArray.length; i += 3 * stride) {
    const lat = flatArray[i];
    const lon = flatArray[i + 1];
    const variant = flatArray[i + 2] ?? 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    points.push({
      x: GLOBE_RADIUS * cosLat * Math.cos(lonRad),
      y: GLOBE_RADIUS * Math.sin(latRad),
      z: GLOBE_RADIUS * cosLat * Math.sin(lonRad),
      variant,
    });
  }
  return points;
};

const layout = (() => {
  const perspectiveMax = DEPTH / (DEPTH - GLOBE_RADIUS);
  const projectedRadiusMax = GLOBE_RADIUS * perspectiveMax;
  const targetRadius = Math.min(WIDTH, HEIGHT) * 0.49 * SIZE_MULTIPLIER;
  const globeScale = targetRadius / projectedRadiusMax;
  return {
    cx: WIDTH * 0.5,
    cy: HEIGHT * 0.56,
    globeScale,
  };
})();

const staticSvgStart = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="pageBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fafafa"/>
      <stop offset="100%" stop-color="#f7f7fb"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
    <filter id="blur120"><feGaussianBlur stdDeviation="60"/></filter>
  </defs>

  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#pageBg)"/>

  <g opacity="0.55" filter="url(#blur120)">
    <circle cx="96" cy="72" r="120" fill="#c7d2fe"/>
    <circle cx="${WIDTH - 90}" cy="170" r="160" fill="#bae6fd"/>
    <circle cx="${WIDTH * 0.56}" cy="${HEIGHT - 36}" r="190" fill="#f5d0fe"/>
  </g>

  <g>
    <rect x="${WIDTH / 2 - 20}" y="16" width="40" height="40" rx="10" fill="#e0e7ff"/>
    <text x="${WIDTH / 2}" y="43" text-anchor="middle" font-size="17" fill="#4f46e5">✦</text>
    <text x="${WIDTH / 2 - 34}" y="78" text-anchor="end" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#09090b">Brand</text>
    <text x="${WIDTH / 2 - 30}" y="78" text-anchor="start" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="url(#brandGrad)">Atlas</text>

    <text x="${WIDTH / 2}" y="126" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="600" fill="#18181b">Choose Your Research Experience</text>
    <text x="${WIDTH / 2}" y="154" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="500" fill="#52525b">Start with cultural research, run a brand audit, or jump into a visual identity analysis.</text>
  </g>
`;

const staticSvgForeground = `
  <g opacity="0.94">
    <rect x="86" y="190" width="250" height="210" rx="22" fill="#ffffff" stroke="#e4e4e7"/>
    <rect x="355" y="190" width="250" height="210" rx="22" fill="#ffffff" stroke="#e4e4e7"/>
    <rect x="624" y="190" width="250" height="210" rx="22" fill="#ffffff" stroke="#e4e4e7"/>
    <text x="108" y="223" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#18181b">Cultural Archaeologist</text>
    <text x="377" y="223" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#18181b">Brand Navigator</text>
    <text x="646" y="223" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#18181b">Design Excavator</text>

    <text x="108" y="247" font-family="Arial, sans-serif" font-size="12" fill="#71717a">Generate sharper insights about any audience.</text>
    <text x="377" y="247" font-family="Arial, sans-serif" font-size="12" fill="#71717a">Audit brands to compare positioning and campaigns.</text>
    <text x="646" y="247" font-family="Arial, sans-serif" font-size="12" fill="#71717a">Compare design systems across brands.</text>

    <text x="108" y="274" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Audience research</text>
    <text x="108" y="293" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Strategy development</text>
    <text x="108" y="312" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Campaign ideation</text>

    <text x="377" y="274" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Brand audits &amp; comp analysis</text>
    <text x="377" y="293" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Opportunity space identification</text>
    <text x="377" y="312" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Messaging development</text>

    <text x="646" y="274" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Competitive research</text>
    <text x="646" y="293" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Visual identity exploration</text>
    <text x="646" y="312" font-family="Arial, sans-serif" font-size="11" fill="#71717a">• Creative briefs</text>

    <rect x="815" y="212" width="44" height="16" rx="8" fill="#e0e7ff" stroke="#c7d2fe"/>
    <text x="837" y="223" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#4338ca">BETA</text>
  </g>
`;

const staticSvgEnd = `</svg>`;

const renderGlobeDots = (points, rotY, cosX, sinX, dotBaseRadius, brightnessBias) => {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  let out = '';

  for (const point of points) {
    const x1 = point.x * cosY + point.z * sinY;
    const z1 = -point.x * sinY + point.z * cosY;
    const y2 = point.y * cosX - z1 * sinX;
    const z2 = point.y * sinX + z1 * cosX;

    const perspective = DEPTH / (DEPTH - z2);
    const px = layout.cx + x1 * perspective * layout.globeScale;
    const py = layout.cy - y2 * perspective * layout.globeScale;

    if (px < -4 || px > WIDTH + 4 || py < -4 || py > HEIGHT + 4) continue;

    const frontNorm = clamp((z2 / GLOBE_RADIUS + 1) * 0.5, 0, 1);
    const alpha = 0.11 + frontNorm * 0.78;
    const size = dotBaseRadius * (0.65 + perspective * 0.52);

    const xNorm = (x1 / GLOBE_RADIUS + 1) * 0.5;
    const yNorm = 1 - (y2 / GLOBE_RADIUS + 1) * 0.5;
    const swirlBias = (x1 * 0.65 + y2 * 0.35) / (GLOBE_RADIUS * 1.45);
    const gradientT = clamp(0.64 * yNorm + 0.23 * (1 - xNorm) + 0.13 * swirlBias, 0, 1);
    const brightness = 0.84 + frontNorm * 0.2 + brightnessBias;
    const color = gradientColorAt(gradientT, brightness);

    out += `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${size.toFixed(2)}" fill="${color.hex}" fill-opacity="${alpha.toFixed(3)}"/>`;
  }

  return out;
};

const loadPoints = async () => {
  console.log('[GIF] loading splash globe data from', DATA_FILE);
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);

  const continent = parseTriplets(data.continentFill || [], 9);
  const country = parseTriplets(data.countryFill || [], 7);

  console.log('[GIF] parsed points', {
    continent: continent.length,
    country: country.length,
  });

  return { continent, country };
};

const createFrameSvg = (frameIndex, points) => {
  const rotBase = (-START_LONGITUDE * Math.PI) / 180;
  const rotY = rotBase + (frameIndex / FRAME_COUNT) * Math.PI * 2;
  const rotX = (AXIS_TILT_DEG * Math.PI) / 180;
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);

  const backContinent = renderGlobeDots(points.continent, rotY + Math.PI, cosX, sinX, 0.56, -0.04);
  const backCountry = renderGlobeDots(points.country, rotY + Math.PI, cosX, sinX, 0.49, -0.03);
  const frontContinent = renderGlobeDots(points.continent, rotY, cosX, sinX, 0.65, 0.01);
  const frontCountry = renderGlobeDots(points.country, rotY, cosX, sinX, 0.54, 0.03);

  return `${staticSvgStart}\n<g opacity="0.66">${backContinent}${backCountry}</g>\n<g>${frontContinent}${frontCountry}</g>\n${staticSvgForeground}\n${staticSvgEnd}`;
};

const renderGif = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const points = await loadPoints();

  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    if (i % 10 === 0 || i === FRAME_COUNT - 1) {
      console.log(`[GIF] rendering frame ${i + 1}/${FRAME_COUNT}`);
    }

    const svg = createFrameSvg(i, points);
    const rendered = await sharp(Buffer.from(svg))
      .png({ compressionLevel: 9, quality: 96 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const frame = new GifFrame(rendered.info.width, rendered.info.height, rendered.data, {
      delayCentisecs: FRAME_DELAY_CS,
      disposalMethod: 1,
    });
    GifUtil.quantizeWu(frame, 192, 5);

    frames.push(frame);
  }

  console.log('[GIF] encoding gif');
  const codec = new GifCodec();
  await GifUtil.write(OUTPUT_FILE, frames, { loops: 0, colorScope: 2 }, codec);
  console.log('[GIF] complete:', OUTPUT_FILE);
};

renderGif().catch((error) => {
  console.error('[GIF] failed', error);
  process.exitCode = 1;
});

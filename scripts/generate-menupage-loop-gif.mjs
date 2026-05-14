import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { GifFrame, GifUtil, GifCodec } from 'gifwrap';

const WIDTH = 900;
const HEIGHT = 506;
const AUTO_ROTATE_SPEED = 0.176;
const ROTATION_PERIOD_SECONDS = (Math.PI * 2) / AUTO_ROTATE_SPEED;
const FRAME_DELAY_CS = 10;
const FRAME_COUNT = Math.round(ROTATION_PERIOD_SECONDS / (FRAME_DELAY_CS / 100));
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
    <g transform="translate(${WIDTH / 2 - 10},26)" stroke="#4f46e5" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6.2 0.9a1 1 0 0 1 1.96 0L9.2 6.45A2 2 0 0 0 10.8 8.05L16.35 9.1a1 1 0 0 1 0 1.96L10.8 12.11a2 2 0 0 0-1.6 1.6l-1.04 5.56a1 1 0 0 1-1.96 0L5.16 13.7a2 2 0 0 0-1.6-1.6L-2 11.06a1 1 0 0 1 0-1.96l5.56-1.05a2 2 0 0 0 1.6-1.6z"/>
      <path d="M14.8 0.3v3.1"/>
      <path d="M16.3 1.85h-3.1"/>
    </g>

    <text x="${WIDTH / 2 - 18}" y="74" text-anchor="end" font-family="Arial, sans-serif" font-size="29" font-weight="600" fill="#09090b">Brand</text>
    <text x="${WIDTH / 2 - 12}" y="74" text-anchor="start" font-family="Arial, sans-serif" font-size="29" font-weight="600" fill="url(#brandGrad)">Atlas</text>

    <text x="${WIDTH / 2}" y="126" text-anchor="middle" font-family="Arial, sans-serif" font-size="41" font-weight="600" fill="#18181b">Choose Your Research Experience</text>
    <text x="${WIDTH / 2}" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="500" fill="#52525b">Start with cultural research, run a brand audit, or jump into a visual identity analysis.</text>
  </g>
`;

const staticSvgForeground = `
  <g opacity="0.94">
    <rect x="72" y="196" width="244" height="248" rx="22" fill="#ffffff" stroke="#e4e4e7"/>
    <rect x="328" y="196" width="244" height="248" rx="22" fill="#ffffff" stroke="#e4e4e7"/>
    <rect x="584" y="196" width="244" height="248" rx="22" fill="#ffffff" stroke="#e4e4e7"/>

    <g transform="translate(92,214)" stroke="#27272a" fill="none" stroke-width="2" stroke-linecap="round">
      <path d="m16 16-3.8-3.8"/>
      <circle cx="9" cy="9" r="6.5"/>
    </g>
    <text x="116" y="232" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="#27272a">Cultural Archaeologist</text>

    <g transform="translate(348,214)" fill="#27272a">
      <path d="M2.8 11.2C2.3 11.4 2.3 12.2 2.8 12.4L10.8 15.4L13.7 22C13.9 22.5 14.7 22.5 14.9 22L21.6 4.6C21.8 4.1 21.3 3.6 20.8 3.8L2.8 11.2Z"/>
      <path d="M20.8 3.8L10.8 15.4L2.8 12.4L20.8 3.8Z" fill="#ffffff" opacity="0.28"/>
    </g>
    <text x="372" y="232" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="#27272a">Brand Navigator</text>

    <g transform="translate(604,214)" stroke="#27272a" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/>
      <circle cx="13.5" cy="6.5" r=".5" fill="#27272a"/>
      <circle cx="17.5" cy="10.5" r=".5" fill="#27272a"/>
      <circle cx="6.5" cy="12.5" r=".5" fill="#27272a"/>
      <circle cx="8.5" cy="7.5" r=".5" fill="#27272a"/>
    </g>
    <text x="628" y="232" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="#27272a">Design Excavator</text>

    <text x="92" y="260" font-family="Arial, sans-serif" font-size="14" fill="#71717a">Generate sharper insights about any audience through a cultural lens.</text>
    <text x="348" y="260" font-family="Arial, sans-serif" font-size="14" fill="#71717a">Audit multiple brands to compare positionings, messages, campaigns, etc.</text>
    <text x="604" y="260" font-family="Arial, sans-serif" font-size="14" fill="#71717a">Compare design systems across brands: logos, colors, typography, visual cues.</text>

    <text x="92" y="287" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Audience research</text>
    <text x="92" y="306" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Strategy development</text>
    <text x="92" y="325" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Campaign &amp; content ideation</text>
    <text x="92" y="344" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Creative briefs</text>
    <text x="92" y="363" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Pitches</text>

    <text x="348" y="287" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Brand audits &amp; competitive analysis</text>
    <text x="348" y="306" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Opportunity space identification</text>
    <text x="348" y="325" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Messaging development</text>
    <text x="348" y="344" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Creative briefs</text>
    <text x="348" y="363" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Pitches</text>

    <text x="604" y="287" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Competitive research</text>
    <text x="604" y="306" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Branding strategy development</text>
    <text x="604" y="325" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Visual identity exploration</text>
    <text x="604" y="344" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Creative briefs</text>
    <text x="604" y="363" font-family="Arial, sans-serif" font-size="12" fill="#71717a">• Pitches</text>

    <rect x="774" y="216" width="40" height="16" rx="8" fill="#e0e7ff" stroke="#c7d2fe"/>
    <text x="794" y="227" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#4338ca">Beta</text>
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
  const elapsedSeconds = frameIndex * (FRAME_DELAY_CS / 100);
  const rotY = rotBase + elapsedSeconds * AUTO_ROTATE_SPEED;
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

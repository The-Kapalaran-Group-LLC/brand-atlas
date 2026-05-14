import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { GifFrame, GifUtil, GifCodec } from 'gifwrap';

const DEFAULT_URL = 'https://brandatlas.vercel.app/?home=1';
const AUTO_ROTATE_SPEED = 0.176;
const ROTATION_PERIOD_SECONDS = (Math.PI * 2) / AUTO_ROTATE_SPEED;
const FRAME_DELAY_CS = 10;
const FRAME_COUNT = Math.round(ROTATION_PERIOD_SECONDS / (FRAME_DELAY_CS / 100));

const argMap = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.split('=');
    return [k.replace(/^--/, ''), rest.join('=') || 'true'];
  }),
);

const targetUrl = argMap.url || DEFAULT_URL;
const width = Number(argMap.width || 1440);
const height = Number(argMap.height || 900);
const outputFile = path.resolve(argMap.out || 'public/assets/menupage-globe-loop.gif');
const warmupMs = Number(argMap.warmupMs || 2200);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium',
    );
  }
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function run() {
  console.log('[GIF] capture settings', {
    targetUrl,
    width,
    height,
    outputFile,
    frameCount: FRAME_COUNT,
    frameDelayCentisecs: FRAME_DELAY_CS,
    durationSeconds: Number((FRAME_COUNT * FRAME_DELAY_CS / 100).toFixed(2)),
  });

  const { chromium } = await getPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // Reduce nondeterminism so every loop export is stable.
  await page.addInitScript(() => {
    const fixedNow = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DateAny = Date;
    // @ts-ignore
    Date = class extends DateAny {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedNow);
        } else {
          super(...args);
        }
      }
      static now() {
        return fixedNow;
      }
    };
  });

  console.log('[GIF] navigating to deployed menu page');
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 120000 });

  // Try to ensure we are on the menu home state.
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('home', '1');
    window.history.replaceState({}, '', url.toString());
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  await sleep(warmupMs);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'menupage-gif-'));
  console.log('[GIF] temp frame dir:', tmpDir);

  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    if (i % 20 === 0 || i === FRAME_COUNT - 1) {
      console.log(`[GIF] capturing frame ${i + 1}/${FRAME_COUNT}`);
    }

    const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });
    const raw = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const frame = new GifFrame(raw.info.width, raw.info.height, raw.data, {
      delayCentisecs: FRAME_DELAY_CS,
      disposalMethod: 1,
    });

    GifUtil.quantizeWu(frame, 192, 5);
    frames.push(frame);

    await sleep(FRAME_DELAY_CS * 10);
  }

  console.log('[GIF] encoding gif');
  await ensureDir(outputFile);
  const codec = new GifCodec();
  await GifUtil.write(outputFile, frames, { loops: 0, colorScope: 2 }, codec);
  console.log('[GIF] complete:', outputFile);

  await context.close();
  await browser.close();
}

run().catch((error) => {
  console.error('[GIF] failed', error);
  process.exitCode = 1;
});

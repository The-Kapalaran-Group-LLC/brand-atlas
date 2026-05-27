import fs from 'fs';
import { chromium } from 'playwright';

const url = process.env.SPLASH_URL || 'http://127.0.0.1:3001/#brand-navigator';
const out = process.env.SPLASH_OUT || 'public/splash-static-source.png';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

// Try multiple selectors/strategies so we can capture reliably.
const splash = page.locator('[data-testid="splash-screen"]');
if (await splash.count()) {
  await splash.first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(200);
  await splash.first().screenshot({ path: out });
} else {
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: false });
}

await browser.close();

if (!fs.existsSync(out)) {
  throw new Error(`Failed to create ${out}`);
}
console.log(`Captured splash screenshot: ${out}`);

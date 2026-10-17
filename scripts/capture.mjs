import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.screenshot({ path: 'artifacts/studio-desktop.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'artifacts/studio-mobile.png', fullPage: true });
console.log(
  JSON.stringify({
    errors,
    labels: await page.locator('.player-label').allTextContents(),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    fps: await page.locator('.arena-canvas').getAttribute('data-fps'),
  }),
);
await browser.close();

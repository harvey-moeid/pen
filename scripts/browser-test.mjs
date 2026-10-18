import { chromium, expect as baseExpect } from '@playwright/test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHmac, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const expect = baseExpect.configure({ timeout: 15000 });
const out = resolve('artifacts');
await mkdir(out, { recursive: true });
const store = await mkdtemp(join(tmpdir(), 'pen-browser-'));
const password = randomBytes(32).toString('hex'),
  signing = randomBytes(32).toString('hex');
const bundled = await build({
  entryPoints: ['src/server/worker.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  external: ['cloudflare:workers', 'node:crypto'],
  conditions: ['workerd', 'worker', 'browser'],
});
const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
};
const root = resolve('dist');
const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    name: 'browser-test',
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-10-17',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { ROOMS: { className: 'MatchRoom', useSQLite: true } },
    kvNamespaces: ['CONFIG'],
    r2Buckets: ['MEDIA'],
    bindings: { ADMIN_SECRET: password, WEBHOOK_SIGNING_SECRET: signing },
    serviceBindings: {
      ASSETS: async (request) => {
        let path = resolve(root, '.' + decodeURIComponent(new URL(request.url).pathname));
        if (!path.startsWith(root + '/')) path = join(root, 'index.html');
        try {
          await access(path);
          if (!extname(path)) throw Error('SPA');
        } catch {
          path = join(root, 'index.html');
        }
        return new Response(await readFile(path), {
          headers: { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' },
        });
      },
    },
  }),
  resourcePersistencePath: store,
});
let browser;
const checks = [],
  errors = [],
  networkErrors = [];
try {
  const base = (await mf.ready).origin;
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (await access('/usr/bin/chromium')
      .then(() => '/usr/bin/chromium')
      .catch(() => undefined));
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    if (!r.failure()?.errorText.includes('ABORTED')) networkErrors.push(r.url());
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('.player-label')).toHaveCount(5);
  await expect(page.locator('.arena-error')).toHaveCount(0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(out, 'studio-desktop.png'), fullPage: true });
  checks.push('Desktop 1440px: 5 clubs visible, no overflow');
  await page.getByRole('button', { name: 'Reset simulasi' }).click();
  await expect(page.locator('.player-label.active')).toHaveCount(0);
  await page.waitForTimeout(500);
  const initialPositions = await page.locator('.player-label').evaluateAll((nodes) =>
    nodes.map((n) => ({
      text: n.textContent,
      x: n.getBoundingClientRect().x,
      y: n.getBoundingClientRect().y,
    })),
  );
  await page.getByLabel('Hasil uji simulasi').selectOption('GOAL');
  await page.getByRole('button', { name: /Dragon Meteor/ }).click();
  await expect(page.locator('.player-label.active')).toHaveText('RMA');
  await page.waitForTimeout(2200);
  const moving = await page.locator('.player-label.active').boundingBox();
  assert.ok(moving.y < initialPositions[0].y - 15, 'Active player advances toward goal');
  const otherLabels = await page.locator('.player-label:not(.active)').count();
  assert.equal(otherLabels, 4);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, 'ultimate.png') });
  await expect(
    page.locator('.score-row').filter({ hasText: 'Madrid' }).locator(':scope > strong'),
  ).toHaveText('1', { timeout: 15000 });
  await expect(page.locator('.player-label.active')).toHaveCount(0, { timeout: 5000 });
  await expect
    .poll(async () => {
      const returned = await page.locator('.player-label').first().boundingBox();
      return Math.abs(returned.x - initialPositions[0].x);
    })
    .toBeLessThan(3);
  checks.push('Ultimate: walks forward, other four remain, scores once, returns home');
  await page.getByRole('button', { name: 'Reset simulasi' }).click();
  await page.waitForTimeout(300);
  await expect(
    page.locator('.score-row').filter({ hasText: 'Madrid' }).locator(':scope > strong'),
  ).toHaveText('0');
  await page.getByLabel('Hasil uji simulasi').selectOption('SAVE');
  await page.getByRole('button', { name: /Fire Shot/ }).click();
  await expect(page.locator('.kick-announcement strong')).toHaveText('SAVE', { timeout: 10000 });
  await page.waitForTimeout(1600);
  await expect(
    page.locator('.score-row').filter({ hasText: 'Madrid' }).locator(':scope > strong'),
  ).toHaveText('0');
  checks.push('Reset persists; forced SAVE yields no goal');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'studio-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  checks.push('Mobile 390px: all 5 clubs, no horizontal overflow');
  // Auth is exercised through the visible form. These secrets exist only in this isolated runtime.
  await page.goto(base + '/admin');
  await page.getByLabel('Kunci admin').fill(password);
  await page.getByRole('button', { name: 'Masuk ke control room' }).click();
  await expect(page.getByRole('heading', { name: 'Ringkasan', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: join(out, 'admin-dashboard.png'), fullPage: true });
  for (const route of [
    'integration',
    'clubs',
    'gifts',
    'likes',
    'skills',
    'goalkeeper',
    'match',
    'queue',
    'leaderboard',
    'visual',
    'overlay',
    'history',
  ]) {
    await page.goto(base + '/admin/' + route);
    await expect(page.getByRole('button', { name: 'Simpan perubahan' })).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  checks.push('Admin login and all 13 admin routes render');
  await page.goto(base + '/admin/clubs');
  await expect(page.getByText('Logo klub berupa gambar (PNG/WebP/JPG, maks. 20 MB)')).toHaveCount(
    5,
  );
  await expect(page.getByText('Model karakter 3D opsional (GLB, maks. 20 MB)')).toHaveCount(5);
  await expect(page.getByRole('link', { name: 'Paket lengkap + panduan' })).toHaveAttribute(
    'href',
    '/examples/penalty-battle-assets.zip',
  );
  const samplePack = await context.request.get(base + '/examples/penalty-battle-assets.zip');
  assert.equal(samplePack.status(), 200);
  assert.equal((await samplePack.body()).subarray(0, 2).toString(), 'PK');
  const beforeSamples = await (await context.request.get(base + '/api/admin/state')).json();
  const clubCard = page.locator('.admin-cards > section').first();
  await page
    .getByLabel('Logo klub berupa gambar (PNG/WebP/JPG, maks. 20 MB)')
    .first()
    .setInputFiles(resolve('public/examples/logo-pb.png'));
  await expect(clubCard.locator('img')).toBeVisible();
  await page
    .getByLabel('Model karakter 3D opsional (GLB, maks. 20 MB)')
    .first()
    .setInputFiles(resolve('public/examples/character-pb.glb'));
  await expect(clubCard.locator('.asset-key').filter({ hasText: '.glb' })).toBeVisible();
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('tersimpan');
  const sampleConfig = await (await context.request.get(base + '/api/admin/state')).json();
  const sampleLive = await context.newPage();
  sampleLive.on('pageerror', (e) => errors.push(e.message));
  await sampleLive.setViewportSize({ width: 390, height: 844 });
  const modelResponse = sampleLive.waitForResponse(
    (response) =>
      response.url().endsWith('/media/' + sampleConfig.config.clubs[0].characterAssetKey) &&
      response.status() === 200,
  );
  await sampleLive.goto(base + '/live');
  await modelResponse;
  await expect(sampleLive.locator('.player-label')).toHaveCount(5);
  await sampleLive
    .locator('.live-scores img')
    .first()
    .evaluate((img) => img.decode());
  await sampleLive.waitForTimeout(1000);
  await expect(sampleLive.locator('.arena-error')).toHaveCount(0);
  await expect(sampleLive.locator('.arena-canvas')).not.toHaveAttribute('data-asset-warning', /.+/);
  await sampleLive.screenshot({ path: join(out, 'example-assets-uploaded.png'), fullPage: true });
  await page.goto(base + '/admin/overlay');
  await page.getByLabel('Di atas kepala pemain').selectOption('LOGO');
  await page.getByLabel('Mode layar penuh bawaan').selectOption('OVERLAY');
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('tersimpan');
  await expect(sampleLive.locator('.player-label img')).toHaveCount(1);
  await sampleLive.locator('.player-label img').evaluate((img) => img.decode());
  await expect(sampleLive.locator('.player-label:not(.player-label-logo)').first()).toHaveText(
    'BAR',
  );
  await expect(sampleLive.getByLabel('Mode layar penuh')).toHaveValue('OVERLAY');
  await page.reload();
  await expect(page.getByLabel('Di atas kepala pemain')).toHaveValue('LOGO');
  await expect(page.getByLabel('Mode layar penuh bawaan')).toHaveValue('OVERLAY');
  await sampleLive.screenshot({ path: join(out, 'player-logo-mobile.png'), fullPage: true });
  // A failed logo returns to the club code rather than leaving an empty badge.
  await sampleLive.locator('.player-label img').evaluate((img) => {
    img.dispatchEvent(new Event('error'));
  });
  await expect(sampleLive.locator('.player-label').first()).toHaveText('RMA');
  await page.getByLabel('Di atas kepala pemain').selectOption('TEXT');
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('tersimpan');
  await expect(sampleLive.locator('.player-label img')).toHaveCount(0);
  await expect(sampleLive.locator('.player-label').first()).toHaveText('RMA');
  // Both native fullscreen targets resize correctly, including exit and re-entry.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await sampleLive.setViewportSize(viewport);
    for (const [mode, target] of [
      ['OVERLAY', 'live-layout'],
      ['ARENA', 'arena-wrap'],
    ]) {
      await sampleLive.getByLabel('Mode layar penuh').selectOption(mode);
      await sampleLive.getByRole('button', { name: 'Layar penuh', exact: true }).click();
      await expect
        .poll(() => sampleLive.evaluate(() => document.fullscreenElement?.className))
        .toBe(target);
      await expect(sampleLive.getByLabel('Mode layar penuh')).toBeDisabled();
      const sizing = await sampleLive.evaluate(() => {
        const el = document.fullscreenElement;
        const canvas = el.querySelector('canvas');
        return {
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
          vw: innerWidth,
          vh: innerHeight,
          canvasWidth: canvas.getBoundingClientRect().width,
        };
      });
      assert.ok(Math.abs(sizing.width - sizing.vw) < 2);
      assert.ok(Math.abs(sizing.height - sizing.vh) < 2);
      assert.ok(sizing.canvasWidth > 0);
      if (mode === 'OVERLAY') {
        await expect(sampleLive.locator('.live-scores')).toBeVisible();
        await expect(sampleLive.locator('.live-header')).toBeVisible();
        await sampleLive.screenshot({
          path: join(out, `fullscreen-overlay-${viewport.width}.png`),
        });
      }
      await sampleLive.getByRole('button', { name: 'Keluar layar penuh' }).click();
      await expect
        .poll(() => sampleLive.evaluate(() => document.fullscreenElement === null))
        .toBe(true);
      await expect(sampleLive.getByLabel('Mode layar penuh')).toBeEnabled();
    }
  }
  checks.push(
    'Player logo/text saves and updates live with missing/broken-logo fallback; both fullscreen targets enter, resize and exit on desktop/mobile',
  );
  const restoreSamples = await (await context.request.get(base + '/api/admin/state')).json();
  restoreSamples.config.clubs = beforeSamples.config.clubs;
  restoreSamples.config.overlay = beforeSamples.config.overlay;
  assert.equal(
    (
      await context.request.put(base + '/api/admin/config', {
        headers: { Origin: base },
        data: { version: restoreSamples.configVersion, config: restoreSamples.config },
      })
    ).status(),
    200,
  );
  await sampleLive.close();
  checks.push(
    'Sample ZIP downloads; PNG and GLB upload through admin and load together in the real overlay',
  );
  await page.goto(base + '/admin/likes');
  await page.getByLabel('Aktifkan tendangan dari like').check();
  await page.getByLabel('Jumlah like per tendangan normal').fill('100');
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('tersimpan');
  await page.reload();
  await expect(page.getByLabel('Aktifkan tendangan dari like')).toBeChecked();
  await expect(page.getByLabel('Jumlah like per tendangan normal')).toHaveValue('100');
  await page.screenshot({ path: join(out, 'admin-likes.png'), fullPage: true });
  checks.push(
    'Admin like threshold and toggle persist; logo image and optional GLB labels are distinct',
  );
  const textOverlay = await context.newPage();
  textOverlay.on('pageerror', (e) => errors.push(e.message));
  await textOverlay.goto(base + '/live');
  await expect(textOverlay.locator('[data-overlay-text="clubPrompt"]')).toHaveText(
    'Pilih klub dulu!',
  );
  await page.goto(base + '/admin/overlay');
  await page.getByLabel('Isi tulisan').fill('LIGA LIVE');
  await page.getByLabel('Ukuran tulisan (%)').fill('150');
  await page.getByLabel('Warna tulisan').evaluate((input) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#ff8800');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByLabel('Bagian tulisan').selectOption('giftNotice');
  await page.getByLabel('Isi tulisan').fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Bagian tulisan').selectOption('queue');
  await page.getByLabel('Isi tulisan').fill('Antrean siaran: {queue}');
  await page.getByLabel('Bagian tulisan').selectOption('clubPrompt');
  await page.getByLabel('Tampilkan tulisan ini').uncheck();
  await page.getByLabel('Tampilkan daftar gift dan skill').uncheck();
  await page.getByLabel('Tampilkan status koneksi').uncheck();
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('tersimpan');
  await expect(textOverlay.locator('[data-overlay-text="title"]')).toHaveText('LIGA LIVE');
  await expect(textOverlay.locator('[data-overlay-text="title"]')).toHaveCSS(
    'color',
    'rgb(255, 136, 0)',
  );
  assert.equal(
    await textOverlay
      .locator('[data-overlay-text="title"] > span')
      .evaluate((el) => el.style.fontSize),
    '1.5em',
  );
  await expect(textOverlay.locator('[data-overlay-text="clubPrompt"]')).toHaveCount(0);
  await expect(textOverlay.locator('[data-overlay-text="giftNotice"]')).toHaveText(
    '<img src=x onerror=alert(1)>',
  );
  await expect(textOverlay.locator('img[src="x"]')).toHaveCount(0);
  await expect(textOverlay.locator('[data-overlay-text="queue"]')).toHaveText('Antrean siaran: 0');
  await expect(textOverlay.locator('.live-gift-legend')).toHaveCount(0);
  await expect(textOverlay.locator('.live-connections')).toHaveCount(0);
  await textOverlay.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await textOverlay.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await textOverlay.screenshot({ path: join(out, 'overlay-custom-mobile.png'), fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Isi tulisan')).toHaveValue('LIGA LIVE');
  await expect(page.getByLabel('Ukuran tulisan (%)')).toHaveValue('150');
  await expect(page.getByLabel('Warna tulisan')).toHaveValue('#ff8800');
  await page.screenshot({ path: join(out, 'admin-overlay.png'), fullPage: true });
  checks.push(
    'Overlay editor persists text/color/size; live updates without reload, hides sections, escapes HTML, and fits mobile',
  );
  await page.getByRole('button', { name: 'Pulihkan bagian ini', exact: true }).click();
  await expect(page.getByLabel('Isi tulisan')).toHaveValue('PENALTY');
  await expect(textOverlay.locator('[data-overlay-text="title"]')).toHaveText('LIGA LIVE');
  await page.getByRole('button', { name: 'Pulihkan semua teks dan tampilan', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('tersimpan');
  await expect(textOverlay.locator('[data-overlay-text="title"]')).toHaveText('PENALTY');
  await expect(textOverlay.locator('[data-overlay-text="clubPrompt"]')).toHaveText(
    'Pilih klub dulu!',
  );
  await expect(textOverlay.locator('.live-gift-legend')).toHaveCount(1);
  const afterTextReset = await (await context.request.get(base + '/api/admin/state')).json();
  assert.deepEqual(afterTextReset.config.likes, { enabled: true, likesPerKick: 100 });
  await textOverlay.close();
  checks.push(
    'Text reset stays local until save and restores overlay without changing like settings',
  );
  await page.goto(base + '/admin/skills');
  await page.getByLabel('Peluang gol (%)').first().fill('61.5');
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('tersimpan');
  await page.reload();
  await expect(page.getByLabel('Peluang gol (%)').first()).toHaveValue('61.5');
  checks.push('Admin edits persist and reload from server');
  const data = await (await context.request.get(base + '/api/admin/state')).json();
  data.config.sourceRoomId = '123';
  data.config.match.countdownSec = 0;
  data.config.match.mode = 'ENDLESS';
  data.config.idle.enabled = false;
  data.config.skills[1].goalChancePercent = 100;
  data.config.skills[1].durationMs = 3000;
  data.config.skills[0].goalChancePercent = 100;
  data.config.skills[0].durationMs = 3000;
  assert.equal(
    (
      await context.request.put(base + '/api/admin/config', {
        headers: { Origin: base },
        data: { version: data.configVersion, config: data.config },
      })
    ).status(),
    200,
  );
  assert.equal(
    (
      await context.request.post(base + '/api/admin/control', {
        headers: { Origin: base },
        data: { action: 'start' },
      })
    ).status(),
    200,
  );
  const hook = async (event, payload, id) => {
    const body = JSON.stringify({
        id,
        version: 1,
        event,
        timestamp: new Date().toISOString(),
        roomId: '123',
        data: payload,
      }),
      stamp = String(Math.floor(Date.now() / 1000));
    return context.request.post(base + '/api/hooks/tiktok', {
      headers: {
        'Content-Type': 'application/json',
        'x-tlk-timestamp': stamp,
        'x-tlk-signature':
          'sha256=' +
          createHmac('sha256', signing)
            .update(stamp + '.' + body)
            .digest('hex'),
      },
      data: body,
    });
  };
  await hook(
    'chat',
    { username: 'test-viewer', nickname: '<img src=x onerror=alert(1)>', message: 'BAR' },
    'browser-comment',
  );
  await page.setViewportSize({ width: 540, height: 960 });
  await page.goto(base + '/live');
  await expect(page.locator('.player-label')).toHaveCount(5);
  await expect(page.getByText('Arena tersambung', { exact: true })).toBeVisible();
  await hook(
    'gift',
    {
      username: 'test-viewer',
      giftId: '5655',
      diamondCount: 1,
      repeatCount: 1,
      repeatEnd: true,
      giftType: 1,
    },
    'browser-gift',
  );
  await expect(page.locator('.player-label.active')).toHaveText('BAR');
  await page.waitForTimeout(3500);
  await expect(
    page.locator('.live-scores>div').filter({ hasText: 'BAR' }).locator('strong'),
  ).toHaveText('1');
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  await page.screenshot({ path: join(out, 'live-portrait.png'), fullPage: true });
  checks.push('Signed webhook → realtime overlay goal; supporter text cannot inject HTML');
  const partial = await hook(
    'like',
    { username: 'test-viewer', likeCount: 60, totalLikeCount: 90000 },
    'like-partial',
  );
  assert.equal((await partial.json()).remainingLikes, 60);
  const triggered = await hook('like', { username: 'test-viewer', likeCount: 50 }, 'like-trigger');
  assert.equal((await triggered.json()).actions, 1);
  await expect(page.locator('.kick-announcement')).toContainText('LIKE');
  await expect(page.getByText('Setiap 100 like per penonton', { exact: false })).toBeVisible();
  await expect(
    page.locator('.live-scores > div').filter({ hasText: 'BAR' }).locator('strong'),
  ).toHaveText('2', { timeout: 15000 });
  const likeAfter = await (await context.request.get(base + '/api/snapshot')).json();
  assert.equal(likeAfter.scores.bar.giftPoints, 1);
  assert.equal(
    (await (await hook('like', { username: 'test-viewer', likeCount: 50 }, 'like-trigger')).json())
      .status,
    'duplicate',
  );
  await page.screenshot({ path: join(out, 'live-likes.png'), fullPage: true });
  checks.push(
    'Signed likes cross threshold once, show Normal Kick, preserve gift points, and deduplicate retry',
  );
  const authoritativeBefore = await (await context.request.get(base + '/api/snapshot')).json();
  await page.reload();
  await expect(
    page.locator('.live-scores>div').filter({ hasText: 'BAR' }).locator('strong'),
  ).toHaveText('2');
  const another = await context.newPage();
  await another.goto(base + '/live');
  await expect(
    another.locator('.live-scores>div').filter({ hasText: 'BAR' }).locator('strong'),
  ).toHaveText('2');
  await another.close();
  const after = await (await context.request.get(base + '/api/snapshot')).json();
  assert.deepEqual(after.scores, authoritativeBefore.scores);
  checks.push('Reload + second overlay recover consistent scores without replay');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'live-landscape.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const bounds = await page.locator('.arena-canvas').boundingBox();
  for (const label of await page.locator('.player-label').all()) {
    const b = await label.boundingBox();
    assert.ok(
      b.x >= bounds.x &&
        b.x + b.width <= bounds.x + bounds.width &&
        b.y >= bounds.y &&
        b.y + b.height <= bounds.y + bounds.height,
      'Every club label inside arena',
    );
  }
  checks.push('Landscape 1280×720: all clubs stay inside arena');
  assert.deepEqual(errors, []);
  assert.deepEqual(networkErrors, []);
  const report = {
    checks,
    consoleErrors: errors,
    networkErrors,
    renderer: 'Headless Chromium / SwiftShader; not a production GPU benchmark',
    fps: await page.locator('.arena-canvas').getAttribute('data-fps'),
  };
  await (
    await import('node:fs/promises')
  ).writeFile(join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await mf.dispose();
  await rm(store, { recursive: true, force: true });
}

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { createHmac } from 'node:crypto';
import type { Snapshot } from '../src/game/engine';
import type { Config } from '../src/game/model';

const origin = 'https://new-connector.test';
const password = 'test-only-admin-key-at-least-32-characters';
const signing = 'test-only-webhook-key-at-least-32-characters';
let mf: Miniflare, cookie: string;
const standard = (type: string, data: Record<string, unknown>, id = crypto.randomUUID()) => ({
  id,
  type,
  timestamp: new Date().toISOString(),
  source: { platform: 'tiktok', account: '@streamer', room_id: '123', engine: 'python' },
  user: { id: '42', username: 'alice', nickname: 'Alice' },
  data,
  is_test: false,
});
async function hook(payload: unknown, key = signing) {
  const body = JSON.stringify(payload),
    timestamp = String(Math.floor(Date.now() / 1000));
  return mf.dispatchFetch(origin + '/api/hooks/tiktok', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': timestamp,
      'X-Webhook-Signature':
        'sha256=' +
        createHmac('sha256', key)
          .update(timestamp + '.' + body)
          .digest('hex'),
    },
    body,
  });
}
async function admin() {
  const response = await mf.dispatchFetch(origin + '/api/admin/state', {
    headers: { Cookie: cookie },
  });
  return (await response.json()) as {
    snapshot: Snapshot;
    config: Config;
    configVersion: number;
    stats: { accepted: number };
    audit: unknown[];
  };
}
beforeAll(async () => {
  const result = await build({
    entryPoints: ['src/server/worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    external: ['cloudflare:workers', 'node:crypto'],
    conditions: ['workerd', 'worker', 'browser'],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'koneklive-test',
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: '2026-10-17',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: { ROOMS: { className: 'MatchRoom', useSQLite: true } },
      kvNamespaces: ['CONFIG'],
      r2Buckets: ['MEDIA'],
      bindings: { ADMIN_SECRET: password, WEBHOOK_SIGNING_SECRET: signing },
      serviceBindings: { ASSETS: () => new Response('static') },
    }),
  );
  await mf.ready;
  const login = await mf.dispatchFetch(origin + '/api/admin/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  expect(login.status).toBe(200);
  cookie = login.headers.get('Set-Cookie')!.split(';')[0];
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});

describe.sequential('koneklive signed webhook in Workers runtime', () => {
  it('rejects the wrong destination secret', async () => {
    const response = await hook(standard('comment', { comment: 'RMA' }), password);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_signature' });
  });
  it('acknowledges TEST without changing room, selection, queue, counters or scores', async () => {
    const before = await admin();
    const test = {
      ...standard('gift', { gift_id: '5655', delta_count: 99, coins_per_gift: 1 }),
      is_test: true,
    };
    const response = await hook(test);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'test_received', is_test: true });
    const after = await admin();
    expect(after.snapshot.revision).toBe(before.snapshot.revision);
    expect(after.snapshot.connector).toEqual(before.snapshot.connector);
    expect(after.stats).toEqual(before.stats);
    expect(after.snapshot.scores).toEqual(before.snapshot.scores);
    expect(after.snapshot.queueDepth).toBe(0);
    expect(after.snapshot.active).toBeNull();
  });
  it('selects clubs, accepts delta gifts and deduplicates concurrent retries', async () => {
    const state = await admin();
    state.config.match.countdownSec = 0;
    state.config.match.mode = 'ENDLESS';
    state.config.idle.enabled = false;
    state.config.likes = { enabled: true, likesPerKick: 100 };
    const update = await mf.dispatchFetch(origin + '/api/admin/config', {
      method: 'PUT',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: state.configVersion, config: state.config }),
    });
    expect(update.status).toBe(200);
    const start = await mf.dispatchFetch(origin + '/api/admin/control', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    expect(start.status).toBe(200);
    expect(await (await hook(standard('comment', { comment: 'RMA' }))).json()).toMatchObject({
      status: 'club_selected',
    });
    const event = standard('gift', {
      gift_id: '5655',
      coins_per_gift: 1,
      delta_count: 2,
      repeat_count: 10,
      is_final: false,
    });
    const receipts = await Promise.all(
      Array.from(
        { length: 5 },
        async () => (await hook(event)).json() as Promise<{ status: string; actions?: number }>,
      ),
    );
    expect(receipts.filter((x) => x.status === 'queued')).toEqual([
      { status: 'queued', actions: 2 },
    ]);
    expect(receipts.filter((x) => x.status === 'duplicate')).toHaveLength(4);
    const beforeFinal = await admin();
    expect(beforeFinal.stats.accepted).toBe(2);
    expect(
      await (
        await hook({
          ...event,
          id: 'final-no-delta',
          data: { ...event.data, delta_count: 0, is_final: true },
        })
      ).json(),
    ).toMatchObject({ status: 'ignored' });
    expect((await admin()).stats.accepted).toBe(2);
    expect(
      await (await hook(standard('like', { like_count: 60, aggregated: false }))).json(),
    ).toMatchObject({ status: 'likes_accumulated', remainingLikes: 60 });
    const combined = standard('like', { like_count: 900, aggregated: true });
    expect(
      await (
        await hook({ ...combined, user: { id: null, username: null, nickname: null } })
      ).json(),
    ).toMatchObject({ status: 'ignored' });
    expect((await admin()).stats.accepted).toBe(2);
    expect(
      await (await hook(standard('like', { like_count: 40, aggregated: false }))).json(),
    ).toMatchObject({ status: 'queued', actions: 1, remainingLikes: 0 });
  });
});

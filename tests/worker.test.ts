import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import type { Config } from '../src/game/model';
import type { Snapshot } from '../src/game/engine';
const origin = 'https://arena.test';
const password = 'test-only-admin-key-with-more-than-32-chars';
const signing = 'test-only-webhook-key-with-more-than-32-chars';
let mf: Miniflare, dir: string, script: string, cookie: string;
const create = () =>
  new Miniflare({
    ...convertV4MiniflareOptions({
      name: 'pen-test',
      modules: true,
      script,
      compatibilityDate: '2026-10-17',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: { ROOMS: { className: 'MatchRoom', useSQLite: true } },
      durableObjectsPersist: join(dir, 'do'),
      kvNamespaces: ['CONFIG'],
      kvPersist: join(dir, 'kv'),
      r2Buckets: ['MEDIA'],
      r2Persist: join(dir, 'r2'),
      bindings: { ADMIN_SECRET: password, WEBHOOK_SIGNING_SECRET: signing },
      serviceBindings: {
        ASSETS: async (request) => {
          if (new URL(request.url).pathname === '/test-service-failure')
            throw Error('private upstream details');
          return new Response('static');
        },
      },
    }),
    resourcePersistencePath: join(dir, 'storage'),
  });
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  auth = false,
  extra: Record<string, string> = {},
) {
  return mf.dispatchFetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(auth ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function admin() {
  return (await (await request('/api/admin/state', 'GET', undefined, true)).json()) as {
    config: Config;
    configVersion: number;
    snapshot: Snapshot;
    archivePending: number;
    history: unknown[];
    kicks: { id: string; state: string; outcome: string; skill: { goalChancePercent: number } }[];
    audit: { at: number; action: string; detail: string }[];
    stats: { rejected: number };
  };
}
async function hook(
  event: string,
  data: Record<string, unknown>,
  id: string = crypto.randomUUID(),
  roomId: string | null = '123',
) {
  const body = JSON.stringify({
      id,
      version: 1,
      event,
      timestamp: new Date().toISOString(),
      roomId,
      data,
    }),
    timestamp = String(Math.floor(Date.now() / 1000));
  return mf.dispatchFetch(origin + '/api/hooks/tiktok', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tlk-timestamp': timestamp,
      'x-tlk-signature':
        'sha256=' +
        createHmac('sha256', signing)
          .update(timestamp + '.' + body)
          .digest('hex'),
    },
    body,
  });
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pen-test-'));
  const result = await build({
    entryPoints: ['src/server/worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    external: ['cloudflare:workers', 'node:crypto'],
    conditions: ['workerd', 'worker', 'browser'],
  });
  script = result.outputFiles[0].text;
  mf = create();
  await mf.ready;
  const login = await request('/api/admin/login', 'POST', { password });
  expect(login.status).toBe(200);
  cookie = login.headers.get('Set-Cookie')!.split(';')[0];
}, 30000);
afterAll(async () => {
  await mf?.dispose();
  await rm(dir, { recursive: true, force: true });
});
describe.sequential('real Workers runtime + SQLite Durable Object + KV + R2', () => {
  it('sanitizes upstream 5xx responses without exposing service internals', async () => {
    const response = await request('/test-service-failure');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'asset_service_unavailable', retryable: true });
  });
  it('exposes health and snapshot but denies unauthenticated admin writes', async () => {
    expect((await request('/api/health')).status).toBe(200);
    expect((await request('/api/snapshot')).status).toBe(200);
    for (const [path, method, body] of [
      ['control', 'POST', { action: 'reset' }],
      ['config', 'PUT', {}],
      ['assets', 'POST', {}],
    ] as const)
      expect((await request('/api/admin/' + path, method, body)).status).toBe(401);
  });
  it('rejects CSRF, invalid passwords, forged cookies and oversized body', async () => {
    expect((await request('/api/admin/login', 'POST', { password: 'wrong' })).status).toBe(401);
    expect(
      (
        await request('/api/admin/control', 'POST', { action: 'start' }, true, {
          Origin: 'https://evil.test',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/api/admin/state', 'GET', undefined, false, {
          Cookie: 'pen_session=fake.signature',
        })
      ).status,
    ).toBe(401);
    expect((await request('/api/admin/login', 'POST', { password: 'a'.repeat(3000) })).status).toBe(
      413,
    );
  });
  it('fails closed on unsigned or tampered webhook payloads', async () => {
    expect((await request('/api/hooks/tiktok', 'POST', {})).status).toBe(401);
    expect(
      (
        await request('/api/hooks/tiktok', 'POST', {}, false, {
          'x-tlk-signature': 'sha256=' + 'a'.repeat(64),
          'x-tlk-timestamp': String(Math.floor(Date.now() / 1000)),
        })
      ).status,
    ).toBe(401);
  });
  it('accepts signed lifecycle events without a room filter, including an unresolved room ID', async () => {
    expect((await admin()).config.sourceRoomId).toBe('');
    const before = (await admin()).snapshot.scores;
    const response = await hook('stream', { state: 'started' }, 'optional-room', null);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'connected' });
    expect((await admin()).snapshot.scores).toEqual(before);
    expect((await admin()).snapshot.connector.status).toBe('CONNECTED');
  });
  it('persists versioned config to KV and rejects stale admin overwrites', async () => {
    const d = await admin();
    d.config.sourceRoomId = '123';
    d.config.match.mode = 'ENDLESS';
    d.config.match.countdownSec = 0;
    d.config.idle.enabled = false;
    d.config.skills[1].goalChancePercent = 100;
    d.config.skills[1].durationMs = 3000;
    d.config.queue.capacity = 3;
    let response = await request(
      '/api/admin/config',
      'PUT',
      { version: d.configVersion, config: d.config },
      true,
    );
    expect(response.status).toBe(200);
    response = await request(
      '/api/admin/config',
      'PUT',
      { version: d.configVersion, config: d.config },
      true,
    );
    expect(response.status).toBe(400);
    const kv = await mf.getKVNamespace('CONFIG');
    const config = (await kv.get('penalty:settings', 'json')) as { config: Config };
    expect(config.config.sourceRoomId).toBe('123');
  });
  it('records signed room rejection without changing scores or treating it as a connection', async () => {
    const before = await admin();
    const response = await hook('stream', { state: 'started' }, 'wrong-room', '999');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'source_room_mismatch' });
    const after = await admin();
    expect(after.snapshot.scores).toEqual(before.snapshot.scores);
    expect(after.snapshot.connector).toEqual(before.snapshot.connector);
    expect(after.stats.rejected).toBe(before.stats.rejected + 1);
    expect(after.audit[0]).toMatchObject({
      action: 'webhook_rejected',
      detail: 'source_room_mismatch',
    });
  });
  it('accepts actual signed lifecycle and comments and rejects no-club gift once', async () => {
    await request('/api/admin/control', 'POST', { action: 'start' }, true);
    expect(
      ((await (await hook('stream', { state: 'started' })).json()) as { status: string }).status,
    ).toBe('connected');
    const gift = {
      username: 'nobody',
      giftId: '5655',
      diamondCount: 1,
      repeatCount: 1,
      repeatEnd: true,
      giftType: 1,
    };
    expect(
      ((await (await hook('gift', gift, 'no-club')).json()) as { status: string }).status,
    ).toBe('no_club');
    expect(
      ((await (await hook('gift', gift, 'no-club')).json()) as { status: string }).status,
    ).toBe('duplicate');
    expect((await admin()).snapshot.queueDepth).toBe(0);
    expect(
      (
        (await (
          await hook('chat', {
            username: 'alice',
            nickname: '<img onerror=alert(1)>',
            message: 'RMA',
          })
        ).json()) as { status: string }
      ).status,
    ).toBe('club_selected');
  });
  it('atomically deduplicates concurrent retries, survives runtime restart, and scores once via alarm', async () => {
    const data = {
      username: 'alice',
      giftId: '5655',
      diamondCount: 1,
      repeatCount: 2,
      repeatEnd: true,
      giftType: 1,
    };
    const responses = await Promise.all(
      Array.from({ length: 30 }, () => hook('gift', data, 'stable-gift-id')),
    );
    const receipts = (await Promise.all(responses.map((r) => r.json()))) as { status: string }[];
    expect(receipts.filter((r) => r.status === 'queued')).toHaveLength(1);
    expect(receipts.filter((r) => r.status === 'duplicate')).toHaveLength(29);
    const before = (await admin()).snapshot;
    expect(before.queueDepth).toBe(1);
    expect(before.active?.id).toBe('stable-gift-id:0');
    await mf.dispose();
    mf = create();
    await mf.ready;
    const recovered = (await admin()).snapshot;
    expect(recovered.active?.id).toBe(before.active?.id);
    expect(recovered.queueDepth).toBe(1);
    expect(
      ((await (await hook('gift', data, 'stable-gift-id')).json()) as { status: string }).status,
    ).toBe('duplicate');
    await new Promise((resolve) => setTimeout(resolve, 6500));
    const after = (await admin()).snapshot;
    expect(after.scores.rma).toEqual({ goals: 2, skillPoints: 4, giftPoints: 2, kicks: 2 });
    expect(after.active).toBeNull();
    const records = (await admin()).kicks;
    expect(records).toHaveLength(2);
    expect(
      records.every(
        (k) => k.state === 'DONE' && k.outcome === 'GOAL' && k.skill.goalChancePercent === 100,
      ),
    ).toBe(true);
    expect(after.queueDepth).toBe(0);
    const kv = await mf.getKVNamespace('CONFIG');
    expect((await kv.list()).keys.map((k) => k.name)).toEqual(['penalty:settings']);
  }, 20000);
  it('returns retryable 503 without partial acceptance then accepts same ID after capacity is freed', async () => {
    const data = {
      username: 'alice',
      giftId: '5655',
      diamondCount: 1,
      repeatCount: 4,
      repeatEnd: true,
      giftType: 1,
    };
    const response = await hook('gift', data, 'overflow');
    expect(response.status).toBe(503);
    expect((await admin()).snapshot.queueDepth).toBe(0);
    const d = await admin();
    d.config.queue.capacity = 5;
    expect(
      (
        await request(
          '/api/admin/config',
          'PUT',
          { version: d.configVersion, config: d.config },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      ((await (await hook('gift', data, 'overflow')).json()) as { status: string }).status,
    ).toBe('queued');
  });
  it('public WebSocket sends snapshots, responds to heartbeat, rejects mutations and reconnects consistently', async () => {
    const response = await mf.dispatchFetch(origin + '/api/ws', {
      headers: { Upgrade: 'websocket' },
    });
    expect(response.status).toBe(101);
    const ws = response.webSocket!;
    ws.accept();
    const snapshot = await new Promise<Snapshot>((resolve) =>
      ws.addEventListener(
        'message',
        (e) => {
          if (e.data !== 'pong') resolve(JSON.parse(String(e.data)));
        },
        { once: true },
      ),
    );
    expect(snapshot.clubs).toHaveLength(5);
    expect(JSON.stringify(snapshot)).not.toContain('supporterId');
    const pong = new Promise((resolve) =>
      ws.addEventListener('message', (e) => resolve(e.data), { once: true }),
    );
    ws.send('ping');
    expect(await pong).toBe('pong');
    const closed = new Promise<number>((resolve) =>
      ws.addEventListener('close', (e) => resolve(e.code)),
    );
    ws.send(JSON.stringify({ action: 'reset', score: 999 }));
    expect(await closed).toBe(1008);
    expect((await admin()).snapshot.round).toBe(snapshot.round);
  }, 10000);
  it('requires auth and bounds for asset writes; serves R2 objects immutably', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const response = await mf.dispatchFetch(origin + '/api/admin/assets', {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'image/png',
        'Content-Length': String(bytes.length),
      },
      body: bytes,
    });
    expect(response.status).toBe(201);
    const info = (await response.json()) as { url: string };
    const asset = await request(info.url);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('Cache-Control')).toContain('immutable');
    expect(asset.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
  it('archives a finished match before reset with KV outbox recovery', async () => {
    await request('/api/admin/control', 'POST', { action: 'stop' }, true);
    expect((await request('/api/admin/control', 'POST', { action: 'reset' }, true)).status).toBe(
      400,
    );
    await new Promise((resolve) => setTimeout(resolve, 13000));
    const d = await admin();
    expect(d.snapshot.status).toBe('RESULT');
    expect(d.history).toHaveLength(1);
    expect((await request('/api/admin/control', 'POST', { action: 'reset' }, true)).status).toBe(
      200,
    );
    expect((await admin()).history).toHaveLength(1);
    const kv = await mf.getKVNamespace('CONFIG');
    expect((await kv.list()).keys.some((k) => k.name.startsWith('penalty:match:history:'))).toBe(
      true,
    );
  }, 20000);
  it('persists like remainders across runtime restart and deduplicates kicks and backpressure retries', async () => {
    const d = await admin();
    d.config.likes = { enabled: true, likesPerKick: 100 };
    d.config.queue.capacity = 2;
    d.config.skills[0].goalChancePercent = 100;
    d.config.skills[0].durationMs = 3000;
    expect(
      (
        await request(
          '/api/admin/config',
          'PUT',
          { version: d.configVersion, config: d.config },
          true,
        )
      ).status,
    ).toBe(200);
    await request('/api/admin/control', 'POST', { action: 'start' }, true);
    await hook('chat', { username: 'like-viewer', message: 'RMA' }, 'like-club');
    expect(
      await (
        await hook(
          'like',
          { username: 'like-viewer', likeCount: 60, totalLikeCount: 50000 },
          'partial-likes',
        )
      ).json(),
    ).toMatchObject({ status: 'likes_accumulated', remainingLikes: 60 });
    expect(
      await (
        await hook('like', { username: 'like-viewer', likeCount: 60 }, 'partial-likes')
      ).json(),
    ).toMatchObject({ status: 'duplicate', remainingLikes: 60 });
    await mf.dispose();
    mf = create();
    await mf.ready;
    expect((await admin()).config.likes).toEqual({ enabled: true, likesPerKick: 100 });
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        hook('like', { username: 'like-viewer', likeCount: 190 }, 'like-burst'),
      ),
    );
    const receipts = await Promise.all(
      responses.map(
        async (response) =>
          (await response.json()) as { status: string; actions?: number; remainingLikes?: number },
      ),
    );
    expect(receipts.filter((r) => r.status === 'queued')).toHaveLength(1);
    expect(receipts.filter((r) => r.status === 'duplicate')).toHaveLength(9);
    expect(receipts.find((r) => r.status === 'queued')).toMatchObject({
      actions: 2,
      remainingLikes: 50,
    });
    const active = (await admin()).snapshot;
    expect(active.active?.skill.id).toBe('NORMAL');
    expect(active.active?.source).toBe('LIKE');
    expect(active.queueDepth).toBe(1);
    const overflow = await hook(
      'like',
      { username: 'like-viewer', likeCount: 200 },
      'like-overflow',
    );
    expect(overflow.status).toBe(503);
    await new Promise((resolve) => setTimeout(resolve, 6500));
    const resolved = (await admin()).snapshot;
    expect(resolved.scores.rma).toEqual({ goals: 2, kicks: 2, skillPoints: 2, giftPoints: 0 });
    expect(
      await (
        await hook('like', { username: 'like-viewer', likeCount: 200 }, 'like-overflow')
      ).json(),
    ).toMatchObject({ status: 'queued', actions: 2, remainingLikes: 50 });
  }, 20000);
  it('persists overlay text and visibility through KV and runtime restart while rejecting invalid styles', async () => {
    const d = await admin();
    d.config.overlay.text.title = {
      text: 'LIGA <img src=x>',
      visible: true,
      color: '#ff8800',
      sizePercent: 150,
    };
    d.config.overlay.text.clubPrompt.visible = false;
    d.config.overlay.showGiftLegend = false;
    expect(
      (
        await request(
          '/api/admin/config',
          'PUT',
          { version: d.configVersion, config: d.config },
          true,
        )
      ).status,
    ).toBe(200);
    const kv = await mf.getKVNamespace('CONFIG');
    const saved = (await kv.get('penalty:settings', 'json')) as { config: Config };
    expect(saved.config.overlay).toEqual(d.config.overlay);
    await mf.dispose();
    mf = create();
    await mf.ready;
    const recovered = await admin();
    expect(recovered.config.overlay).toEqual(d.config.overlay);
    expect(recovered.snapshot.overlay).toEqual(d.config.overlay);
    recovered.config.overlay.text.title.color = 'url(https://example.com)';
    expect(
      (
        await request(
          '/api/admin/config',
          'PUT',
          { version: recovered.configVersion, config: recovered.config },
          true,
        )
      ).status,
    ).toBe(400);
    expect((await admin()).configVersion).toBe(recovered.configVersion);
  });
});

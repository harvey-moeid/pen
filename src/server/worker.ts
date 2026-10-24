import { z } from 'zod';
import { ConfigSchema } from '../game/model';
import { authorized, boundedBody, boundedBytes, digest, passwordMatches, session } from './auth';
import { isKonekliveTest, verifyWebhook } from './adapter';
export { MatchRoom } from './room';
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname,
      room = env.ROOMS.getByName('primary');
    try {
      if (path === '/api/health') return json({ ok: true, service: 'penalty-battle', version: 1 });
      if (path === '/api/snapshot' && request.method === 'GET') return json(await room.snapshot());
      if (
        path === '/api/ws' &&
        request.method === 'GET' &&
        request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
      )
        return await room.fetch(request);
      if (path === '/api/hooks/tiktok' && request.method === 'POST') {
        if (!env.WEBHOOK_SIGNING_SECRET) return json({ error: 'integration_not_configured' }, 503);
        const raw = await boundedBody(request, 262144);
        if (!(await verifyWebhook(raw, request.headers, env.WEBHOOK_SIGNING_SECRET)))
          return json({ error: 'invalid_signature' }, 401);
        if (!(await room.allow('webhooks', 6000, 60000)))
          return json({ error: 'rate_limited', retryable: true }, 429);
        const payload: unknown = JSON.parse(raw);
        if (isKonekliveTest(payload)) return json({ status: 'test_received', is_test: true });
        const result = await room.receive(payload);
        return json(result, result.retryable ? 503 : 200);
      }
      if (path.startsWith('/api/admin/')) {
        if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin)
          return json({ error: 'origin_rejected' }, 403);
        if (path === '/api/admin/login' && request.method === 'POST') {
          const ip = await digest(request.headers.get('CF-Connecting-IP') ?? 'local');
          if (!(await room.allow('login:' + ip, 10, 60000)))
            return json({ error: 'Coba lagi dalam satu menit' }, 429);
          if (!env.ADMIN_SECRET || env.ADMIN_SECRET.length < 32)
            return json({ error: 'ADMIN_SECRET belum dikonfigurasi' }, 503);
          const body = z
            .object({ password: z.string().max(512) })
            .parse(JSON.parse(await boundedBody(request, 2048)));
          if (!(await passwordMatches(body.password, env.ADMIN_SECRET)))
            return json({ error: 'Kredensial tidak valid' }, 401);
          const cookie = await session(env.ADMIN_SECRET);
          return new Response(JSON.stringify({ ok: true }), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
              'Set-Cookie': `pen_session=${cookie}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${url.protocol === 'https:' ? '; Secure' : ''}`,
            },
          });
        }
        if (!(await authorized(request, env.ADMIN_SECRET)))
          return json({ error: 'Autentikasi admin diperlukan' }, 401);
        if (path === '/api/admin/logout' && request.method === 'POST')
          return new Response(null, {
            status: 204,
            headers: {
              'Set-Cookie': 'pen_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0',
            },
          });
        if (path === '/api/admin/state' && request.method === 'GET')
          return json(await room.adminSnapshot());
        if (path === '/api/admin/config' && request.method === 'PUT') {
          const b = z
            .object({ version: z.number().int().positive(), config: z.unknown() })
            .parse(JSON.parse(await boundedBody(request)));
          return json(await room.updateConfig(ConfigSchema.parse(b.config), b.version));
        }
        if (path === '/api/admin/control' && request.method === 'POST') {
          const b = z
            .object({ action: z.enum(['start', 'stop', 'pause', 'resume', 'reset']) })
            .parse(JSON.parse(await boundedBody(request, 2048)));
          return json(await room.command(b.action));
        }
        if (path === '/api/admin/integration' && request.method === 'GET')
          return json({
            configured: Boolean(env.WEBHOOK_SIGNING_SECRET),
            endpoint: `${url.origin}/api/hooks/tiktok`,
            contract: 'koneklive Standard JSON + tiktok-live-konektor@3660b385',
            dedup:
              'Webhook event.id; koneklive gift delta_count; upstream replay remains unverified',
          });
        if (path === '/api/admin/assets' && request.method === 'POST') {
          const type = request.headers.get('Content-Type') ?? '';
          const extensions: Record<string, string> = {
            'image/png': 'png',
            'image/webp': 'webp',
            'image/jpeg': 'jpg',
            'model/gltf-binary': 'glb',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
          };
          if (!extensions[type]) return json({ error: 'Format aset tidak didukung' }, 415);
          const length = Number(request.headers.get('Content-Length'));
          if (!Number.isInteger(length) || length <= 0 || length > 20 * 1024 * 1024)
            return json({ error: 'Aset maksimal 20 MB; Content-Length wajib' }, 413);
          const bytes = await boundedBytes(request, 20 * 1024 * 1024);
          if (bytes.length !== length) return json({ error: 'length_mismatch' }, 400);
          const key = `assets/${crypto.randomUUID()}.${extensions[type]}`;
          await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
          return json({ key, url: `/media/${key}` }, 201);
        }
        return json({ error: 'not_found' }, 404);
      }
      if (path.startsWith('/media/') && request.method === 'GET') {
        const key = decodeURIComponent(path.slice(7));
        if (!/^assets\/[a-zA-Z0-9_.-]+$/.test(key)) return json({ error: 'invalid_key' }, 400);
        const asset = await env.MEDIA.get(key);
        if (!asset) return json({ error: 'not_found' }, 404);
        const headers = new Headers();
        asset.writeHttpMetadata(headers);
        headers.set('ETag', asset.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(asset.body, { headers });
      }
      if (path.startsWith('/api/')) return json({ error: 'not_found' }, 404);
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status >= 500)
        return json({ error: 'asset_service_unavailable', retryable: true }, 503);
      return assetResponse;
    } catch (error) {
      if (error instanceof z.ZodError)
        return json(
          { error: 'validation_failed', details: error.issues.map((i) => i.message) },
          400,
        );
      if (error instanceof SyntaxError) return json({ error: 'invalid_json' }, 400);
      const message = error instanceof Error ? error.message : 'internal_error';
      if (message === 'body_too_large') return json({ error: message }, 413);
      console.warn(JSON.stringify({ event: 'request_failed', path, message }));
      if (error instanceof Error && error.name === 'ZodError')
        return json({ error: 'validation_failed' }, 400);
      const expected = [
        'source_room_mismatch',
        'event_expired',
        'truncated_payload',
        'Selesaikan ronde dan antrean dahulu',
        'Hentikan dan habiskan antrean sebelum reset',
        'Kontrol tidak dikenal',
        'Ubah klub dan aturan ronde setelah ronde selesai',
        'Kapasitas lebih kecil dari antrean saat ini',
        'Nonaktifkan klub lama; ID klub tidak boleh dihapus',
        'Konfigurasi berubah; muat ulang sebelum menyimpan',
      ];
      if (expected.includes(message)) return json({ error: message }, 400);
      return json({ error: 'internal_error', retryable: true }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

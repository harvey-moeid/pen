import { z } from 'zod';
import type { GameEvent } from '../game/model';
const identity = z.string().trim().min(1).max(100);
const Envelope = z.object({
  id: z.string().min(1).max(160),
  version: z.literal(1),
  event: z.string().max(40),
  timestamp: z.iso.datetime({ offset: true }),
  roomId: z.union([z.string(), z.number(), z.null()]),
  data: z.record(z.string(), z.unknown()),
});
const Who = z.object({
  username: identity.refine(
    (v) => !['unknown', 'Penonton TikTok'].includes(v),
    'Stable username required',
  ),
  nickname: z.string().max(200).optional(),
});
const Gift = Who.extend({
  giftId: z.union([z.string().min(1).max(80), z.number().int().positive()]),
  diamondCount: z.number().int().min(0).max(100000),
  repeatCount: z.number().int().min(1).max(2000),
  repeatEnd: z.boolean(),
  giftType: z.number().int().min(0),
  streakable: z.boolean().optional(),
});
export function normalizeConnector(input: unknown, expectedRoom: string, now: number): GameEvent {
  const e = Envelope.parse(input);
  const roomFilter = expectedRoom.trim();
  if (roomFilter && (e.roomId === null || String(e.roomId) !== roomFilter))
    throw Error('source_room_mismatch');
  const at = Date.parse(e.timestamp);
  if (now - at > 86400000 || at - now > 300000) throw Error('event_expired');
  if (e.data.truncated) throw Error('truncated_payload');
  const base = { id: e.id, at };
  if (e.event === 'chat') {
    const d = Who.extend({ message: z.string().max(1000) }).parse(e.data);
    return {
      ...base,
      type: 'comment',
      userId: d.username,
      displayName: d.nickname || d.username,
      comment: d.message,
    };
  }
  if (e.event === 'gift') {
    const d = Gift.parse(e.data);
    return {
      ...base,
      type: 'gift',
      userId: d.username,
      displayName: d.nickname || d.username,
      gift: {
        id: String(d.giftId),
        coins: d.diamondCount,
        units: d.repeatCount,
        final: !(d.streakable || d.giftType === 1) || d.repeatEnd,
      },
    };
  }
  if (e.event === 'stream')
    return {
      ...base,
      type:
        e.data.state === 'started'
          ? 'connected'
          : e.data.state === 'ended'
            ? 'disconnected'
            : 'ignored',
    };
  const type =
    e.event === 'connected'
      ? 'connected'
      : ['disconnected', 'streamEnd'].includes(e.event)
        ? 'disconnected'
        : e.event === 'reconnecting'
          ? 'reconnecting'
          : 'ignored';
  return { ...base, type };
}
export async function verifyWebhook(
  raw: string,
  headers: Headers,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!secret || secret.length < 32) return false;
  const stamp = headers.get('x-tlk-timestamp') ?? '',
    signature = headers.get('x-tlk-signature') ?? '';
  if (
    !/^\d{10}$/.test(stamp) ||
    Math.abs(now / 1000 - Number(stamp)) > 300 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, (h) => parseInt(h, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(stamp + '.' + raw));
}

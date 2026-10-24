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
const KonekliveEnvelope = z.object({
  id: z.string().min(1).max(512),
  type: z.enum(['comment', 'like', 'gift', 'join', 'follow', 'share', 'subscribe', 'viewer']),
  timestamp: z.iso.datetime({ offset: true }),
  source: z.object({
    platform: z.literal('tiktok'),
    account: z.string().max(256),
    room_id: z.string().max(256).nullable(),
    engine: z.enum(['node', 'python']),
  }),
  user: z.object({
    id: z.string().max(256).nullable(),
    username: z.string().max(256).nullable(),
    nickname: z.string().max(256).nullable(),
  }),
  data: z.record(z.string(), z.unknown()),
  is_test: z.boolean(),
});
export function isKonekliveTest(input: unknown): boolean {
  const result = KonekliveEnvelope.safeParse(input);
  return result.success && result.data.is_test;
}
function normalizeKoneklive(input: unknown, expectedRoom: string, now: number): GameEvent {
  const e = KonekliveEnvelope.parse(input);
  // Tests are acknowledged by the HTTP handler before touching the room.
  if (e.is_test) throw Error('test_event_not_live');
  const room = expectedRoom.trim();
  if (room && e.source.room_id !== room) throw Error('source_room_mismatch');
  const at = Date.parse(e.timestamp);
  if (now - at > 86400000 || at - now > 300000) throw Error('event_expired');
  if (e.data.truncated) throw Error('truncated_payload');
  const base = { id: e.id, at };
  if (!['comment', 'gift', 'like'].includes(e.type)) return { ...base, type: 'ignored' };
  // Batched room-wide likes cannot be attributed to a viewer or club.
  if (e.type === 'like' && e.data.aggregated === true) return { ...base, type: 'ignored' };
  const username = e.user.username?.trim();
  const numericId = e.user.id?.trim();
  const userId = identity.parse(username || (numericId ? `tiktok-id:${numericId}` : ''));
  if (['unknown', 'Penonton TikTok'].includes(userId)) throw Error('invalid_identity');
  const who = { userId, displayName: e.user.nickname || username || userId };
  if (e.type === 'comment') {
    const data = z.object({ comment: z.string().max(4000) }).parse(e.data);
    return { ...base, ...who, type: 'comment', comment: data.comment };
  }
  if (e.type === 'like') {
    const data = z.object({ like_count: z.number().int().min(1).max(1000000) }).parse(e.data);
    return { ...base, ...who, type: 'like', likeCount: data.like_count };
  }
  const data = z
    .object({
      gift_id: z.string().min(1).max(80),
      delta_count: z.number().int().min(0).max(2000),
      coins_per_gift: z.number().int().min(0).max(100000).nullable(),
    })
    .parse(e.data);
  // The connector has already converted cumulative combos into increments.
  // A final repeat_count must never replay units already received.
  if (data.delta_count === 0) return { ...base, type: 'ignored' };
  return {
    ...base,
    ...who,
    type: 'gift',
    gift: { id: data.gift_id, coins: data.coins_per_gift, units: data.delta_count, final: true },
  };
}
export function normalizeConnector(input: unknown, expectedRoom: string, now: number): GameEvent {
  if (typeof input === 'object' && input !== null && 'type' in input)
    return normalizeKoneklive(input, expectedRoom, now);
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
  if (e.event === 'like') {
    const d = Who.extend({ likeCount: z.number().int().min(1).max(1000000) }).parse(e.data);
    return {
      ...base,
      type: 'like',
      userId: d.username,
      displayName: d.nickname || d.username,
      likeCount: d.likeCount,
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
  const modern = headers.has('x-webhook-timestamp') || headers.has('x-webhook-signature');
  const legacy = headers.has('x-tlk-timestamp') || headers.has('x-tlk-signature');
  // Never mix header families or fall back from an invalid modern signature.
  if (modern && legacy) return false;
  const stamp = headers.get(modern ? 'x-webhook-timestamp' : 'x-tlk-timestamp') ?? '',
    signature = headers.get(modern ? 'x-webhook-signature' : 'x-tlk-signature') ?? '';
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

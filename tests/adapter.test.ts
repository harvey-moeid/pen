import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { isKonekliveTest, normalizeConnector, verifyWebhook } from '../src/server/adapter';
import { matchGift } from '../src/game/engine';
import { defaultConfig } from '../src/game/model';
const now = Date.now(),
  secret = 'unit-test-signing-secret-32-characters-long';
const envelope = (event: string, data: Record<string, unknown>) => ({
  id: 'e-1',
  version: 1,
  event,
  timestamp: new Date(now).toISOString(),
  roomId: '123',
  data,
});

const standard = (type: string, data: Record<string, unknown>) => ({
  id: 'tt_@streamer_gift_42',
  type,
  timestamp: new Date(now).toISOString(),
  source: { platform: 'tiktok', account: '@streamer', room_id: '123', engine: 'node' },
  user: { id: '12345', username: 'alice', nickname: 'Alice' },
  data,
  is_test: false,
});
describe('koneklive Standard JSON', () => {
  it('maps comments, per-viewer likes and numeric identity fallback consistently', () => {
    expect(normalizeConnector(standard('comment', { comment: 'RMA' }), '123', now)).toMatchObject({
      type: 'comment',
      userId: 'alice',
      comment: 'RMA',
    });
    expect(
      normalizeConnector(standard('like', { like_count: 50, aggregated: false }), '', now),
    ).toMatchObject({ type: 'like', userId: 'alice', likeCount: 50 });
    const e = standard('comment', { comment: 'RMA' });
    const fallback = { ...e, user: { ...e.user, username: null } };
    expect(normalizeConnector(fallback, '', now).userId).toBe('tiktok-id:12345');
  });
  it('counts gift increments even before final, never cumulative repeat_count', () => {
    const e = standard('gift', {
      gift_id: '5655',
      coins_per_gift: 1,
      delta_count: 2,
      repeat_count: 10,
      is_final: false,
    });
    expect(normalizeConnector(e, '', now).gift).toEqual({
      id: '5655',
      coins: 1,
      units: 2,
      final: true,
    });
    expect(
      normalizeConnector({ ...e, data: { ...e.data, delta_count: 0, is_final: true } }, '', now)
        .type,
    ).toBe('ignored');
    for (const delta_count of [undefined, null, -1, 0.5, 2001])
      expect(() =>
        normalizeConnector({ ...e, data: { ...e.data, delta_count } }, '', now),
      ).toThrow();
  });
  it('allows exact Gift ID mapping with unknown coins, never a fabricated coin fallback', () => {
    const event = normalizeConnector(
      standard('gift', {
        gift_id: '5655',
        coins_per_gift: null,
        delta_count: 1,
      }),
      '',
      now,
    );
    const config = defaultConfig();
    config.mappings.push({
      id: 'zero',
      coinValueFallback: 0,
      skillId: 'SKILL_1',
      contributionPoints: 0,
      enabled: true,
      matchPriority: 99,
    });
    expect(matchGift(config, event.gift!)).toBeUndefined();
    config.mappings.push({
      id: 'rose',
      giftId: '5655',
      skillId: 'NORMAL',
      contributionPoints: 1,
      enabled: true,
      matchPriority: 1,
    });
    expect(matchGift(config, event.gift!)?.id).toBe('rose');
  });
  it('ignores combined likes and unrelated events without attributing a club', () => {
    const e = standard('like', { like_count: 100, aggregated: true });
    expect(
      normalizeConnector({ ...e, user: { id: null, username: null, nickname: null } }, '', now)
        .type,
    ).toBe('ignored');
    expect(normalizeConnector(standard('viewer', { viewer_count: 100 }), '', now).type).toBe(
      'ignored',
    );
  });
  it('keeps room, age, identity, count and TEST validation', () => {
    const e = standard('comment', { comment: 'RMA' });
    expect(() => normalizeConnector(e, 'other', now)).toThrow('source_room_mismatch');
    expect(() => normalizeConnector(e, '', now + 86400001)).toThrow('event_expired');
    expect(() =>
      normalizeConnector({ ...e, user: { id: null, username: null, nickname: null } }, '', now),
    ).toThrow();
    expect(() => normalizeConnector(standard('like', { like_count: 0 }), '', now)).toThrow();
    const test = { ...e, is_test: true };
    expect(isKonekliveTest(test)).toBe(true);
    expect(() => normalizeConnector(test, '', now)).toThrow('test_event_not_live');
    expect(isKonekliveTest({ is_test: true })).toBe(false);
    expect(() => normalizeConnector({ ...e, is_test: undefined }, '', now)).toThrow();
  });
  it('verifies exact body with the new header pair and rejects mixed or forged pairs', async () => {
    const body = JSON.stringify(standard('comment', { comment: 'RMA' }));
    const ts = String(Math.floor(now / 1000));
    const signature =
      'sha256=' +
      createHmac('sha256', secret)
        .update(ts + '.' + body)
        .digest('hex');
    const headers = new Headers({ 'X-Webhook-Timestamp': ts, 'X-Webhook-Signature': signature });
    expect(await verifyWebhook(body, headers, secret, now)).toBe(true);
    expect(await verifyWebhook(body + ' ', headers, secret, now)).toBe(false);
    expect(await verifyWebhook(body, headers, secret, now + 301000)).toBe(false);
    expect(await verifyWebhook(body, headers, 'a-different-secret-with-32-characters', now)).toBe(
      false,
    );
    headers.set('X-TLK-Timestamp', ts);
    expect(await verifyWebhook(body, headers, secret, now)).toBe(false);
    headers.delete('X-TLK-Timestamp');
    headers.delete('X-Webhook-Timestamp');
    expect(await verifyWebhook(body, headers, secret, now)).toBe(false);
  });
});
const gift = {
  username: 'stable_handle',
  nickname: '<script>alert(1)</script>',
  giftId: '5655',
  diamondCount: 1,
  repeatCount: 3,
  repeatEnd: false,
  giftType: 1,
  streakable: true,
};
describe('audited connector contract', () => {
  it('normalizes per-event likeCount and ignores the cumulative room total', () => {
    expect(
      normalizeConnector(
        envelope('like', { username: 'alice', likeCount: 12, totalLikeCount: 90000 }),
        '',
        now,
      ),
    ).toMatchObject({ type: 'like', userId: 'alice', likeCount: 12 });
  });
  it.each([undefined, 0, -1, 1.5, 1000001])(
    'rejects invalid connector likeCount %s',
    (likeCount) => {
      expect(() =>
        normalizeConnector(envelope('like', { username: 'alice', likeCount }), '', now),
      ).toThrow();
    },
  );
  it('normalizes real Node connector chat fields', () => {
    expect(
      normalizeConnector(envelope('chat', { username: 'alice', message: ' rma ' }), '123', now),
    ).toMatchObject({ type: 'comment', userId: 'alice', comment: ' rma ' });
  });
  it('only final streak counts, with totalValue never used as per-unit coins', () => {
    expect(normalizeConnector(envelope('gift', gift), '123', now).gift).toMatchObject({
      units: 3,
      coins: 1,
      final: false,
    });
    expect(
      normalizeConnector(envelope('gift', { ...gift, repeatEnd: true, totalValue: 3 }), '123', now)
        .gift,
    ).toMatchObject({ units: 3, coins: 1, final: true });
  });
  it('accepts Python final events and non-streak normal gifts', () => {
    expect(
      normalizeConnector(envelope('gift', { ...gift, repeatEnd: true }), '123', now).gift?.final,
    ).toBe(true);
    expect(
      normalizeConnector(envelope('gift', { ...gift, giftType: 0, streakable: false }), '123', now)
        .gift?.final,
    ).toBe(true);
  });
  it('uses actual stream started/ended lifecycle events', () => {
    expect(normalizeConnector(envelope('stream', { state: 'started' }), '123', now).type).toBe(
      'connected',
    );
    expect(normalizeConnector(envelope('stream', { state: 'ended' }), '123', now).type).toBe(
      'disconnected',
    );
  });
  it.each(['', '   '])('allows an optional blank room filter %j', (room) => {
    expect(normalizeConnector(envelope('gift', gift), room, now).type).toBe('gift');
    expect(
      normalizeConnector({ ...envelope('stream', { state: 'started' }), roomId: null }, room, now)
        .type,
    ).toBe('connected');
  });
  it('enforces an explicitly configured room, including null room IDs', () => {
    expect(() => normalizeConnector(envelope('gift', gift), 'other', now)).toThrow(
      'source_room_mismatch',
    );
    expect(() =>
      normalizeConnector({ ...envelope('gift', gift), roomId: null }, '123', now),
    ).toThrow('source_room_mismatch');
    expect(normalizeConnector(envelope('gift', gift), ' 123 ', now).type).toBe('gift');
  });
  it('rejects missing username, truncated gift, missing ID and malformed count', () => {
    for (const data of [
      { ...gift, username: 'unknown' },
      { ...gift, truncated: true },
      { ...gift, giftId: null },
      { ...gift, repeatCount: 1.2 },
    ])
      expect(() => normalizeConnector(envelope('gift', data), '123', now)).toThrow();
    expect(() => normalizeConnector({ ...envelope('gift', gift), id: '' }, '123', now)).toThrow();
  });
  it('rejects events older than one day so dedup retention has a safe boundary', () => {
    expect(() => normalizeConnector(envelope('gift', gift), '123', now + 86400001)).toThrow(
      'event_expired',
    );
  });
  it('validates HMAC against exact raw body, timestamp and signature format', async () => {
    const body = JSON.stringify(envelope('gift', gift)),
      ts = String(Math.floor(now / 1000));
    const signature =
      'sha256=' +
      createHmac('sha256', secret)
        .update(ts + '.' + body)
        .digest('hex');
    const headers = new Headers({ 'x-tlk-timestamp': ts, 'x-tlk-signature': signature });
    expect(await verifyWebhook(body, headers, secret, now)).toBe(true);
    expect(await verifyWebhook(body + ' ', headers, secret, now)).toBe(false);
    expect(await verifyWebhook(body, headers, secret, now + 301000)).toBe(false);
    expect(await verifyWebhook(body, headers, undefined, now)).toBe(false);
  });
});

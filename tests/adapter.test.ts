import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { normalizeConnector, verifyWebhook } from '../src/server/adapter';
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
  it.each(['', 'other'])('rejects unconfigured or wrong source room %s', (room) => {
    expect(() => normalizeConnector(envelope('gift', gift), room, now)).toThrow(
      'source_room_mismatch',
    );
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

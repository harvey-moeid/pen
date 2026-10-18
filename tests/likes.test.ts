import { describe, expect, it } from 'vitest';
import {
  configure,
  control,
  ingest,
  initialState,
  publicSnapshot,
  restoreState,
  startRound,
  tick,
} from '../src/game/engine';
import { ConfigSchema, type RoomState } from '../src/game/model';

const now = 1000000;
function ready() {
  const s = initialState(now);
  s.config.likes = { enabled: true, likesPerKick: 100 };
  s.config.match.mode = 'ENDLESS';
  s.config.match.countdownSec = 0;
  s.config.idle.enabled = false;
  s.config.skills[0].goalChancePercent = 100;
  startRound(s, now);
  tick(s, now, () => 0);
  select(s);
  return s;
}
function select(s: RoomState, userId = 'alice', comment = 'RMA', at = now) {
  return ingest(s, { id: `chat-${userId}-${at}`, type: 'comment', at, userId, comment }, at);
}
function like(s: RoomState, likeCount: number, userId = 'alice', at = now) {
  return ingest(s, { id: `like-${userId}-${at}`, type: 'like', at, userId, likeCount }, at);
}

describe('like-triggered Normal Kick', () => {
  it('accumulates deltas, triggers each complete threshold, and retains the remainder', () => {
    const s = ready();
    expect(like(s, 60)).toEqual({ status: 'likes_accumulated', actions: 0, remainingLikes: 60 });
    expect(like(s, 190)).toEqual({ status: 'queued', actions: 2, remainingLikes: 50 });
    expect(s.queue).toHaveLength(2);
    expect(
      s.queue.every((k) => k.source === 'LIKE' && k.skill.id === 'NORMAL' && k.clubId === 'rma'),
    ).toBe(true);
    expect(like(s, 50).actions).toBe(1);
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
  });
  it('keeps separate counters for each viewer, even on the same club', () => {
    const s = ready();
    select(s, 'bob');
    like(s, 60);
    like(s, 60, 'bob');
    expect(s.queue).toHaveLength(0);
    expect(like(s, 40).actions).toBe(1);
    expect(s.viewers['u:bob'].likeRemainder).toBe(60);
  });
  it('preserves remainder on repeat selection and resets it on club switch', () => {
    const s = ready();
    like(s, 75);
    select(s);
    expect(s.viewers['u:alice'].likeRemainder).toBe(75);
    select(s, 'alice', 'BAR', now + 11000);
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
    expect(like(s, 100).actions).toBe(1);
    expect(s.queue[0].clubId).toBe('bar');
  });
  it('does not count likes before selecting a club', () => {
    const s = ready();
    expect(like(s, 100, 'bob').status).toBe('no_club');
    select(s, 'bob');
    expect(like(s, 1, 'bob').remainingLikes).toBe(1);
  });
  it('does not accrue while disabled, paused, or outside a LIVE round', () => {
    const s = ready();
    like(s, 25);
    s.config.likes.enabled = false;
    expect(like(s, 100).status).toBe('likes_disabled');
    s.config.likes.enabled = true;
    control(s, 'pause', now);
    expect(like(s, 100).status).toBe('round_closed');
    control(s, 'resume', now);
    control(s, 'stop', now);
    expect(like(s, 100).status).toBe('round_closed');
    expect(s.viewers['u:alice'].likeRemainder).toBe(25);
  });
  it('requires enabled NORMAL but no gift mapping for like kicks', () => {
    const s = ready();
    s.config.mappings = [];
    s.config.skills[0].enabled = false;
    expect(like(s, 100).status).toBe('normal_disabled');
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
    s.config.skills[0].enabled = true;
    expect(like(s, 100).actions).toBe(1);
  });
  it('does not consume remainder or partially enqueue when capacity is insufficient', () => {
    const s = ready();
    s.config.queue.capacity = 1;
    like(s, 50);
    const rejected = like(s, 200);
    expect(rejected).toMatchObject({ status: 'queue_full', retryable: true });
    expect(s.queue).toHaveLength(0);
    expect(s.viewers['u:alice'].likeRemainder).toBe(50);
    s.config.queue.capacity = 2;
    expect(like(s, 200)).toMatchObject({ actions: 2, remainingLikes: 50 });
  });
  it('uses NORMAL score settings and never adds gift contribution points', () => {
    const s = ready();
    s.config.skills[0].pointsOnGoal = 3;
    like(s, 100);
    tick(s, now, () => 0);
    tick(s, s.active!.endsAt!, () => 0);
    expect(s.scores.rma).toEqual({ goals: 1, kicks: 1, skillPoints: 3, giftPoints: 0 });
    expect(s.viewers['u:alice'].score).toEqual(s.scores.rma);
  });
  it('snapshots NORMAL odds/points/duration and keeps queued kicks on a settings change', () => {
    const s = ready();
    like(s, 150);
    const c = structuredClone(s.config);
    c.likes.likesPerKick = 50;
    c.skills[0].goalChancePercent = 0;
    configure(s, c, now);
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
    expect(s.queue[0].skill.goalChancePercent).toBe(100);
    expect(like(s, 50).actions).toBe(1);
    expect(s.queue[1].skill.goalChancePercent).toBe(0);
  });
  it('retains remainder when unrelated settings change and clears it when likes are toggled', () => {
    const s = ready();
    like(s, 50);
    const c = structuredClone(s.config);
    c.visual.volume = 0.5;
    configure(s, c, now);
    expect(s.viewers['u:alice'].likeRemainder).toBe(50);
    configure(s, { ...c, likes: { ...c.likes, enabled: false } }, now);
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
  });
  it('clears like remainders at reset and the start of a new round', () => {
    const s = ready();
    like(s, 50);
    control(s, 'stop', now);
    tick(s, now, () => 0);
    control(s, 'reset', now);
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
    s.viewers['u:alice'].likeRemainder = 50;
    startRound(s, now);
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
  });
  it('restores partial counts after serialization without sharing counters with new viewers', () => {
    const s = ready();
    like(s, 75);
    const recovered = restoreState(JSON.stringify(s));
    expect(like(recovered, 25).actions).toBe(1);
    expect(recovered.queue).toHaveLength(1);
    expect(recovered.viewers['u:alice'].likeRemainder).toBe(0);
  });
  it('loads pre-like config and saved state with the feature disabled and existing scores intact', () => {
    const s = ready();
    const legacy = JSON.parse(JSON.stringify(s));
    delete legacy.config.likes;
    delete legacy.viewers['u:alice'].likeRemainder;
    const parsed = ConfigSchema.parse(legacy.config);
    expect(parsed.likes).toEqual({ enabled: false, likesPerKick: 100 });
    const recovered = restoreState(JSON.stringify(legacy));
    expect(recovered.scores).toEqual(s.scores);
    expect(like(recovered, 100).status).toBe('likes_disabled');
    recovered.config.likes.enabled = true;
    expect(like(recovered, 100).actions).toBe(1);
  });
  it.each([0, -1, 1.5, 1000001])('rejects invalid threshold %s', (value) => {
    const c = ready().config;
    c.likes.likesPerKick = value;
    expect(ConfigSchema.safeParse(c).success).toBe(false);
  });
  it('publishes the configured like instructions and avoids idle demos while like activity continues', () => {
    const s = ready();
    s.config.idle.enabled = true;
    s.nextDemoAt = now;
    like(s, 1);
    tick(s, now, () => 0);
    expect(s.active).toBeNull();
    expect(
      publicSnapshot(s, now).giftLegend.find((k) => k.skillId === 'NORMAL')?.triggers,
    ).toContain('100 like / penonton');
  });
});

import { describe, it, expect } from 'vitest';
import {
  initialState,
  ingest,
  startRound,
  tick,
  control,
  configure,
  matchGift,
  pickNext,
  publicSnapshot,
} from '../src/game/engine';
import {
  ConfigSchema,
  defaultConfig,
  skillIds,
  type GameEvent,
  type RoomState,
} from '../src/game/model';
const now = 1_000_000;
function ready() {
  const s = initialState(now);
  s.config.match.mode = 'ENDLESS';
  s.config.match.countdownSec = 0;
  s.config.idle.enabled = false;
  startRound(s, now);
  tick(s, now, () => 0);
  return s;
}
function comment(s: RoomState, id = 'viewer', code = 'RMA', at = now) {
  return ingest(
    s,
    { id: 'c' + id, type: 'comment', at, userId: id, displayName: 'Viewer', comment: code },
    at,
  );
}
function gift(s: RoomState, coins = 1, id = 'gift', units = 1, userId = 'viewer', at = now) {
  return ingest(
    s,
    { id, type: 'gift', at, userId, gift: { id: 'g' + coins, coins, units, final: true } },
    at,
  );
}
function drain(s: RoomState) {
  let t = now;
  while (s.active || s.queue.length) {
    tick(s, t, () => 0);
    t += 16000;
  }
  return t;
}
describe('authoritative engine', () => {
  it('publishes editable gift instructions and hides disabled fallback rules', () => {
    const s = ready();
    expect(
      publicSnapshot(s, now).giftLegend.find((g) => g.skillId === 'SKILL_1')?.triggers,
    ).toEqual(['1 koin']);
    s.config.coinFallback = false;
    s.config.mappings.push({
      id: 'normal',
      giftId: 'configured-id',
      displayName: 'Gift Pilihan',
      skillId: 'NORMAL',
      contributionPoints: 1,
      enabled: true,
      matchPriority: 100,
    });
    const legend = publicSnapshot(s, now).giftLegend;
    expect(legend.find((g) => g.skillId === 'SKILL_1')?.triggers).toEqual([]);
    expect(legend.find((g) => g.skillId === 'NORMAL')?.triggers).toEqual(['Gift Pilihan']);
  });
  it('requires an explicit gift ID for Normal even when a coin fallback was provided', () => {
    const config = defaultConfig();
    config.mappings.push({
      id: 'invalid-normal',
      coinValueFallback: 1,
      skillId: 'NORMAL',
      contributionPoints: 1,
      enabled: true,
      matchPriority: 100,
    });
    expect(ConfigSchema.safeParse(config).success).toBe(false);
  });

  it('validates the default configuration and rejects ambiguous/reserved club identities', () => {
    expect(ConfigSchema.safeParse(defaultConfig()).success).toBe(true);
    const c = defaultConfig();
    c.clubs[1].code = 'RMA';
    expect(ConfigSchema.safeParse(c).success).toBe(false);
    c.clubs[1].code = 'BAR';
    c.clubs[0].id = '__proto__';
    expect(ConfigSchema.safeParse(c).success).toBe(false);
  });
  it('normalizes comments and enforces cooldown without changing queued club', () => {
    const s = ready();
    expect(comment(s, 'viewer', '  rma  ').status).toBe('club_selected');
    gift(s);
    expect(comment(s, 'viewer', 'BAR', now + 1).status).toBe('cooldown');
    expect(comment(s, 'viewer', 'BAR', now + 11000).status).toBe('club_selected');
    expect(s.queue[0].clubId).toBe('rma');
  });
  it('ignores invalid club comments', () => {
    const s = ready();
    expect(comment(s, 'viewer', 'HACK').status).toBe('ignored_comment');
    expect(Object.keys(s.viewers)).toHaveLength(0);
  });
  it('rejects gift before club selection with no metrics', () => {
    const s = ready();
    expect(gift(s).status).toBe('no_club');
    expect(s.queue).toHaveLength(0);
    expect(s.scores.rma.giftPoints).toBe(0);
    expect(s.notice?.text).toBe('Pilih klub dulu!');
  });
  it('ignores partial streak and expands only final units', () => {
    const s = ready();
    comment(s);
    expect(
      ingest(
        s,
        {
          id: 'partial',
          type: 'gift',
          at: now,
          userId: 'viewer',
          gift: { id: 'x', coins: 1, units: 4, final: false },
        },
        now,
      ).status,
    ).toBe('streak_pending');
    expect(s.queue).toHaveLength(0);
    expect(gift(s, 1, 'final', 4).actions).toBe(4);
    expect(new Set(s.queue.map((k) => k.id)).size).toBe(4);
  });
  it('prioritizes explicit normal ID over exact skills and coin fallback', () => {
    const c = defaultConfig();
    c.mappings.push(
      {
        id: 'special',
        giftId: 'rose',
        skillId: 'NORMAL',
        contributionPoints: 2,
        enabled: true,
        matchPriority: 0,
      },
      {
        id: 'conflict',
        giftId: 'rose',
        skillId: 'ULTIMATE',
        contributionPoints: 30,
        enabled: true,
        matchPriority: 100,
      },
    );
    expect(matchGift(c, { id: 'rose', coins: 1 })?.skillId).toBe('NORMAL');
    expect(matchGift(c, { id: 'other', coins: 1 })?.skillId).toBe('SKILL_1');
    c.coinFallback = false;
    expect(matchGift(c, { id: 'other', coins: 1 })).toBeUndefined();
  });
  it('does not accumulate small gifts into a higher skill', () => {
    const s = ready();
    comment(s);
    gift(s, 1, 'burst', 10);
    expect(s.queue).toHaveLength(10);
    expect(s.queue.every((k) => k.skill.id === 'SKILL_1')).toBe(true);
  });
  it('rejects unknown and disabled skill mappings', () => {
    const s = ready();
    comment(s);
    expect(gift(s, 999).status).toBe('unmapped');
    s.config.skills[1].enabled = false;
    expect(gift(s).status).toBe('unmapped');
  });
  it('backpressures the entire combo without partial enqueue', () => {
    const s = ready();
    comment(s);
    s.config.queue.capacity = 3;
    expect(gift(s, 1, 'large', 4)).toMatchObject({ status: 'queue_full', retryable: true });
    expect(s.queue).toHaveLength(0);
    expect(gift(s, 1, 'large', 3).actions).toBe(3);
  });
  it.each([0, 100])('respects %i%% probability on every skill', (chance) => {
    for (const skill of skillIds) {
      const s = ready();
      comment(s);
      s.config.skills.find((k) => k.id === skill)!.goalChancePercent = chance;
      s.config.mappings = [
        {
          id: 'exact',
          giftId: 'g1',
          skillId: skill,
          contributionPoints: 1,
          enabled: true,
          matchPriority: 1,
        },
      ];
      gift(s);
      tick(s, now, () => (chance === 100 ? 0.999999 : 0));
      expect(s.active?.outcome).toBe(chance === 100 ? 'GOAL' : 'SAVE');
    }
  });
  it('awards one goal, weighted skill points and separate gift points exactly once', () => {
    const s = ready();
    comment(s);
    gift(s, 30);
    tick(s, now, () => 0);
    tick(s, now + 8000, () => 0);
    expect(s.scores.rma).toEqual({ goals: 1, skillPoints: 10, giftPoints: 30, kicks: 1 });
    expect(s.viewers['u:viewer'].score).toEqual(s.scores.rma);
    tick(s, now + 9000, () => 0);
    expect(s.scores.rma.goals).toBe(1);
  });
  it('awards gift contribution for saves and misses but zero goals/skill points', () => {
    for (const rng of [0, 0.99]) {
      const s = ready();
      comment(s);
      s.config.skills[1].goalChancePercent = 0;
      gift(s);
      tick(s, now, () => rng);
      tick(s, now + 5000, () => rng);
      expect(s.scores.rma).toEqual({ goals: 0, skillPoints: 0, giftPoints: 1, kicks: 1 });
    }
  });
  it('snapshots chance, duration, weight, and club at enqueue', () => {
    const s = ready();
    comment(s);
    gift(s);
    const c = structuredClone(s.config);
    c.skills[1].goalChancePercent = 0;
    c.skills[1].pointsOnGoal = 100;
    c.skills[1].durationMs = 8000;
    configure(s, c, now);
    expect(s.queue[0].skill.goalChancePercent).toBe(55);
    expect(s.queue[0].skill.pointsOnGoal).toBe(2);
    expect(s.queue[0].skill.durationMs).toBe(4500);
  });
  it('keeps all waiting characters in public config and hides viewer IDs', () => {
    const s = ready();
    comment(s, 'private-user-id');
    gift(s, 1, 'evt', 1, 'private-user-id');
    tick(s, now, () => 0);
    const pub = publicSnapshot(s, now);
    expect(pub.clubs).toHaveLength(5);
    expect(JSON.stringify(pub)).not.toContain('private-user-id');
  });
  it('does not interrupt an active kick for Ultimate', () => {
    const s = ready();
    comment(s);
    gift(s);
    tick(s, now, () => 0);
    const id = s.active!.id;
    gift(s, 30, 'ult');
    tick(s, now + 10, () => 0);
    expect(s.active!.id).toBe(id);
    expect(s.queue).toHaveLength(1);
  });
  it('caps overtaking and prevents starvation under repeated high tiers', () => {
    const s = ready();
    comment(s);
    s.config.mappings.push({
      id: 'normal',
      giftId: 'g0',
      skillId: 'NORMAL',
      contributionPoints: 1,
      enabled: true,
      matchPriority: 1,
    });
    gift(s, 0, 'oldest');
    for (let i = 0; i < 10; i++) gift(s, 30, 'ult' + i);
    for (let i = 0; i < 3; i++) expect(pickNext(s, now)?.eventId).toBe('ult' + i);
    expect(pickNext(s, now)?.eventId).toBe('oldest');
  });
  it('uses FIFO when disabled or oldest exceeds max wait', () => {
    const s = ready();
    comment(s);
    gift(s, 1, 'old');
    gift(s, 30, 'new');
    s.config.queue.smart = false;
    expect(pickNext(s, now)?.eventId).toBe('old');
    gift(s, 1, 'aged');
    gift(s, 30, 'newer');
    s.config.queue.smart = true;
    pickNext(s, now);
    expect(pickNext(s, now + s.config.queue.maxWaitMs + 1)?.eventId).toBe('aged');
  });
  it('drains all accepted actions when TIME expires then archives results', () => {
    const s = ready();
    s.config.match.mode = 'TIME';
    s.deadline = now + 1000;
    comment(s);
    gift(s, 1, 'g', 3);
    tick(s, now, () => 0);
    tick(s, now + 1000, () => 0);
    expect(s.status).toBe('CLOSING');
    expect(gift(s, 1, 'late').status).toBe('round_closed');
    drain(s);
    expect(s.status).toBe('RESULT');
    expect(s.history[0].scores.rma.goals).toBe(3);
  });
  it('TARGET_GOALS closes on goals even when ranking gift points', () => {
    const s = ready();
    s.config.match.mode = 'TARGET_GOALS';
    s.config.match.targetGoals = 1;
    s.config.match.ranking = 'GIFT_POINTS';
    comment(s);
    gift(s);
    tick(s, now, () => 0);
    tick(s, now + 5000, () => 0);
    expect(s.status).toBe('RESULT');
    expect(s.history[0].ranking).toBe('GIFT_POINTS');
  });
  it('ties remain ties and results survive reset', () => {
    const s = ready();
    control(s, 'stop', now);
    tick(s, now, () => 0);
    expect(s.history[0].winners).toHaveLength(5);
    control(s, 'reset', now + 1);
    expect(s.history).toHaveLength(1);
    expect(s.status).toBe('WAITING');
  });
  it('pause finishes active kick, retains queue and extends deadline on resume', () => {
    const s = ready();
    s.deadline = now + 30000;
    comment(s);
    gift(s, 1, 'g', 2);
    tick(s, now, () => 0);
    control(s, 'pause', now + 100);
    tick(s, now + 10000, () => 0);
    expect(s.active).toBeNull();
    expect(s.queue).toHaveLength(1);
    expect(gift(s, 1, 'paused').status).toBe('round_closed');
    control(s, 'resume', now + 10100);
    expect(s.deadline).toBe(now + 40000);
    tick(s, now + 10100, () => 0);
    expect(s.active).not.toBeNull();
  });
  it('reset refuses to discard valid pending gifts', () => {
    const s = ready();
    comment(s);
    gift(s);
    expect(() => control(s, 'reset', now)).toThrow();
    expect(s.queue).toHaveLength(1);
  });
  it('demo changes no official metrics and real gift follows current demo', () => {
    const s = ready();
    s.config.idle.enabled = true;
    s.nextDemoAt = now;
    s.lastActivity = now - 40000;
    tick(s, now, () => 0);
    expect(s.active?.demo).toBe(true);
    comment(s);
    gift(s);
    const end = s.active!.endsAt!;
    tick(s, end, () => 0);
    expect(s.active?.demo).toBe(false);
    expect(s.scores.rma.goals).toBe(0);
  });
  it('round lifecycle auto-restarts only after result and intermission', () => {
    const s = ready();
    s.config.match.autoRestart = true;
    control(s, 'stop', now);
    tick(s, now, () => 0);
    expect(s.status).toBe('RESULT');
    tick(s, now + 10000, () => 0);
    expect(s.status).toBe('INTERMISSION');
    tick(s, now + 15000, () => 0);
    expect(s.status).toBe('COUNTDOWN');
    expect(s.round).toBe(2);
    expect(s.history).toHaveLength(1);
  });
  it('serialized recovery does not reapply resolved scores', () => {
    const s = ready();
    comment(s);
    gift(s, 1, 'a', 2);
    tick(s, now, () => 0);
    const recovered: RoomState = JSON.parse(JSON.stringify(s));
    tick(recovered, now + 6000, () => 0);
    const again: RoomState = JSON.parse(JSON.stringify(recovered));
    tick(again, now + 6000, () => 0);
    expect(again.scores.rma.goals).toBe(1);
    expect(again.active?.id).toBe('a:1');
  });
  it('rejects club changes while a round is active and soft deletion loss', () => {
    const s = ready();
    const c = structuredClone(s.config);
    c.clubs[0].enabled = false;
    expect(() => configure(s, c, now)).toThrow();
    const idle = initialState(now);
    const cut = structuredClone(idle.config);
    cut.clubs.pop();
    expect(() => configure(idle, cut, now)).toThrow();
  });
  it('handles a 500-action burst while retaining every distinct action', () => {
    const s = ready();
    comment(s);
    gift(s, 1, 'burst', 500);
    expect(s.queue).toHaveLength(500);
    const at = drain(s);
    expect(s.scores.rma.goals).toBe(500);
    expect(s.scores.rma.skillPoints).toBe(1000);
    expect(at).toBeGreaterThan(now);
  });
});

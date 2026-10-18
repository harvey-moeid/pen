import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
import { ConfigSchema, emptyScore, type GameEvent, type RoomState } from '../src/game/model';
import { OverlayText, overlayVariables } from '../src/client/overlay';

const now = 1000000;
function ready() {
  const s = initialState(now);
  s.config.randomClubWithoutComment = true;
  s.config.likes = { enabled: true, likesPerKick: 100 };
  s.config.match.mode = 'ENDLESS';
  s.config.match.countdownSec = 0;
  s.config.idle.enabled = false;
  s.config.skills.forEach((skill) => {
    skill.goalChancePercent = 100;
  });
  startRound(s, now);
  tick(s, now, () => 0);
  return s;
}
const gift = (units = 1): GameEvent => ({
  id: 'gift',
  type: 'gift',
  at: now,
  userId: 'alice',
  displayName: 'Alice',
  gift: { id: 'rose', coins: 1, units, final: true },
});
const like = (likeCount: number): GameEvent => ({
  id: 'like',
  type: 'like',
  at: now,
  userId: 'alice',
  displayName: 'Alice',
  likeCount,
});
function select(s: RoomState, comment: string) {
  return ingest(s, { id: 'comment', type: 'comment', at: now, userId: 'alice', comment }, now);
}

describe('gacha club for viewers without a club comment', () => {
  it('keeps legacy settings disabled and legacy club selections intact', () => {
    const s = ready();
    select(s, 'RMA');
    const legacy = JSON.parse(JSON.stringify(s));
    delete legacy.config.randomClubWithoutComment;
    delete legacy.viewers['u:alice'].clubSelection;
    expect(ConfigSchema.parse(legacy.config).randomClubWithoutComment).toBe(false);
    const restored = restoreState(JSON.stringify(legacy));
    expect(restored.config.randomClubWithoutComment).toBe(false);
    ingest(restored, gift(), now, () => 0.99);
    expect(restored.queue[0].clubId).toBe('rma');
  });
  it('draws each combo kick independently from enabled clubs and scores those clubs', () => {
    const s = ready();
    s.config.clubs[1].enabled = false;
    const random = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.99);
    expect(ingest(s, gift(3), now, random)).toMatchObject({ status: 'queued', actions: 3 });
    expect(random).toHaveBeenCalledTimes(3);
    expect(s.queue.map((kick) => kick.clubId)).toEqual(['rma', 'mun', 'juv']);
    expect(s.queue.every((kick) => kick.randomClub && kick.source === 'GIFT')).toBe(true);
    expect(s.viewers['u:alice']).toMatchObject({ clubSelection: 'RANDOM', clubId: 'juv' });
    for (let i = 0; i <= 3; i++) tick(s, now + i * 16000, () => 0);
    for (const id of ['rma', 'mun', 'juv'])
      expect(s.scores[id]).toMatchObject({ goals: 1, kicks: 1, giftPoints: 1 });
    expect(s.scores.bar).toEqual(emptyScore());
    expect(s.viewers['u:alice'].score).toMatchObject({ kicks: 3, goals: 3, giftPoints: 3 });
  });
  it('does not turn the last random result into a permanent selection', () => {
    const s = ready();
    ingest(s, gift(), now, () => 0);
    ingest(s, { ...gift(), id: 'next-gift' }, now, () => 0.99);
    expect(s.queue.map((kick) => kick.clubId)).toEqual(['rma', 'juv']);
    expect(select(s, 'BAR').status).toBe('club_selected');
    const random = vi.fn(() => 0.99);
    ingest(s, { ...gift(), id: 'selected-gift' }, now, random);
    expect(random).not.toHaveBeenCalled();
    expect(s.queue[2]).toMatchObject({ clubId: 'bar', randomClub: false });
    expect(s.queue[0].clubId).toBe('rma');
    expect(select(s, 'RMA').status).toBe('cooldown');
  });
  it('accumulates per-viewer likes and draws only when a threshold becomes a kick', () => {
    const s = ready();
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    expect(ingest(s, like(60), now, random)).toMatchObject({ actions: 0, remainingLikes: 60 });
    expect(random).not.toHaveBeenCalled();
    const restored = restoreState(JSON.stringify(s));
    expect(ingest(restored, like(190), now, random)).toMatchObject({
      actions: 2,
      remainingLikes: 50,
    });
    expect(restored.queue.map((kick) => kick.clubId)).toEqual(['rma', 'juv']);
    expect(restored.queue.every((kick) => kick.source === 'LIKE' && kick.contribution === 0)).toBe(
      true,
    );
    expect(restored.viewers['u:alice'].likeRemainder).toBe(50);
    expect(ingest(restored, { ...like(60), userId: 'bob' }, now).remainingLikes).toBe(60);
    expect(restored.viewers['u:alice'].likeRemainder).toBe(50);
    select(restored, 'JUV');
    expect(restored.viewers['u:alice'].likeRemainder).toBe(0);
  });
  it('does not draw or partially mutate viewers for invalid or overflowing events', () => {
    const s = ready();
    const random = vi.fn(() => 0);
    const send = (e: GameEvent) => ingest(s, e, now, random);
    s.config.queue.capacity = 1;
    expect(send(gift(2))).toMatchObject({ status: 'queue_full', retryable: true });
    expect(s.viewers['u:alice']).toBeUndefined();
    expect(send({ ...gift(), gift: { ...gift().gift!, final: false } }).status).toBe(
      'streak_pending',
    );
    expect(send({ ...gift(), gift: { ...gift().gift!, coins: 999 } }).status).toBe('unmapped');
    expect(send(like(0)).status).toBe('invalid_like_count');
    expect(send({ ...gift(), userId: undefined }).status).toBe('invalid_identity');
    control(s, 'pause', now);
    expect(send(gift()).status).toBe('round_closed');
    expect(send(like(100)).status).toBe('round_closed');
    control(s, 'resume', now);
    s.config.likes.enabled = false;
    expect(send(like(100)).status).toBe('likes_disabled');
    s.config.likes.enabled = true;
    s.config.skills[0].enabled = false;
    expect(send(like(100)).status).toBe('normal_disabled');
    s.config.skills[0].enabled = true;
    expect(random).not.toHaveBeenCalled();
    expect(Object.keys(s.viewers)).toHaveLength(0);
    send(like(50));
    expect(send(like(200))).toMatchObject({ status: 'queue_full', retryable: true });
    expect(s.viewers['u:alice'].likeRemainder).toBe(50);
    expect(random).not.toHaveBeenCalled();
    s.config.queue.capacity = 2;
    expect(send(like(200))).toMatchObject({ actions: 2, remainingLikes: 50 });
    expect(random).toHaveBeenCalledTimes(2);
  });
  it('enforces viewer capacity for gift and even partial likes before drawing', () => {
    const s = ready();
    s.viewers = Object.fromEntries(
      Array.from({ length: 10000 }, (_, i) => [
        `u:${i}`,
        {
          clubId: 'rma',
          displayName: 'Viewer',
          changedAt: now,
          seenAt: now,
          score: emptyScore(),
        },
      ]),
    );
    const random = vi.fn(() => 0);
    expect(ingest(s, gift(), now, random)).toMatchObject({
      status: 'viewer_capacity',
      retryable: true,
    });
    expect(ingest(s, like(1), now, random)).toMatchObject({
      status: 'viewer_capacity',
      retryable: true,
    });
    expect(random).not.toHaveBeenCalled();
    expect(s.viewers['u:alice']).toBeUndefined();
  });
  it('disables future gacha and clears only random-viewer partial likes while preserving queued clubs', () => {
    const s = ready();
    ingest(s, like(150), now, () => 0.99);
    ingest(s, { ...like(1), userId: 'bob' }, now);
    ingest(s, { id: 'select-bob', type: 'comment', at: now, userId: 'bob', comment: 'RMA' }, now);
    ingest(s, { ...like(60), userId: 'bob' }, now);
    configure(s, { ...s.config, randomClubWithoutComment: false }, now);
    expect(s.viewers['u:alice'].likeRemainder).toBe(0);
    expect(s.viewers['u:bob'].likeRemainder).toBe(60);
    expect(ingest(s, gift(), now).status).toBe('no_club');
    expect(ingest(s, like(100), now).status).toBe('no_club');
    expect(s.queue[0].clubId).toBe('juv');
    expect(ingest(s, { ...like(40), userId: 'bob' }, now).actions).toBe(1);
    expect(select(s, 'RMA').status).toBe('club_selected');
  });
  it('updates default overlay guidance and labels gacha kicks while preserving custom copy', () => {
    const s = ready();
    ingest(s, like(100), now, () => 0.99);
    tick(s, now, () => 0);
    const snapshot = publicSnapshot(s, now);
    const variables = overlayVariables(snapshot);
    expect(snapshot.randomClubWithoutComment).toBe(true);
    expect(variables.source).toBe('GACHA · LIKE · ');
    const render = () =>
      renderToStaticMarkup(
        createElement(OverlayText, { settings: s.config.overlay, name: 'giftNotice', variables }),
      );
    expect(render()).toContain('diundi');
    s.config.overlay.text.giftNotice.text = 'Tulisan khusus operator';
    expect(render()).toContain('Tulisan khusus operator');
    expect(render()).not.toContain('diundi');
  });
});

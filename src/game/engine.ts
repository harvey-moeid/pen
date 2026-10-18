import {
  defaultConfig,
  defaultLikeSettings,
  emptyScore,
  skillIds,
  type Config,
  type RoomState,
  type Kick,
  type GameEvent,
  type Receipt,
  type Outcome,
  type Result,
  type Skill,
  type Viewer,
} from './model';
export function restoreState(serialized: string): RoomState {
  const state: RoomState = JSON.parse(serialized);
  state.config.likes ??= defaultLikeSettings();
  return state;
}
export function initialState(now = Date.now(), config = defaultConfig()): RoomState {
  return {
    schema: 1,
    revision: 0,
    configVersion: 1,
    config,
    matchId: 'round-1',
    round: 1,
    status: 'WAITING',
    pausedAt: null,
    phaseEndsAt: null,
    deadline: null,
    sequence: 0,
    queue: [],
    active: null,
    lastKick: null,
    scores: Object.fromEntries(config.clubs.map((c) => [c.id, emptyScore()])),
    viewers: {},
    history: [],
    lastActivity: now,
    nextDemoAt: now + config.idle.timeoutMs,
    connector: { status: 'DISCONNECTED', lastEventAt: null, delayMs: 0 },
    notice: null,
    stats: { accepted: 0, rejected: 0, duplicates: 0, reordered: 0 },
    audit: [],
  };
}
export function audit(s: RoomState, now: number, action: string, detail: string) {
  s.audit.unshift({ at: now, action, detail });
  s.audit = s.audit.slice(0, 100);
}
export function matchGift(c: Config, gift: { id: string; coins: number }) {
  const candidates = c.mappings.filter(
    (m) =>
      m.enabled &&
      ((m.giftId && m.giftId === gift.id) ||
        (!m.giftId && c.coinFallback && m.coinValueFallback === gift.coins)),
  );
  return candidates.sort(
    (a, b) =>
      Number(Boolean(b.giftId) && b.skillId === 'NORMAL') -
        Number(Boolean(a.giftId) && a.skillId === 'NORMAL') ||
      Number(Boolean(b.giftId)) - Number(Boolean(a.giftId)) ||
      b.matchPriority - a.matchPriority ||
      a.id.localeCompare(b.id),
  )[0];
}
function enqueue(
  s: RoomState,
  e: GameEvent,
  viewer: Viewer,
  skill: Skill,
  units: number,
  contribution: number,
  now: number,
  source: 'GIFT' | 'LIKE',
): Receipt {
  for (let i = 0; i < units; i++) {
    s.queue.push({
      id: `${e.id}:${i}`,
      eventId: e.id,
      matchId: s.matchId,
      clubId: viewer.clubId,
      supporterId: 'u:' + e.userId,
      supporterName: viewer.displayName,
      skill: structuredClone(skill),
      contribution,
      queuedAt: now,
      sequence: ++s.sequence,
      overtakes: 0,
      demo: false,
      configVersion: s.configVersion,
      source,
    });
  }
  viewer.seenAt = now;
  s.lastActivity = now;
  s.nextDemoAt = now + s.config.idle.timeoutMs;
  s.stats.accepted += units;
  return { status: 'queued', actions: units };
}
export function ingest(s: RoomState, e: GameEvent, now: number): Receipt {
  s.connector.lastEventAt = now;
  s.connector.delayMs = Math.max(0, now - e.at);
  if (e.type === 'connected' || e.type === 'disconnected' || e.type === 'reconnecting') {
    s.connector.status = e.type.toUpperCase() as RoomState['connector']['status'];
    return { status: e.type };
  }
  if (e.type === 'ignored') return { status: 'ignored' };
  s.connector.status = 'CONNECTED';
  const reject = (status: string, message: string, retryable = false): Receipt => {
    s.stats.rejected++;
    if (!s.notice || now - s.notice.at >= 3000) s.notice = { text: message, at: now };
    audit(s, now, status, e.id);
    return { status, message, retryable };
  };
  if (!e.userId) return reject('invalid_identity', 'Identitas penonton tidak valid');
  const userKey = 'u:' + e.userId;
  const viewer = s.viewers[userKey];
  if (e.type === 'comment') {
    const club = s.config.clubs.find(
      (c) => c.enabled && c.code === (e.comment ?? '').trim().toUpperCase(),
    );
    if (!club) return { status: 'ignored_comment' };
    if (
      viewer &&
      viewer.clubId !== club.id &&
      now - viewer.changedAt < s.config.clubSwitchCooldownMs
    )
      return reject('cooldown', 'Tunggu sebelum pindah klub');
    if (!viewer && Object.keys(s.viewers).length >= 10000)
      return reject('viewer_capacity', 'Kapasitas penonton penuh', true);
    s.viewers[userKey] = {
      clubId: club.id,
      displayName: (e.displayName || 'Pendukung').slice(0, 40),
      changedAt: viewer?.clubId === club.id ? viewer.changedAt : now,
      seenAt: now,
      score: viewer?.score ?? emptyScore(),
      likeRemainder: viewer?.clubId === club.id ? (viewer.likeRemainder ?? 0) : 0,
    };
    return { status: 'club_selected', message: club.code };
  }
  if (e.type === 'like') {
    if (!s.config.likes.enabled) return { status: 'likes_disabled' };
    const count = e.likeCount;
    if (count === undefined || !Number.isInteger(count) || count < 1 || count > 1000000)
      return reject('invalid_like_count', 'Jumlah like tidak valid');
    if (!viewer || !s.config.clubs.some((c) => c.id === viewer.clubId && c.enabled))
      return reject('no_club', 'Pilih klub dulu!');
    if (s.status !== 'LIVE' || s.pausedAt !== null)
      return reject('round_closed', 'Ronde tidak menerima like');
    const skill = s.config.skills.find((k) => k.id === 'NORMAL' && k.enabled);
    if (!skill) return reject('normal_disabled', 'Aktifkan skill Normal Kick untuk tendangan like');
    const total = (viewer.likeRemainder ?? 0) + count;
    const units = Math.floor(total / s.config.likes.likesPerKick);
    if (s.queue.length + units > s.config.queue.capacity)
      return reject('queue_full', 'Antrean penuh; event perlu dikirim ulang', true);
    viewer.likeRemainder = total % s.config.likes.likesPerKick;
    viewer.seenAt = now;
    s.lastActivity = now;
    s.nextDemoAt = now + s.config.idle.timeoutMs;
    if (!units)
      return { status: 'likes_accumulated', actions: 0, remainingLikes: viewer.likeRemainder };
    return {
      ...enqueue(s, e, viewer, skill, units, 0, now, 'LIKE'),
      remainingLikes: viewer.likeRemainder,
    };
  }
  const gift = e.gift;
  if (!gift || !gift.final) return { status: 'streak_pending' };
  if (!viewer || !s.config.clubs.some((c) => c.id === viewer.clubId && c.enabled))
    return reject('no_club', 'Pilih klub dulu!');
  if (s.status !== 'LIVE' || s.pausedAt !== null)
    return reject('round_closed', 'Ronde tidak menerima gift');
  const mapping = matchGift(s.config, gift);
  const skill = s.config.skills.find((k) => k.id === mapping?.skillId && k.enabled);
  if (!mapping || !skill) return reject('unmapped', 'Gift belum dipetakan');
  if (s.queue.length + gift.units > s.config.queue.capacity)
    return reject('queue_full', 'Antrean penuh; event perlu dikirim ulang', true);
  return enqueue(s, e, viewer, skill, gift.units, mapping.contributionPoints, now, 'GIFT');
}
export function pickNext(s: RoomState, now: number): Kick | undefined {
  if (!s.queue.length) return;
  let index = 0;
  const q = s.config.queue;
  if (q.smart && now - s.queue[0].queuedAt < q.maxWaitMs && s.queue[0].overtakes < q.maxOvertakes) {
    const eligible = s.queue.slice(0, q.maxOvertakes + 1);
    const rank = (k: Kick) => k.skill.priorityTier + Math.floor((now - k.queuedAt) / q.agingMs);
    for (let i = 1; i < eligible.length; i++) {
      if (
        eligible
          .slice(0, i)
          .some((k) => k.overtakes >= q.maxOvertakes || now - k.queuedAt >= q.maxWaitMs)
      )
        break;
      if (rank(eligible[i]) > rank(eligible[index])) index = i;
    }
  }
  if (index) {
    s.queue.slice(0, index).forEach((k) => k.overtakes++);
    s.stats.reordered++;
    audit(s, now, 'queue_reorder', `${s.queue[index].id} overtook ${index}`);
  }
  return s.queue.splice(index, 1)[0];
}
export function startRound(s: RoomState, now: number) {
  if (!['WAITING', 'RESULT', 'INTERMISSION'].includes(s.status) || s.queue.length || s.active)
    throw Error('Selesaikan ronde dan antrean dahulu');
  if (s.status === 'RESULT' || s.status === 'INTERMISSION') {
    s.round++;
    s.matchId = `round-${s.round}`;
  }
  s.scores = Object.fromEntries(s.config.clubs.map((c) => [c.id, emptyScore()]));
  for (const v of Object.values(s.viewers)) {
    v.score = emptyScore();
    v.likeRemainder = 0;
  }
  s.status = 'COUNTDOWN';
  s.phaseEndsAt = now + s.config.match.countdownSec * 1000;
  s.deadline = null;
  s.pausedAt = null;
  s.lastKick = null;
  s.lastActivity = now;
  s.nextDemoAt = now + s.config.idle.timeoutMs;
}
export function finish(s: RoomState, now: number): Result {
  const metric = { GOALS: 'goals', SKILL_POINTS: 'skillPoints', GIFT_POINTS: 'giftPoints' }[
    s.config.match.ranking
  ] as 'goals' | 'skillPoints' | 'giftPoints';
  const entries = Object.entries(s.scores).filter(([id]) =>
    s.config.clubs.some((c) => c.id === id && c.enabled),
  );
  const max = Math.max(...entries.map(([, score]) => score[metric]));
  const result: Result = {
    id: s.matchId,
    endedAt: now,
    ranking: s.config.match.ranking,
    winners: entries.filter(([, score]) => score[metric] === max).map(([id]) => id),
    scores: structuredClone(s.scores),
    clubs: structuredClone(s.config.clubs),
  };
  s.history.unshift(result);
  s.history = s.history.slice(0, 50);
  s.status = 'RESULT';
  s.phaseEndsAt = now + s.config.match.resultSec * 1000;
  s.deadline = null;
  return result;
}
export function tick(s: RoomState, now: number, random: () => number): void {
  if (
    s.connector.lastEventAt &&
    now - s.connector.lastEventAt > 90000 &&
    s.connector.status === 'CONNECTED'
  )
    s.connector.status = 'RECONNECTING';
  if (s.active && now >= s.active.endsAt!) {
    const k = s.active;
    if (!k.demo) {
      const scores = [s.scores[k.clubId], s.viewers[k.supporterId]?.score].filter(Boolean);
      for (const score of scores) {
        score.kicks++;
        score.giftPoints += k.contribution;
        if (k.outcome === 'GOAL') {
          score.goals++;
          score.skillPoints += k.skill.pointsOnGoal;
        }
      }
      if (
        s.config.match.mode === 'TARGET_GOALS' &&
        s.scores[k.clubId].goals >= s.config.match.targetGoals
      )
        s.status = 'CLOSING';
    }
    s.lastKick = k;
    s.active = null;
    s.nextDemoAt = now + s.config.idle.intervalMs;
  }
  if (s.pausedAt !== null) return;
  if (s.status === 'COUNTDOWN' && now >= s.phaseEndsAt!) {
    s.status = 'LIVE';
    s.deadline = s.config.match.mode === 'TIME' ? now + s.config.match.durationSec * 1000 : null;
    s.phaseEndsAt = null;
  }
  if (s.status === 'LIVE' && s.deadline !== null && now >= s.deadline) s.status = 'CLOSING';
  if (s.status === 'CLOSING' && !s.active && !s.queue.length) {
    finish(s, now);
    return;
  }
  if (s.status === 'RESULT' && now >= s.phaseEndsAt!) {
    s.status = 'INTERMISSION';
    s.phaseEndsAt = now + s.config.match.intermissionSec * 1000;
  }
  if (s.status === 'INTERMISSION' && now >= s.phaseEndsAt!) {
    if (s.config.match.autoRestart) startRound(s, now);
    else {
      s.status = 'WAITING';
      s.phaseEndsAt = null;
      s.round++;
      s.matchId = `round-${s.round}`;
    }
  }
  if (!s.active && ['LIVE', 'CLOSING'].includes(s.status)) {
    let kick = pickNext(s, now);
    if (
      !kick &&
      s.status === 'LIVE' &&
      s.config.idle.enabled &&
      now >= s.nextDemoAt &&
      now - s.lastActivity >= s.config.idle.timeoutMs
    ) {
      const clubs = s.config.clubs.filter((c) => c.enabled),
        skills = s.config.skills.filter((k) => k.enabled);
      if (skills.length) {
        const club = clubs[s.sequence % clubs.length],
          skill = skills[s.sequence % skills.length];
        kick = {
          id: `demo-${++s.sequence}`,
          eventId: 'demo',
          matchId: s.matchId,
          clubId: club.id,
          supporterId: 'demo',
          supporterName: 'Pemanasan',
          skill: structuredClone(skill),
          contribution: 0,
          queuedAt: now,
          sequence: s.sequence,
          overtakes: 0,
          demo: true,
          configVersion: s.configVersion,
        };
      }
    }
    if (kick) {
      kick.outcome =
        random() * 100 < kick.skill.goalChancePercent ? 'GOAL' : random() < 0.75 ? 'SAVE' : 'MISS';
      kick.startedAt = now;
      kick.endsAt = now + kick.skill.durationMs;
      s.active = kick;
    }
  }
}
export function control(s: RoomState, action: string, now: number) {
  if (action === 'start') startRound(s, now);
  else if (action === 'stop') {
    if (['LIVE', 'COUNTDOWN'].includes(s.status)) {
      s.status = 'CLOSING';
      s.pausedAt = null;
    }
  } else if (action === 'pause') {
    if (s.status === 'LIVE' && s.pausedAt === null) s.pausedAt = now;
  } else if (action === 'resume') {
    if (s.pausedAt !== null) {
      if (s.deadline) s.deadline += now - s.pausedAt;
      s.pausedAt = null;
    }
  } else if (action === 'reset') {
    if (s.queue.length || s.active || !['WAITING', 'RESULT', 'INTERMISSION'].includes(s.status))
      throw Error('Hentikan dan habiskan antrean sebelum reset');
    if (s.status !== 'WAITING') {
      s.round++;
      s.matchId = `round-${s.round}`;
    }
    s.status = 'WAITING';
    s.phaseEndsAt = null;
    s.scores = Object.fromEntries(s.config.clubs.map((c) => [c.id, emptyScore()]));
    for (const v of Object.values(s.viewers)) {
      v.score = emptyScore();
      v.likeRemainder = 0;
    }
  } else throw Error('Kontrol tidak dikenal');
  audit(s, now, 'control', action);
}
export function configure(s: RoomState, c: Config, now: number) {
  // Structural / round rules cannot rewrite an already-running competition.
  if (!['WAITING', 'RESULT', 'INTERMISSION'].includes(s.status) || s.active || s.queue.length) {
    if (
      JSON.stringify(c.clubs) !== JSON.stringify(s.config.clubs) ||
      JSON.stringify(c.match) !== JSON.stringify(s.config.match)
    )
      throw Error('Ubah klub dan aturan ronde setelah ronde selesai');
  }
  if (c.queue.capacity < s.queue.length) throw Error('Kapasitas lebih kecil dari antrean saat ini');
  const removed = s.config.clubs.filter((old) => !c.clubs.some((n) => n.id === old.id));
  if (removed.length) throw Error('Nonaktifkan klub lama; ID klub tidak boleh dihapus');
  audit(
    s,
    now,
    'config',
    JSON.stringify({ from: s.configVersion, to: s.configVersion + 1, before: s.config, after: c }),
  );
  if (JSON.stringify(s.config.likes) !== JSON.stringify(c.likes))
    for (const viewer of Object.values(s.viewers)) viewer.likeRemainder = 0;
  s.config = c;
  s.configVersion++;
  for (const club of c.clubs) s.scores[club.id] ??= emptyScore();
}
export function publicSnapshot(s: RoomState, now: number) {
  const kick = (k: Kick | null) =>
    k
      ? {
          id: k.id,
          clubId: k.clubId,
          supporterName: k.supporterName,
          skill: k.skill,
          demo: k.demo,
          source: k.source ?? (k.demo ? 'DEMO' : 'GIFT'),
          outcome: k.outcome,
          startedAt: k.startedAt,
          endsAt: k.endsAt,
          sequence: k.sequence,
          queuedAt: k.queuedAt,
        }
      : null;
  return {
    serverTime: now,
    revision: s.revision,
    configVersion: s.configVersion,
    clubs: s.config.clubs.filter((c) => c.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    skills: s.config.skills,
    likes: s.config.likes,
    giftLegend: s.config.skills
      .filter((skill) => skill.enabled)
      .map((skill) => ({
        skillId: skill.id,
        skillLabel: skill.label,
        triggers: [
          ...(skill.id === 'NORMAL' && s.config.likes.enabled
            ? [`${s.config.likes.likesPerKick} like / penonton`]
            : []),
          ...s.config.mappings
            .filter(
              (m) => m.enabled && m.skillId === skill.id && (m.giftId || s.config.coinFallback),
            )
            .map(
              (m) => m.displayName || (m.giftId ? 'Gift khusus' : `${m.coinValueFallback} koin`),
            ),
        ],
      })),
    visual: s.config.visual,
    ranking: s.config.match.ranking,
    mode: s.config.match.mode,
    targetGoals: s.config.match.targetGoals,
    round: s.round,
    status: s.status,
    pausedAt: s.pausedAt,
    phaseEndsAt: s.phaseEndsAt,
    deadline: s.deadline,
    scores: s.scores,
    active: kick(s.active),
    lastKick: kick(s.lastKick),
    queue: s.queue.slice(0, 6).map((k) => kick(k)!),
    queueDepth: s.queue.length,
    connector: s.connector,
    notice: s.notice,
    result: s.history[0] ?? null,
    supporters: Object.values(s.viewers)
      .filter((v) => v.score.kicks)
      .sort((a, b) => b.score.giftPoints - a.score.giftPoints)
      .slice(0, 5)
      .map((v) => ({ displayName: v.displayName, clubId: v.clubId, ...v.score })),
  };
}
export type Snapshot = ReturnType<typeof publicSnapshot>;
export function simulate(
  s: RoomState,
  clubId: string,
  skillId: (typeof skillIds)[number],
  outcome: Outcome,
  now: number,
) {
  if (s.active) throw Error('Tunggu animasi demo selesai');
  const skill = s.config.skills.find((x) => x.id === skillId)!;
  if (!s.config.clubs.some((c) => c.id === clubId && c.enabled)) throw Error('Klub tidak aktif');
  s.active = {
    id: `sim-${++s.sequence}`,
    eventId: 'simulation',
    matchId: s.matchId,
    clubId,
    supporterId: 'demo',
    supporterName: 'Simulasi operator',
    skill: structuredClone(skill),
    contribution: 0,
    queuedAt: now,
    sequence: s.sequence,
    overtakes: 0,
    demo: true,
    outcome,
    startedAt: now,
    endsAt: now + skill.durationMs,
    configVersion: s.configVersion,
  };
}

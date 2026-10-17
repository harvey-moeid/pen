import { z } from 'zod';
export const skillIds = ['NORMAL', 'SKILL_1', 'SKILL_2', 'SKILL_3', 'ULTIMATE'] as const;
export const SkillIdSchema = z.enum(skillIds);
export type SkillId = z.infer<typeof SkillIdSchema>;
const key = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/)
  .refine((v) => !['__proto__', 'prototype', 'constructor'].includes(v));
const asset = z
  .string()
  .regex(/^[a-zA-Z0-9_./-]{1,200}$/)
  .refine((v) => !v.includes('..'))
  .optional();
export const ClubSchema = z.object({
  id: key,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/),
  displayName: z.string().trim().min(1).max(40),
  enabled: z.boolean(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().min(0).max(100),
  number: z.number().int().min(1).max(99),
  logoAssetKey: asset,
  characterAssetKey: asset,
});
export const SkillSchema = z.object({
  id: SkillIdSchema,
  label: z.string().min(1).max(40),
  goalChancePercent: z.number().min(0).max(100),
  pointsOnGoal: z.number().min(0).max(10000),
  durationMs: z.number().int().min(3000).max(15000),
  priorityTier: z.number().int().min(0).max(10),
  enabled: z.boolean(),
});
export const MappingSchema = z
  .object({
    id: key,
    giftId: z.string().trim().min(1).max(80).optional(),
    displayName: z.string().trim().max(40).optional(),
    coinValueFallback: z.number().int().min(0).max(100000).optional(),
    skillId: SkillIdSchema,
    contributionPoints: z.number().min(0).max(100000),
    enabled: z.boolean(),
    matchPriority: z.number().int().min(0).max(100),
  })
  .refine(
    (v) => v.giftId !== undefined || v.coinValueFallback !== undefined,
    'Isi Gift ID atau nilai koin',
  );
export const ConfigSchema = z
  .object({
    clubs: z.array(ClubSchema).min(1).max(8),
    skills: z.array(SkillSchema).length(5),
    mappings: z.array(MappingSchema).max(100),
    coinFallback: z.boolean(),
    match: z.object({
      mode: z.enum(['TIME', 'TARGET_GOALS', 'ENDLESS']),
      durationSec: z.number().int().min(10).max(86400),
      targetGoals: z.number().int().min(1).max(10000),
      countdownSec: z.number().int().min(0).max(60),
      resultSec: z.number().int().min(3).max(120),
      intermissionSec: z.number().int().min(1).max(120),
      autoRestart: z.boolean(),
      ranking: z.enum(['GOALS', 'SKILL_POINTS', 'GIFT_POINTS']),
    }),
    queue: z.object({
      smart: z.boolean(),
      capacity: z.number().int().min(1).max(2000),
      maxOvertakes: z.number().int().min(0).max(20),
      agingMs: z.number().int().min(1000).max(60000),
      maxWaitMs: z.number().int().min(1000).max(600000),
    }),
    idle: z.object({
      enabled: z.boolean(),
      timeoutMs: z.number().int().min(5000).max(300000),
      intervalMs: z.number().int().min(5000).max(300000),
    }),
    visual: z.object({
      quality: z.enum(['Low', 'Medium', 'High']),
      safeArea: z.number().min(0).max(25),
      volume: z.number().min(0).max(1),
      cinematic: z.boolean(),
      keeperColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
    clubSwitchCooldownMs: z.number().int().min(0).max(3600000),
    sourceRoomId: z.string().max(100),
    retentionDays: z.number().int().min(1).max(30),
  })
  .superRefine((c, ctx) => {
    for (const field of ['id', 'code'] as const)
      if (new Set(c.clubs.map((x) => x[field])).size !== c.clubs.length)
        ctx.addIssue({ code: 'custom', message: `Klub ${field} harus unik` });
    if (!c.clubs.some((x) => x.enabled))
      ctx.addIssue({ code: 'custom', message: 'Minimal satu klub aktif' });
    if (new Set(c.skills.map((x) => x.id)).size !== 5)
      ctx.addIssue({ code: 'custom', message: 'Lima skill unik wajib tersedia' });
    if (c.mappings.some((m) => m.skillId === 'NORMAL' && !m.giftId))
      ctx.addIssue({ code: 'custom', message: 'Normal Kick wajib memakai Gift ID khusus' });
    if (new Set(c.mappings.map((x) => x.id)).size !== c.mappings.length)
      ctx.addIssue({ code: 'custom', message: 'ID mapping harus unik' });
  });
export type Config = z.infer<typeof ConfigSchema>;
export type Club = z.infer<typeof ClubSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Outcome = 'GOAL' | 'SAVE' | 'MISS';
export type Score = { goals: number; skillPoints: number; giftPoints: number; kicks: number };
export type Viewer = {
  clubId: string;
  displayName: string;
  changedAt: number;
  seenAt: number;
  score: Score;
};
export type Kick = {
  id: string;
  eventId: string;
  matchId: string;
  clubId: string;
  supporterId: string;
  supporterName: string;
  skill: Skill;
  contribution: number;
  queuedAt: number;
  sequence: number;
  overtakes: number;
  demo: boolean;
  outcome?: Outcome;
  startedAt?: number;
  endsAt?: number;
  configVersion: number;
};
export type MatchStatus = 'WAITING' | 'COUNTDOWN' | 'LIVE' | 'CLOSING' | 'RESULT' | 'INTERMISSION';
export type Result = {
  id: string;
  endedAt: number;
  ranking: Config['match']['ranking'];
  winners: string[];
  scores: Record<string, Score>;
  clubs: Club[];
};
export type RoomState = {
  schema: 1;
  revision: number;
  configVersion: number;
  config: Config;
  matchId: string;
  round: number;
  status: MatchStatus;
  pausedAt: number | null;
  phaseEndsAt: number | null;
  deadline: number | null;
  sequence: number;
  queue: Kick[];
  active: Kick | null;
  lastKick: Kick | null;
  scores: Record<string, Score>;
  viewers: Record<string, Viewer>;
  history: Result[];
  lastActivity: number;
  nextDemoAt: number;
  connector: {
    status: 'DISCONNECTED' | 'CONNECTED' | 'RECONNECTING';
    lastEventAt: number | null;
    delayMs: number;
  };
  notice: { text: string; at: number } | null;
  stats: { accepted: number; rejected: number; duplicates: number; reordered: number };
  audit: { at: number; action: string; detail: string }[];
};
export type GameEvent = {
  id: string;
  type: 'comment' | 'gift' | 'connected' | 'disconnected' | 'reconnecting' | 'ignored';
  at: number;
  userId?: string;
  displayName?: string;
  comment?: string;
  gift?: { id: string; coins: number; units: number; final: boolean };
};
export type Receipt = { status: string; actions?: number; message?: string; retryable?: boolean };
export const emptyScore = (): Score => ({ goals: 0, skillPoints: 0, giftPoints: 0, kicks: 0 });
export function defaultConfig(): Config {
  return {
    clubs: [
      ['rma', 'RMA', 'Madrid', '#f4f2ed', '#d3ae55'],
      ['bar', 'BAR', 'Barcelona', '#a82649', '#264aab'],
      ['mun', 'MUN', 'Manchester', '#e14448', '#141923'],
      ['psg', 'PSG', 'Paris', '#2a64ce', '#e84e65'],
      ['juv', 'JUV', 'Juventus', '#f2f0e9', '#252933'],
    ].map(([id, code, displayName, primaryColor, secondaryColor], i) => ({
      id,
      code,
      displayName,
      primaryColor,
      secondaryColor,
      enabled: true,
      sortOrder: i,
      number: [7, 10, 9, 11, 21][i],
    })),
    skills: skillIds.map((id, i) => ({
      id,
      label: ['Normal Kick', 'Fire Shot', 'Thunder Curve', 'Phantom Strike', 'Dragon Meteor'][i],
      goalChancePercent: [40, 55, 70, 85, 100][i],
      pointsOnGoal: [1, 2, 3, 5, 10][i],
      durationMs: [4000, 4500, 5000, 6000, 7500][i],
      priorityTier: i,
      enabled: true,
    })),
    mappings: [1, 5, 10, 30].map((coins, i) => ({
      id: `coin-${coins}`,
      coinValueFallback: coins,
      skillId: skillIds[i + 1],
      contributionPoints: coins,
      enabled: true,
      matchPriority: 10,
    })),
    coinFallback: true,
    match: {
      mode: 'TIME',
      durationSec: 300,
      targetGoals: 10,
      countdownSec: 3,
      resultSec: 10,
      intermissionSec: 5,
      autoRestart: false,
      ranking: 'GOALS',
    },
    queue: { smart: true, capacity: 500, maxOvertakes: 3, agingMs: 15000, maxWaitMs: 60000 },
    idle: { enabled: true, timeoutMs: 30000, intervalMs: 15000 },
    visual: {
      quality: 'Medium',
      safeArea: 6,
      volume: 0.35,
      cinematic: true,
      keeperColor: '#e9ad44',
    },
    clubSwitchCooldownMs: 10000,
    sourceRoomId: '',
    retentionDays: 7,
  };
}

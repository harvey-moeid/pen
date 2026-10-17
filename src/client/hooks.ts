import { useEffect, useRef, useState } from 'react';
import {
  initialState,
  publicSnapshot,
  startRound,
  tick,
  ingest,
  type Snapshot,
} from '../game/engine';
import { type SkillId, type Outcome, defaultConfig } from '../game/model';
export function useDemo() {
  const state = useRef(initialState());
  const forced = useRef(new Map<string, Outcome>());
  const advance = (now: number) => {
    const current = state.current;
    tick(current, now, Math.random);
    if (current.active && forced.current.has(current.active.eventId)) {
      current.active.outcome = forced.current.get(current.active.eventId)!;
      forced.current.delete(current.active.eventId);
    }
  };
  const [snapshot, setSnapshot] = useState(() => publicSnapshot(state.current, Date.now()));
  useEffect(() => {
    const s = state.current;
    s.config.match.mode = 'ENDLESS';
    s.config.match.countdownSec = 0;
    s.config.idle.timeoutMs = 7000;
    s.config.idle.intervalMs = 8000;
    startRound(s, Date.now());
    const timer = setInterval(() => {
      advance(Date.now());
      setSnapshot(publicSnapshot(state.current, Date.now()));
    }, 80);
    return () => clearInterval(timer);
  }, []);
  const shoot = (clubId: string, skillId: SkillId, outcome?: Outcome) => {
    const s = state.current,
      now = Date.now();
    const club = s.config.clubs.find((c) => c.id === clubId)!;
    const id = crypto.randomUUID(),
      giftId = 'preview-' + skillId;
    s.config.mappings = s.config.mappings.filter((m) => m.id !== 'preview');
    s.config.mappings.push({
      id: 'preview',
      giftId,
      skillId,
      contributionPoints: [0, 1, 5, 10, 30][
        ['NORMAL', 'SKILL_1', 'SKILL_2', 'SKILL_3', 'ULTIMATE'].indexOf(skillId)
      ],
      enabled: true,
      matchPriority: 100,
    });
    ingest(
      s,
      {
        id: 'comment-' + id,
        type: 'comment',
        at: now,
        userId: clubId,
        displayName: 'Kamu · ' + club.code,
        comment: club.code,
      },
      now,
    );
    const result = ingest(
      s,
      {
        id,
        type: 'gift',
        at: now,
        userId: clubId,
        gift: { id: giftId, coins: 0, units: 1, final: true },
      },
      now,
    );
    if (outcome) forced.current.set(id, outcome);
    advance(now);
    setSnapshot(publicSnapshot(s, now));
    return result;
  };
  const reset = () => {
    forced.current.clear();
    const c = defaultConfig();
    c.match.mode = 'ENDLESS';
    c.match.countdownSec = 0;
    c.idle.timeoutMs = 7000;
    state.current = initialState(Date.now(), c);
    startRound(state.current, Date.now());
    setSnapshot(publicSnapshot(state.current, Date.now()));
  };
  return { snapshot, shoot, reset };
}
export function useLive(enabled = true) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>(
      'connecting',
    );
  const offset = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false,
      ws: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout>,
      heartbeat: ReturnType<typeof setInterval>;
    let attempt = 0,
      lastMessage = 0;
    const accept = (data: Snapshot) => {
      offset.current = data.serverTime - Date.now();
      setSnapshot(data);
    };
    const connect = () => {
      if (disposed) return;
      setConnection('connecting');
      ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/ws`,
      );
      ws.onopen = () => {
        attempt = 0;
        lastMessage = Date.now();
        setConnection('connected');
        heartbeat = setInterval(() => {
          if (Date.now() - lastMessage > 65000) {
            ws?.close();
            return;
          }
          if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
        }, 20000);
      };
      ws.onmessage = (e) => {
        lastMessage = Date.now();
        if (e.data === 'pong') return;
        try {
          accept(JSON.parse(e.data));
        } catch {
          setConnection('disconnected');
        }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        clearInterval(heartbeat);
        if (disposed) return;
        setConnection('disconnected');
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++) + Math.random() * 500);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      ws?.close();
    };
  }, [enabled]);
  return { snapshot, connection, offset };
}
export async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
) {
  const response = await fetch('/api/admin/' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const value: unknown = await response.json();
  if (!response.ok)
    throw Error(
      typeof value === 'object' && value && 'error' in value
        ? String(value.error)
        : 'Permintaan gagal',
    );
  return value as T;
}

import { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Maximize,
  Flame,
  Zap,
  Ghost,
  Sparkles,
  Target,
  Wifi,
  WifiOff,
  Trophy,
} from 'lucide-react';
import { Arena } from './arena';
import { StadiumAudio } from './audio';
import type { Snapshot } from '../game/engine';
export const skillIcons = [Target, Flame, Zap, Ghost, Sparkles];
export const skillColors = ['#b7c2cd', '#ff9353', '#66ccff', '#c29aff', '#f5d27a'];
export function Crest({
  code,
  color,
  small = false,
  asset,
}: {
  code: string;
  color: string;
  small?: boolean;
  asset?: string;
}) {
  return (
    <span
      className={'crest ' + (small ? 'small' : '')}
      style={{ '--club': color } as React.CSSProperties}
    >
      <span>
        {asset ? (
          <img
            src={'/media/' + asset}
            alt={code}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          code.slice(0, 1)
        )}
      </span>
    </span>
  );
}
export function ArenaView({ snapshot, offset = 0 }: { snapshot: Snapshot; offset?: number }) {
  const host = useRef<HTMLDivElement>(null),
    arena = useRef<Arena | null>(null);
  const [error, setError] = useState(''),
    [muted, setMuted] = useState(true);
  const audio = useRef<StadiumAudio | null>(null),
    mutedRef = useRef(true),
    volume = useRef(snapshot.visual.volume);
  useEffect(() => {
    if (!host.current) return;
    try {
      arena.current = new Arena(host.current, snapshot, (result) => {
        if (mutedRef.current || !audio.current) return;
        audio.current.volume = volume.current;
        audio.current.cue(result);
      });
    } catch {
      setError('WebGL tidak tersedia. Gunakan browser dengan akselerasi grafis.');
    }
    return () => {
      arena.current?.dispose();
      void audio.current?.dispose();
    };
  }, []);
  useEffect(() => {
    arena.current?.update(snapshot);
    volume.current = snapshot.visual.volume;
    if (host.current) host.current.dataset.clockOffset = String(offset);
  }, [snapshot, offset]);
  const toggleAudio = () => {
    const value = !muted;
    setMuted(value);
    mutedRef.current = value;
    if (!value) {
      audio.current ??= new StadiumAudio();
      void audio.current.enable();
    }
  };
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 100);
    return () => clearInterval(id);
  }, [offset]);
  const k = snapshot.active,
    p = k?.startedAt ? (now - k.startedAt) / (k.endsAt! - k.startedAt) : 0;
  const skillIndex = k
    ? ['NORMAL', 'SKILL_1', 'SKILL_2', 'SKILL_3', 'ULTIMATE'].indexOf(k.skill.id)
    : 0;
  return (
    <div className="arena-wrap">
      <div
        className="arena-canvas"
        ref={host}
        aria-label="Arena 3D: seluruh penendang berjejer menghadap satu gawang"
      />
      {error && <div className="arena-error">{error}</div>}
      <div className="arena-topline">
        <span className="arena-tag">
          <span className="dot" /> DIORAMA ARENA
        </span>
        <span>
          CAM 01 <span className="subtle">/</span> {snapshot.visual.quality.toUpperCase()}
        </span>
      </div>
      {k && (
        <div
          className={'kick-announcement ' + (p > 0.65 && p < 0.83 ? 'result' : '')}
          style={{ '--skill': skillColors[skillIndex] } as React.CSSProperties}
        >
          <span>{k.demo ? 'DEMO · TANPA SKOR' : k.supporterName}</span>
          <strong>{p > 0.65 && p < 0.83 ? k.outcome : k.skill.label}</strong>
        </div>
      )}
      {snapshot.status === 'COUNTDOWN' && (
        <div className="countdown">
          {Math.max(1, Math.ceil((snapshot.phaseEndsAt! - now) / 1000))}
        </div>
      )}
      {(snapshot.status === 'RESULT' || snapshot.status === 'INTERMISSION') && snapshot.result && (
        <div className="winner">
          <Trophy size={30} />
          <small>RONDE SELESAI</small>
          <strong>
            {snapshot.result.winners.length > 1
              ? 'HASIL SERI'
              : snapshot.result.clubs.find((c) => c.id === snapshot.result!.winners[0])
                  ?.displayName}
          </strong>
          <span>Antrean ronde telah diselesaikan</span>
        </div>
      )}
      <div className="arena-bottomline">
        <span>
          <span className="dot lime" />{' '}
          {snapshot.active ? 'PENALTI BERLANGSUNG' : 'MENUNGGU GILIRAN'}
        </span>
        <div>
          <button
            className="icon-button"
            onClick={toggleAudio}
            aria-label={muted ? 'Aktifkan suara' : 'Matikan suara'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            className="icon-button"
            onClick={() =>
              void host.current?.parentElement
                ?.requestFullscreen()
                .catch(() => setError('Fullscreen tidak tersedia'))
            }
            aria-label="Layar penuh"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function Scoreboard({
  snapshot,
  compact = false,
}: {
  snapshot: Snapshot;
  compact?: boolean;
}) {
  const metric = { GOALS: 'goals', SKILL_POINTS: 'skillPoints', GIFT_POINTS: 'giftPoints' }[
    snapshot.ranking
  ] as 'goals' | 'skillPoints' | 'giftPoints';
  const ordered = [...snapshot.clubs].sort(
    (a, b) => (snapshot.scores[b.id]?.[metric] ?? 0) - (snapshot.scores[a.id]?.[metric] ?? 0),
  );
  return (
    <div className={'scoreboard ' + (compact ? 'compact' : '')}>
      <div className="section-title">
        <h3>Klasemen klub</h3>
        <span className="mini-label">
          {snapshot.ranking === 'GOALS'
            ? 'GOL'
            : snapshot.ranking === 'SKILL_POINTS'
              ? 'POIN SKILL'
              : 'POIN GIFT'}
        </span>
      </div>
      <div className="score-table">
        <div className="score-head">
          <span>KLUB</span>
          <span>GOL</span>
          <span>SKILL</span>
          <span>GIFT</span>
        </div>
        {ordered.map((club, i) => (
          <div
            className={'score-row ' + (snapshot.active?.clubId === club.id ? 'playing' : '')}
            key={club.id}
          >
            <div className="club-cell">
              <span className="rank">{String(i + 1).padStart(2, '0')}</span>
              <Crest code={club.code} color={club.primaryColor} asset={club.logoAssetKey} small />
              <div>
                <strong>{club.code}</strong>
                <small>{club.displayName}</small>
              </div>
            </div>
            <strong>{snapshot.scores[club.id]?.goals ?? 0}</strong>
            <span>{snapshot.scores[club.id]?.skillPoints ?? 0}</span>
            <span>{snapshot.scores[club.id]?.giftPoints ?? 0}</span>
          </div>
        ))}
      </div>
      <div className="score-note">Satu gol. Satu langkah menuju puncak.</div>
    </div>
  );
}
export function RoundTimer({ snapshot, offset = 0 }: { snapshot: Snapshot; offset?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(t);
  }, [offset]);
  const seconds = snapshot.deadline
    ? Math.max(0, Math.ceil((snapshot.deadline - (snapshot.pausedAt ?? now)) / 1000))
    : 0;
  return (
    <span className="timer">
      {snapshot.mode === 'TIME'
        ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
        : snapshot.mode === 'TARGET_GOALS'
          ? `TARGET ${snapshot.targetGoals}`
          : '∞'}
      <small>
        {snapshot.pausedAt
          ? 'DIJEDA'
          : snapshot.status === 'LIVE'
            ? 'RONDE BERJALAN'
            : snapshot.status}
      </small>
    </span>
  );
}
export function Connection({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={'connection ' + (connected ? 'online' : '')}>
      {connected ? <Wifi size={13} /> : <WifiOff size={13} />} {label}
    </span>
  );
}

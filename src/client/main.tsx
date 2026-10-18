import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  ChevronRight,
  Radio,
  SlidersHorizontal,
  RotateCcw,
  Play,
  ShieldCheck,
  Trophy,
  Users,
  Layers,
  ExternalLink,
  Activity,
} from 'lucide-react';
import {
  ArenaView,
  Crest,
  Scoreboard,
  RoundTimer,
  Connection,
  skillIcons,
  skillColors,
} from './components';
import { useDemo, useLive } from './hooks';
import type { Outcome } from '../game/model';
const Admin = React.lazy(() => import('./admin').then((m) => ({ default: m.Admin })));
import './style.css';
function Brand() {
  return (
    <a className="brand" href="/">
      <div className="brand-mark">
        P<span>◆</span>
      </div>
      <div>
        PENALTY
        <span>
          BATTLE <b>3D</b>
        </span>
      </div>
    </a>
  );
}
function Studio() {
  const { snapshot, shoot, reset } = useDemo(),
    [club, setClub] = useState('rma'),
    [message, setMessage] = useState(''),
    [forcedOutcome, setForcedOutcome] = useState<Outcome | ''>('');
  const selected = snapshot.clubs.find((c) => c.id === club)!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <span className="nav-label">WORKSPACE</span>
        <a className="nav-link selected" href="/">
          <Layers size={18} /> Studio arena <span className="nav-dot" />
        </a>
        <a className="nav-link" href="/live">
          <Radio size={18} /> Overlay LIVE <ArrowUpRight size={14} />
        </a>
        <a className="nav-link" href="/admin">
          <SlidersHorizontal size={18} /> Panel admin
        </a>
        <div className="sidebar-divider" />
        <span className="nav-label">PANDUAN BERMAIN</span>
        <div className="steps">
          <div>
            <b>01</b>
            <p>
              Pilih klub<span>Ketik kode klub di komentar.</span>
            </p>
          </div>
          <div>
            <b>02</b>
            <p>
              Kirim gift<span>Aktifkan tendangan & skill.</span>
            </p>
          </div>
          <div>
            <b>03</b>
            <p>
              Rebut puncak<span>Dukung klubmu jadi juara.</span>
            </p>
          </div>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={22} />
          <strong>Setiap dukungan berarti.</strong>
          <p>Pilih klub sebelum mengirim gift. Peluang gol mengikuti pengaturan operator.</p>
          <span>BUILT FOR THE LIVE MOMENT</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>Studio arena</strong>
          </div>
          <div>
            <span className="preview-badge">
              <span className="dot" /> SIMULASI LOKAL
            </span>
            <a className="button small" href="/live" target="_blank" rel="noreferrer">
              Buka overlay <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main className="studio-main">
          <div className="page-intro">
            <div>
              <span className="eyebrow">THE CROWD CALLS THE SHOTS</span>
              <h1>
                Satu tendangan.
                <br className="mobile-break" /> Ribuan dukungan<span>.</span>
              </h1>
              <p>Klub pilihanmu. Skill andalanmu. Saatnya mengambil alih arena.</p>
            </div>
            <div className="intro-decoration">
              <span>5</span>KLUB<span>1</span>G A W A N G
            </div>
          </div>
          <div className="studio-grid">
            <section className="main-column">
              <div className="arena-card">
                <div className="match-header">
                  <div>
                    <span className="live-pill">PREVIEW</span>
                    <strong>Penalty Battle</strong>
                    <span className="subtle">/</span>
                    <span className="round-number">
                      Ronde {String(snapshot.round).padStart(2, '0')}
                    </span>
                  </div>
                  <RoundTimer snapshot={snapshot} />
                </div>
                <ArenaView snapshot={snapshot} />
                <div className="arena-footer">
                  <div>
                    <span className="status-orbit" />
                    <p>
                      <strong>
                        {snapshot.active ? snapshot.active.supporterName : 'Arena siap. Giliranmu.'}
                      </strong>
                      <span>
                        {snapshot.active
                          ? snapshot.active.skill.label
                          : 'Pilih klub dan coba tendangan di bawah.'}
                      </span>
                    </p>
                  </div>
                  <span className="queue-count">
                    <Layers size={15} /> {snapshot.queueDepth} <span>antrean</span>
                  </span>
                </div>
              </div>
              <section className="simulation-panel">
                <div className="section-title">
                  <div>
                    <h3>Coba kekuatan klubmu</h3>
                    <p>Simulasi terisolasi. Tidak mengubah pertandingan LIVE.</p>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => {
                      reset();
                      setMessage('Simulasi direset');
                    }}
                    aria-label="Reset simulasi"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <label className="simulation-outcome">
                  Hasil uji{' '}
                  <select
                    aria-label="Hasil uji simulasi"
                    value={forcedOutcome}
                    onChange={(e) => setForcedOutcome(e.target.value as Outcome | '')}
                  >
                    <option value="">Peluang skill</option>
                    <option value="GOAL">GOAL</option>
                    <option value="SAVE">SAVE</option>
                    <option value="MISS">MISS</option>
                  </select>
                </label>
                <div className="club-picker">
                  {snapshot.clubs.map((c) => (
                    <button
                      key={c.id}
                      className={club === c.id ? 'selected' : ''}
                      onClick={() => setClub(c.id)}
                    >
                      <Crest code={c.code} color={c.primaryColor} asset={c.logoAssetKey} small />
                      {c.code}
                      {club === c.id && <span className="dot" />}
                    </button>
                  ))}
                </div>
                <div className="skills-grid">
                  {snapshot.skills.map((s, i) => {
                    const Icon = skillIcons[i];
                    return (
                      <button
                        key={s.id}
                        className="skill-card"
                        style={{ '--skill': skillColors[i] } as React.CSSProperties}
                        onClick={() => {
                          const result = shoot(club, s.id, forcedOutcome || undefined);
                          setMessage(
                            result.status === 'queued'
                              ? `${selected.code} · ${s.label} masuk antrean`
                              : (result.message ?? result.status),
                          );
                        }}
                      >
                        <span className="skill-art">
                          <Icon size={27} strokeWidth={1.5} />
                          {i === 4 && <span className="ultimate-star">✦</span>}
                        </span>
                        <span className="skill-tier">
                          {i === 0 ? 'CLASSIC' : i === 4 ? 'ULTIMATE' : `SKILL 0${i}`}
                        </span>
                        <strong>{s.label}</strong>
                        <span className="skill-price">
                          {i === 0 ? 'Gift khusus' : `${[0, 1, 5, 10, 30][i]} koin`}
                          <ChevronRight size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="simulation-hint" role="status">
                  <Activity size={13} />
                  {message || 'Tekan skill untuk mencoba. Hasil mengikuti peluang gol simulasi.'}
                </div>
              </section>
            </section>
            <aside className="right-column">
              <div className="panel">
                <Scoreboard snapshot={snapshot} />
              </div>
              <div className="panel supporters">
                <div className="section-title">
                  <h3>
                    <Users size={16} /> Top pendukung
                  </h3>
                  <span className="mini-label">GIFT</span>
                </div>
                {snapshot.supporters.length ? (
                  snapshot.supporters.slice(0, 3).map((s, i) => (
                    <div className="supporter" key={s.displayName}>
                      <span className="avatar">{s.displayName.slice(0, 1)}</span>
                      <div>
                        <strong>{s.displayName}</strong>
                        <small>{snapshot.clubs.find((c) => c.id === s.clubId)?.code}</small>
                      </div>
                      <b>{s.giftPoints}</b>
                    </div>
                  ))
                ) : (
                  <div className="empty-supporters">
                    <Users size={27} />
                    <p>Jadilah dukungan pertama.</p>
                    <span>Kontribusi muncul setelah penalti selesai.</span>
                  </div>
                )}
              </div>
              <div className="next-panel">
                <div className="section-title">
                  <h3>Giliran berikutnya</h3>
                  <span className="count-badge">{snapshot.queueDepth}</span>
                </div>
                {snapshot.queue.length ? (
                  snapshot.queue.slice(0, 3).map((k) => (
                    <div className="next-kick" key={k.id}>
                      <span className="dot" />
                      <div>
                        <strong>{snapshot.clubs.find((c) => c.id === k.clubId)?.code}</strong>
                        <small>{k.skill.label}</small>
                      </div>
                      <span>#{k.sequence}</span>
                    </div>
                  ))
                ) : (
                  <div className="queue-empty">
                    <div className="queue-lines">
                      <i />
                      <i />
                      <i />
                    </div>
                    <p>Antrean masih kosong</p>
                    <small>Skill berikutnya bisa jadi milikmu.</small>
                  </div>
                )}
                <div className="fairness">
                  <ShieldCheck size={14} /> Prioritas pintar, giliran tetap adil.
                </div>
              </div>
              <a className="broadcast-cta" href="/admin">
                <span className="eyebrow">READY TO GO LIVE?</span>
                <strong>
                  Arenamu.
                  <br />
                  Panggung mereka.
                </strong>
                <p>Atur klub, gift, dan ronde dari panel operator.</p>
                <span>
                  Siapkan siaran <ArrowUpRight size={17} />
                </span>
                <Radio className="cta-bg" size={110} />
              </a>
            </aside>
          </div>
          <footer className="workspace-footer">
            <span>
              <span className="dot lime" /> PREVIEW ENGINE AKTIF
            </span>
            <span>
              PENALTY BATTLE 3D <i>•</i> V0.1
            </span>
            <a href="/admin/integration">
              Pengaturan integrasi <ExternalLink size={12} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Live() {
  const { snapshot, connection, offset } = useLive();
  if (!snapshot)
    return (
      <div className="loading-screen">
        <Brand />
        <div className="spinner" />
        <h2>Menghubungkan arena…</h2>
        <p>
          {connection === 'disconnected'
            ? 'Koneksi terputus. Mencoba kembali otomatis.'
            : 'Menunggu snapshot pertandingan dari server.'}
        </p>
        <a href="/">Kembali ke studio</a>
      </div>
    );
  const metric = { GOALS: 'goals', SKILL_POINTS: 'skillPoints', GIFT_POINTS: 'giftPoints' }[
    snapshot.ranking
  ] as 'goals' | 'skillPoints' | 'giftPoints';
  const rankedClubs = [...snapshot.clubs].sort(
    (a, b) => (snapshot.scores[b.id]?.[metric] ?? 0) - (snapshot.scores[a.id]?.[metric] ?? 0),
  );
  return (
    <main
      className="live-layout"
      style={{ '--safe-area': `${snapshot.visual.safeArea}%` } as React.CSSProperties}
    >
      <header className="live-header">
        <Brand />
        <RoundTimer snapshot={snapshot} offset={offset.current} />
      </header>
      <div className="live-connections">
        <Connection
          connected={connection === 'connected'}
          label={connection === 'connected' ? 'Arena tersambung' : 'Menghubungkan ulang'}
        />
        <Connection
          connected={snapshot.connector.status === 'CONNECTED'}
          label={'Konektor ' + snapshot.connector.status.toLowerCase()}
        />
      </div>
      <div className="live-scores">
        {rankedClubs.map((c) => (
          <div key={c.id}>
            <Crest code={c.code} color={c.primaryColor} asset={c.logoAssetKey} small />
            <span>{c.code}</span>
            <strong>{snapshot.scores[c.id]?.[metric] ?? 0}</strong>
          </div>
        ))}
      </div>
      <div className="live-arena">
        <ArenaView snapshot={snapshot} offset={offset.current} />
      </div>
      <div className="live-instructions">
        <span className="eyebrow">
          {snapshot.likes?.enabled
            ? 'KOMENTAR KODE KLUB → LIKE / GIFT → TENDANG!'
            : 'KOMENTAR KODE KLUB → KIRIM GIFT → TENDANG!'}
        </span>
        <strong>Pilih klub dulu!</strong>
        <div className="club-codes">
          {snapshot.clubs.map((c) => (
            <span key={c.id}>{c.code}</span>
          ))}
        </div>
        <p>Gift sebelum memilih klub tidak memicu aksi atau skor.</p>
        {snapshot.likes?.enabled && (
          <p>
            Setiap {snapshot.likes.likesPerKick} like per penonton → 1 tendangan normal untuk klub
            pilihannya. Pilih klub sebelum memberi like!
          </p>
        )}
        <div className="live-gift-legend">
          {snapshot.giftLegend.map((s, i) => (
            <span key={s.skillId} style={{ color: skillColors[i] }}>
              {s.skillLabel}
              <small>{s.triggers.length ? s.triggers.join(' / ') : 'Belum dipetakan'}</small>
            </span>
          ))}
        </div>
        <div className="live-status">
          <span>{snapshot.queueDepth} dalam antrean</span>
          <span>PERINGKAT: {snapshot.ranking}</span>
        </div>
        {snapshot.notice && Date.now() + offset.current - snapshot.notice.at < 10000 && (
          <div className="notice">{snapshot.notice.text}</div>
        )}
      </div>
      <div className="live-detailed">
        <Scoreboard snapshot={snapshot} compact />
      </div>
    </main>
  );
}
const path = location.pathname;
createRoot(document.getElementById('root')!).render(
  <React.Suspense
    fallback={
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    }
  >
    {path.startsWith('/admin') ? <Admin /> : path === '/live' ? <Live /> : <Studio />}
  </React.Suspense>,
);

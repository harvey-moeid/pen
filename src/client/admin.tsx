import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Save,
  LogOut,
  Play,
  Pause,
  Square,
  RotateCcw,
  Plus,
  Trash2,
  ShieldCheck,
  ExternalLink,
  Download,
  RefreshCw,
} from 'lucide-react';
import { ConfigSchema, defaultConfig, skillIds, type Config } from '../game/model';
import type { Snapshot } from '../game/engine';
import { api, useLive } from './hooks';
import {
  defaultOverlaySettings,
  overlayTextDefinitions,
  overlayTextKeys,
  type OverlayTextKey,
} from '../game/overlay';
import { OverlayText, overlayVariables } from './overlay';
import { Scoreboard, Connection, RoundTimer, Crest } from './components';
type AdminData = {
  config: Config;
  configVersion: number;
  snapshot: Snapshot;
  history: unknown[];
  kicks: unknown[];
  audit: { at: number; action: string; detail: string }[];
  stats: Record<string, number>;
  archivePending: number;
};
const pages = [
  ['', 'Ringkasan'],
  ['integration', 'Integrasi'],
  ['clubs', 'Klub'],
  ['gifts', 'Mapping gift'],
  ['likes', 'Like → tendangan'],
  ['skills', 'Skill & peluang'],
  ['goalkeeper', 'Kiper'],
  ['match', 'Ronde'],
  ['queue', 'Antrean'],
  ['leaderboard', 'Leaderboard'],
  ['visual', 'Visual & audio'],
  ['overlay', 'Teks overlay'],
  ['history', 'Riwayat'],
] as const;
function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  type = 'number',
}: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
export function Admin() {
  const [data, setData] = useState<AdminData | null>(null),
    [draft, setDraft] = useState<Config>(defaultConfig),
    [auth, setAuth] = useState(false),
    [loading, setLoading] = useState(true),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [overlayField, setOverlayField] = useState<OverlayTextKey>('title'),
    [integration, setIntegration] = useState<{
      configured: boolean;
      endpoint: string;
      contract: string;
    } | null>(null);
  const page = location.pathname.split('/')[2] ?? '';
  const live = useLive(auth);
  const snapshot = live.snapshot ?? data?.snapshot;
  const reload = async () => {
    const value = await api<AdminData>('state');
    setData(value);
    setDraft(value.config);
    setAuth(true);
  };
  useEffect(() => {
    void reload()
      .catch(() => setAuth(false))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (auth && page === 'integration')
      void api<{ configured: boolean; endpoint: string; contract: string }>('integration')
        .then(setIntegration)
        .catch((e) => setError(e.message));
  }, [auth, page]);
  const edit = (fn: (c: Config) => void) => {
    setDraft((prev) => {
      const copy = structuredClone(prev);
      fn(copy);
      return copy;
    });
    setNotice('Perubahan belum disimpan');
  };
  const task = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    void task(async () => {
      const parsed = ConfigSchema.safeParse(draft);
      if (!parsed.success)
        throw Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '),
        );
      const value = await api<AdminData>('config', 'PUT', {
        version: data!.configVersion,
        config: parsed.data,
      });
      setData(value);
      setDraft(value.config);
      setNotice(
        value.archivePending
          ? 'Aktif di room. Arsip KV menunggu retry.'
          : 'Konfigurasi aktif dan tersimpan ke KV.',
      );
    });
  const command = (action: string) =>
    void task(async () => {
      await api('control', 'POST', { action });
      await reload();
      setNotice(`Kontrol ${action} diterapkan`);
    });
  const upload = async (file: File | undefined): Promise<string> => {
    if (!file) throw Error('Pilih berkas');
    if (file.size > 20 * 1024 * 1024) throw Error('Aset maksimal 20 MB');
    const type = file.name.endsWith('.glb') ? 'model/gltf-binary' : file.type;
    const response = await fetch('/api/admin/assets', {
      method: 'POST',
      headers: { 'Content-Type': type },
      body: file,
    });
    const result = (await response.json()) as { error?: string; key: string };
    if (!response.ok) throw Error(result.error);
    return result.key;
  };
  if (loading)
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Memeriksa sesi admin…</p>
      </div>
    );
  if (!auth)
    return (
      <main className="login-page">
        <a href="/" className="back-link">
          <ArrowLeft size={16} /> Kembali ke studio
        </a>
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            void task(async () => {
              await api('login', 'POST', { password });
              setPassword('');
              await reload();
            });
          }}
        >
          <span className="login-icon">
            <ShieldCheck size={28} />
          </span>
          <span className="eyebrow">PENALTY BATTLE · CONTROL ROOM</span>
          <h1>
            Di balik
            <br />
            setiap momen.
          </h1>
          <p>Masuk untuk mengatur klub, skill, dan pertandingan LIVE.</p>
          <label className="field">
            <span>Kunci admin</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kunci admin"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Memeriksa…' : 'Masuk ke control room'}{' '}
            <ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <small>Sesi aman dengan cookie HttpOnly. Kunci tidak disimpan di browser.</small>
        </form>
      </main>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" className="brand admin-brand">
          <div className="brand-mark">
            P<span>◆</span>
          </div>
          <div>
            CONTROL<span>ROOM</span>
          </div>
        </a>
        <span className="nav-label">OPERATOR</span>
        {pages.map(([slug, label]) => (
          <a
            key={slug}
            className={'nav-link ' + (slug === page ? 'selected' : '')}
            href={'/admin' + (slug ? '/' + slug : '')}
          >
            {label}
          </a>
        ))}
        <a className="nav-link" href="/" target="_blank" rel="noreferrer">
          Simulasi terisolasi <ExternalLink size={14} />
        </a>
        <button
          className="nav-link"
          onClick={() =>
            void task(async () => {
              await fetch('/api/admin/logout', { method: 'POST' });
              setAuth(false);
            })
          }
        >
          <LogOut size={15} /> Keluar
        </button>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <span className="eyebrow">
              CONTROL ROOM / {pages.find(([p]) => p === page)?.[1]?.toUpperCase()}
            </span>
            <h1>{pages.find(([p]) => p === page)?.[1] ?? 'Halaman tidak ditemukan'}</h1>
            <p>Konfigurasi v{data?.configVersion} · satu room authoritative</p>
          </div>
          <div className="admin-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await reload();
                  setNotice('Konfigurasi dimuat ulang');
                })
              }
            >
              <RefreshCw size={15} /> Muat ulang
            </button>
            <button className="button primary" disabled={busy} onClick={save}>
              <Save size={15} /> {busy ? 'Memproses…' : 'Simpan perubahan'}
            </button>
          </div>
        </header>
        {error && (
          <div className="error alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice alert" role="status">
            {notice}
          </div>
        )}
        {snapshot && (
          <div className="admin-status">
            <Connection connected={live.connection === 'connected'} label={live.connection} />
            <span>Konektor: {snapshot.connector.status}</span>
            <span>Antrean: {snapshot.queueDepth}</span>
            <span>
              Ronde {snapshot.round} · {snapshot.status}
            </span>
            <RoundTimer snapshot={snapshot} />
          </div>
        )}
        {page === '' && snapshot && (
          <>
            <div className="metric-grid">
              {[
                ['Tendangan diterima', data?.stats.accepted],
                ['Event ditolak', data?.stats.rejected],
                ['Retry duplikat', data?.stats.duplicates],
                ['Arsip menunggu', data?.archivePending],
              ].map(([label, value]) => (
                <div className="panel metric" key={label}>
                  <span>{label}</span>
                  <strong>{value ?? 0}</strong>
                </div>
              ))}
            </div>
            <div className="admin-two">
              <div className="panel">
                <Scoreboard snapshot={snapshot} />
              </div>
              <div className="panel padded">
                <h3>Kendali pertandingan</h3>
                <p>
                  Stop menutup penerimaan dan menghabiskan seluruh antrean sebelum hasil disimpan.
                </p>
                <Controls command={command} busy={busy} />
                <a className="button" href="/live" target="_blank" rel="noreferrer">
                  Buka overlay read-only <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </>
        )}
        {page === 'integration' && (
          <>
            <section className="panel padded">
              <h3>Webhook live-tiktok-konektor</h3>
              <p>
                Status secret:{' '}
                <b>{integration?.configured ? 'Terkonfigurasi' : 'Belum tersedia'}</b>
              </p>
              <code className="code-block">{integration?.endpoint ?? '/api/hooks/tiktok'}</code>
              <p>
                Tambahkan endpoint ini pada dashboard konektor. Pilih event chat, gift, like,
                stream. Samakan WEBHOOK_SIGNING_SECRET melalui secret Worker dan konektor.
              </p>
              <Field
                label="Filter Room ID TikTok (opsional)"
                type="text"
                value={draft.sourceRoomId}
                onChange={(v) =>
                  edit((c) => {
                    c.sourceRoomId = v;
                  })
                }
              />
              <p>
                Kosongkan untuk menerima event dari konektor dengan signing secret yang sama. Isi
                hanya jika ingin membatasi satu room TikTok. Room ID adalah ID siaran pada konektor,
                bukan username, URL, atau versi kode; nilainya dapat berubah saat LIVE baru. Gunakan
                signing secret khusus untuk konektor sumber game ini.
              </p>
              <div className="notice">
                Versi kode konektor yang diaudit (bukan Room ID): {integration?.contract}. Dedup
                menjamin retry dengan event.id yang sama. Konektor belum meneruskan ID pesan TikTok
                asli; replay upstream dengan ID baru perlu verifikasi sebelum produksi.
              </div>
              <p>
                Combo streakable dihitung hanya saat repeatEnd=true. Gift tanpa klub ditolak sebagai
                aksi game. Antrean penuh mengembalikan 503 agar dapat diretry.
              </p>
              <Field
                label="Retensi data penonton & riwayat (hari)"
                value={draft.retentionDays}
                min={1}
                max={30}
                onChange={(v) =>
                  edit((c) => {
                    c.retentionDays = +v;
                  })
                }
              />
            </section>
            <section className="panel padded">
              <h3>Diagnostik</h3>
              <p>
                Event terakhir:{' '}
                {snapshot?.connector.lastEventAt
                  ? new Date(snapshot.connector.lastEventAt).toLocaleString('id-ID')
                  : 'Belum ada event'}
              </p>
              <p>Delay sumber → backend: {snapshot?.connector.delayMs ?? 0} ms</p>
              <p>
                Penolakan webhook terakhir:{' '}
                <b>
                  {data?.audit.find((entry) => entry.action === 'webhook_rejected')?.detail ??
                    'Belum ada penolakan tercatat'}
                </b>
              </p>
              <p>
                source_room_mismatch berarti filter Room ID tidak cocok; kosongkan filter atau isi
                ID siaran yang benar, lalu simpan. Status di halaman ini diperbarui setelah event
                diterima, bukan saat URL webhook baru ditambahkan.
              </p>
              <p>Event yang lolos signature tetapi ditolak dapat dilihat di Riwayat → Audit.</p>
              <a className="button" href="/" target="_blank" rel="noreferrer">
                Buka simulator lokal <ExternalLink size={14} />
              </a>
            </section>
          </>
        )}
        {page === 'clubs' && (
          <>
            <div className="notice">
              Maksimal 8 klub. Semua klub aktif ditampilkan dalam satu baris. Nonaktifkan klub lama
              untuk mempertahankan riwayat; ubah formasi setelah ronde selesai.
            </div>
            <div className="admin-cards">
              {draft.clubs.map((club, i) => (
                <section className="panel padded" key={club.id}>
                  <div className="section-title">
                    <h3>{club.code}</h3>
                    <Toggle
                      label="Aktif"
                      value={club.enabled}
                      onChange={(v) =>
                        edit((c) => {
                          c.clubs[i].enabled = v;
                        })
                      }
                    />
                  </div>
                  <div className="form-grid">
                    <Field
                      label="Kode komentar"
                      type="text"
                      value={club.code}
                      onChange={(v) =>
                        edit((c) => {
                          c.clubs[i].code = v.toUpperCase();
                        })
                      }
                    />
                    <Field
                      label="Nama klub"
                      type="text"
                      value={club.displayName}
                      onChange={(v) =>
                        edit((c) => {
                          c.clubs[i].displayName = v;
                        })
                      }
                    />
                    <Field
                      label="Warna jersey"
                      type="color"
                      value={club.primaryColor}
                      onChange={(v) =>
                        edit((c) => {
                          c.clubs[i].primaryColor = v;
                        })
                      }
                    />
                    <Field
                      label="Warna sekunder"
                      type="color"
                      value={club.secondaryColor}
                      onChange={(v) =>
                        edit((c) => {
                          c.clubs[i].secondaryColor = v;
                        })
                      }
                    />
                    <Field
                      label="Urutan"
                      value={club.sortOrder}
                      min={0}
                      onChange={(v) =>
                        edit((c) => {
                          c.clubs[i].sortOrder = +v;
                        })
                      }
                    />
                    <Field
                      label="Nomor"
                      value={club.number}
                      min={1}
                      max={99}
                      onChange={(v) =>
                        edit((c) => {
                          c.clubs[i].number = +v;
                        })
                      }
                    />
                  </div>
                  <label className="field">
                    <span>Model karakter 3D opsional (GLB, maks. 20 MB)</span>
                    <input
                      type="file"
                      accept=".glb"
                      onChange={(e) =>
                        void task(async () => {
                          const key = await upload(e.target.files?.[0]);
                          edit((c) => {
                            c.clubs[i].characterAssetKey = key;
                          });
                        })
                      }
                    />
                  </label>
                  {club.characterAssetKey && (
                    <p className="asset-key">
                      {club.characterAssetKey}{' '}
                      <button
                        className="text-button"
                        onClick={() =>
                          edit((c) => {
                            delete c.clubs[i].characterAssetKey;
                          })
                        }
                      >
                        Gunakan model bawaan
                      </button>
                    </p>
                  )}
                  <label className="field">
                    <span>Logo klub berupa gambar (PNG/WebP/JPG, maks. 20 MB)</span>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      onChange={(e) =>
                        void task(async () => {
                          const key = await upload(e.target.files?.[0]);
                          edit((c) => {
                            c.clubs[i].logoAssetKey = key;
                          });
                        })
                      }
                    />
                  </label>
                  <small>
                    Logo memakai gambar; GLB hanya untuk mengganti karakter 3D. Keduanya opsional.
                  </small>
                  {club.logoAssetKey && (
                    <div className="asset-key">
                      <Crest
                        code={club.code}
                        color={club.primaryColor}
                        asset={club.logoAssetKey}
                        small
                      />
                      <button
                        className="text-button"
                        onClick={() =>
                          edit((c) => {
                            delete c.clubs[i].logoAssetKey;
                          })
                        }
                      >
                        Gunakan logo bawaan
                      </button>
                    </div>
                  )}
                </section>
              ))}
            </div>
            <button
              className="button"
              disabled={draft.clubs.length >= 8}
              onClick={() =>
                edit((c) => {
                  const i = c.clubs.length + 1;
                  c.clubs.push({
                    id: crypto.randomUUID(),
                    code: `C${i}`,
                    displayName: `Klub ${i}`,
                    primaryColor: '#5cbabb',
                    secondaryColor: '#ffffff',
                    number: i,
                    sortOrder: i,
                    enabled: true,
                  });
                })
              }
            >
              <Plus size={15} /> Tambah klub
            </button>
            <Field
              label="Cooldown pindah klub (ms)"
              value={draft.clubSwitchCooldownMs}
              min={0}
              onChange={(v) =>
                edit((c) => {
                  c.clubSwitchCooldownMs = +v;
                })
              }
            />
          </>
        )}
        {page === 'skills' && (
          <div className="admin-cards">
            {draft.skills.map((skill, i) => (
              <section className="panel padded" key={skill.id}>
                <div className="section-title">
                  <h3>{skill.id}</h3>
                  <Toggle
                    label="Aktif"
                    value={skill.enabled}
                    onChange={(v) =>
                      edit((c) => {
                        c.skills[i].enabled = v;
                      })
                    }
                  />
                </div>
                <Field
                  label="Nama skill"
                  type="text"
                  value={skill.label}
                  onChange={(v) =>
                    edit((c) => {
                      c.skills[i].label = v;
                    })
                  }
                />
                <div className="form-grid">
                  <Field
                    label="Peluang gol (%)"
                    value={skill.goalChancePercent}
                    min={0}
                    max={100}
                    step={0.1}
                    onChange={(v) =>
                      edit((c) => {
                        c.skills[i].goalChancePercent = +v;
                      })
                    }
                  />
                  <Field
                    label="Poin ketika gol"
                    value={skill.pointsOnGoal}
                    min={0}
                    onChange={(v) =>
                      edit((c) => {
                        c.skills[i].pointsOnGoal = +v;
                      })
                    }
                  />
                  <Field
                    label="Durasi animasi (ms)"
                    value={skill.durationMs}
                    min={3000}
                    max={15000}
                    step={100}
                    onChange={(v) =>
                      edit((c) => {
                        c.skills[i].durationMs = +v;
                      })
                    }
                  />
                  <Field
                    label="Prioritas (0–10)"
                    value={skill.priorityTier}
                    min={0}
                    max={10}
                    onChange={(v) =>
                      edit((c) => {
                        c.skills[i].priorityTier = +v;
                      })
                    }
                  />
                </div>
                <small>
                  Perubahan berlaku untuk aksi baru. Peluang dan poin antrean lama tetap memakai
                  snapshot sebelumnya.
                </small>
              </section>
            ))}
          </div>
        )}
        {page === 'likes' && (
          <section className="panel padded">
            <h3>Like memicu tendangan normal</h3>
            <Toggle
              label="Aktifkan tendangan dari like"
              value={draft.likes.enabled}
              onChange={(v) =>
                edit((c) => {
                  c.likes.enabled = v;
                })
              }
            />
            <Field
              label="Jumlah like per tendangan normal"
              value={draft.likes.likesPerKick}
              min={1}
              max={1000000}
              onChange={(v) =>
                edit((c) => {
                  c.likes.likesPerKick = +v;
                })
              }
            />
            <p>
              Dihitung per penonton untuk klub yang dipilih lewat komentar. Setiap{' '}
              {draft.likes.likesPerKick || 'N'} like memicu 1 Normal Kick. Misalnya, ambang 100
              dengan 250 like menghasilkan 2 tendangan dan menyimpan sisa 50 like.
            </p>
            <p>
              Like hanya dihitung saat ronde LIVE, tidak dijeda, dan penonton sudah memilih klub.
              Sisa like direset ketika pindah klub, ronde baru/reset, atau pengaturan like berubah.
              Tendangan yang sudah mengantre tetap berjalan dengan aturan saat diterima.
            </p>
            <p>
              Peluang gol, poin saat gol, durasi, dan prioritas mengikuti skill NORMAL pada menu
              Skill & peluang. Tendangan like tidak menambah poin gift dan tidak memerlukan mapping
              Gift ID. Tambahkan event <code>like</code> pada webhook konektor, lalu simpan
              pengaturan.
            </p>
            {!draft.skills.find((skill) => skill.id === 'NORMAL')?.enabled && (
              <div className="error">
                Skill NORMAL sedang nonaktif. Aktifkan agar like dapat memicu tendangan.
              </div>
            )}
          </section>
        )}
        {page === 'gifts' && (
          <>
            <div className="panel padded">
              <Toggle
                label="Aktifkan fallback nilai koin"
                value={draft.coinFallback}
                onChange={(v) =>
                  edit((c) => {
                    c.coinFallback = v;
                  })
                }
              />
              <p>
                Pemicu gift untuk Normal Kick memakai Gift ID khusus. Pemicu like diatur terpisah di
                menu Like → tendangan. Gift ID spesifik mengalahkan fallback koin; Normal memiliki
                prioritas ketika ID sama.
              </p>
              {!draft.mappings.some((m) => m.enabled && m.skillId === 'NORMAL' && m.giftId) && (
                <div className="notice">
                  Pemicu gift untuk Normal Kick belum dipetakan. Like tetap dapat memicu Normal Kick
                  jika diaktifkan di menu Like → tendangan.
                </div>
              )}
              {draft.mappings.some(
                (m, i) =>
                  m.enabled &&
                  m.giftId &&
                  draft.mappings.some((n, j) => i !== j && n.enabled && n.giftId === m.giftId),
              ) && (
                <div className="error">
                  Tabrakan Gift ID: Normal didahulukan, lalu matchPriority tertinggi.
                </div>
              )}
            </div>
            <div className="admin-cards">
              {draft.mappings.map((m, i) => (
                <section className="panel padded" key={m.id}>
                  <div className="section-title">
                    <Toggle
                      label="Aktif"
                      value={m.enabled}
                      onChange={(v) =>
                        edit((c) => {
                          c.mappings[i].enabled = v;
                        })
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label="Hapus mapping"
                      onClick={() =>
                        edit((c) => {
                          c.mappings.splice(i, 1);
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <Field
                    label="Gift ID (kosong = fallback koin)"
                    type="text"
                    value={m.giftId ?? ''}
                    onChange={(v) =>
                      edit((c) => {
                        c.mappings[i].giftId = v || undefined;
                      })
                    }
                  />
                  <Field
                    label="Nama gift di overlay"
                    type="text"
                    value={m.displayName ?? ''}
                    onChange={(v) =>
                      edit((c) => {
                        c.mappings[i].displayName = v;
                      })
                    }
                  />
                  <Select
                    label="Skill"
                    value={m.skillId}
                    options={skillIds}
                    onChange={(v) =>
                      edit((c) => {
                        c.mappings[i].skillId = v as typeof m.skillId;
                      })
                    }
                  />
                  <div className="form-grid">
                    <Field
                      label="Nilai koin fallback"
                      value={m.coinValueFallback ?? ''}
                      min={0}
                      onChange={(v) =>
                        edit((c) => {
                          c.mappings[i].coinValueFallback = v === '' ? undefined : +v;
                        })
                      }
                    />
                    <Field
                      label="Poin kontribusi / unit"
                      value={m.contributionPoints}
                      min={0}
                      onChange={(v) =>
                        edit((c) => {
                          c.mappings[i].contributionPoints = +v;
                        })
                      }
                    />
                    <Field
                      label="Prioritas matching"
                      value={m.matchPriority}
                      min={0}
                      max={100}
                      onChange={(v) =>
                        edit((c) => {
                          c.mappings[i].matchPriority = +v;
                        })
                      }
                    />
                  </div>
                </section>
              ))}
            </div>
            <button
              className="button"
              onClick={() =>
                edit((c) => {
                  c.mappings.push({
                    id: crypto.randomUUID(),
                    skillId: 'NORMAL',
                    contributionPoints: 1,
                    enabled: true,
                    matchPriority: 100,
                  });
                })
              }
            >
              <Plus size={16} /> Tambah mapping
            </button>
          </>
        )}
        {page === 'match' && (
          <section className="panel padded">
            <h3>Kendali ronde</h3>
            <Controls command={command} busy={busy} />
            <div className="notice">
              Kebijakan closing: selesaikan seluruh antrean. Hasil seri ditampilkan bila metrik
              ranking sama. Reset menunggu hasil tersimpan di Durable Object.
            </div>
            <div className="form-grid">
              <Select
                label="Mode ronde"
                value={draft.match.mode}
                options={['TIME', 'TARGET_GOALS', 'ENDLESS']}
                onChange={(v) =>
                  edit((c) => {
                    c.match.mode = v as Config['match']['mode'];
                  })
                }
              />
              {(
                [
                  'durationSec',
                  'targetGoals',
                  'countdownSec',
                  'resultSec',
                  'intermissionSec',
                ] as const
              ).map((field, i) => (
                <Field
                  key={field}
                  label={
                    [
                      'Durasi (detik)',
                      'Target gol',
                      'Countdown (detik)',
                      'Pengumuman (detik)',
                      'Jeda (detik)',
                    ][i]
                  }
                  value={draft.match[field]}
                  min={field === 'countdownSec' ? 0 : 1}
                  onChange={(v) =>
                    edit((c) => {
                      c.match[field] = +v;
                    })
                  }
                />
              ))}
            </div>
            <Toggle
              label="Mulai ronde berikutnya otomatis"
              value={draft.match.autoRestart}
              onChange={(v) =>
                edit((c) => {
                  c.match.autoRestart = v;
                })
              }
            />
          </section>
        )}
        {page === 'queue' && (
          <section className="panel padded">
            <Toggle
              label="Aktifkan antrean pintar"
              value={draft.queue.smart}
              onChange={(v) =>
                edit((c) => {
                  c.queue.smart = v;
                })
              }
            />
            <div className="form-grid">
              {(['capacity', 'maxOvertakes', 'agingMs', 'maxWaitMs'] as const).map((field, i) => (
                <Field
                  key={field}
                  label={
                    [
                      'Kapasitas aksi (1–2000)',
                      'Batas menyalip (0–20)',
                      'Interval aging (ms)',
                      'Batas tunggu prioritas (ms)',
                    ][i]
                  }
                  value={draft.queue[field]}
                  min={0}
                  onChange={(v) =>
                    edit((c) => {
                      c.queue[field] = +v;
                    })
                  }
                />
              ))}
            </div>
            <p>
              Batas tunggu membuat aksi lama dipilih lebih dahulu; bukan jaminan seluruh antrean
              selesai dalam waktu tersebut. Saat penuh, seluruh event ditolak dengan 503 tanpa dedup
              permanen, agar retry dapat diterima.
            </p>
            <div className="notice">
              Retry konektor terbatas dan belum memiliki outbox durable. Operator harus memantau
              kegagalan delivery; kapasitas dan kompensasi overflow wajib disepakati sebelum LIVE
              publik.
            </div>
          </section>
        )}
        {page === 'leaderboard' && (
          <section className="panel padded">
            <Select
              label="Metrik pemenang"
              value={draft.match.ranking}
              options={['GOALS', 'SKILL_POINTS', 'GIFT_POINTS']}
              onChange={(v) =>
                edit((c) => {
                  c.match.ranking = v as Config['match']['ranking'];
                })
              }
            />
            <p>
              Ketiga metrik selalu disimpan terpisah. Skill points hanya bertambah saat gol. Gift
              points bertambah saat aksi resmi diselesaikan, termasuk SAVE/MISS.
            </p>
            <div className="notice">
              TARGET_GOALS selalu menutup ronde berdasarkan jumlah gol, walaupun metrik pemenang
              berbeda.
            </div>
            {snapshot && <Scoreboard snapshot={snapshot} />}
          </section>
        )}
        {page === 'goalkeeper' && (
          <section className="panel padded">
            <h3>Penjaga gawang</h3>
            <Field
              label="Warna jersey kiper"
              type="color"
              value={draft.visual.keeperColor}
              onChange={(v) =>
                edit((c) => {
                  c.visual.keeperColor = v;
                })
              }
            />
            <p>
              Gerakan dive, concede, deflect, dan recovery mengikuti outcome server. Peluang gol
              dikendalikan pada halaman Skill & peluang; visual kiper tidak mengubah probabilitas.
            </p>
            <a className="button" href="/admin/skills">
              Atur peluang gol
            </a>
          </section>
        )}
        {page === 'overlay' && (
          <>
            <section className="panel padded">
              <div className="section-title">
                <h3>Tulisan untuk siaran</h3>
                <a className="button" href="/live" target="_blank" rel="noreferrer">
                  Buka overlay <ExternalLink size={14} />
                </a>
              </div>
              <p>
                Pilih bagian tulisan, lalu ubah isi, warna, ukuran, atau tampil/sembunyikan.
                Pratinjau di bawah mengikuti perubahan yang belum disimpan. Klik Simpan perubahan
                untuk memperbarui overlay yang sedang tersambung.
              </p>
              <label className="field">
                <span>Bagian tulisan</span>
                <select
                  value={overlayField}
                  onChange={(e) => setOverlayField(e.target.value as OverlayTextKey)}
                >
                  {overlayTextKeys.map((key) => (
                    <option key={key} value={key}>
                      {overlayTextDefinitions[key].label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <div className="overlay-editor-grid">
              <section className="panel padded">
                <h3>{overlayTextDefinitions[overlayField].label}</h3>
                <Toggle
                  label="Tampilkan tulisan ini"
                  value={draft.overlay.text[overlayField].visible}
                  onChange={(value) =>
                    edit((c) => {
                      c.overlay.text[overlayField].visible = value;
                    })
                  }
                />
                <label className="field">
                  <span>Isi tulisan</span>
                  <textarea
                    rows={4}
                    maxLength={240}
                    value={draft.overlay.text[overlayField].text}
                    onChange={(e) =>
                      edit((c) => {
                        c.overlay.text[overlayField].text = e.target.value;
                      })
                    }
                  />
                </label>
                <small>
                  {draft.overlay.text[overlayField].text.length}/240 karakter.{' '}
                  {overlayTextDefinitions[overlayField].help}
                </small>
                <div className="form-grid">
                  <Field
                    label="Ukuran tulisan (%)"
                    value={draft.overlay.text[overlayField].sizePercent}
                    min={50}
                    max={200}
                    onChange={(value) =>
                      edit((c) => {
                        c.overlay.text[overlayField].sizePercent = +value;
                      })
                    }
                  />
                  <Field
                    label="Warna tulisan"
                    type="color"
                    value={draft.overlay.text[overlayField].color}
                    onChange={(value) =>
                      edit((c) => {
                        c.overlay.text[overlayField].color = value;
                      })
                    }
                  />
                </div>
                <p>
                  100% mengikuti ukuran bawaan pada portrait/landscape. Angka 50–200% memperkecil
                  atau memperbesar tulisan ini. Isi kosong menyembunyikan tulisan. HTML ditampilkan
                  sebagai teks biasa.
                </p>
                <button
                  className="button"
                  onClick={() =>
                    edit((c) => {
                      c.overlay.text[overlayField] = defaultOverlaySettings().text[overlayField];
                    })
                  }
                >
                  Pulihkan bagian ini
                </button>
              </section>
              <section className="panel padded">
                <h3>Pratinjau tulisan</h3>
                <p>
                  Contoh tampilan dengan data pertandingan saat ini. Posisi dan ukuran dasar
                  mengikuti bagian masing-masing pada overlay.
                </p>
                <div className="overlay-text-preview" aria-label="Pratinjau tulisan overlay">
                  {draft.overlay.text[overlayField].visible &&
                  draft.overlay.text[overlayField].text.trim() ? (
                    <OverlayText
                      settings={draft.overlay}
                      name={overlayField}
                      variables={
                        snapshot
                          ? overlayVariables(snapshot, {
                              arenaStatus: 'Arena tersambung',
                              kick: snapshot.active?.skill.label ?? 'Normal Kick',
                              supporter: snapshot.active?.supporterName ?? 'Pendukung',
                              winner: snapshot.result
                                ? overlayVariables(snapshot).winner
                                : 'Klub pemenang',
                              notice: snapshot.notice?.text ?? 'Pilih klub dulu!',
                            })
                          : {}
                      }
                    />
                  ) : (
                    <small>Tulisan ini disembunyikan.</small>
                  )}
                </div>
                <p>
                  Nama klub diatur pada Klub, nama skill pada Skill & peluang, dan nama gift pada
                  Mapping gift. Penanda seperti <code>{'{likes}'}</code> dan{' '}
                  <code>{'{queue}'}</code> mengikuti angka game tanpa mengubah skor atau aturan
                  pertandingan.
                </p>
              </section>
            </div>
            <section className="panel padded">
              <h3>Kelompok informasi</h3>
              <div className="form-grid">
                {(
                  [
                    ['showClubCodes', 'Tampilkan daftar kode klub'],
                    ['showGiftLegend', 'Tampilkan daftar gift dan skill'],
                    ['showConnections', 'Tampilkan status koneksi'],
                    ['showDetailedScores', 'Tampilkan klasemen detail landscape'],
                    ['showNotices', 'Tampilkan pemberitahuan game'],
                  ] as const
                ).map(([key, label]) => (
                  <Toggle
                    key={key}
                    label={label}
                    value={draft.overlay[key]}
                    onChange={(value) =>
                      edit((c) => {
                        c.overlay[key] = value;
                      })
                    }
                  />
                ))}
              </div>
              <button
                className="button"
                onClick={() =>
                  edit((c) => {
                    c.overlay = defaultOverlaySettings();
                  })
                }
              >
                Pulihkan semua teks dan tampilan
              </button>
              <p>
                Pemulihan masuk sebagai perubahan yang belum disimpan. Pengaturan pertandingan,
                like, gift, klub, dan skor tetap memakai nilainya saat ini.
              </p>
            </section>
          </>
        )}
        {page === 'visual' && (
          <section className="panel padded">
            <div className="form-grid">
              <Select
                label="Kualitas"
                value={draft.visual.quality}
                options={['Low', 'Medium', 'High']}
                onChange={(v) =>
                  edit((c) => {
                    c.visual.quality = v as Config['visual']['quality'];
                  })
                }
              />
              <Field
                label="Safe area bawah (%)"
                value={draft.visual.safeArea}
                min={0}
                max={25}
                onChange={(v) =>
                  edit((c) => {
                    c.visual.safeArea = +v;
                  })
                }
              />
              <Field
                label="Volume (0–1)"
                value={draft.visual.volume}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  edit((c) => {
                    c.visual.volume = +v;
                  })
                }
              />
            </div>
            <Toggle
              label="Kamera sinematik skill"
              value={draft.visual.cinematic}
              onChange={(v) =>
                edit((c) => {
                  c.visual.cinematic = v;
                })
              }
            />
            <Toggle
              label="Demo otomatis ketika sepi (tanpa skor)"
              value={draft.idle.enabled}
              onChange={(v) =>
                edit((c) => {
                  c.idle.enabled = v;
                })
              }
            />
            <div className="form-grid">
              <Field
                label="Timeout idle (ms)"
                value={draft.idle.timeoutMs}
                min={5000}
                onChange={(v) =>
                  edit((c) => {
                    c.idle.timeoutMs = +v;
                  })
                }
              />
              <Field
                label="Interval demo (ms)"
                value={draft.idle.intervalMs}
                min={5000}
                onChange={(v) =>
                  edit((c) => {
                    c.idle.intervalMs = +v;
                  })
                }
              />
            </div>
            <p>
              Audio harus diaktifkan operator lewat ikon suara pada overlay. Medium adalah preset
              default; lakukan uji FPS di perangkat siaran.
            </p>
          </section>
        )}
        {page === 'history' && (
          <>
            <section className="panel padded">
              <div className="section-title">
                <h3>50 ronde terbaru</h3>
                <button
                  className="button"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data?.history, null, 2)], {
                        type: 'application/json',
                      }),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'penalty-rounds.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={15} /> Ekspor JSON
                </button>
              </div>
              {data?.history.length ? (
                <pre className="history-data">{JSON.stringify(data.history, null, 2)}</pre>
              ) : (
                <p>
                  Belum ada ronde selesai. Riwayat disimpan sebelum reset; arsip KV diproses melalui
                  outbox.
                </p>
              )}
            </section>
            <section className="panel padded">
              <h3>100 tendangan resmi terbaru</h3>
              <details className="audit-row">
                <summary>Outcome, peluang, poin, versi konfigurasi</summary>
                <pre>{JSON.stringify(data?.kicks, null, 2)}</pre>
              </details>
              <h3>Audit terbaru</h3>
              {data?.audit.map((a, i) => (
                <details className="audit-row" key={i}>
                  <summary>
                    {new Date(a.at).toLocaleString('id-ID')} · {a.action}
                  </summary>
                  <pre>{a.detail}</pre>
                </details>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
function Controls({ command, busy }: { command: (s: string) => void; busy: boolean }) {
  return (
    <div className="controls">
      {[
        ['start', 'Mulai', Play],
        ['pause', 'Jeda', Pause],
        ['resume', 'Lanjut', Play],
        ['stop', 'Tutup ronde', Square],
        ['reset', 'Reset', RotateCcw],
      ].map(([action, label, Icon]) => {
        const I = Icon as typeof Play;
        return (
          <button
            className={'button ' + (action === 'start' ? 'primary' : '')}
            key={action as string}
            disabled={busy}
            onClick={() => command(action as string)}
          >
            <I size={14} />
            {label as string}
          </button>
        );
      })}
    </div>
  );
}

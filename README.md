# Penalty Battle 3D

Arena penalti interaktif berbahasa Indonesia untuk TikTok LIVE, OBS, dan LIVE Studio. Implementasi awal [PRD v1.1](docs/PRD.md): **Workers + Durable Objects + KV + R2, tanpa D1**.

Lima karakter klub berjejer menghadap satu gawang. Pemain aktif berjalan ke titik penalti, menendang, bereaksi, dan kembali ke slot asal. Skill memiliki gerak dan efek berbeda: api, lintasan petir melengkung, putaran phantom, serta meteor naga emas. Semua aset bawaan dibuat secara prosedural; tidak menyertakan logo resmi atau model pemain berlisensi.

![Studio arena dari pengujian lokal](docs/screenshots/studio.png)

[Preview overlay portrait](docs/screenshots/portrait.png) · [Laporan browser](docs/browser-report.json)

## Jalankan lokal

Node.js **22.12+** (pengujian memakai Node 24).

```sh
npm ci
cp .dev.vars.example .dev.vars
# Isi dua secret acak yang berbeda, masing-masing minimal 32 karakter.
npm run build
npm run dev:server
# Terminal kedua:
npm run dev
```

- `http://localhost:5173/`: studio/simulator lokal yang terisolasi dari skor resmi.
- `/live`: overlay publik read-only dengan WebSocket dan pemulihan snapshot.
- `/admin`: login operator menggunakan `ADMIN_SECRET`; cookie HttpOnly, SameSite Strict, Secure di HTTPS.
- Semua halaman admin: integrasi, klub, gift, skill, kiper, ronde, antrean, leaderboard, visual, riwayat.

Pratinjau `/` juga berjalan tanpa backend setelah aset aplikasi dimuat. Pilih klub dan skill; dropdown **Hasil uji** dapat memaksa GOAL/SAVE/MISS untuk uji animasi. Tombol reset hanya mereset simulasi browser.

## Pemeriksaan

```sh
npm run check          # typecheck, lint promise, unit + integration tests, build
npm run format:check
npm run test:browser   # jalankan setelah build; membutuhkan Chromium
```

Tes browser memakai Worker, KV, R2, dan Durable Object **terisolasi**, dengan secret acak sementara. Tidak memakai kredensial atau pertandingan produksi. Jika Chromium belum tersedia, jalankan `npx playwright install chromium`; atau set `CHROMIUM_PATH` ke browser lokal. Screenshot dan laporan tersimpan di `artifacts/` (tidak masuk Git).

Tes meliputi combo final, prioritas mapping, peluang 0/100%, snapshot konfigurasi, pemisahan skor, anti-starvation, burst 500 aksi, penutupan ronde, pause/resume, retry bersamaan, restart runtime dengan storage persisten, WebSocket read-only, HMAC, auth/CSRF, serta upload R2.

## Arsitektur

```text
Konektor milik pengguna ── HMAC webhook ── Worker API
                                            │
                                   MatchRoom Durable Object
                                   SQLite internal, bukan D1
                                   state + antrean + dedup
                                   outcome + skor + outbox
                                      │              │
                                WebSocket       KV config/arsip
                                      │
                                Overlay / admin
                                      │
                               R2 aset immutable
```

- Seluruh perubahan game, dedup, hasil RNG, dan skor ditulis dalam transaksi sinkron SQLite **di Durable Object**.
- Alarm menyelesaikan aksi meskipun browser tidak tersambung; reload tidak menghitung skor ulang.
- Peluang, durasi, kontribusi, poin skill, klub, dan versi konfigurasi disnapshot ketika enqueue. Outcome diputuskan dengan Web Crypto di server saat aksi dimulai.
- Catatan `ACTIVE`/`DONE` tiap tendangan resmi disimpan untuk audit. Demo tidak masuk skor atau riwayat resmi.
- KV ditulis saat konfigurasi berubah atau ronde selesai melalui outbox persisten, bukan per gift/like. Konfigurasi KV tidak kedaluwarsa; arsip hasil mengikuti retensi.
- Score publik tidak menyertakan ID penonton, secret, isi konfigurasi admin, atau audit.

Lihat [arsitektur dan aturan](docs/ARCHITECTURE.md), [audit konektor](docs/INTEGRATION.md), [runbook](docs/OPERATIONS.md), dan [status acceptance](docs/ACCEPTANCE.md).

## Deploy Cloudflare

```sh
npx wrangler login
npx wrangler kv namespace create CONFIG
npx wrangler r2 bucket create penalty-battle-assets
# Isi id namespace CONFIG pada wrangler.jsonc sesuai hasil provisioning.
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put WEBHOOK_SIGNING_SECRET
npm run build
npx wrangler deploy --dry-run
npm run deploy
```

`wrangler.jsonc` menyertakan migrasi SQLite Durable Object, static SPA assets, observability, KV, R2, dan deklarasi secret yang diperlukan. ID namespace sengaja belum terikat ke akun tertentu. Wrangler versi proyek juga mendukung provisioning KV otomatis; provisioning eksplisit mempermudah peninjauan akun dan resource.

Setelah deploy, login admin, isi **Room ID TikTok sumber**, pilih **Gift ID Normal**, periksa mapping/kontribusi/probabilitas, lalu simpan dan mulai ronde. Tambahkan endpoint `/api/hooks/tiktok` pada dashboard konektor untuk event **chat, gift, stream**. Secret tidak boleh dimasukkan ke URL overlay atau source frontend.

**Status produksi:** kode konektor telah diaudit pada commit `3660b385078318e2d10782ddf1e00dc8492d3b28`. Pengujian memakai payload kontrak dan HMAC nyata di runtime lokal, belum delivery TikTok LIVE sungguhan. ID pesan upstream belum diteruskan konektor dan delivery retry-nya belum durable; kedua batas tersebut perlu ditangani/diterima sebelum siaran publik berbayar. FPS di perangkat OBS/LIVE Studio dan aset GLB final juga harus diuji. Jangan mengartikan simulator atau tes sintetis sebagai bukti kesiapan produksi penuh.

# Operasi, deploy, dan rollback

## Persiapan

1. Gunakan akun Cloudflare yang mendukung SQLite Durable Objects, KV, dan R2. Periksa biaya dan batas plan aktual pada dashboard; repo tidak mengasumsikan layanan gratis.
2. Provision namespace KV CONFIG dan bucket R2 sesuai README. Isi ID KV hasil provisioning pada config, simpan di Git sebagai ID non-secret.
3. Isi ADMIN_SECRET dan WEBHOOK_SIGNING_SECRET melalui `wrangler secret put`, bukan lewat source atau query URL. Gunakan nilai berbeda, acak, 32+ karakter.
4. `npm ci && npm run check && npm run test:browser`, lalu `npx wrangler deploy --dry-run`. Deploy explicit dengan `npm run deploy`. GitHub CI melakukan pemeriksaan saja, **tidak otomatis deploy**.
5. Buka admin melalui HTTPS, simpan source room, mapping normal, peluang/poin, queue dan mode ronde. Jangan menyalin cookie ke browser source publik.

## OBS / TikTok LIVE Studio

- Browser source: `https://<domain>/live`, portrait 1080×1920 atau landscape 1920×1080.
- Pastikan kelima klub, gawang, titik penalti, label, timer, dan petunjuk terlihat. Atur safe area melalui admin sesuai letak komentar dan gift tray pada layout siaran aktual.
- Klik tombol suara setelah browser mengizinkan audio. Audio default mute. Jangan menganggap autoplay dijamin OBS atau browser.
- Medium adalah awal yang dianjurkan. Turunkan ke Low jika GPU/encoder sibuk. Lakukan benchmark 60 FPS desktop / 30 FPS mobile pada perangkat sasaran; tes SwiftShader tidak membuktikan target tersebut.
- Uji GOAL/SAVE/MISS seluruh skill di studio simulasi lokal. Jangan mengirim gift asli untuk menguji shader/animasi.

## Saat siaran

- Pantau last event, status sumber, queue depth, event rejected, duplicate, dan outbox pending.
- Setiap aksi rata-rata memerlukan 4–7,5 detik. Burst panjang dapat menghasilkan waktu tunggu besar walaupun enqueue cepat. Hindari mempromosikan gift ketika antrean tidak dapat ditangani.
- Jeda: aksi aktif selesai, antrean tertahan, gift baru mendapat round_closed.
- Tutup ronde: penerimaan berhenti, seluruh aksi valid diselesaikan, hasil disimpan, baru result/intermission. Reset tidak membuang hak aksi yang sudah diterima.
- Status no_club tidak mengembalikan gift TikTok. Tampilkan instruksi pilih klub sebelum penonton mengirim gift.

## Kegagalan dan pemulihan

| Gejala                | Tindakan                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 webhook           | Cocokkan signing secret, timestamp detik, raw body; jangan memodifikasi JSON sebelum verifikasi        |
| source_room_mismatch  | Samakan room aktual dan sourceRoomId admin; room kosong memang ditolak                                 |
| streak_pending        | Normal untuk update combo non-final; periksa final event benar-benar tiba                              |
| queue_full / 503      | Pantau retry konektor; jangan mengasumsikan retry terbatas menyimpan event selamanya                   |
| Overlay putus         | Reconnect otomatis dengan exponential backoff + jitter; reload mengambil snapshot, bukan replay skor   |
| Outbox pending        | Hasil tetap di DO; periksa KV binding/quota. Alarm retry otomatis                                      |
| Konektor RECONNECTING | 90 detik tidak ada event; cek konektor langsung, karena webhook tidak memiliki heartbeat terverifikasi |
| GLB gagal             | Karakter prosedural fallback; periksa key R2, tipe file, ukuran dan orientasi model                    |

## Rollback dan perubahan schema

Catat commit Git dan Worker version setiap deploy. `npx wrangler versions list` lalu `npx wrangler rollback <VERSION_ID>` mengembalikan kode; **tidak mengembalikan storage**. Schema snapshot saat ini `schema:1` dan migrasi `v1` memakai `new_sqlite_classes: [MatchRoom]`. Jangan menghapus binding, class, namespace, atau storage untuk mereset game. Migrasi berikutnya wajib kompatibel dengan data versi sebelumnya dan diuji pada salinan data nonproduksi.

Sebelum migrasi storage, tutup penerimaan, drain antrean, ekspor riwayat admin, dan gunakan mekanisme backup/recovery DO dari platform sesuai plan. Ekspor JSON admin adalah ringkasan hasil, bukan backup seluruh antrean/dedup.

## Retensi dan akses

Retensi default 7 hari; edit menjadi 1–30 hari melalui admin. Maintenance purge berjalan lewat alarm. Tidak menyimpan foto profil atau payload mentah TikTok. Dedup menyimpan ID dan status 7 hari. Aset immutable R2 tidak dihapus otomatis; hapus aset tidak terpakai melalui akun Cloudflare setelah memastikan tidak direferensikan.

ADMIN_SECRET shared operator menghasilkan audit actor tunggal (`operator`), bukan multi-user RBAC. Rotasi secret membatalkan sesi lama; sesi maksimal 8 jam. Untuk beberapa operator dengan identitas individual, tempatkan Cloudflare Access di depan halaman/API admin dan tambahkan verifikasi identitas teruji sebelum mengklaim audit per orang.

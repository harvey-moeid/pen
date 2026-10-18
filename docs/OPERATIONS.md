# Operasi, deploy, dan rollback

## Persiapan

1. Gunakan akun Cloudflare yang mendukung SQLite Durable Objects, KV, dan R2. Periksa biaya dan batas plan aktual pada dashboard; repo tidak mengasumsikan layanan gratis.
2. Binding KV dan R2 produksi sudah disiapkan pada akun di bawah. Jangan membuat namespace baru untuk setiap deploy; storage harus tetap sama.
3. Isi ADMIN_SECRET dan WEBHOOK_SIGNING_SECRET melalui GitHub Actions secrets untuk CD, atau `wrangler secret put` untuk deploy lokal. Gunakan nilai berbeda, acak, 32–512 karakter; jangan lewat source atau query URL.
4. CI menjalankan pemeriksaan sebelum CD. Untuk verifikasi lokal: `npm ci && npm run check && npm run test:browser`, lalu `npx wrangler deploy --dry-run`. Deploy lokal tersedia dengan `npm run deploy`.
5. Buka admin melalui HTTPS, simpan source room, mapping normal, peluang/poin, queue dan mode ronde. Jangan menyalin cookie ke browser source publik.

## CD GitHub Actions

Workflow [Verify Penalty Battle](https://github.com/harvey-moeid/pen/actions/workflows/check.yml) memiliki job **Deploy production**, bergantung pada **CI passed**. Hanya push dan **Run workflow** pada `main` yang dapat deploy. Pull request, merge queue, branch lain, atau CI gagal tidak mendapat akses ke job deploy. Tidak ada pemicu `pull_request_target` atau eksekusi artifact dari fork.

Resource produksi yang telah dibuat:

| Resource                    | Nilai                                                           |
| --------------------------- | --------------------------------------------------------------- |
| Cloudflare account          | `harvey` — `07086b4d368d0a37ebcbbf186e51eecf`                   |
| Worker                      | `penalty-battle-3d`                                             |
| KV CONFIG                   | `penalty-battle-3d-CONFIG` — `9a2612fe04034f7e934f4f7865103c14` |
| R2 MEDIA                    | `penalty-battle-assets` — APAC                                  |
| GitHub environment          | `production`                                                    |
| URL setelah deploy berhasil | `https://penalty-battle-3d.harveymoeid.workers.dev`             |

### Pengaturan sekali saja

Di [Settings → Secrets and variables → Actions](https://github.com/harvey-moeid/pen/settings/secrets/actions), tambahkan repository secrets berikut. Alternatifnya, simpan sebagai environment secrets pada `production`; nilai environment mengalahkan repository secret dengan nama sama.

| Secret                   | Isi                                                                               |
| ------------------------ | --------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`   | Token Cloudflare untuk deploy Workers pada akun `harvey`                          |
| `CLOUDFLARE_ACCOUNT_ID`  | `07086b4d368d0a37ebcbbf186e51eecf`                                                |
| `ADMIN_SECRET`           | Kunci operator acak, 32–512 karakter                                              |
| `WEBHOOK_SIGNING_SECRET` | Kunci HMAC acak, berbeda dari kunci operator; samakan dengan konfigurasi konektor |

Buat API token menggunakan template **Edit Cloudflare Workers**, batasi resource ke akun di atas, dan pastikan akses Workers Scripts serta binding Workers KV/R2 tersedia. Resource telah dibuat sehingga workflow tidak perlu membuat ulang KV/R2. Panduan resmi: [Cloudflare GitHub Actions authentication](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/). Jangan menyimpan token di file repo, log, atau chat.

Setelah secret disimpan, buka **Actions → Verify Penalty Battle → Run workflow → main**. Untuk run yang hanya gagal karena secret kosong, **Re-run failed jobs** juga dapat dipakai selama artifact `production-assets` belum kedaluwarsa (7 hari) dan commit masih merupakan `main` terbaru. Jika tidak, jalankan workflow baru.

### Perilaku deployment

1. Ketiga job CI harus lulus. Artifact `production-assets` berisi frontend yang telah diuji browser, dari run yang sama; CD tidak membangun ulang frontend.
2. Job memeriksa bahwa commit masih merupakan `main` terbaru serta keempat secret tersedia dan valid. Kekurangan secret menghasilkan kegagalan yang menyebut nama pengaturan, tanpa menampilkan nilainya.
3. Wrangler versi lockfile membundel Worker dari commit yang sama dan mengunggahnya bersama static assets. Dua secret runtime dikirim menggunakan `--secrets-file` melalui file sementara berizin `0600`, lalu dihapus; file tidak masuk artifact atau Git.
4. Deploy menyertakan commit SHA pada pesan versi Cloudflare. Job mengecek `/api/health`, `/api/snapshot`, dan `/live`, dengan retry terbatas selama propagasi. Pemeriksaan snapshot tidak menambah skor atau mengirim event gift.
5. Ringkasan run mencatat status, commit, dan URL. Health/snapshot/HTML smoke test tidak membuktikan delivery TikTok LIVE, performa GPU, atau setiap operasi R2.

Deployment hanya satu per satu. Run `main` yang sedang berjalan tidak dibatalkan oleh push baru; commit antrean yang sudah tertinggal ditolak sebelum deploy. GitHub dapat mengganti run pending dengan run terbaru. Menjalankan ulang commit lama tidak digunakan untuk rollback; buat revert commit pada `main` atau ikuti prosedur rollback di bawah.

GitHub environment `production` dapat diberi aturan branch `main` dan required reviewers sesuai kebutuhan operator. Workflow tidak mengubah pengaturan proteksi repository. Secret runtime di GitHub menjadi sumber nilai saat CD; rotasi di dashboard Cloudflare saja akan ditimpa oleh deploy berikutnya, jadi perbarui GitHub dan konektor bersamaan.

Jika smoke test gagal setelah upload, kode baru mungkin sudah aktif. Workflow melaporkan gagal dan **tidak otomatis rollback**, karena rollback kode tidak mengembalikan storage. Periksa log Worker sebelum melakukan pemulihan.

## Pengaturan like dan logo

- **Admin → Like → tendangan**: aktifkan fitur, isi jumlah like per Normal Kick, simpan. Aktifkan skill NORMAL pada **Skill & peluang**. Default fitur nonaktif, ambang 100. Pilih event `like` pada webhook konektor selain `chat`, `gift`, `stream`.
- Hitungan per penonton setelah memilih klub. Contoh ambang 100: 250 like menghasilkan 2 tendangan dan sisa 50. Like sebelum pilih klub atau di luar LIVE/pause tidak dihitung. Ambang/toggle berubah, pindah klub, dan ronde baru/reset menghapus sisa; perubahan unrelated seperti volume tidak menghapus sisa.
- **Admin → Klub**: logo menerima PNG/WebP/JPG, model karakter menerima GLB. Keduanya opsional, masing-masing maksimal 20 MB. Simpan konfigurasi setelah upload. Tombol logo/model bawaan menghapus referensi aset dari klub tanpa menghapus objek R2.

## Teks overlay

1. Buka **Admin → Teks overlay**, pilih **Bagian tulisan**, lalu edit isi, warna, ukuran 50–200%, atau sakelar tampil. Pratinjau memakai draft dan data pertandingan saat ini. Maksimal 240 karakter per bagian; teks boleh beberapa baris.
2. Gunakan penanda yang dijelaskan di bawah editor: misalnya `{likes}` untuk ambang like dan `{queue}` untuk antrean. Nilai otomatis mengikuti game; jangan mengganti angka tersebut dengan nilai manual jika ingin tetap sinkron.
3. Sesuaikan kelompok informasi yang ingin ditampilkan. Klik **Simpan perubahan**, kemudian cek `/live` portrait dan landscape. Tulisan diperbarui melalui WebSocket; overlay yang reconnect mengambil snapshot terbaru.
4. **Pulihkan bagian ini** hanya memulihkan teks terpilih beserta warna/ukuran/visibilitasnya. **Pulihkan semua teks dan tampilan** memulihkan semua pengaturan overlay. Keduanya perlu disimpan untuk mengubah siaran; aturan pertandingan dan hitungan like tidak direset.

Judul, label, dan petunjuk adalah teks biasa. Karakter seperti `<` atau `>` tidak menjadi HTML. Ukuran 100% mengikuti ukuran bawaan pada layout masing-masing. Tulisan panjang dan ukuran besar perlu diperiksa pada perangkat siaran; editor tidak mengatur posisi arena atau hasil game.

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
| source_room_mismatch  | Kosongkan filter Room ID atau samakan dengan ID siaran TikTok aktual; bukan hash commit                |
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

# PRODUCT REQUIREMENTS DOCUMENT (PRD)

# TikTok LIVE Penalty Battle 3D

**Versi:** 1.1 — Revisi tata letak penendang berjejer  
**Tanggal:** 17 Oktober 2026  
**Status:** Siap untuk perencanaan dan implementasi bertahap; integrasi aktual dan aset perlu diverifikasi  
**Platform:** Web 3D, overlay TikTok LIVE / OBS / TikTok LIVE Studio, panel admin  
**Bahasa UI utama:** Indonesia  
**Sumber event LIVE:** `live-tiktok-konektor` (web/konektor yang sudah dimiliki pengguna)  
**Stack utama:** Cloudflare Workers + Durable Objects + KV + R2; **tanpa D1**  
**Prioritas tampilan:** Portrait 9:16, dengan dukungan landscape 16:9

---

## 1. Ringkasan eksekutif

TikTok LIVE Penalty Battle 3D adalah permainan **adu penalti saja** (bukan pertandingan sepak bola penuh). Beberapa klub, secara awal **lima klub**, masing-masing memiliki karakter penendang 3D miniatur realistis. Mereka bersaing mencetak gol ke **satu gawang** yang dijaga kiper AI berbasis logika game. Penonton memilih klub lewat komentar di TikTok LIVE. Gift yang valid memicu antrean tendangan biasa atau skill khusus. Setiap skill mempunyai animasi tendangan 3D sinematik yang berbeda.

Game dapat terus menampilkan aktivitas saat tidak ada gift: animasi idle dan, setelah timeout yang dapat diatur, penalti demo yang **tidak** menambah skor. Admin mengendalikan klub, mapping gift, peluang gol, bobot poin, ronde, antrean, visual, serta integrasi.

**Tujuan produk:** menghasilkan tayangan LIVE interaktif yang menarik, jelas dan stabil, dengan skor valid, visual spektakuler, dan penggunaan layanan Cloudflare yang efisien.

### 1.1 Sasaran keberhasilan

- Penonton dapat memilih klub lewat komentar dan memicu penalti dengan gift yang sesuai.
- Semua gift valid yang memenuhi ketentuan diproses **tepat satu kali** sebagai aksi permainan, atau diberikan status error/penolakan yang jelas.
- Skor/leaderboard pertandingan aktif sinkron pada semua layar.
- Karakter dan efek skill tampil berbeda, halus, dan layak siaran portrait.
- Admin dapat mengubah konfigurasi inti tanpa edit kode/deploy ulang.
- Pemrosesan gift LIVE tidak menghasilkan write D1 dan tidak menulis setiap event ke KV.

### 1.2 Di luar cakupan (MVP)

- Pertandingan sepak bola penuh: dribbling, passing, tackling, offside, dua tim berhadapan.
- Sistem taruhan, taruhan uang, atau kemenangan yang memberikan hadiah bernilai uang berdasarkan peluang.
- Integrasi TikTok terpisah yang menduplikasi koneksi `live-tiktok-konektor`.
- Liga multipengguna lintas banyak room, transfer pemain, toko NFT, dompet koin internal.
- Janji dukungan terhadap semua jenis payload TikTok sebelum kontrak event konektor diverifikasi.

---

## 2. Keputusan final yang dikunci

| ID | Topik | Keputusan |
|---|---|---|
| K-01 | Genre | **Adu penalti 3D saja**, satu gawang dan kiper. |
| K-02 | Sumber LIVE | Event berasal dari **`live-tiktok-konektor`**, tidak membangun konektor TikTok lain. |
| K-03 | Klub | Klub, nama, kode, warna, logo, karakter dapat dikelola di **admin**. Awal 5 klub. |
| K-04 | Tendangan biasa | **Opsi B:** satu **jenis/ID gift khusus** yang dipilih admin memicu tendangan biasa; **bukan** akumulasi 10 gift. |
| K-05 | Skill trigger | Gift bernilai **1 koin → Skill 1; 5 koin → Skill 2; 10 koin → Skill 3; 30 koin → Ultimate**; mapping konkret Gift ID/price harus dikelola admin. |
| K-06 | Peluang gol (#2) | **Opsi D:** probabilitas gol 0–100% per tendangan/skill dikonfigurasi admin, termasuk Ultimate. |
| K-07 | Antrean (#3) | **Opsi D:** antrean pintar, urutan kedatangan dengan prioritas terbatas untuk skill tinggi, tanpa starvation; tidak menginterupsi animasi aktif. |
| K-08 | Visual (#4) | **Opsi C:** Hybrid Cinematic — model 3D miniatur realistis + efek superpower/camera sinematik saat skill. |
| K-09 | Belum pilih klub (#5) | **Opsi A:** gift tidak memicu aksi/skor dan tampil pesan **“Pilih klub dulu!”**. Gift di TikTok tidak dapat ditolak/dikembalikan oleh game. |
| K-10 | Ronde (#6) | **Opsi D:** admin memilih berdasarkan waktu, target gol, atau tanpa batas; mengatur countdown, reset, winner announcement, auto restart. |
| K-11 | Saat tidak ada gift (#7) | **Opsi D:** mode pintar — idle/pemanasan lalu demo penalti tanpa skor setelah timeout; gift valid mendapat prioritas setelah animasi aktif selesai. |
| K-12 | Leaderboard (#8) | **Opsi D:** admin memilih pemenang berdasarkan gol, poin skill berbobot, atau kontribusi gift. Ketiga metrik tetap disimpan terpisah. |
| K-13 | Penyimpanan | **Cloudflare KV + Durable Objects + R2, tanpa D1** untuk MVP. |
| K-14 | Susunan karakter penendang | **Seluruh karakter klub berjejer horizontal menghadap gawang**, seperti referensi awal. Hanya karakter yang mendapat giliran maju ke titik penalti lalu kembali ke posisi awal; karakter lain tetap terlihat. |

> **Pembedaan penting:** “gift 10” yang sempat disebut di awal **sudah diganti** keputusan K-04: tendangan biasa dipicu **jenis gift khusus**, tidak dengan menghitung 10 gift. Nilai koin untuk empat skill adalah aturan default produk yang harus dipetakan ke event gift aktual dari konektor. Admin dapat mengubah/mengaktifkan aturan.

---

## 3. Pemain, admin, dan skenario penggunaan

### 3.1 Peran

1. **Penonton LIVE:** memilih klub dengan komentar; mengirim gift untuk melakukan penalti; melihat leaderboard dan animasi.
2. **Streamer/operator:** menayangkan halaman `/live`, memantau koneksi dan antrean, dapat mengendalikan pertandingan sesuai hak akses.
3. **Admin:** membuat/mengubah klub, mapping gift, skill, skor, ronde, kiper, efek, serta pengamanan konektor.
4. **Konektor LIVE:** mengirim event terverifikasi dari `live-tiktok-konektor` ke adapter game.

### 3.2 Alur utama penonton

1. LIVE dimulai dan overlay menampilkan kode klub beserta instruksi.
2. Penonton berkomentar `RMA`, `BAR`, atau kode klub aktif lain.
3. Sistem memvalidasi akun dan menyimpan klub aktif penonton pada state room.
4. Penonton mengirim gift yang cocok dengan mapping admin.
5. Event divalidasi dan didedup, lalu diubah menjadi satu atau lebih **aksi tendangan** sesuai pengaturan gift (default satu aksi untuk satu unit gift valid).
6. Aksi masuk antrean pintar, karakter klub tampil dengan nama pendukung.
7. Pemain melakukan animasi tendangan; kiper bereaksi; engine menentukan **GOAL / SAVE / MISS**.
8. Gol, poin skill, dan kontribusi gift diperbarui **secara terpisah**; leaderboard real-time berubah.
9. Ketika ronde selesai, pemenang diumumkan sesuai mode ranking yang dipilih admin.

### 3.3 Penonton tanpa klub

Jika gift diterima sebelum penonton memilih klub:

- Sistem **tidak** memasukkannya ke antrean, tidak menambah gol, dan tidak memberi poin game.
- Overlay menampilkan pesan **“Pilih klub dulu!”** bila aman dari spam overlay; admin log menyimpan ringkasan event penolakan.
- Jangan menyatakan transaksi gift TikTok dapat dibatalkan atau direfund oleh game.
- UI petunjuk harus membuat aturan ini terlihat jelas **sebelum** penonton memberi gift.

---

## 4. Arena dan gameplay 3D

### 4.1 Komposisi arena

- Satu gawang dan satu kiper AI.
- Lima posisi karakter penendang default, masing-masing mewakili satu klub. **Kelima karakter harus berjejer horizontal di depan gawang, menghadap ke gawang** (bukan tersebar acak di lapangan atau hanya menampilkan satu penendang).
- Titik penalti, bola, rumput stadion miniatur, garis lapangan, tribune/dekorasi, lampu dan bayangan.
- Satu karakter aktif mengambil penalti pada suatu waktu, yang lain melakukan idle/pemanasan.
- Jumlah klub aktual dinamis dari data admin; layout posisi menyesuaikan jumlah klub yang didukung.
- Responsif portrait 9:16 (utama) dan landscape 16:9.

### 4.1.1 Aturan wajib: formasi barisan penendang

**Susunan utama mengacu pada screenshot awal dari pengguna:**

1. **Gawang + penjaga gawang** berada di ujung lapangan, terlihat jelas dari kamera utama.
2. **Seluruh karakter penendang klub** berjejer dalam **satu baris horizontal di area depan gawang**, pada sisi lapangan yang lebih dekat ke kamera; setiap karakter menghadap gawang. Untuk lima klub default, semuanya harus tampak bersamaan.
3. Urutan kiri-ke-kanan mengikuti `sortOrder` klub dari admin. Label nama/kode klub berada di atas/dekat masing-masing karakter dan tidak saling menutupi.
4. **Titik penalti berada di antara barisan penendang dan gawang.** Saat antrean menugaskan satu klub, karakter klub itu **maju dari posisi barisan** ke titik penalti melalui animasi berjalan/berlari tanpa teleportasi.
5. Pemain aktif mengambil ancang-ancang, menendang, lalu menjalankan animasi reaksi dan **kembali ke slot asalnya di barisan** setelah penyelesaian penalti. Tidak membuat salinan karakter baru untuk setiap gift.
6. Pemain lain **tetap terlihat di slot masing-masing** sepanjang penalti, melakukan idle, pemanasan, tepuk tangan atau interaksi ringan tanpa menghalangi lintasan bola/kamera.
7. **Kamera utama** memakai komposisi diorama yang memperlihatkan **lima pemain berjejer, titik penalti, gawang dan kiper secara bersamaan** pada orientasi portrait 9:16. Kamera boleh melakukan close-up/zoom skill sementara, kemudian **kembali ke kamera komposisi utama**.
8. Bila jumlah klub berubah lewat admin, jarak antar-slot dan skala framing menyesuaikan secara responsif. Batas maksimum klub yang dapat tampil dalam satu baris bergantung pada uji keterbacaan/performa; jangan diam-diam menyembunyikan klub aktif.
9. Formasi tetap konsisten saat idle, demo, gift burst, reconnect dan transisi ronde, tanpa collision antarkarakter.

Skema konseptual dari sudut pandang penonton (bukan ukuran lapangan sebenarnya):

```text
                  [ G A W A N G ]
                       [KIPER]

                   (TITIK PENALTI)

       [RMA]    [BAR]    [MUN]    [PSG]    [JUV]
         o        o        o        o        o
       penendang berjejer, semua menghadap gawang

                 [ KAMERA UTAMA ]
```

### 4.2 Alur satu tendangan

`QUEUED → PREPARE → RUN_UP → KICK → BALL_FLIGHT → GOAL/SAVE/MISS → REACTION → RESET → DONE`

- Engine authoritative di server memutuskan hasil dan perubahan skor. Browser hanya menampilkan animasi yang sejalan dengan hasil tersebut.
- Satu tendangan tidak dapat menghasilkan lebih dari satu gol.
- Kiper memakai state: `IDLE`, `READY`, `DIVE_LEFT`, `DIVE_RIGHT`, `CENTER_SAVE`, `CATCH`, `DEFLECT`, `CONCEDE`, `RECOVER`.
- Jika render mengalami putus sambung, browser dapat memulihkan snapshot pertandingan dan melanjutkan tampilan tanpa menghitung skor ulang.

### 4.3 Kualitas visual

- **Hybrid Cinematic:** model karakter miniatur yang realistis dan lucu/proposional, dipadukan skill superpower.
- Pemain tidak teleportasi; perpindahan diinterpolasi dan memakai animasi skeletal.
- Tingkat kualitas **Low / Medium / High**, default **Medium**, dapat dipilih dan disesuaikan operator.
- Efek partikel, shadow, post-processing, motion blur dan jumlah lampu bisa diturunkan pada Low.
- OBS / browser autoplay audio diperlakukan sesuai keterbatasan browser; operator perlu mengaktifkan suara bila dibutuhkan.

---

## 5. Gift, skill dan animasi

### 5.1 Mapping default

| Pemicu | Tendangan | Contoh visual | Contoh target durasi |
|---|---|---|---|
| **Gift ID khusus** dipilih admin | Normal Kick | Ancang-ancang + tendangan penalti standar | 3–4 dtk |
| **Gift bernilai 1 koin** | Skill 1: Fire Shot | Bola menyala, jejak api | ~4 dtk |
| **Gift bernilai 5 koin** | Skill 2: Thunder Curve | Tendangan melengkung, petir biru | 4–5 dtk |
| **Gift bernilai 10 koin** | Skill 3: Phantom Strike | Afterimage karakter, pusaran energi ungu | 5–6 dtk |
| **Gift bernilai 30 koin** | Ultimate: Dragon Meteor | Close-up, meteor naga emas, slow-motion | 6–8 dtk |

Nama skill dan angka durasi di atas adalah **baseline desain yang dapat diubah**, bukan klaim durasi final. Aset final dibuat sendiri/berlisensi sah. Keempat skill harus mempunyai **animasi tendangan** yang benar-benar berbeda (gerak badan, timing, lintasan/camera, dan efek), bukan hanya warna bola.

### 5.2 Aturan matching dan prioritas mapping

1. Gunakan **Gift ID** konkret dari payload bila tersedia sebagai identitas utama.
2. Mapping **gift khusus Normal Kick** memiliki prioritas eksplisit terhadap aturan generik nilai koin jika keduanya cocok; admin UI menampilkan peringatan tabrakan.
3. Aturan skill berdasar nilai koin adalah **default**; admin boleh menambah mapping Gift ID spesifik per skill dan menonaktifkan fallback nilai koin bila tidak aman.
4. Tidak menjumlahkan beberapa gift kecil menjadi skill lebih tinggi kecuali admin mengaktifkan fitur khusus di pengembangan berikutnya.
5. Aturan default: satu unit gift valid menghasilkan satu aksi penalti. Jika event mengandung `repeat_count`, `combo`, atau streak, adapter harus memeriksa semantik event konektor untuk **tidak menghitung combo dua kali**.
6. Setiap event/gift unit harus punya **idempotency key**. Pengulangan payload tidak menciptakan tendangan baru.
7. Gift yang tidak mempunyai klub valid tidak menghasilkan tendangan atau poin, sesuai K-09.
8. Gift yang tidak dikenali dicatat sebagai `unmapped`, bukan secara otomatis dimasukkan ke Normal Kick.
9. Jika antrean penuh, gunakan backpressure dan kebijakan status yang jelas, **jangan diam-diam membuang gift valid**. Kebijakan kompensasi gameplay/overflow harus ditentukan sebelum produksi.

### 5.3 Peluang gol per jenis tendangan — keputusan #2

Admin dapat mengatur angka bulat/desimal 0–100% untuk:

- Normal Kick.
- Skill 1.
- Skill 2.
- Skill 3.
- Ultimate.

**Contoh preset awal (bukan ketetapan):** Normal 40%, Skill 1 55%, Skill 2 70%, Skill 3 85%, Ultimate 100%. Preset boleh diubah kapan saja oleh admin. Jika Ultimate disetel 75%, kiper masih bisa menepis Ultimate. UI animasi harus memiliki pasangan keberhasilan/kegagalan yang masuk akal untuk masing-masing skill.

- RNG dilakukan di server; hasil dan konfigurasi peluang saat eksekusi disimpan pada catatan tendangan.
- Perubahan peluang tidak mengubah hasil tendangan yang sudah ditetapkan; konfigurasi berlaku sesuai kebijakan snapshot konfigurasi per aksi.
- Untuk akurasi skor, `GOAL` hanya jika outcome authoritative menyatakan gol dan animasi lintasan kompatibel.

---

## 6. Antrean pintar — keputusan #3

### 6.1 Ketentuan

- Sistem menerima aksi dalam urutan kedatangan server dan memberi nomor antrean monotonik di room.
- Saat idle, **skill tinggi mendapat prioritas terbatas**, tetapi aksi normal yang sudah menunggu lama tetap harus diproses (anti-starvation).
- Tendangan yang sedang dianimasikan **tidak dibatalkan** oleh gift baru, termasuk Ultimate.
- Semua aksi valid tersimpan di antrean persisten selama siklus recovery/reconnect.
- Perubahan klub penonton **tidak mengubah** klub dari tendangan yang sudah masuk antrean (snapshot pada enqueue).

### 6.2 Kebijakan rekomendasi untuk implementasi

Gunakan *priority aging*: prioritas awal berdasarkan tier (`ULTIMATE > SKILL_3 > SKILL_2 > SKILL_1 > NORMAL`) dengan bonus berdasarkan waktu tunggu. Tambahkan batas maksimal lompatan prioritas dan batas maksimal waktu tunggu yang dapat diubah di admin. Saat kondisi beban normal, FIFO mendominasi. Semua keputusan reorder terekam untuk audit.

**Parameter admin:** enable smart queue, prioritas tier, batas overtaking, aging interval, kapasitas antrean, lama tunggu peringatan, timeout animasi, kebijakan saat ronde berakhir.

### 6.3 Ronde habis ketika masih ada antrean

Belum ditentukan sebagai keputusan eksplisit pengguna. **Default usulan:** tutup penerimaan untuk ronde tersebut, selesaikan tendangan aktif dan antrean yang sudah berlabel ronde itu, lalu umumkan pemenang. Admin boleh mengganti dengan opsi *stop setelah aksi aktif* serta kebijakan antrean lanjutan. Harus dipilih sebelum implementasi final untuk mencegah kehilangan hak aksi dari gift valid.

---

## 7. Mode pintar saat sepi gift — keputusan #7

- Karakter idle, mengobrol/berinteraksi ringan, stretching, juggling atau pemanasan saat menunggu.
- Setelah idle timeout (contoh awal 30 detik), sistem menjalankan **penalti demo** dengan interval yang dapat diatur (contoh 15 detik).
- Penalti demo menampilkan gerak karakter, reaksi kiper, dan kamera, **tidak** memengaruhi gol/poin gift/skill/leaderboard/rekor resmi.
- Gift valid yang datang saat demo aktif masuk antrean dan menjadi prioritas setelah demo aktif menyelesaikan animasi.
- Sistem tidak memulai demo baru bila ada antrean gift valid.
- Tampilan demo harus ditandai `DEMO` agar penonton tidak mengira terjadi gol resmi.
- Admin dapat mengaktifkan/nonaktifkan idle animation, demo, timeout, interval, kamera demo.

---

## 8. Sistem ronde — keputusan #6

Admin memilih salah satu mode:

1. **Waktu:** pertandingan selesai ketika durasi tercapai (contoh awal 5 menit).
2. **Target gol:** pertandingan selesai saat ada klub mencapai target gol yang dikonfigurasi.
3. **Tanpa batas:** berlangsung sampai admin menghentikan/reset secara manual.

Opsi per mode: countdown awal, jeda antar ronde, auto-start, auto-restart, durasi pengumuman juara, auto/manual reset gol dan poin, kebijakan tie-break, serta perilaku antrean tersisa.

### 8.1 Siklus pertandingan

`WAITING → COUNTDOWN → LIVE → CLOSING → RESULT → INTERMISSION → (AUTO-RESTART / WAITING)`

- Reset tidak boleh terjadi sebelum snapshot hasil/riwayat ronde aman tersimpan.
- Server mengirim event state transition ke overlay agar timer/efek sesuai.
- **Tie-break belum dikunci oleh pengguna.** Default usulan: tampilkan hasil seri jika metrik ranking sama, atau admin pilih tie-break sekunder. Jangan menetapkan juara sepihak tanpa aturan yang terlihat.

---

## 9. Skor dan leaderboard — keputusan #8

### 9.1 Tiga metrik independen

Setiap klub dan pendukung mempunyai data yang dipisahkan:

1. **Jumlah gol** (`goals`): hanya penalti resmi yang berhasil masuk.
2. **Poin skill** (`skill_points`): poin berbobot **hanya ketika tendangan berhasil gol**, menurut mapping bobot skill yang aktif.
3. **Poin kontribusi gift** (`gift_points`): jumlah poin kontribusi dari gift valid sesuai konfigurasi, **terlepas dari berhasil/gagal gol**; tidak diberikan pada gift tanpa klub menurut K-09.

Admin dapat memilih **satu** metrik untuk leaderboard kompetisi/pemenang ronde: `GOALS`, `SKILL_POINTS`, atau `GIFT_POINTS`. Metrik lainnya tetap ditampilkan sebagai statistik terpisah.

### 9.2 Contoh bobot skill (semua editable)

| Jenis | Skill points ketika gol |
|---|---:|
| Normal | 1 |
| Skill 1 | 2 |
| Skill 2 | 3 |
| Skill 3 | 5 |
| Ultimate | 10 |

- `goals` selalu bertambah **1** untuk setiap penalti resmi yang gol, termasuk Ultimate.
- `skill_points` bertambah sesuai bobot yang berlaku pada tendangan gol.
- `gift_points` mengikuti tabel kontribusi event/gift terpisah yang dikelola admin.
- Penalti demo **tidak** mengubah metrik apa pun.
- Mode `TARGET_GOALS` tetap memakai **jumlah gol** sebagai pemicu penghentian ronde; peringkat pemenang bisa memakai metrik ranking admin. UI harus menjelaskan perbedaan ini jika digabungkan.

### 9.3 Leaderboard

**Leaderboard klub:** rank, kode/logo/nama, gol, poin skill, poin gift, indikator tren/penendang aktif.  
**Leaderboard pendukung:** nama akun yang diizinkan tampil, klub saat ini, total tendangan, total gol, poin skill, kontribusi gift.

Pembaruan berasal dari state authoritative Durable Object. Tampilkan mode peringkat aktif di papan agar penonton memahami kriteria juara.

---

## 10. Pengelolaan klub melalui admin

### 10.1 Data klub

- `id` unik/stabil, `code` unik (untuk komentar), `display_name`, `status` aktif.
- Warna primer/sekunder, jersey, nomor punggung, logo/crest asset, GLB character asset.
- Posisi tampilan, label/teks supporter, animasi idle default.
- Tambah, ubah, nonaktifkan, hapus (soft delete untuk klub yang pernah ikut pertandingan).

### 10.2 Aturan komentar

- Normalisasi huruf besar/kecil dan spasi.
- Hanya `club.code` aktif yang sah; dapat menambahkan alias, diperiksa agar tidak ambigu.
- Penonton memiliki satu klub aktif per room; dapat pindah sesuai `club_switch_cooldown` admin.
- Perubahan kode klub diterapkan pada event berikutnya dan tidak memindahkan aksi yang terlanjur antre.
- Penyimpanan data penonton diminimalkan; display name/foto profil opsional sesuai data sah dari konektor.

---

## 11. Overlay dan pengalaman siaran

### 11.1 Tata letak portrait 9:16

**Bagian atas:** status LIVE/connector, timer atau target, ranking klub, top supporters.  
**Bagian tengah:** arena 3D miniatur, **seluruh penendang klub berjejer horizontal di depan gawang**, titik penalti, kiper, penendang aktif yang maju sementara, bola, efek skill. Kamera kembali ke framing barisan setelah efek sinematik.  
**Bagian bawah:** panduan komentar memilih klub, gift legend, indikator jenis skill, sisa antrean.

Overlay menghormati *safe area* kontrol TikTok (komentar, gift tray, tombol LIVE) sehingga teks penting tidak tertutup. OBS/TikTok LIVE Studio memakai URL publik read-only.

### 11.2 Efek dan suara

- Animasi GOAL, SAVE, MISS; kamera dan selebrasi berbeda untuk normal dan tiap skill.
- Suara kick, peluit, stadion, sorakan, penyelamatan, impact, kombo efek.
- Peringatan `Pilih klub dulu!`, konektor disconnected, antrean penuh, pergantian ronde.
- Pengaturan volume dan mute; hindari audio otomatis yang tidak diizinkan browser.
- Ejaan/nama pendukung yang panjang dipotong secara aman agar tidak merusak tampilan.

### 11.3 Mode kualitas

- Low: efek hemat, shadow sederhana, material ringan.
- Medium (default): efek lengkap yang dioptimasi.
- High: pencahayaan/partikel tambahan untuk PC memadai.

Target awal uji performa: desktop 60 FPS, ponsel 30 FPS pada perangkat uji yang ditetapkan; bukan jaminan seluruh perangkat. Pengukuran latency dihitung **sejak event diterima backend game**, terpisah dari keterlambatan sumber TikTok/konektor.

---

## 12. Admin panel dan konfigurasi

| Halaman | Fungsi inti |
|---|---|
| `/admin` | Status konektor, status room, jumlah event, antrean, error, ringkasan ronde. |
| `/admin/integration` | Endpoint, token/secret, tes koneksi, format event, reconnect, diagnostics. |
| `/admin/clubs` | CRUD klub, warna/jersey, logo, karakter GLB, kode komentar. |
| `/admin/gifts` | Gift ID/coin value, mapping normal dan skill, prioritas, simulasi event. |
| `/admin/skills` | Nama, efek, aset animasi, peluang gol 0–100%, bobot poin, durasi. |
| `/admin/goalkeeper` | Animasi, visual, preset keeper dan parameter gameplay non-skew. |
| `/admin/match` | Mode ronde, waktu/target, start/pause/resume/stop/reset/auto-restart. |
| `/admin/queue` | Antrean pintar, aging, batas, kebijakan closing. |
| `/admin/leaderboard` | Mode peringkat dan tampilan metrik. |
| `/admin/visual` | Kualitas, camera preset, safe area, UI layout, SFX. |
| `/admin/history` | Ringkasan ronde, juara, statistik tiga metrik, ekspor terbatas. |

### 12.1 Fitur pengujian admin

- Tombol simulasi: Normal, Skill 1–3, Ultimate; gol dan gagal.
- Simulasi komentar pilih/pindah klub, penonton tanpa klub, gift combo/retry, reconnect.
- **Mode simulasi terisolasi:** tidak mencemari skor/riwayat resmi kecuali admin memilih mode test-room.
- Audit perubahan konfigurasi penting (siapa, kapan, sebelum/sesudah secara ringkas).

### 12.2 Kontrol akses

- Admin dilindungi Cloudflare Access atau autentikasi server-side setara.
- Public overlay hanya mengakses state read-only; tidak bisa memicu gift resmi, reset, mengubah konfigurasi, atau mengubah skor.

---

## 13. Integrasi `live-tiktok-konektor`

### 13.1 Prinsip

Game **menjadi konsumen event**, tidak melakukan login/subscribe TikTok langsung jika konektor yang sudah ada dapat menyediakan event. Hindari menjalankan konektor kedua untuk room yang sama.

**Sebelum development adaptor**, verifikasi:

- URL webhook atau dukungan WebSocket dari `live-tiktok-konektor`.
- Format payload `comment`, `gift`, `like`, `connected`, `disconnected`.
- Field user ID stabil, username, Gift ID, koin/diamond value, `repeat_count`, combo/streak status, event ID, event timestamp.
- Mekanisme secret/signature, retry, ordering, rate-limit, dan keadaan jika konektor terputus.
- Apakah konektor mengirim event gift tiap unit, per update combo, atau saat combo selesai.

**Jangan mengarang API/route spesifik konektor.** Adapter dirancang fleksibel, endpoint aktual disesuaikan setelah audit kontrak sistem yang ada.

### 13.2 Format event INTERNAL yang diusulkan

```json
{
  "version": 1,
  "roomId": "primary",
  "source": "live-tiktok-konektor",
  "eventId": "connector-unique-event-id",
  "type": "gift",
  "occurredAt": "2026-10-17T15:00:00.000Z",
  "user": { "id": "viewer-id", "displayName": "Viewer" },
  "gift": {
    "id": "specific-gift-id",
    "coinValue": 5,
    "unitCount": 1,
    "streakFinal": true
  }
}
```

Ini **kontrak internal usulan**, bukan klaim payload asli `live-tiktok-konektor`. Adapter menyimpan metadata minimum, melakukan validasi schema, idempotency, dan menormalisasi event sebelum masuk room engine.

### 13.3 Delivery semantics

- Webhook menerima auth/token/HMAC bila tersedia; terapkan replay protection dan rate limiting.
- Terapkan idempotency berbasis `roomId + eventId` atau kunci unit gift yang disepakati.
- Sistem memproses payload event minimal sebagai *at-least-once delivery* dan menjamin **exactly-once logical application** melalui dedup durable.
- Jika identitas event stabil tidak ada, kebutuhan tersebut menjadi **blocker produksi** hingga ada strategi dedup yang dapat diuji.
- Saat reconnect, gunakan status `DISCONNECTED/RECONNECTING/CONNECTED`; jangan menciptakan event atau poin palsu.
- Dashboard menampilkan `last_event_at`, delay, event ditolak, event ganda, jumlah aksi menunggu.

---

## 14. Arsitektur Cloudflare: KV + Durable Objects + R2 (tanpa D1)

```text
TikTok LIVE
    |
    v
[web milik pengguna: live-tiktok-konektor]
    |
    | webhook / event bridge terautentikasi
    v
[Cloudflare Worker: API + adapter + validation]
    |
    +------> [Cloudflare KV]
    |        konfigurasi admin, klub, gift/skill mapping,
    |        pengaturan visual, ringkasan riwayat sederhana
    |
    +------> [Durable Object per LIVE room]
    |        authoritative live match state
    |        persistent queue + dedup + score + leaderboard
    |        WebSocket fanout dan replay snapshot
    |
    +------> [Cloudflare R2]
             GLB, texture, logo, audio, aset stadion

Browser Overlay 3D <---- WebSocket/snapshot ---- Durable Object
Admin Panel      <---- API terproteksi ---- Worker
```

### 14.1 Tanggung jawab penyimpanan

**KV (konfigurasi/arsip sederhana):**

- `penalty:settings`
- `penalty:clubs`
- `penalty:gift-mapping`
- `penalty:skill-settings`
- `penalty:goalkeeper`
- `penalty:visual-settings`
- `penalty:match:history:{matchId}`

KV bukan sumber kebenaran untuk transaksi skor/gift real-time karena eventual consistency dan keterbatasan write per key.

**Durable Objects (otoritatif, persisten):**

- Room state, antrean, dedup event, player→club assignment, timer, gameplay outcomes, pending animations.
- Snapshot dan log event penting dalam **penyimpanan persisten Durable Objects**. Jangan hanya bergantung pada variabel memori.
- Atomic update sesuai semantik platform, serialisasi per room, broadcast WebSocket.
- Peralihan ronde, recovery setelah hibernasi, dan pemrosesan gift harus tahan restart.

**R2:** GLB/GLTF, tekstur, logo, stadium, audio, aset skill; jangan menyimpan asset besar di KV.

### 14.2 Penghematan kuota

- Jangan tulis setiap like/gift/tendangan ke KV.
- Agregasikan hasil, tulis ringkasan ke KV **setelah** ronde selesai dan dipersist dengan aman.
- Hindari polling database per frame; frontend render lokal dan menerima delta/snapshot via WebSocket.
- Cache aset dengan header yang tepat; versioning untuk perubahan GLB/texture.
- Batasi frekuensi broadcast state yang tidak penting, tanpa mengorbankan kebenaran skor.
- Tinjau kuota/biaya Workers, KV, Durable Objects, dan R2 menurut plan aktual sebelum live produksi.
- Untuk riwayat yang terlalu besar atau butuh query lintas ronde yang kompleks, evolusi storage dapat dievaluasi; **D1 tidak diperlukan untuk MVP yang disepakati**.

### 14.3 Konsistensi konfigurasi

Karena KV eventual consistency, perubahan admin yang perlu berlaku segera dapat dikirim oleh Worker langsung ke Durable Object room untuk update cache konfigurasi dan pencatatan versi. KV tetap menyimpan konfigurasi durable sebagai sumber penyimpanan admin; UI harus menampilkan status propagasi. Hindari menyatakan perubahan KV langsung konsisten global.

---

## 15. Rancangan model data minimum

### 15.1 Club

```ts
type Club = {
  id: string;
  code: string;        // unique, e.g. RMA
  displayName: string;
  enabled: boolean;
  primaryColor: string;
  secondaryColor?: string;
  logoAssetKey?: string;
  characterAssetKey?: string;
  sortOrder: number;
};
```

### 15.2 Skill

```ts
type Skill = {
  id: 'NORMAL' | 'SKILL_1' | 'SKILL_2' | 'SKILL_3' | 'ULTIMATE';
  label: string;
  goalChancePercent: number; // 0..100
  pointsOnGoal: number;
  animationKey: string;
  durationMs: number;
  priorityTier: number;
  enabled: boolean;
};
```

### 15.3 Gift mapping

```ts
type GiftMapping = {
  id: string;
  giftId?: string;            // exact identity preferred
  coinValueFallback?: number; // 1, 5, 10, 30 for defaults
  skillId: Skill['id'];
  contributionPoints: number;
  enabled: boolean;
  matchPriority: number;
};
```

### 15.4 Match / Kick / Score

```ts
type MatchMode = 'TIME' | 'TARGET_GOALS' | 'ENDLESS';
type RankingMode = 'GOALS' | 'SKILL_POINTS' | 'GIFT_POINTS';
type MatchStatus =
  'WAITING' | 'COUNTDOWN' | 'LIVE' | 'CLOSING' | 'RESULT' | 'INTERMISSION';

type ClubScore = {
  clubId: string;
  goals: number;
  skillPoints: number;
  giftPoints: number;
};

type Kick = {
  id: string;
  eventId: string;
  matchId: string;
  clubId: string;
  supporterId: string;
  skillId: Skill['id'];
  queuedAt: number;
  state: 'QUEUED' | 'ACTIVE' | 'DONE' | 'FAILED';
  outcome?: 'GOAL' | 'SAVE' | 'MISS';
  goalChanceSnapshot: number;
  skillPointsSnapshot: number;
  contributionPointsSnapshot: number;
};
```

Model di atas merupakan target awal, dapat diperluas dengan versi schema, audit, idempotency unit gift, serta waktu start/end ketika implementasi.

---

## 16. Keamanan dan privasi

- Admin auth dengan Cloudflare Access/server auth; tidak menyimpan secret di frontend.
- Webhook private menggunakan signature/token, timestamp check dan replay prevention.
- Semua command score, gol, perubahan klub, reset dan simulasi resmi divalidasi oleh backend.
- Overlay publik **read-only**; game tidak mempercayai skor yang dikirim browser.
- Sanitasi komentar dan nama akun untuk mencegah XSS/layout injection.
- Data penonton disimpan seminimal mungkin; retention, penghapusan riwayat dan anonimisasi dapat diatur.
- Audit konfigurasi penting; versioning schema, backup/restore konfigurasi sebelum deploy besar.
- Tidak melakukan klaim bahwa game dapat mengembalikan gift atau uang penonton.
- Hak merek/logo/jersey klub dan efek/audio harus aman secara lisensi.

---

## 17. Skenario gagal dan pemulihan

| Situasi | Perilaku wajib |
|---|---|
| Webhook event duplikat | Tidak menghasilkan aksi/score dua kali. |
| Gift combo berulang | Hanya unit valid yang diakui konektor yang dihitung, tanpa duplikat. |
| Belum pilih klub | Jangan antre, tampilkan “Pilih klub dulu!”. |
| Gift tidak dikenali | Tanda `unmapped`, log untuk admin. |
| Konektor disconnect | Game menunjukkan status, antrean lokal yang sah tetap aman; tidak membuat gift fiktif. |
| Browser overlay reload | Meminta snapshot room, merekonstruksi skor/antrean/render. |
| Durable Object hibernasi/restart | State, dedup, dan antrean dipulihkan dari storage persisten. |
| KV sementara stale | Room memakai konfigurasi terversi dan notifikasi perubahan dari admin API. |
| Antrean terlalu panjang | Backpressure, tampilkan jumlah antrean dan kebijakan overflow yang terlihat; jangan buang event diam-diam. |
| Animasi crash/timeout | Kick tetap punya status authoritative, timeout recovery aman dan tidak double-goal. |
| Ronde berakhir saat antrean tersisa | Patuhi kebijakan closing yang dipilih admin; tidak menghapus aksi valid diam-diam. |

---

## 18. Halaman dan rute usulan

| URL | Fungsi | Akses |
|---|---|---|
| `/` | Landing/preview game | Publik |
| `/live` | Overlay siaran fullscreen, portrait atau landscape | Publik read-only |
| `/admin` | Dashboard LIVE & room | Admin |
| `/admin/integration` | Integrasi konektor | Admin |
| `/admin/clubs` | Pengelolaan klub | Admin |
| `/admin/gifts` | Gift mapping | Admin |
| `/admin/skills` | Animasi, peluang, poin | Admin |
| `/admin/match` | Ronde, timer, control | Admin |
| `/admin/queue` | Smart queue | Admin |
| `/admin/leaderboard` | Mode peringkat | Admin |
| `/admin/goalkeeper` | Setelan kiper | Admin |
| `/admin/visual` | Kamera, efek, audio | Admin |
| `/admin/history` | Riwayat & ringkasan | Admin |

Rute dan kontrak API final disesuaikan dengan struktur repo yang akan dipakai; ini bukan klaim route `live-tiktok-konektor` saat ini.

---

## 19. Rencana implementasi

### Fase 0 — Audit integrasi dan kesiapan

- Pastikan repository/deploy `live-tiktok-konektor` dan format event nyata.
- Tetapkan cara autentikasi event, gift streak, dedup, health/reconnect.
- Uji kecocokan event ID, coin value, Gift ID, user ID.
- Audit hak penggunaan klub/logo serta rencana aset 3D.
- Pastikan plan Cloudflare mendukung Durable Objects sesuai kebutuhan.

**Deliverable:** kontrak event teruji dan daftar dependencies siap implementasi.

### Fase 1 — Playable offline MVP

- Arena 3D, 5 pemain **berjejer horizontal menghadap satu gawang**, kiper, bola, titik penalti, kamera.
- Normal + Skill 1/2/3/Ultimate lengkap dengan animasi.
- Simulasi antrean, outcome GOAL/SAVE/MISS, skor tiga metrik.
- Mode portrait dan quality presets.

**Deliverable:** game sepenuhnya dapat diuji memakai event simulasi tanpa TikTok.

### Fase 2 — Live event & authoritative match

- Worker adapter, Durable Object room, persistent queue, dedup.
- Komentar pilih klub, gift triggers, penolakan penonton tanpa klub.
- WebSocket dan reconnect/recovery overlay.

**Deliverable:** LIVE men-trigger tendangan yang tervalidasi dan konsisten.

### Fase 3 — Admin dan konfigurasi

- CRUD klub, mapping gift, skill probability/points.
- Ronde, smart queue, idle/demo, leaderboard modes, visual, history.
- KV config, R2 assets, admin auth, audit config.

**Deliverable:** game dapat dikonfigurasi tanpa kode.

### Fase 4 — Hardening produksi

- Load/stress test, burst gift, streak dan retry, reconnect, failover.
- Test end-of-round, fairness queue, snapshot setelah crash.
- Optimasi CPU/GPU dan asset; pengujian TikTok LIVE Studio/OBS.
- Runbook deploy/rollback, monitoring kuota/biaya, privasi dan keamanan.

**Deliverable:** release candidate siap pengujian LIVE publik.

---

## 20. Acceptance criteria

### Game dan animasi

- [ ] Arena menampilkan lima penendang klub default **berjejer horizontal di depan satu gawang** menghadap kiper; semua terlihat serentak, jumlah klub dapat diubah admin.
- [ ] Saat gift memicu penalti, penendang dari klub terkait maju dari slot barisannya ke titik penalti, menendang, bereaksi, lalu kembali ke slot yang sama tanpa teleportasi.
- [ ] Pemain lain tetap terlihat dan idle selama penalti; kamera utama memperlihatkan barisan, titik penalti, gawang dan kiper pada portrait 9:16, lalu pulih setelah zoom skill.
- [ ] Tidak ada gameplay sepak bola penuh; semua aksi inti berupa penalti.
- [ ] Normal dan keempat skill mempunyai animasi gerak tendangan 3D berbeda.
- [ ] Skill dapat menampilkan outcome gol maupun gagal sesuai peluang admin 0–100%.
- [ ] Kiper memiliki reaksi GOAL/SAVE/MISS yang konsisten dengan outcome server.
- [ ] Overlay portrait 9:16 aman untuk elemen TikTok; landscape juga bisa digunakan.

### TikTok LIVE dan gift

- [ ] Event diterima dari `live-tiktok-konektor` dengan verifikasi nyata (bukan mock semata).
- [ ] Komentar valid memilih klub aktif; pergantian klub sesuai aturan cooldown.
- [ ] Gift sebelum memilih klub tidak memicu tendangan dan menampilkan pesan.
- [ ] Gift khusus admin memicu Normal; gift dengan nilai 1/5/10/30 koin memicu skill sesuai mapping.
- [ ] Idempotency mencegah aksi ganda ketika connector retry/stream combo.
- [ ] Smart queue mengutamakan skill secara terbatas tanpa mengorbankan aksi lama.
- [ ] Gift valid yang menunggu tetap pulih setelah reconnect/restart.

### Ronde, skor, admin

- [ ] Ronde TIME/TARGET_GOALS/ENDLESS berfungsi; countdown, reset, result, auto restart dapat diatur.
- [ ] Tidak ada gift → idle + demo penalti; demo tidak menambah gol/poin.
- [ ] Leaderboard ranking dapat berganti berdasarkan gol, poin skill, atau kontribusi gift.
- [ ] Tiga metrik terpisah dan konsisten pada club serta supporter.
- [ ] Admin dapat edit klub, gift, peluang, bobot skill, ronde, queue, visual.
- [ ] Admin test event tidak mengotori pertandingan resmi.
- [ ] Konfigurasi memakai KV, live state memakai Durable Objects, aset memakai R2; **tidak ada D1**.
- [ ] Semua kontrol admin diproteksi dan overlay publik tidak bisa mengubah skor.

### Reliability dan operational

- [ ] Recovery overlay/DO tidak menciptakan dobel skor/gift.
- [ ] Pengujian burst events serta long queue memenuhi ambang kapasitas yang disepakati.
- [ ] Health connector, error, queue depth, match age dan kuota dapat dipantau.
- [ ] Hasil resmi dipersist aman sebelum reset/auto-restart.

---

## 21. Risiko, pertanyaan terbuka, dan asumsi penting

Hal-hal di bawah **belum dikunci** dan tidak boleh disamakan dengan keputusan pengguna:

| ID | Topik | Usulan default / tindakan |
|---|---|---|
| O-01 | Gift khusus Normal | Admin memilih **Gift ID** konkret saat konfigurasi; nama gift belum ditentukan. |
| O-02 | Pemicu koin | Nilai 1/5/10/30 adalah default; lakukan audit `coinValue` dan kombinasi Gift ID untuk mencegah ambiguitas. |
| O-03 | Prioritas queue | Gunakan priority aging dan batas overtaking; angka akhir ditetapkan pada implementasi. |
| O-04 | Antrean saat ronde selesai | Usulan habiskan antrean yang sudah masuk ronde tersebut sebelum final, tetapi admin perlu mengunci kebijakan. |
| O-05 | Tie-break pemenang | Usulan seri atau secondary tiebreak dari admin; belum diputuskan. |
| O-06 | Maksimum klub aktif | Awal lima; batas performa/susunan layout ditentukan lewat uji. |
| O-07 | Gift burst/overflow | Perlu batas antrean, SLA proses dan prosedur backlog yang transparan. |
| O-08 | Data penonton & histori | Retensi dan peraturan privasi perlu ditetapkan sebelum publik. |
| O-09 | Aset klub resmi | Periksa izin merek/logo/seragam; fallback gunakan identitas orisinal. |
| O-10 | Persentase gol awal | 40/55/70/85/100 hanyalah contoh editable, bukan keputusan final. |
| O-11 | Nilai poin gift | Admin harus menentukan bobot poin kontribusi setiap gift. |
| O-12 | Ukuran efektivitas performa | Target FPS dan durasi animasi adalah target uji, bukan kepastian untuk setiap perangkat. |

---

## 22. Definition of Done

Satu fitur dianggap selesai bila implementasi, pengujian unit/integrasi, validasi UI portrait/landscape, error-state dan log yang relevan, serta dokumentasinya sudah lengkap. Produksi baru layak dinyatakan siap setelah event konektor asli diverifikasi, skenario gift burst/retry terbukti tidak menggandakan skor, recovery Durable Objects lolos tes, dan gameplay dapat dipantau operator.

**Kesimpulan:** PRD ini menggabungkan seluruh keputusan pengguna sampai **pertanyaan #8 (opsi D)**. Arsitektur final MVP yang dipilih ialah **Cloudflare Workers + KV + Durable Objects + R2**, menggunakan web **`live-tiktok-konektor`** sebagai pemasok event, tanpa D1. Aturan yang belum diputuskan ditandai eksplisit pada Bagian 21 agar implementasi tidak diam-diam mengasumsikannya.


---

## Lampiran revisi v1.1 — Tata letak wajib

**Perubahan dari v1.0:** Detail formasi barisan seluruh penendang di depan gawang, maju ke titik penalti saat giliran, kembali ke slot semula, pemain lain tetap terlihat, komposisi kamera portrait, dan acceptance criteria layout kini **wajib**, bukan sekadar arahan konsep. Semua keputusan gameplay, skill, integrasi konektor, dan penyimpanan tetap sama.

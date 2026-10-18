# Arsitektur dan kebijakan implementasi

## Batas kepercayaan

`/` menjalankan engine simulasi di browser, dengan label SIMULASI LOKAL. Tidak ada endpoint public untuk mengirim gift, memaksa outcome, atau menulis skor. `/live` membaca snapshot dan menerima WebSocket; pesan selain heartbeat menutup socket. `/api/admin/*` memeriksa sesi server, origin untuk mutasi, dan validasi schema. Webhook menggunakan HMAC yang kompatibel dengan kode konektor yang diaudit.

Satu room authoritative bernama `primary` mengonsumsi event dari konektor yang memiliki signing secret khusus. Filter `sourceRoomId` bersifat opsional: kosong berarti menerima room apa pun dari konektor terautentikasi; jika diisi, payload dengan room lain atau room null ditolak. HMAC tetap wajib pada kedua mode. Jangan berbagi signing secret dengan sumber lain yang tidak ingin digabungkan ke pertandingan yang sama. Ini bukan layanan multi-tenant atau multi-room publik.

## Transaksi dan recovery

Tabel SQLite internal Durable Object:

| Tabel      | Isi                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------ |
| `state`    | Snapshot terversi: konfigurasi, viewers, antrean, aksi aktif, skor, ronde, ringkasan audit |
| `receipts` | ID event unik + hasil pemrosesan, untuk dedup durable                                      |
| `kicks`    | Outcome, peluang/poin/durasi snapshot, waktu, urutan, status ACTIVE/DONE                   |
| `outbox`   | Konfigurasi atau hasil ronde yang belum tersalin ke KV                                     |
| `limits`   | Counter rate-limit per jendela waktu                                                       |

`transactionSync` meliputi dedup dan seluruh perubahan bisnis yang terkait. State dibaca dari SQLite pada setiap mutasi; tidak bergantung pada cache memori. Setelah transaksi committed, alarm dijadwalkan dan snapshot dibroadcast. Jika putus setelah commit sebelum ACK, retry mendapatkan receipt yang sudah ada. Alarm yang dijalankan ulang tidak menghitung tendangan selesai dua kali.

Outcome diputuskan saat aksi mulai, lalu disimpan sebelum broadcast. Browser menggunakan `startedAt`, `endsAt`, dan offset jam server untuk interpolasi, tanpa ACK skor dari browser. Event yang tiba saat animasi aktif hanya masuk antrean. GLB/aset visual tidak dapat menentukan hasil game.

Outbox memakai compare-and-delete dan satu flush per instance untuk melindungi konfigurasi baru saat operasi KV sedang berjalan. Gagal menulis KV tidak menghapus hasil authoritative; alarm mencoba ulang. Pengumuman/reset boleh berjalan setelah hasil aman di Durable Object, meskipun KV belum tersalin. Dashboard menampilkan jumlah outbox pending. DO harus dibackup/dioperasikan sebagai sumber kebenaran, bukan dipulihkan dari KV yang mungkin stale.

## Kebijakan produk yang digunakan

- Maksimum **8 klub** aktif/tersimpan dalam konfigurasi awal; semuanya dirender. Lima klub bawaan. Klub lama dinonaktifkan, tidak dihapus atau digunakan ulang ID-nya.
- Urutan baris mengikuti `sortOrder`. Perubahan struktur klub dan aturan ronde hanya di antara ronde; perubahan skill berlaku untuk enqueue berikutnya.
- Normal hanya melalui Gift ID eksplisit. Default koin 1/5/10/30 untuk empat skill; fallback dapat dimatikan. Matching: Normal dengan ID yang sama → ID spesifik → fallback koin → matchPriority tertinggi → ID mapping untuk determinisme.
- Satu unit final gift = satu aksi. Tidak ada akumulasi gift kecil menjadi skill besar.
- Antrean default 500, maksimum konfigurasi 2000 aksi. FIFO sebagai dasar; candidate window maksimum `maxOvertakes+1`, prioritas tier + aging, penghentian overtaking setelah batas tercapai. `maxWaitMs` memaksa FIFO untuk aksi yang sudah lama, **bukan SLA** penyelesaian antrean.
- Overflow menerima **nol** unit dari event tersebut, mengembalikan 503 `retryable:true`, tanpa receipt dedup permanen. Retry dengan ID sama dapat diterima ketika kapasitas tersedia. Tidak ada antrean tak terbatas atau janji kompensasi otomatis.
- Ronde waktu/target/manual menutup penerimaan lalu menghabiskan seluruh antrean. Tidak ada opsi membuang antrean setelah aksi aktif. Hasil target-gol boleh melebihi target akibat drain.
- Pemenang berdasarkan metrik yang dikunci untuk ronde itu. Jika sama, semua yang seri ditampilkan; tidak ada tie-break tersembunyi.
- Pause menolak gift baru dan menahan antrean; animasi aktif selesai. Resume memperpanjang deadline sebesar durasi pause.
- `goals += 1` dan `skillPoints += weight` hanya untuk GOAL resmi. `giftPoints` dan `kicks` bertambah ketika aksi resmi selesai, termasuk SAVE/MISS. Demo tidak mengubah metrik.
- Supporter scoreboard adalah kontribusi dalam ronde aktif, dapat mencakup beberapa klub jika viewer pindah. Aksi lama tetap pada klub snapshot.
- Tidak ada refund atau penolakan transaksi TikTok; status penolakan hanya menyangkut aksi permainan.

## Batas data dan biaya

Payload webhook maksimal 256 KiB, JSON admin 64 KiB, login 2 KiB, aset 20 MiB. Maksimal 100 socket overlay dan 10.000 penonton dalam room. Webhook terautentikasi dibatasi 6000/menit, login 10/menit/IP. Sesuaikan kapasitas ini dengan plan dan uji beban produksi; angka tersebut bukan janji throughput.

Dedup 7 hari; event sumber lebih tua dari 24 jam atau lebih dari 5 menit di masa depan ditolak. Signature memiliki jendela replay 5 menit; retry konektor menandatangani timestamp delivery baru, body/ID tetap sama. Data viewer, audit, tendangan, dan hasil memakai retensi admin 1–30 hari (default 7). Viewer yang masih memiliki aksi pending tidak dipurge. Riwayat ringkas maksimal 50 ronde di snapshot, 100 audit, dan 100 tendangan pada tampilan admin.

MVP memakai satu JSON snapshot per room di SQLite. Ini mudah diaudit dan dipulihkan, tetapi biaya serialisasi tumbuh dengan jumlah penonton/antrean. Uji 500 aksi bukan pengganti benchmark seluruh room dengan 10.000 viewer. Untuk skala lebih besar, pecah viewers/queue menjadi tabel baris tanpa mengubah kontrak public.

## Aset dan animasi

Aset default dibuat dengan Three.js: diorama, gawang, net, turf, tulang/joint karakter, label dan crest inisial, efek pooled, dan audio sintetis. Tidak menggunakan logo atau model pemain profesional. GLB dari R2 dapat menggantikan model default; fallback tetap tersedia jika asset gagal dimuat. Gunakan aset mandiri dengan lisensi jelas dan orientasi +Z model menghadap kamera sebelum koreksi rotasi import. Animasi bawaan bersifat prosedural dan perlu review artistik; ini bukan klaim aset karakter fotorealistis final.

Low membatasi pixel ratio dan partikel serta mematikan shadow. Medium memakai shadow dan pixel ratio maksimal 1.5. High menambah partikel dan pixel ratio maksimal 2. Kamera skill menjaga semua slot tetap terlihat. Audio hanya dibuat setelah operator menekan tombol suara.

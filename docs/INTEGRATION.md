# Audit dan kontrak konektor

Audit read-only repository `harvey-moeid/tiktok-live-konektor`, commit **3660b385078318e2d10782ddf1e00dc8492d3b28**. Repository konektor tidak diubah dalam implementasi ini.

Sumber yang diperiksa: `server/events.js`, `server/gifts.js`, `server/tiktok.js`, `server/webhooks.js`, `server/webhook-delivery.js`, `python_fallback/events.py`, `docs/INTEGRASI_WEBSITE.md`.

## Transport aktual

Gunakan fitur **Integrasi Webhook** yang sudah ada, bukan membuat koneksi TikTok tambahan. URL receiver game: `https://<domain-game>/api/hooks/tiktok`. Pilih event `chat`, `gift`, `like`, `stream`.

Header `x-tlk-signature: sha256=<hex HMAC-SHA256>` ditandatangani atas `x-tlk-timestamp + "." + rawBody`. Timestamp berupa Unix detik. Receiver memverifikasi raw body, timestamp maksimal ±300 detik, signature, schema, filter room sumber jika diisi, dan ID. Metadata header event ID tidak dipercaya; ID dalam body yang sudah diverifikasi digunakan.

```json
{
  "id": "uuid-created-by-connector",
  "event": "gift",
  "timestamp": "2026-10-17T15:00:00.000Z",
  "roomId": "123456789",
  "username": "streamer",
  "version": 1,
  "data": {
    "username": "viewer_unique_handle",
    "nickname": "Viewer",
    "giftId": "5655",
    "giftName": "Metadata name from connector",
    "diamondCount": 1,
    "repeatCount": 3,
    "repeatEnd": true,
    "giftType": 1,
    "streakable": true,
    "totalValue": 3
  }
}
```

Gift ID di contoh bukan penetapan Normal Kick. Admin harus memilih Gift ID nyata yang diinginkan. `diamondCount` adalah koin **per unit**. `totalValue` tidak dipakai sebagai pemicu skill agar combo 3×1 tidak berubah menjadi skill bernilai 3.

Chat memakai `data.username`, `data.nickname`, dan `data.message`. Lifecycle aktual Node connector adalah `event: "stream"`, `data.state: "started" | "ended"`; bukan mengasumsikan event connected/disconnected tersedia. Adapter juga memahami connected/disconnected/reconnecting jika bridge lain secara eksplisit meneruskannya.

## Event like

Konektor Node, managed, dan Python memetakan like ke `event: "like"`, dengan `data.username`, `data.nickname` opsional, `data.likeCount` berupa delta event, serta `data.totalLikeCount` berupa total room. Receiver hanya memakai **likeCount** (integer 1–1.000.000), tidak menjumlahkan totalLikeCount. Ini mencegah total kumulatif room dihitung ulang sebagai like baru.

Contoh `data`: `{ "username": "viewer_unique_handle", "nickname": "Viewer", "likeCount": 25, "totalLikeCount": 50000 }`. Envelope, HMAC, batas waktu, filter room, rate limit, dan dedup sama dengan gift. Aktifkan fitur serta ambang pada `/admin/likes`, lalu pastikan penonton memilih klub sebelum memberi like, atau aktifkan **Gacha klub jika penonton belum memilih klub** pada `/admin/clubs`.

Sisa like disimpan per penonton di state SQLite Durable Object. Pencatatan sisa, enqueue, dan receipt event berlangsung dalam transaksi yang sama. Retry ID identik tidak menambah hitungan; payload baru dengan ID baru tetap bergantung pada jaminan ID upstream yang dijelaskan di bawah. Event sebelum pilih klub (ketika gacha nonaktif), di luar LIVE/ketika pause, saat fitur nonaktif atau NORMAL nonaktif tidak ditabung untuk masa depan. Antrean penuh mengembalikan 503 tanpa konsumsi parsial.

## Gacha tanpa komentar

`config.randomClubWithoutComment` bernilai `false` secara default, termasuk saat memuat konfigurasi lama. Jika aktif, gift final yang dipetakan serta like yang mencapai ambang dari penonton tanpa pilihan klub memicu undian klub aktif untuk **setiap tendangan**. Komentar kode klub tetap menjadi pilihan tetap sampai penonton menggantinya; hasil undian tidak menjadi pilihan tetap. Tendangan gacha tetap memakai peluang dan poin skill biasa, serta menyimpan `randomClub: true` dan klub hasil undian di antrean. Retry ID yang sama dan restart memulihkan hasil yang tersimpan tanpa undian ulang. Tidak perlu mengubah payload konektor.

Like yang belum mencapai ambang hanya menyimpan sisa per penonton. Komentar pertama setelah gacha atau perubahan mode gacha menghapus sisa like penonton gacha, tanpa mengubah tendangan yang sudah diterima. Kapasitas penonton, kapasitas antrean, status ronde, dan mapping/skill diperiksa sebelum menerima event atau mengundi.

## Combo dan idempotency

- Node connector mengirim setiap update combo. Untuk `streakable=true` atau `giftType=1`, receiver mengabaikan aksi sampai `repeatEnd=true`, lalu mengembangkan total `repeatCount` menjadi unit bernomor `eventId:0..n-1`.
- Python fallback sudah menyaring update non-final; receiver tetap memeriksa flag final.
- Payload duplicate dengan **event.id yang sama** memiliki tepat satu aplikasi logis, bahkan request bersamaan dan restart DO.
- Ditolak karena belum pilih klub/unmapped/ronde tertutup: receipt terminal disimpan. Memilih klub setelah gift ditolak tidak membuat retry gift lama menjadi aksi baru.
- Antrean penuh: 503, seluruh combo belum diterima, aman untuk retry ID yang sama.

## Temuan yang membatasi produksi

1. `createEvent()` membuat UUID baru pada setiap emisi. ID pesan TikTok asli, user numeric ID, dan streak/session ID upstream tidak diteruskan. Retry webhook mempertahankan ID; replay dari upstream yang memicu emisi baru **dapat menjadi gift baru**. Jangan mengklaim exactly-once end-to-end melampaui batas ini.
2. Identitas viewer saat ini `data.username`/unique handle. Konektor dapat fallback ke nickname pada sumber yang tidak lengkap. Receiver menolak placeholder `unknown`/`Penonton TikTok`, tetapi tidak dapat membuktikan stabilitas semua handle dari payload sekarang. Produksi membutuhkan ID user stabil dari sumber dan fixture aktual.
3. Retry webhook default 3, maksimum 5. Delivery queue memori, dapat melewati event ketika penuh dan tidak memiliki outbox durable. Receiver tidak dapat memulihkan event yang tidak pernah diterima. Perlu outbox durable pada konektor atau prosedur replay/rekonsiliasi yang disepakati.
4. Tidak ada heartbeat webhook khusus yang telah dibuktikan. Overlay menandai RECONNECTING setelah 90 detik tanpa event: ini berarti status sumber belum terverifikasi, bukan bukti koneksi TikTok putus. Event `stream: ended` menandai DISCONNECTED.
5. Tidak ada event LIVE sungguhan atau URL deploy konektor yang digunakan pada tes proyek ini. Tes HMAC memakai kontrak aktual yang dibaca dari kode; delivery TikTok tetap tahap acceptance lapangan.

## Langkah uji LIVE terkontrol

1. Samakan secret khusus di kedua backend dan isi mapping Gift ID terverifikasi. Filter Room ID boleh kosong; isi hanya untuk membatasi ID siaran tertentu.
2. Mulai ronde dan konektor. Periksa stream started dan `lastEventAt`.
3. Kirim komentar klub dari akun uji, lalu satu gift dan satu combo. Cocokkan ID receipt dan jumlah tendangan dengan payload aktual.
4. Kirim ulang body identik dengan timestamp signature baru: tidak menambah aksi.
5. Putus/sambungkan sumber; periksa apakah upstream mengulang final combo dengan ID baru. Jangan aktifkan penerimaan publik sebelum strategi ini selesai.
6. Pantau overflow/failed delivery dan simpan keputusan kompensasi gameplay sebelum memberi panduan gift pada penonton umum.

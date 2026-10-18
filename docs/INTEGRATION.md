# Audit dan kontrak konektor

Audit read-only repository `harvey-moeid/tiktok-live-konektor`, commit **3660b385078318e2d10782ddf1e00dc8492d3b28**. Repository konektor tidak diubah dalam implementasi ini.

Sumber yang diperiksa: `server/events.js`, `server/gifts.js`, `server/tiktok.js`, `server/webhooks.js`, `server/webhook-delivery.js`, `python_fallback/events.py`, `docs/INTEGRASI_WEBSITE.md`.

## Transport aktual

Gunakan fitur **Integrasi Webhook** yang sudah ada, bukan membuat koneksi TikTok tambahan. URL receiver game: `https://<domain-game>/api/hooks/tiktok`. Pilih event `chat`, `gift`, `stream`.

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

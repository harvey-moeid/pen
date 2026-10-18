# Acceptance PRD v1.1

Status ini memisahkan implementasi yang dapat diuji lokal dari acceptance pada layanan/perangkat produksi. Tidak mengklaim seluruh PRD sudah terbukti pada TikTok LIVE.

| Area                                                                | Implementasi / bukti                                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 5 klub dalam satu baris, gawang, titik penalti, kiper               | Arena prosedural Three.js; pengujian browser memeriksa semua label dan gerak pemain aktif                                  |
| Berjalan maju, tendangan, reaksi, kembali tanpa spawn karakter baru | Joint/bone animation prosedural, satu objek per klub; efek skill dipool                                                    |
| Normal + 4 skill, hasil gol/gagal                                   | Gerak badan, timing, lintasan, dan efek berbeda; simulator memaksa GOAL/SAVE/MISS tanpa API resmi                          |
| Portrait / landscape / safe area / kualitas                         | Layout responsif, 3 quality preset, safe area admin; screenshot otomatis                                                   |
| Komentar dan cooldown klub                                          | Validasi kode aktif, snapshot klub pada enqueue; unit tests                                                                |
| Like → Normal Kick                                                  | Ambang admin per penonton, sisa persisten, reset per klub/ronde/aturan, dedup dan backpressure; unit/runtime/browser tests |
| Gift khusus Normal, 1/5/10/30 fallback                              | Admin mapping dengan aturan prioritas; normal wajib Gift ID konkret; unit tests                                            |
| Combo/retry/dedup                                                   | Final-only + durable receipt; 30 retry paralel, restart runtime; upstream ID baru masih blocker                            |
| Antrean pintar tanpa starvation                                     | Aging + batas jumlah/candidate overtaking; stress 500 aksi dan full-combo backpressure                                     |
| TIME / TARGET_GOALS / ENDLESS                                       | Countdown, pause/resume, closing-drain, result, intermission, auto-restart; unit/integration tests                         |
| Tiga metrik terpisah                                                | Goals, skillPoints, giftPoints pada klub dan supporter; demo tidak mengubah angka                                          |
| Konfigurasi dan riwayat                                             | Versioned config + audit, DO authoritative, KV outbox, hasil aman sebelum reset                                            |
| Catatan outcome per tendangan                                       | SQLite internal DO menyimpan ACTIVE/DONE dan snapshot peluang/poin/durasi/config                                           |
| R2                                                                  | Upload admin dibatasi tipe/ukuran, URL immutable, loader GLB dan crest                                                     |
| Auth / public overlay                                               | Server session HttpOnly, CSRF origin, HMAC/replay check, read-only WebSocket, input limits                                 |
| Reconnect/recovery                                                  | Snapshot melalui WebSocket, exponential backoff, server alarm, tes runtime teardown/restart                                |
| Observability                                                       | Dashboard last event/delay, accepted/rejected/duplicate, queue/outbox, structured logs                                     |

Pengaturan teks overlay mencakup 24 bagian, warna, ukuran, visibilitas, reset, dan pratinjau admin. Unit/runtime/browser tests memeriksa default state lama, persistensi KV/restart, penggantian penanda, escaping HTML, pembaruan tanpa reload, tampilan mobile, dan pemulihan tanpa mengubah game.

## Batas acceptance yang belum boleh ditandai selesai

- **Delivery LIVE asli**: membutuhkan deploy, konektor aktif, payload aktual, akun uji, dan verifikasi bahwa upstream tidak memberi identitas baru pada gift yang sama. Kontrak source-code sudah diaudit; itu tidak menggantikan uji lapangan.
- **Exactly-once end-to-end**: terjamin pada batas receiver untuk `event.id` stabil. Tidak dijamin untuk replay upstream dengan UUID baru atau delivery yang hilang sebelum receiver. Perbaikan konektor adalah scope terpisah, didokumentasikan di INTEGRATION.md.
- **Aset karakter final**: default adalah model miniatur prosedural dengan artikulasi bone/joint, bukan model manusia realistis dengan rig/skin artistik final. GLB eksternal didukung; animasi/clip dan lisensi aset pilihan pengguna perlu review sebelum siaran final.
- **Audio final**: tersedia efek sintetis orisinal (whistle, kick, hasil) dan mute/volume. Belum merupakan library crowd/voice-over profesional.
- **Kiper**: visual reaksi mengikuti outcome server, belum mempunyai koleksi klip artistik terpisah untuk seluruh label state keeper di PRD.
- **Performa**: tes headless menggunakan software renderer. Belum ada pembuktian 60 FPS desktop / 30 FPS ponsel atau OBS/TikTok LIVE Studio pada GPU sasaran.
- **Overflow produksi**: receiver tidak membuang unit diam-diam dan mengembalikan 503, tetapi konektor memiliki retry terbatas serta queue memori. Kebijakan kompensasi dan backlog wajib disepakati sebelum produksi.
- **Audit per operator**: auth shared secret setara server-side untuk MVP; bukan multi-user RBAC. Tidak mengklaim identitas personal pada perubahan konfigurasi.
- **Fitur opsional lanjutan**: alias kode, tie-break sekunder, stop-after-active dengan carry-over queue, dan variasi idle artistik lengkap belum tersedia. Default aman adalah kode unik, seri, drain seluruh antrean, dan pemanasan prosedural.

## Cara mereproduksi bukti

`npm run check` menjalankan typecheck, lint, tes engine/adapter/runtime, dan build. `npm run test:browser` setelah build menjalankan studio, login/form admin, input berbahaya sebagai teks, webhook HMAC, sinkronisasi overlay, dan screenshot portrait/landscape dalam environment terisolasi. Laporan ada pada `artifacts/browser-report.json`; CI mengunggah folder tersebut sebagai artefak.

Dokumen ini sengaja tidak memberi angka "99,9% selesai" yang tidak dapat dibuktikan. Kesiapan produksi ditentukan oleh acceptance lapangan di atas.

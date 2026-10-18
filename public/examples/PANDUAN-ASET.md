# Contoh logo dan karakter custom Penalty Battle

Paket ini berisi aset contoh orisinal untuk dicoba pada satu klub. Tidak berisi logo resmi atau wajah pemain profesional.

## Berkas yang dipakai

| Berkas             | Unggah pada                | Isi                                                                         |
| ------------------ | -------------------------- | --------------------------------------------------------------------------- |
| `logo-pb.png`      | Logo klub berupa gambar    | PNG transparan 1254 × 1254 piksel, sekitar 1 MB                             |
| `character-pb.glb` | Model karakter 3D opsional | Miniatur pemain jersey lime, sekitar 182 KB, 4.276 segitiga, animasi `Idle` |
| `preview.png`      | Tidak perlu diunggah       | Tampak depan/belakang dari GLB contoh dan pratinjau logo                    |

Warna klub yang cocok dengan contoh: **jersey utama `#C5E883`**, **warna kedua `#152536`**. Warna model GLB berasal dari material di dalam GLB; mengubah warna klub pada admin tidak mewarnai ulang material model impor secara otomatis.

Logo PNG tampil pada crest/scoreboard. Logo tersebut tidak otomatis ditempel ke jersey model GLB. Nomor pada karakter contoh adalah **7**; warna, nomor, dan logo pada jersey custom perlu dibuat di dalam model sebelum diekspor.

## Cara mencoba

1. Ekstrak ZIP, lalu buka **Admin → Klub**. Lakukan perubahan saat ronde sudah selesai dan antrean/aksi aktif kosong, supaya aturan klub dapat disimpan.
2. Pilih satu klub. Pada **Logo klub berupa gambar**, unggah `logo-pb.png`.
3. Bila ingin mengganti pemain, pada **Model karakter 3D opsional**, unggah `character-pb.glb`. Logo dan model adalah dua berkas berbeda.
4. Klik **Simpan perubahan**. Buka `/live` untuk memeriksa hasil, termasuk layout portrait dan landscape. Periksa visual sebelum memulai ronde LIVE.
5. Untuk kembali, gunakan **Gunakan logo bawaan** atau **Gunakan model bawaan**, lalu simpan. Tombol ini mengganti referensi pada klub, tidak menghapus objek dari R2.

## Agar logo buatan sendiri terlihat jelas

- Gunakan PNG atau WebP transparan, bentuk persegi. Ukuran kerja **512 × 512 hingga 2048 × 2048 piksel** cukup; contoh ini 1254 × 1254. JPG juga diterima, tetapi tidak mendukung transparansi.
- Buat simbol/monogram besar dengan garis tebal. Gunakan 2–3 warna kontras. Hindari slogan kecil, garis tipis, foto stadion, efek glow lebar, atau logo dengan banyak ruang kosong.
- Sisakan jarak tipis di tepi agar simbol tidak mentok. Game menempatkan gambar di dalam bingkai crest; jangan meletakkan detail penting di sudut paling luar.
- Logo pada scoreboard kecil dapat tampil sekitar **22 × 25 piksel**, sehingga periksa juga versi kecil, bukan hanya file resolusi besar.
- Batas unggah saat ini **20 MB per berkas**. Untuk logo, usahakan di bawah 1–2 MB agar cepat dimuat. Logo contoh sekitar 1 MB.

## Spesifikasi karakter custom untuk pembuat model

- Format **GLB biner glTF 2.0**. Semua mesh, material, tekstur, dan animasi harus ikut di dalam satu GLB. Hindari referensi ke file gambar/`.bin` di komputer lokal.
- Sumbu atas **+Y**, wajah menghadap **+Z**, kaki berada di lantai **Y = 0**, badan berpusat di sekitar **X = 0, Z = 0**. Game memutar model 180° agar menghadap gawang.
- Game menyamakan tinggi model menjadi 2 unit, lalu menerapkan skala pemain arena. Hindari objek tersembunyi besar atau benda jauh dari badan yang membuat bounding box terlalu lebar/tinggi.
- Pakai **MeshStandard/PBR sederhana**, roughness sekitar 0,7–1, dan sedikit transparansi. Pastikan material tidak hanya bergantung pada cahaya emissive.
- Untuk mulai, targetkan sekitar **5.000–20.000 segitiga**, sedikit material, dan tekstur 512–1024 piksel. Ini rekomendasi awal; cek performa di perangkat OBS/LIVE Studio sendiri.
- Ekspor GLB standar **tanpa Draco, Meshopt, atau tekstur KTX2**. Loader game saat ini belum dipasangi decoder untuk format kompresi tersebut.
- Batas unggah **20 MB**; target praktis 1–5 MB atau lebih kecil. Contoh ini 182 KB dan tidak memakai tekstur eksternal.

## Animasi yang didukung saat ini

Loader memutar **clip animasi pertama** secara berulang. Karena itu, taruh **Idle** sebagai clip pertama. Contoh berisi satu `Idle` ringan: napas dan gerak lengan.

Posisi pemain di arena tetap mengikuti alur game. Model impor belum otomatis memilih clip `Walk`, `Kick`, atau `Celebrate` berdasarkan fase tendangan. Jika membutuhkan gerak kaki/tendangan artistik dari model custom, pemetaan clip tersebut perlu ditambahkan ke loader. Gunakan model bawaan bila memerlukan gerak tendangan prosedural yang sudah ada.

## Jika hasilnya kurang pas

| Gejala                               | Yang diperiksa                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Logo tampak kecil atau buram         | Pangkas ruang kosong berlebih, perbesar simbol, hindari detail tipis                     |
| Logo memiliki kotak putih            | Pakai PNG/WebP dengan alpha transparan, bukan JPG                                        |
| Pemain membelakangi gawang           | Ubah arah wajah sumber menjadi +Z saat ekspor                                            |
| Pemain melayang                      | Pastikan kaki Y=0 dan tidak ada mesh jauh di bawah lantai                                |
| Pemain bergeser ke kiri/kanan        | Pusatkan karakter pada X=0, Z=0 sebelum ekspor                                           |
| Model terlalu kecil                  | Hapus mesh tersembunyi atau aksesori jauh yang memperbesar bounding box                  |
| GLB gagal dan karakter bawaan muncul | Periksa GLB mandiri, batas ukuran, referensi eksternal, dan kompresi yang belum didukung |
| Warna jersey tidak mengikuti admin   | Warna GLB diedit di material model, lalu ekspor ulang                                    |

Logo contoh dibuat dengan image generation. Karakter contoh dibangun dari geometri prosedural dan dapat dibuat ulang dengan `node scripts/create-example-model.mjs` pada repository proyek.

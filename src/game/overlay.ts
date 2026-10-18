import { z } from 'zod';

export const overlayTextKeys = [
  'title',
  'subtitle',
  'guide',
  'clubPrompt',
  'giftNotice',
  'likeNotice',
  'arenaTitle',
  'camera',
  'activeState',
  'idleState',
  'supporter',
  'demo',
  'kick',
  'resultHeading',
  'resultWinner',
  'resultNote',
  'scoreTitle',
  'scoreNote',
  'queue',
  'ranking',
  'arenaConnection',
  'connectorConnection',
  'roundStatus',
  'notice',
] as const;
export type OverlayTextKey = (typeof overlayTextKeys)[number];
export const overlayTextDefinitions: Record<
  OverlayTextKey,
  { label: string; text: string; color: string; help: string }
> = {
  title: {
    label: 'Judul overlay',
    text: 'PENALTY',
    color: '#e8edf2',
    help: 'Judul utama di bagian atas.',
  },
  subtitle: {
    label: 'Subjudul overlay',
    text: 'BATTLE 3D',
    color: '#94a2ae',
    help: 'Baris kedua di bawah judul.',
  },
  guide: {
    label: 'Petunjuk utama',
    text: 'KOMENTAR KODE KLUB → {actions} → TENDANG!',
    color: '#c5e883',
    help: '{actions}: LIKE / GIFT atau KIRIM GIFT, sesuai fitur aktif.',
  },
  clubPrompt: {
    label: 'Ajakan memilih klub',
    text: 'Pilih klub dulu!',
    color: '#c5e883',
    help: 'Ajakan di atas daftar kode klub.',
  },
  giftNotice: {
    label: 'Petunjuk gift',
    text: 'Gift sebelum memilih klub tidak memicu aksi atau skor.',
    color: '#8395a6',
    help: 'Petunjuk sebelum penonton mengirim gift.',
  },
  likeNotice: {
    label: 'Petunjuk like',
    text: 'Setiap {likes} like per penonton → 1 tendangan normal untuk klub pilihannya. Pilih klub sebelum memberi like!',
    color: '#8395a6',
    help: '{likes}: ambang like. Hanya tampil ketika fitur like aktif.',
  },
  arenaTitle: {
    label: 'Label arena',
    text: 'DIORAMA ARENA',
    color: '#abbec3',
    help: 'Tulisan di pojok atas arena 3D.',
  },
  camera: {
    label: 'Label kamera',
    text: 'CAM 01 / {quality}',
    color: '#abbec3',
    help: '{quality}: LOW, MEDIUM, atau HIGH.',
  },
  activeState: {
    label: 'Status saat menendang',
    text: 'PENALTI BERLANGSUNG',
    color: '#abbec3',
    help: 'Status di bawah arena ketika tendangan aktif.',
  },
  idleState: {
    label: 'Status saat menunggu',
    text: 'MENUNGGU GILIRAN',
    color: '#abbec3',
    help: 'Status di bawah arena ketika tidak ada tendangan.',
  },
  supporter: {
    label: 'Nama pendukung saat tendangan',
    text: '{source}{supporter}',
    color: '#c6d0d9',
    help: '{supporter}: nama pendukung. {source}: awalan LIKE · untuk tendangan like.',
  },
  demo: {
    label: 'Label demo',
    text: 'DEMO · TANPA SKOR',
    color: '#c6d0d9',
    help: 'Label untuk tendangan simulasi tanpa skor.',
  },
  kick: {
    label: 'Nama skill / hasil tendangan',
    text: '{kick}',
    color: '#e8edf2',
    help: '{kick}: nama skill atau hasil GOAL, SAVE, MISS sesuai animasi.',
  },
  resultHeading: {
    label: 'Judul hasil ronde',
    text: 'RONDE SELESAI',
    color: '#c6d0d9',
    help: 'Ditampilkan ketika ronde selesai.',
  },
  resultWinner: {
    label: 'Pemenang ronde',
    text: '{winner}',
    color: '#e8edf2',
    help: '{winner}: nama klub pemenang atau HASIL SERI.',
  },
  resultNote: {
    label: 'Catatan hasil ronde',
    text: 'Antrean ronde telah diselesaikan',
    color: '#c6d0d9',
    help: 'Baris penjelas di bawah pemenang.',
  },
  scoreTitle: {
    label: 'Judul klasemen',
    text: 'Klasemen klub',
    color: '#e8edf2',
    help: 'Judul klasemen detail pada layout landscape.',
  },
  scoreNote: {
    label: 'Catatan klasemen',
    text: 'Satu gol. Satu langkah menuju puncak.',
    color: '#8395a6',
    help: 'Tulisan di bawah tabel klasemen.',
  },
  queue: {
    label: 'Jumlah antrean',
    text: '{queue} dalam antrean',
    color: '#78909e',
    help: '{queue}: jumlah tendangan yang sedang mengantre.',
  },
  ranking: {
    label: 'Label peringkat',
    text: 'PERINGKAT: {ranking}',
    color: '#78909e',
    help: '{ranking}: metrik peringkat ronde aktif.',
  },
  arenaConnection: {
    label: 'Status koneksi arena',
    text: '{arenaStatus}',
    color: '#9dbb84',
    help: '{arenaStatus}: status koneksi browser ke game.',
  },
  connectorConnection: {
    label: 'Status konektor',
    text: 'Konektor {connectorStatus}',
    color: '#8395a6',
    help: '{connectorStatus}: status konektor TikTok.',
  },
  roundStatus: {
    label: 'Status ronde di timer',
    text: '{roundStatus}',
    color: '#8395a6',
    help: '{roundStatus}: status LIVE, dijeda, atau fase ronde. Angka timer tetap mengikuti game.',
  },
  notice: {
    label: 'Pemberitahuan game',
    text: '{notice}',
    color: '#b8d2a1',
    help: '{notice}: pemberitahuan terbaru dari game.',
  },
};
export const OverlayTextSchema = z.object({
  text: z.string().max(240),
  visible: z.boolean(),
  sizePercent: z.number().int().min(50).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const OverlaySchema = z.object({
  text: z.record(z.enum(overlayTextKeys), OverlayTextSchema),
  showClubCodes: z.boolean(),
  showGiftLegend: z.boolean(),
  showConnections: z.boolean(),
  showDetailedScores: z.boolean(),
  showNotices: z.boolean(),
});
export type OverlaySettings = z.infer<typeof OverlaySchema>;
export function defaultOverlaySettings(): OverlaySettings {
  const text = Object.fromEntries(
    overlayTextKeys.map((key) => [
      key,
      {
        text: overlayTextDefinitions[key].text,
        color: overlayTextDefinitions[key].color,
        sizePercent: 100,
        visible: true,
      },
    ]),
  ) as OverlaySettings['text'];
  return {
    text,
    showClubCodes: true,
    showGiftLegend: true,
    showConnections: true,
    showDetailedScores: true,
    showNotices: true,
  };
}
export function formatOverlayText(text: string, variables: Record<string, string | number> = {}) {
  return text.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : match,
  );
}

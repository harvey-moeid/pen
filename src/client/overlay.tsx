import type { Snapshot } from '../game/engine';
import {
  formatOverlayText,
  overlayTextDefinitions,
  type OverlaySettings,
  type OverlayTextKey,
} from '../game/overlay';

const randomClubText: Partial<Record<OverlayTextKey, string>> = {
  guide: 'KOMENTAR KODE KLUB ATAU GACHA → {actions} → TENDANG!',
  clubPrompt: 'Pilih klub atau biarkan gacha!',
  giftNotice: 'Belum memilih klub? Setiap tendangan dari gift diundi dari klub aktif.',
  likeNotice:
    'Setiap {likes} like per penonton → 1 tendangan normal. Belum memilih klub? Klub diundi setiap tendangan!',
};

export function overlayVariables(snapshot: Snapshot, extras: Record<string, string | number> = {}) {
  const result = snapshot.result;
  return {
    actions: snapshot.likes.enabled ? 'LIKE / GIFT' : 'KIRIM GIFT',
    likes: snapshot.likes.likesPerKick,
    randomClub: snapshot.randomClubWithoutComment ? 1 : 0,
    queue: snapshot.queueDepth,
    ranking: snapshot.ranking,
    quality: snapshot.visual.quality.toUpperCase(),
    supporter: snapshot.active?.supporterName ?? '',
    source: `${snapshot.active?.randomClub ? 'GACHA · ' : ''}${snapshot.active?.source === 'LIKE' ? 'LIKE · ' : ''}`,
    kick: snapshot.active?.skill.label ?? '',
    winner: result
      ? result.winners.length > 1
        ? 'HASIL SERI'
        : (result.clubs.find((club) => club.id === result.winners[0])?.displayName ?? '')
      : '',
    connectorStatus: snapshot.connector.status.toLowerCase(),
    roundStatus: snapshot.pausedAt
      ? 'DIJEDA'
      : snapshot.status === 'LIVE'
        ? 'RONDE BERJALAN'
        : snapshot.status,
    notice: snapshot.notice?.text ?? '',
    ...extras,
  };
}
export function OverlayText({
  settings,
  name,
  variables = {},
  as: Tag = 'span',
  className,
}: {
  settings: OverlaySettings;
  name: OverlayTextKey;
  variables?: Record<string, string | number>;
  as?: 'span' | 'div' | 'p' | 'strong' | 'small' | 'h3';
  className?: string;
}) {
  const item = settings.text[name];
  if (!item.visible || !item.text.trim()) return null;
  const text =
    variables.randomClub === 1 && item.text === overlayTextDefinitions[name].text
      ? (randomClubText[name] ?? item.text)
      : item.text;
  return (
    <Tag data-overlay-text={name} className={className} style={{ color: item.color }}>
      <span className="overlay-text-value" style={{ fontSize: `${item.sizePercent / 100}em` }}>
        {formatOverlayText(text, variables)}
      </span>
    </Tag>
  );
}

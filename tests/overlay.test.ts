import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  configure,
  initialState,
  ingest,
  publicSnapshot,
  restoreState,
  startRound,
  tick,
} from '../src/game/engine';
import { ConfigSchema, defaultConfig } from '../src/game/model';
import {
  defaultOverlaySettings,
  formatOverlayText,
  OverlaySchema,
  overlayTextKeys,
} from '../src/game/overlay';
import { OverlayText, overlayVariables } from '../src/client/overlay';

describe('editable overlay text', () => {
  it('loads pre-overlay config and persisted state with the existing display defaults', () => {
    const legacy = JSON.parse(JSON.stringify(initialState(1000)));
    delete legacy.config.overlay;
    expect(ConfigSchema.parse(legacy.config).overlay).toEqual(defaultOverlaySettings());
    const recovered = restoreState(JSON.stringify(legacy));
    expect(recovered.config.overlay).toEqual(defaultOverlaySettings());
    expect(recovered.scores).toEqual(legacy.scores);
    expect(Object.keys(recovered.config.overlay.text)).toEqual([...overlayTextKeys]);
  });
  it('substitutes known values once without interpreting HTML or unknown placeholders', () => {
    expect(
      formatOverlayText('Setiap {likes} like; antrean {queue}', { likes: 100, queue: 2 }),
    ).toBe('Setiap 100 like; antrean 2');
    expect(
      formatOverlayText('{supporter} {unknown} {constructor}', {
        supporter: '<b>{queue}</b>',
        queue: 9,
      }),
    ).toBe('<b>{queue}</b> {unknown} {constructor}');
  });
  it('loads saved overlays from before player labels and fullscreen options existed', () => {
    const legacy = JSON.parse(JSON.stringify(initialState(1000)));
    delete legacy.config.overlay.playerLabelMode;
    delete legacy.config.overlay.fullscreenMode;
    const recovered = restoreState(JSON.stringify(legacy));
    expect(recovered.config.overlay.playerLabelMode).toBe('TEXT');
    expect(recovered.config.overlay.fullscreenMode).toBe('ARENA');
    expect(recovered.config.overlay.text).toEqual(legacy.config.overlay.text);
    expect(recovered.scores).toEqual(legacy.scores);
  });
  it('publishes logo and fullscreen preferences to connected overlays', () => {
    const state = initialState(1000);
    const config = structuredClone(state.config);
    config.overlay.playerLabelMode = 'LOGO';
    config.overlay.fullscreenMode = 'OVERLAY';
    configure(state, ConfigSchema.parse(config), 1100);
    expect(publicSnapshot(state, 1100).overlay).toMatchObject({
      playerLabelMode: 'LOGO',
      fullscreenMode: 'OVERLAY',
    });
    expect(state.scores).toEqual(initialState(1000).scores);
  });
  it('escapes markup and renders the configured relative font size and color', () => {
    const settings = defaultOverlaySettings();
    settings.text.title = {
      text: '<img src=x onerror=alert(1)>',
      sizePercent: 150,
      color: '#ff8800',
      visible: true,
    };
    const html = renderToStaticMarkup(createElement(OverlayText, { settings, name: 'title' }));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).toContain('font-size:1.5em');
    expect(html).toContain('color:#ff8800');
  });
  it('omits hidden or empty text completely', () => {
    const settings = defaultOverlaySettings();
    settings.text.title.visible = false;
    expect(renderToStaticMarkup(createElement(OverlayText, { settings, name: 'title' }))).toBe('');
    settings.text.title.visible = true;
    settings.text.title.text = ' \n ';
    expect(renderToStaticMarkup(createElement(OverlayText, { settings, name: 'title' }))).toBe('');
  });
  it.each([
    { sizePercent: 49 },
    { sizePercent: 201 },
    { sizePercent: 100.5 },
    { color: 'red' },
    { color: 'url(https://example.com)' },
    { text: 'a'.repeat(241) },
  ])('rejects out-of-range styles or overlong text: %j', (patch) => {
    const overlay = defaultOverlaySettings();
    Object.assign(overlay.text.title, patch);
    expect(OverlaySchema.safeParse(overlay).success).toBe(false);
  });
  it('requires every known text entry when an overlay config is explicitly provided', () => {
    const overlay = JSON.parse(JSON.stringify(defaultOverlaySettings()));
    delete overlay.text.title;
    expect(OverlaySchema.safeParse(overlay).success).toBe(false);
  });
  it('uses independent default objects for resets and new configurations', () => {
    const a = defaultOverlaySettings(),
      b = defaultOverlaySettings();
    a.text.title.text = 'Changed';
    expect(b.text.title.text).toBe('PENALTY');
    expect(defaultConfig().overlay.text.title.text).toBe('PENALTY');
  });
  it('applies text updates during LIVE without changing scores, queued kicks, or like remainders', () => {
    const s = initialState(1000);
    s.config.match.countdownSec = 0;
    s.config.likes.enabled = true;
    startRound(s, 1000);
    tick(s, 1000, () => 0);
    ingest(s, { id: 'club', type: 'comment', userId: 'alice', comment: 'RMA', at: 1000 }, 1000);
    ingest(s, { id: 'likes', type: 'like', userId: 'alice', likeCount: 150, at: 1000 }, 1000);
    const before = structuredClone(s);
    const c = structuredClone(s.config);
    c.overlay.text.title.text = 'LIGA LIVE';
    c.overlay.text.clubPrompt.visible = false;
    c.overlay.showGiftLegend = false;
    configure(s, c, 1100);
    expect(s.scores).toEqual(before.scores);
    expect(s.queue).toEqual(before.queue);
    expect(s.viewers['u:alice'].likeRemainder).toBe(50);
    const snapshot = publicSnapshot(s, 1100);
    expect(snapshot.overlay.text.title.text).toBe('LIGA LIVE');
    expect(snapshot.overlay.text.clubPrompt.visible).toBe(false);
    expect(overlayVariables(snapshot).likes).toBe(100);
    expect(overlayVariables(snapshot).queue).toBe(1);
    const reset = { ...s.config, overlay: defaultOverlaySettings() };
    configure(s, reset, 1200);
    expect(s.viewers['u:alice'].likeRemainder).toBe(50);
    expect(s.queue).toEqual(before.queue);
  });
});

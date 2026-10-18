import { DurableObject } from 'cloudflare:workers';
import { ConfigSchema, type RoomState, type Receipt, type GameEvent } from '../game/model';
import {
  initialState,
  tick,
  ingest,
  publicSnapshot,
  configure,
  control,
  audit,
  restoreState,
} from '../game/engine';
import { normalizeConnector } from './adapter';
export class MatchRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT NOT NULL)',
    );
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL)',
    );
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS receipt_age ON receipts(at)');
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS kicks (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, json TEXT NOT NULL, at INTEGER NOT NULL)',
    );
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS kick_age ON kicks(at)');
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS outbox (key TEXT PRIMARY KEY, json TEXT NOT NULL)',
    );
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER, expires INTEGER)',
    );
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO state VALUES (1, ?)',
      JSON.stringify(initialState()),
    );
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private read(): RoomState {
    return restoreState(
      this.ctx.storage.sql.exec<{ json: string }>('SELECT json FROM state WHERE id=1').one().json,
    );
  }
  private save(s: RoomState) {
    s.revision++;
    this.ctx.storage.sql.exec('UPDATE state SET json=? WHERE id=1', JSON.stringify(s));
  }
  private transition(s: RoomState, now: number) {
    const last = s.history[0]?.id;
    const priorActive = s.active;
    tick(s, now, () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
    if (priorActive && priorActive.id !== s.active?.id && !priorActive.demo)
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO kicks VALUES (?,?,?,?)',
        priorActive.id,
        priorActive.matchId,
        JSON.stringify({ ...priorActive, state: 'DONE' }),
        now,
      );
    if (s.active && s.active.id !== priorActive?.id && !s.active.demo)
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO kicks VALUES (?,?,?,?)',
        s.active.id,
        s.active.matchId,
        JSON.stringify({ ...s.active, state: 'ACTIVE' }),
        now,
      );
    if (s.history[0]?.id && s.history[0].id !== last)
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO outbox VALUES (?,?)',
        `penalty:match:history:${s.history[0].id}`,
        JSON.stringify(s.history[0]),
      );
  }
  private async schedule(s: RoomState) {
    const now = Date.now();
    const times = [
      s.active?.endsAt,
      s.pausedAt === null ? s.phaseEndsAt : null,
      s.pausedAt === null && s.status === 'LIVE' ? s.deadline : null,
    ]
      .filter((v): v is number => typeof v === 'number')
      .map((v) => Math.max(now + 1, v));
    if (s.status === 'LIVE' && s.pausedAt === null && s.config.idle.enabled)
      times.push(
        Math.max(Date.now() + 1000, s.nextDemoAt, s.lastActivity + s.config.idle.timeoutMs),
      );
    if (s.status === 'CLOSING' || s.queue.length) times.push(Date.now() + 1000);
    // Maintenance also expires dedup, prunes viewers, and retries KV outbox.
    await this.ctx.storage.setAlarm(Math.min(Date.now() + 60000, ...times));
  }
  private broadcast(s: RoomState) {
    const data = JSON.stringify(publicSnapshot(s, Date.now()));
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        ws.close(1011, 'Reconnect');
      }
    }
  }
  async snapshot() {
    const s = this.read();
    await this.schedule(s);
    return publicSnapshot(s, Date.now());
  }
  async adminSnapshot() {
    const s = this.read();
    return {
      config: s.config,
      configVersion: s.configVersion,
      snapshot: publicSnapshot(s, Date.now()),
      history: s.history,
      kicks: this.ctx.storage.sql
        .exec<{ json: string }>('SELECT json FROM kicks ORDER BY at DESC LIMIT 100')
        .toArray()
        .map((row) => JSON.parse(row.json)),
      audit: s.audit,
      stats: s.stats,
      archivePending: this.ctx.storage.sql
        .exec<{ n: number }>('SELECT count(*) AS n FROM outbox')
        .one().n,
    };
  }
  async receive(payload: unknown): Promise<Receipt> {
    const now = Date.now();
    let receipt: Receipt = { status: 'invalid' };
    let rejection: unknown;
    this.ctx.storage.transactionSync(() => {
      const s = this.read();
      let event: GameEvent;
      try {
        event = normalizeConnector(payload, s.config.sourceRoomId, now);
      } catch (error) {
        const reason = error instanceof Error ? error.message : '';
        const detail = ['source_room_mismatch', 'event_expired', 'truncated_payload'].includes(
          reason,
        )
          ? reason
          : 'validation_failed';
        s.stats.rejected++;
        audit(s, now, 'webhook_rejected', detail);
        this.save(s);
        rejection = error;
        return;
      }
      this.transition(s, now);
      const existing = this.ctx.storage.sql
        .exec<{ json: string }>('SELECT json FROM receipts WHERE id=?', event.id)
        .toArray()[0];
      if (existing) {
        s.stats.duplicates++;
        receipt = { ...JSON.parse(existing.json), status: 'duplicate' };
      } else {
        receipt = ingest(s, event, now);
        if (!receipt.retryable)
          this.ctx.storage.sql.exec(
            'INSERT INTO receipts VALUES (?,?,?)',
            event.id,
            JSON.stringify(receipt),
            now,
          );
      }
      this.transition(s, now);
      this.save(s);
    });
    if (rejection) throw rejection;
    const s = this.read();
    await this.schedule(s);
    this.broadcast(s);
    return receipt;
  }
  async command(action: string) {
    this.ctx.storage.transactionSync(() => {
      const s = this.read();
      this.transition(s, Date.now());
      control(s, action, Date.now());
      this.transition(s, Date.now());
      this.save(s);
    });
    const s = this.read();
    await this.schedule(s);
    this.broadcast(s);
    return publicSnapshot(s, Date.now());
  }
  async updateConfig(input: unknown, version: number) {
    const parsed = ConfigSchema.parse(input);
    this.ctx.storage.transactionSync(() => {
      const s = this.read();
      if (s.configVersion !== version)
        throw Error('Konfigurasi berubah; muat ulang sebelum menyimpan');
      configure(s, parsed, Date.now());
      this.save(s);
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO outbox VALUES (?,?)',
        'penalty:settings',
        JSON.stringify({ version: s.configVersion, config: parsed }),
      );
    });
    const s = this.read();
    await this.schedule(s);
    this.broadcast(s);
    await this.flushOutbox();
    return this.adminSnapshot();
  }
  async allow(key: string, max: number, windowMs: number) {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM limits WHERE expires<?', now);
    const row = this.ctx.storage.sql
      .exec<{ count: number }>('SELECT count FROM limits WHERE key=?', key)
      .toArray()[0];
    if ((row?.count ?? 0) >= max) return false;
    this.ctx.storage.sql.exec(
      'INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
      key,
      now + windowMs,
    );
    return true;
  }
  async fetch(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 });
    if (this.ctx.getWebSockets().length >= 100)
      return new Response('Too many viewers', { status: 503 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].send(JSON.stringify(await this.snapshot()));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(ws: WebSocket) {
    ws.close(1008, 'Read-only overlay');
  }
  webSocketClose(ws: WebSocket, code: number) {
    ws.close(code, 'Closed');
  }
  private flushing = false;
  private async flushOutbox() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      // No per-event KV writes. Compare-and-delete protects a newer configuration while awaiting KV.
      const rows = this.ctx.storage.sql
        .exec<{ key: string; json: string }>('SELECT key,json FROM outbox LIMIT 10')
        .toArray();
      for (const row of rows) {
        try {
          await this.env.CONFIG.put(
            row.key,
            row.json,
            row.key === 'penalty:settings'
              ? undefined
              : { expirationTtl: this.read().config.retentionDays * 86400 },
          );
          this.ctx.storage.sql.exec('DELETE FROM outbox WHERE key=? AND json=?', row.key, row.json);
        } catch {
          console.warn(JSON.stringify({ event: 'archive_retry', key: row.key }));
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
  async alarm() {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      const s = this.read();
      this.transition(s, now);
      this.ctx.storage.sql.exec('DELETE FROM receipts WHERE at<?', now - 7 * 86400000);
      const activeIds = new Set(s.queue.map((k) => k.supporterId));
      if (s.active) activeIds.add(s.active.supporterId);
      for (const [id, v] of Object.entries(s.viewers))
        if (now - v.seenAt > s.config.retentionDays * 86400000 && !activeIds.has(id))
          delete s.viewers[id];
      s.history = s.history.filter((h) => now - h.endedAt < s.config.retentionDays * 86400000);
      const cutoff = now - s.config.retentionDays * 86400000;
      this.ctx.storage.sql.exec('DELETE FROM kicks WHERE at<?', cutoff);
      s.audit = s.audit.filter((a) => a.at >= cutoff);
      if (s.lastKick?.endsAt && s.lastKick.endsAt < cutoff) s.lastKick = null;
      this.save(s);
    });
    const s = this.read();
    await this.schedule(s);
    this.broadcast(s);
    await this.flushOutbox();
  }
}

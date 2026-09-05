import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

/**
 * LINEログイン連携（方式B）の状態管理。
 *
 * - state: ログイン開始時に発行するワンタイムトークン（CSRF対策）。
 *   端末ID（deviceId）と結びつけて10分だけ覚え、コールバックで1回だけ使える
 * - links: 連携が完了した端末の記録（deviceId → LINEユーザー情報）。
 *   /data のボリュームに保存して再起動をまたいで残す
 */

export interface LineLinkEntry {
  /** LINEのユーザーID（Uで始まる） */
  userId: string;
  /** LINEの表示名（本人確認の表示用。32文字まで） */
  name: string;
  /** 公式アカウントを友だち追加済みか（取れなかったときは false） */
  friend: boolean;
  /** 連携した日時（ISO） */
  at: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_STATES = 1000;

export class LineLinks {
  private links: Record<string, LineLinkEntry> = {};
  private states = new Map<string, { device: string; at: number }>();
  private readonly file: string;
  private readonly now: () => number;

  constructor(dataDir: string, now: () => number = () => Date.now()) {
    this.now = now;
    this.file = path.join(dataDir, "line-links.json");
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      if (fs.existsSync(this.file)) {
        this.links = JSON.parse(fs.readFileSync(this.file, "utf-8")) as Record<
          string,
          LineLinkEntry
        >;
      }
    } catch (e) {
      console.warn("LINE連携記録の読み込みに失敗しました（新規で始めます）:", e);
      this.links = {};
    }
  }

  /** ログイン開始: この端末用のワンタイムstateを発行する */
  newState(device: string): string {
    this.purgeStates();
    const state = crypto.randomBytes(16).toString("hex");
    this.states.set(state, { device, at: this.now() });
    return state;
  }

  /** コールバック: stateを1回だけ使って端末IDに引き当てる（無効ならnull） */
  consumeState(state: string): string | null {
    this.purgeStates();
    const found = this.states.get(state);
    if (!found) return null;
    this.states.delete(state);
    return found.device;
  }

  /** 連携完了を記録する */
  link(device: string, entry: LineLinkEntry): void {
    this.links[device] = entry;
    this.save();
  }

  /** この端末が連携済みか（未連携ならnull） */
  get(device: string): LineLinkEntry | null {
    return this.links[device] ?? null;
  }

  /** 連携記録を消す（検証用の連携解除コードから使う） */
  remove(device: string): void {
    if (!(device in this.links)) return;
    delete this.links[device];
    this.save();
  }

  private purgeStates(): void {
    const cutoff = this.now() - STATE_TTL_MS;
    for (const [k, v] of this.states) {
      if (v.at < cutoff) this.states.delete(k);
    }
    // 万一大量に作られても無限には増やさない（古い順に落ちる）
    while (this.states.size > MAX_PENDING_STATES) {
      const oldest = this.states.keys().next().value;
      if (oldest === undefined) break;
      this.states.delete(oldest);
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.links));
    } catch (e) {
      console.warn("LINE連携記録の保存に失敗しました:", e);
    }
  }
}

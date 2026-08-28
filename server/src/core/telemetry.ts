import fs from "node:fs";
import path from "node:path";

/**
 * 利用状況の匿名集計。
 * アプリから届くイベント（起動・対戦・QR登録）を集計し、管理画面の
 * 「分析」タブに返す。個人を特定できる情報（名前など）は保存しない。
 *
 * 保存先はデータディレクトリの stats.json（Fly.io ではボリューム /data）。
 * 書き込みは数秒ごとにまとめて行い、再起動しても集計が残る。
 */

export interface TrackEvent {
  type: "appOpen" | "match" | "scan";
  deviceId: string;
  env: string; // prod / dev / app など
  platform?: string;
  mode?: "cpu" | "online";
  result?: "win" | "lose";
  difficulty?: string | null;
  turns?: number;
  durationSec?: number;
  first?: boolean;
  cardId?: string;
  /** メタ分析用: この対戦で使ったデッキのカードID一覧 */
  cards?: string[];
}

interface DailyStat {
  opens: number;
  matches: number;
  onlineMatches: number;
  scans: number;
  devices: string[];
}

interface Aggregates {
  devices: Record<string, { first: string; last: string; env: string }>;
  totals: {
    appOpens: number;
    matches: number;
    cpuMatches: number;
    onlineMatches: number;
    cpuWins: number;
    cpuLosses: number;
    scans: number;
  };
  byDifficulty: Record<string, { matches: number; wins: number }>;
  firstPlayer: { firstWins: number; firstMatches: number };
  turnsSum: number;
  turnsCount: number;
  durSum: number;
  durCount: number;
  daily: Record<string, DailyStat>;
  scanByCard: Record<string, number>;
  /** カード別のメタ分析（そのカード入りデッキの対戦数と勝利数） */
  cardUsage: Record<string, { matches: number; wins: number }>;
  envTotals: Record<string, { opens: number; matches: number }>;
}

const MAX_DEVICES = 20000;
const MAX_DAYS = 90;
const MAX_DAILY_DEVICES = 3000;

function emptyAggregates(): Aggregates {
  return {
    devices: {},
    totals: {
      appOpens: 0,
      matches: 0,
      cpuMatches: 0,
      onlineMatches: 0,
      cpuWins: 0,
      cpuLosses: 0,
      scans: 0,
    },
    byDifficulty: {},
    firstPlayer: { firstWins: 0, firstMatches: 0 },
    turnsSum: 0,
    turnsCount: 0,
    durSum: 0,
    durCount: 0,
    daily: {},
    scanByCard: {},
    cardUsage: {},
    envTotals: {},
  };
}

export class Telemetry {
  private agg: Aggregates;
  private readonly file: string;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => Date;

  constructor(dataDir: string, now: () => Date = () => new Date()) {
    this.now = now;
    this.file = path.join(dataDir, "stats.json");
    this.agg = emptyAggregates();
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      if (fs.existsSync(this.file)) {
        const loaded = JSON.parse(fs.readFileSync(this.file, "utf-8")) as Aggregates;
        this.agg = { ...emptyAggregates(), ...loaded };
      }
    } catch (e) {
      console.warn("集計の読み込みに失敗しました（新規で始めます）:", e);
      this.agg = emptyAggregates();
    }
  }

  private today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  private dayOf(date: string): DailyStat {
    let d = this.agg.daily[date];
    if (!d) {
      d = { opens: 0, matches: 0, onlineMatches: 0, scans: 0, devices: [] };
      this.agg.daily[date] = d;
      // 古い日は落とす
      const keys = Object.keys(this.agg.daily).sort();
      while (keys.length > MAX_DAYS) {
        delete this.agg.daily[keys.shift()!];
      }
    }
    return d;
  }

  /** イベントを1件取り込む。壊れた入力は無視する */
  track(raw: unknown): boolean {
    const e = raw as TrackEvent;
    if (!e || typeof e !== "object") return false;
    if (e.type !== "appOpen" && e.type !== "match" && e.type !== "scan") return false;
    const deviceId = String(e.deviceId ?? "").slice(0, 64);
    if (!deviceId) return false;
    const env = String(e.env ?? "prod").slice(0, 16);
    const nowIso = this.now().toISOString();
    const date = this.today();
    const day = this.dayOf(date);

    // 端末の初回・最終利用
    const known = this.agg.devices[deviceId];
    if (known) {
      known.last = nowIso;
    } else if (Object.keys(this.agg.devices).length < MAX_DEVICES) {
      this.agg.devices[deviceId] = { first: nowIso, last: nowIso, env };
    }
    if (day.devices.length < MAX_DAILY_DEVICES && !day.devices.includes(deviceId)) {
      day.devices.push(deviceId);
    }
    const envT = (this.agg.envTotals[env] ??= { opens: 0, matches: 0 });

    if (e.type === "appOpen") {
      this.agg.totals.appOpens++;
      day.opens++;
      envT.opens++;
    } else if (e.type === "match") {
      this.agg.totals.matches++;
      day.matches++;
      envT.matches++;
      if (e.mode === "online") {
        this.agg.totals.onlineMatches++;
        day.onlineMatches++;
      } else {
        this.agg.totals.cpuMatches++;
        if (e.result === "win") this.agg.totals.cpuWins++;
        else if (e.result === "lose") this.agg.totals.cpuLosses++;
        const diff = String(e.difficulty ?? "normal").slice(0, 16);
        const d = (this.agg.byDifficulty[diff] ??= { matches: 0, wins: 0 });
        d.matches++;
        if (e.result === "win") d.wins++;
      }
      if (typeof e.turns === "number" && e.turns > 0 && e.turns < 200) {
        this.agg.turnsSum += e.turns;
        this.agg.turnsCount++;
      }
      if (typeof e.durationSec === "number" && e.durationSec > 0 && e.durationSec < 3600 * 3) {
        this.agg.durSum += e.durationSec;
        this.agg.durCount++;
      }
      if (typeof e.first === "boolean") {
        this.agg.firstPlayer.firstMatches++;
        if (e.first && e.result === "win") this.agg.firstPlayer.firstWins++;
      }
      // カード別のメタ分析（重複IDは1回として数える）
      if (Array.isArray(e.cards) && e.cards.length <= 40) {
        for (const raw2 of new Set(e.cards)) {
          const cid = String(raw2).slice(0, 64);
          if (!cid) continue;
          if (
            !this.agg.cardUsage[cid] &&
            Object.keys(this.agg.cardUsage).length >= 500
          ) {
            continue; // でたらめなIDの送りつけで肥大しないよう上限を設ける
          }
          const u = (this.agg.cardUsage[cid] ??= { matches: 0, wins: 0 });
          u.matches++;
          if (e.result === "win") u.wins++;
        }
      }
    } else if (e.type === "scan") {
      this.agg.totals.scans++;
      day.scans++;
      const cardId = String(e.cardId ?? "").slice(0, 64);
      if (cardId) {
        this.agg.scanByCard[cardId] = (this.agg.scanByCard[cardId] ?? 0) + 1;
      }
    }

    this.scheduleSave();
    return true;
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 3000);
  }

  saveNow(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.agg));
    } catch (e) {
      console.warn("集計の保存に失敗しました:", e);
    }
  }

  /** 管理画面向けの集計サマリー */
  stats(): object {
    const a = this.agg;
    const days = Object.keys(a.daily).sort();
    const today = this.today();
    const lastNDates = (n: number) => {
      const out: string[] = [];
      const base = this.now();
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base.getTime() - i * 86400000);
        out.push(d.toISOString().slice(0, 10));
      }
      return out;
    };
    const activeDevices = (n: number) => {
      const set = new Set<string>();
      for (const date of lastNDates(n)) {
        for (const id of a.daily[date]?.devices ?? []) set.add(id);
      }
      return set.size;
    };
    const top = Object.entries(a.scanByCard)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 10)
      .map(([cardId, count]) => ({ cardId, count }));
    return {
      generatedAt: this.now().toISOString(),
      devices: {
        total: Object.keys(a.devices).length,
        today: a.daily[today]?.devices.length ?? 0,
        last7: activeDevices(7),
        last30: activeDevices(30),
      },
      appOpens: {
        total: a.totals.appOpens,
        today: a.daily[today]?.opens ?? 0,
      },
      matches: {
        total: a.totals.matches,
        today: a.daily[today]?.matches ?? 0,
        cpu: a.totals.cpuMatches,
        online: a.totals.onlineMatches,
        cpuWinRate:
          a.totals.cpuWins + a.totals.cpuLosses > 0
            ? a.totals.cpuWins / (a.totals.cpuWins + a.totals.cpuLosses)
            : null,
        avgTurns: a.turnsCount > 0 ? a.turnsSum / a.turnsCount : null,
        avgDurationSec: a.durCount > 0 ? a.durSum / a.durCount : null,
        firstWinRate:
          a.firstPlayer.firstMatches > 0
            ? a.firstPlayer.firstWins / a.firstPlayer.firstMatches
            : null,
        byDifficulty: a.byDifficulty,
      },
      scans: {
        total: a.totals.scans,
        topCards: top,
      },
      // カード別の使用数・勝率（管理画面のメタ分析用。使用数の多い順）
      cardUsage: Object.entries(a.cardUsage)
        .sort((x, y) => y[1].matches - x[1].matches)
        .slice(0, 100)
        .map(([cardId, u]) => ({ cardId, matches: u.matches, wins: u.wins })),
      env: a.envTotals,
      daily: lastNDates(14).map((date) => ({
        date,
        opens: a.daily[date]?.opens ?? 0,
        matches: a.daily[date]?.matches ?? 0,
        onlineMatches: a.daily[date]?.onlineMatches ?? 0,
        scans: a.daily[date]?.scans ?? 0,
        devices: a.daily[date]?.devices.length ?? 0,
      })),
      _days: days.length,
    };
  }
}

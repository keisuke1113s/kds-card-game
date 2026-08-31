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
  type: "appOpen" | "match" | "scan" | "lineLink";
  /** appOpen に添付されるLINE連携状態 */
  line?: boolean;
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
  /** デッキ分析用: 使ったデッキの名前（スタンダードデッキ等） */
  deckName?: string;
  /** 週間ランキング用（本人が付けた表示名。未設定なら送られない） */
  name?: string;
  streak?: number;
}

interface DailyStat {
  opens: number;
  matches: number;
  onlineMatches: number;
  scans: number;
  devices: string[];
}

interface DeviceExtra { line?: boolean }

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
  /** カード2枚の組み合わせ別のメタ分析（キーは "小さいID|大きいID"） */
  pairUsage: Record<string, { matches: number; wins: number }>;
  envTotals: Record<string, { opens: number; matches: number }>;
  /** 端末の種類別（web / ios / android）の利用数 */
  platformTotals?: Record<string, { opens: number; matches: number }>;
  /** デッキ名別の対戦数と勝利数 */
  deckUsage?: Record<string, { matches: number; wins: number }>;
  /** CPU・オンライン別の平均ターン・平均時間の材料 */
  turnsByMode?: Record<string, { turnsSum: number; turnsCount: number; durSum: number; durCount: number }>;
  /** 曜日別の対戦数（日本時間、0=月曜） */
  weekday?: number[];
  /** 時間帯別（日本時間0〜23時）の対戦数 */
  hourly: { cpu: number[]; online: number[] };
  /** LINE連携の実行数（累計と日別） */
  lineLinks?: { total: number; daily: Record<string, number> };
  /** 週間ランキング（キーは日本時間の週の月曜日 YYYY-MM-DD） */
  weekly?: Record<
    string,
    Record<string, { name: string; wins: number; losses: number; bestStreak: number   /**
   * 絞り込み集計用の生イベントログ（直近分のみ・上限あり）。
   * at=UTCのISO分, ty=種別, d=端末ID, pf=端末種別, md=モード, rs=勝敗,
   * tn=ターン数, du=秒数, dk=デッキ名
   */
  events?: {
    at: string;
    ty: string;
    d: string;
    pf?: string;
    md?: string;
    rs?: string;
    tn?: number;
    du?: number;
    dk?: string;
  }[];
}>
  >;
  /**
   * 絞り込み集計用の生イベントログ（直近分のみ・上限あり）。
   * at=UTCのISO分, ty=種別, d=端末ID, pf=端末種別, md=モード, rs=勝敗,
   * tn=ターン数, du=秒数, dk=デッキ名
   */
  events?: {
    at: string;
    ty: string;
    d: string;
    pf?: string;
    md?: string;
    rs?: string;
    tn?: number;
    du?: number;
    dk?: string;
  }[];
}

const MAX_DEVICES = 20000;
const MAX_EVENTS = 30000;
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
    pairUsage: {},
    envTotals: {},
    platformTotals: {},
    deckUsage: {},
    turnsByMode: {},
    weekday: new Array(7).fill(0),
    hourly: { cpu: new Array(24).fill(0), online: new Array(24).fill(0) },
    lineLinks: { total: 0, daily: {} },
    weekly: {},
    events: [],
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

  /** 日本時間でその週の月曜日の日付（週間ランキングのキー） */
  private weekKey(): string {
    const jst = new Date(this.now().getTime() + 9 * 3600 * 1000);
    const day = (jst.getUTCDay() + 6) % 7; // 月曜=0
    const monday = new Date(jst.getTime() - day * 86400000);
    return monday.toISOString().slice(0, 10);
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
    if (e.type !== "appOpen" && e.type !== "match" && e.type !== "scan" && e.type !== "lineLink") return false;
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
      if (typeof e.line === "boolean") (known as unknown as DeviceExtra).line = e.line;
    } else if (Object.keys(this.agg.devices).length < MAX_DEVICES) {
      const rec = { first: nowIso, last: nowIso, env } as (typeof this.agg.devices)[string];
      if (typeof e.line === "boolean") (rec as unknown as DeviceExtra).line = e.line;
      this.agg.devices[deviceId] = rec;
    }
    if (day.devices.length < MAX_DAILY_DEVICES && !day.devices.includes(deviceId)) {
      day.devices.push(deviceId);
    }
    const envT = (this.agg.envTotals[env] ??= { opens: 0, matches: 0 });
    // 絞り込み集計用の生ログ（1分単位・上限超過分は古い順に落とす）
    this.agg.events ??= [];
    const ev: NonNullable<Aggregates["events"]>[number] = {
      at: nowIso.slice(0, 16),
      ty: e.type,
      d: deviceId,
    };
    const pfShort = String(e.platform ?? "").slice(0, 16);
    if (pfShort) ev.pf = pfShort;
    if (e.type === "match") {
      ev.md = e.mode === "online" ? "online" : "cpu";
      if (e.result === "win" || e.result === "lose") ev.rs = e.result;
      if (typeof e.turns === "number" && e.turns > 0 && e.turns < 200) ev.tn = e.turns;
      if (typeof e.durationSec === "number" && e.durationSec > 0 && e.durationSec < 3600 * 3) {
        ev.du = Math.round(e.durationSec);
      }
      const dkShort = String(e.deckName ?? "").slice(0, 24);
      if (dkShort) ev.dk = dkShort;
    }
    this.agg.events.push(ev);
    if (this.agg.events.length > MAX_EVENTS) {
      this.agg.events.splice(0, this.agg.events.length - MAX_EVENTS);
    }
    // 端末の種類別（web / ios / android）
    const platform = String(e.platform ?? "").slice(0, 16) || "不明";
    this.agg.platformTotals ??= {};
    const platT = (this.agg.platformTotals[platform] ??= { opens: 0, matches: 0 });

    if (e.type === "appOpen") {
      this.agg.totals.appOpens++;
      day.opens++;
      envT.opens++;
      platT.opens++;
    } else if (e.type === "lineLink") {
      // LINE連携の実行（コード入力やログインの成功）
      this.agg.lineLinks ??= { total: 0, daily: {} };
      this.agg.lineLinks.total++;
      this.agg.lineLinks.daily[date] = (this.agg.lineLinks.daily[date] ?? 0) + 1;
      const dev = this.agg.devices[deviceId] as unknown as DeviceExtra | undefined;
      if (dev) dev.line = true;
    } else if (e.type === "match") {
      this.agg.totals.matches++;
      day.matches++;
      envT.matches++;
      platT.matches++;
      // 曜日別（日本時間、0=月曜）
      this.agg.weekday ??= new Array(7).fill(0);
      const jstDay = (new Date(this.now().getTime() + 9 * 3600 * 1000).getUTCDay() + 6) % 7;
      this.agg.weekday[jstDay]++;
      // デッキ名別の成績
      const deckName = String(e.deckName ?? "").slice(0, 24);
      if (deckName) {
        this.agg.deckUsage ??= {};
        if (this.agg.deckUsage[deckName] || Object.keys(this.agg.deckUsage).length < 200) {
          const du = (this.agg.deckUsage[deckName] ??= { matches: 0, wins: 0 });
          du.matches++;
          if (e.result === "win") du.wins++;
        }
      }
      // 時間帯別（日本時間）。古い保存データには hourly が無いことがある
      this.agg.hourly ??= { cpu: new Array(24).fill(0), online: new Array(24).fill(0) };
      const jstHour = (this.now().getUTCHours() + 9) % 24;
      if (e.mode === "online") this.agg.hourly.online[jstHour]++;
      else this.agg.hourly.cpu[jstHour]++;
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
      // CPU・オンライン別の平均の材料
      this.agg.turnsByMode ??= {};
      const tm = (this.agg.turnsByMode[e.mode === "online" ? "online" : "cpu"] ??= {
        turnsSum: 0,
        turnsCount: 0,
        durSum: 0,
        durCount: 0,
      });
      if (typeof e.turns === "number" && e.turns > 0 && e.turns < 200) {
        this.agg.turnsSum += e.turns;
        this.agg.turnsCount++;
        tm.turnsSum += e.turns;
        tm.turnsCount++;
      }
      if (typeof e.durationSec === "number" && e.durationSec > 0 && e.durationSec < 3600 * 3) {
        this.agg.durSum += e.durationSec;
        this.agg.durCount++;
        tm.durSum += e.durationSec;
        tm.durCount++;
      }
      if (typeof e.first === "boolean") {
        this.agg.firstPlayer.firstMatches++;
        if (e.first && e.result === "win") this.agg.firstPlayer.firstWins++;
      }
      // 週間ランキング（表示名を送ってきた対戦だけ数える）
      if (typeof e.name === "string" && e.name.trim()) {
        this.agg.weekly ??= {};
        const wk = this.weekKey();
        const week = (this.agg.weekly[wk] ??= {});
        // 古い週は8週ぶんだけ残す
        const wkeys = Object.keys(this.agg.weekly).sort();
        while (wkeys.length > 8) delete this.agg.weekly[wkeys.shift()!];
        if (week[deviceId] || Object.keys(week).length < 2000) {
          const r = (week[deviceId] ??= { name: "", wins: 0, losses: 0, bestStreak: 0 });
          r.name = String(e.name).slice(0, 12);
          if (e.result === "win") r.wins++;
          else if (e.result === "lose") r.losses++;
          if (typeof e.streak === "number") r.bestStreak = Math.max(r.bestStreak, Math.min(999, e.streak));
        }
      }
      // カード別のメタ分析（重複IDは1回として数える）
      if (Array.isArray(e.cards) && e.cards.length <= 40) {
        const ids = [...new Set(e.cards.map((c) => String(c).slice(0, 64)).filter(Boolean))].sort();
        for (const cid of ids) {
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
        // カード2枚の組み合わせ（相性）の集計
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const key = `${ids[i]}|${ids[j]}`;
            if (
              !this.agg.pairUsage[key] &&
              Object.keys(this.agg.pairUsage).length >= 5000
            ) {
              continue;
            }
            const p = (this.agg.pairUsage[key] ??= { matches: 0, wins: 0 });
            p.matches++;
            if (e.result === "win") p.wins++;
          }
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

  /** 週間ランキング（今週と先週の上位） */
  ranking(): object {
    const weekly = this.agg.weekly ?? {};
    const wk = this.weekKey();
    const prevWk = new Date(Date.parse(wk) - 7 * 86400000).toISOString().slice(0, 10);
    const topOf = (key: string) =>
      Object.values(weekly[key] ?? {})
        .filter((r) => r.wins + r.losses > 0)
        .sort((a, b) => b.wins - a.wins || b.bestStreak - a.bestStreak || a.losses - b.losses)
        .slice(0, 20)
        .map((r) => ({
          name: r.name,
          wins: r.wins,
          losses: r.losses,
          bestStreak: r.bestStreak,
        }));
    return {
      generatedAt: this.now().toISOString(),
      week: wk,
      top: topOf(wk),
      prevWeek: prevWk,
      prevTop: topOf(prevWk).slice(0, 3),
    };
  }

  /**
   * 期間・時間帯（日本時間）で絞り込んだ集計。
   * 生イベントログ（この機能の追加以降に記録した分）だけが対象。
   */
  rangeStats(from: string, to: string, hourFrom: number, hourTo: number): object {
    const events = this.agg.events ?? [];
    const hf = Math.max(0, Math.min(23, Math.floor(hourFrom)));
    const ht = Math.max(0, Math.min(23, Math.floor(hourTo)));
    const devices = new Set<string>();
    const hourly = new Array<number>(24).fill(0);
    const daily: Record<string, { opens: number; matches: number; devices: Set<string> }> = {};
    const decks: Record<string, { matches: number; wins: number }> = {};
    const platforms: Record<string, { opens: number; matches: number }> = {};
    let opens = 0;
    let matches = 0;
    let cpuMatches = 0;
    let onlineMatches = 0;
    let cpuWins = 0;
    let cpuLosses = 0;
    let scans = 0;
    let lineLinks = 0;
    let turnsSum = 0;
    let turnsCount = 0;
    let durSum = 0;
    let durCount = 0;
    for (const ev of events) {
      // UTCのISO分 → 日本時間の日付と時刻
      const jst = new Date(Date.parse(ev.at + ":00Z") + 9 * 3600 * 1000);
      const date = jst.toISOString().slice(0, 10);
      if (date < from || date > to) continue;
      const hour = jst.getUTCHours();
      // 時間帯は 22〜2時 のような日またぎ指定にも対応する
      const inHours = hf <= ht ? hour >= hf && hour <= ht : hour >= hf || hour <= ht;
      if (!inHours) continue;
      devices.add(ev.d);
      const day = (daily[date] ??= { opens: 0, matches: 0, devices: new Set<string>() });
      day.devices.add(ev.d);
      const pf = ev.pf || "不明";
      const pfT = (platforms[pf] ??= { opens: 0, matches: 0 });
      if (ev.ty === "appOpen") {
        opens++;
        day.opens++;
        pfT.opens++;
      } else if (ev.ty === "scan") {
        scans++;
      } else if (ev.ty === "lineLink") {
        lineLinks++;
      } else if (ev.ty === "match") {
        matches++;
        day.matches++;
        pfT.matches++;
        hourly[hour]++;
        if (ev.md === "online") onlineMatches++;
        else {
          cpuMatches++;
          if (ev.rs === "win") cpuWins++;
          else if (ev.rs === "lose") cpuLosses++;
        }
        if (typeof ev.tn === "number") {
          turnsSum += ev.tn;
          turnsCount++;
        }
        if (typeof ev.du === "number") {
          durSum += ev.du;
          durCount++;
        }
        if (ev.dk) {
          const du = (decks[ev.dk] ??= { matches: 0, wins: 0 });
          du.matches++;
          if (ev.rs === "win") du.wins++;
        }
      }
    }
    return {
      generatedAt: this.now().toISOString(),
      from,
      to,
      hourFrom: hf,
      hourTo: ht,
      /** ログの記録が始まった日時（これより前は絞り込めない） */
      recordedSince: events.length > 0 ? events[0].at : null,
      eventCount: events.length,
      opens,
      matches,
      cpuMatches,
      onlineMatches,
      cpuWins,
      cpuLosses,
      cpuWinRate: cpuWins + cpuLosses > 0 ? cpuWins / (cpuWins + cpuLosses) : null,
      scans,
      lineLinks,
      devices: devices.size,
      avgTurns: turnsCount > 0 ? turnsSum / turnsCount : null,
      avgDurationSec: durCount > 0 ? durSum / durCount : null,
      hourly,
      daily: Object.keys(daily)
        .sort()
        .map((date) => ({
          date,
          opens: daily[date].opens,
          matches: daily[date].matches,
          devices: daily[date].devices.size,
        })),
      decks: Object.entries(decks)
        .sort((x, y) => y[1].matches - x[1].matches)
        .slice(0, 10)
        .map(([name, v]) => ({ name, ...v })),
      platforms,
    };
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
    // LINE連携の集計（端末のline状態はappOpenごとに更新されている）
    const allDevices = Object.entries(a.devices);
    const linkedDevices = allDevices.filter(([, d]) => (d as unknown as DeviceExtra).line === true).length;
    const knownStateDevices = allDevices.filter(
      ([, d]) => typeof (d as unknown as DeviceExtra).line === "boolean"
    ).length;
    const activeIds = (n: number) => {
      const set = new Set<string>();
      for (const date of lastNDates(n)) for (const id of a.daily[date]?.devices ?? []) set.add(id);
      return set;
    };
    const linkedIn = (n: number) => {
      let linked = 0;
      let known = 0;
      for (const id of activeIds(n)) {
        const d = a.devices[id] as unknown as DeviceExtra | undefined;
        if (!d || typeof d.line !== "boolean") continue;
        known++;
        if (d.line) linked++;
      }
      return { linked, known };
    };
    // 定着率: 8日以上前に初めて来た端末のうち、直近7日にも来ている割合
    let retBase = 0;
    let retKept = 0;
    {
      const nowMs = this.now().getTime();
      const activeSet = activeIds(7);
      for (const [id, d] of allDevices) {
        if (nowMs - Date.parse(d.first) >= 8 * 86400000) {
          retBase++;
          if (activeSet.has(id)) retKept++;
        }
      }
    }
    const l7 = linkedIn(7);
    const l30 = linkedIn(30);
    const lineDaily = lastNDates(14).map((date) => ({
      date,
      links: a.lineLinks?.daily?.[date] ?? 0,
    }));

    return {
      generatedAt: this.now().toISOString(),
      line: {
        linkedDevices,
        knownStateDevices,
        totalDevices: allDevices.length,
        rate: knownStateDevices > 0 ? linkedDevices / knownStateDevices : null,
        active7: l7,
        rate7: l7.known > 0 ? l7.linked / l7.known : null,
        active30: l30,
        rate30: l30.known > 0 ? l30.linked / l30.known : null,
        linkActionsTotal: a.lineLinks?.total ?? 0,
        linkActionsToday: a.lineLinks?.daily?.[today] ?? 0,
        daily: lineDaily,
      },
      hourly: {
        cpu: a.hourly?.cpu ?? new Array(24).fill(0),
        online: a.hourly?.online ?? new Array(24).fill(0),
      },
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
      // 相性の良い組み合わせ（5戦以上のペアを勝率順に）
      bestPairs: Object.entries(a.pairUsage)
        .filter(([, p]) => p.matches >= 5)
        .sort((x, y) => y[1].wins / y[1].matches - x[1].wins / x[1].matches)
        .slice(0, 12)
        .map(([key, p]) => ({ pair: key.split("|"), matches: p.matches, wins: p.wins })),
      env: a.envTotals,
      platforms: a.platformTotals ?? {},
      decks: Object.entries(a.deckUsage ?? {})
        .sort((x, y) => y[1].matches - x[1].matches)
        .slice(0, 30)
        .map(([name, u]) => ({ name, matches: u.matches, wins: u.wins })),
      byMode: {
        cpu: a.turnsByMode?.cpu ?? null,
        online: a.turnsByMode?.online ?? null,
      },
      weekday: a.weekday ?? new Array(7).fill(0),
      retention: { base: retBase, kept: retKept, rate: retBase > 0 ? retKept / retBase : null },
      // よく使われるペア（使用数順）
      topPairs: Object.entries(a.pairUsage)
        .sort((x, y) => y[1].matches - x[1].matches)
        .slice(0, 12)
        .map(([key, p]) => ({ pair: key.split("|"), matches: p.matches, wins: p.wins })),
      daily: lastNDates(30).map((date) => ({
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

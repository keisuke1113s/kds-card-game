import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Telemetry } from "../core/telemetry";

describe("Telemetry（利用状況の匿名集計）", () => {
  it("起動・対戦・QR登録を集計し、保存して再読み込みできる", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kds-telemetry-"));
    const now = () => new Date("2026-08-28T10:00:00Z");
    const t = new Telemetry(dir, now);

    expect(t.track({ type: "appOpen", deviceId: "d1", env: "prod" })).toBe(true);
    expect(t.track({ type: "appOpen", deviceId: "d2", env: "dev" })).toBe(true);
    expect(
      t.track({
        type: "match",
        deviceId: "d1",
        env: "prod",
        mode: "cpu",
        result: "win",
        difficulty: "hard",
        turns: 8,
        durationSec: 120,
        first: true,
      })
    ).toBe(true);
    t.track({ type: "match", deviceId: "d2", env: "prod", mode: "online", result: "lose", turns: 12 });
    t.track({ type: "scan", deviceId: "d1", env: "prod", cardId: "i_kuji" });
    t.track({ type: "scan", deviceId: "d1", env: "prod", cardId: "i_kuji" });
    // 壊れた入力は無視される
    expect(t.track(null)).toBe(false);
    expect(t.track({ type: "hack" })).toBe(false);
    expect(t.track({ type: "appOpen" })).toBe(false); // deviceId なし

    const s = t.stats() as {
      devices: { total: number; today: number };
      appOpens: { total: number };
      matches: {
        total: number;
        cpu: number;
        online: number;
        cpuWinRate: number | null;
        avgTurns: number | null;
        byDifficulty: Record<string, { matches: number; wins: number }>;
      };
      scans: { total: number; topCards: { cardId: string; count: number }[] };
    };
    expect(s.devices.total).toBe(2);
    expect(s.devices.today).toBe(2);
    expect(s.appOpens.total).toBe(2);
    expect(s.matches.total).toBe(2);
    expect(s.matches.cpu).toBe(1);
    expect(s.matches.online).toBe(1);
    expect(s.matches.cpuWinRate).toBe(1);
    expect(s.matches.avgTurns).toBe(10);
    expect(s.matches.byDifficulty.hard.wins).toBe(1);
    expect(s.scans.total).toBe(2);
    expect(s.scans.topCards[0]).toEqual({ cardId: "i_kuji", count: 2 });

    // 保存 → 別インスタンスで読み込んでも集計が残る
    t.saveNow();
    const t2 = new Telemetry(dir, now);
    const s2 = t2.stats() as typeof s;
    expect(s2.devices.total).toBe(2);
    expect(s2.matches.total).toBe(2);
  });
});

describe("Telemetry.rangeStats（期間・時間帯の絞り込み）", () => {
  interface Range {
    opens: number;
    matches: number;
    cpuWins: number;
    onlineMatches: number;
    devices: number;
    hourly: number[];
    daily: { date: string; matches: number }[];
    recordedSince: string | null;
  }

  it("日本時間の日付と時間帯で絞り込める", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kds-range-"));
    let nowIso = "2026-09-01T01:00:00Z"; // JST 10時
    const t = new Telemetry(dir, () => new Date(nowIso));

    t.track({ type: "appOpen", deviceId: "d1", env: "prod" });
    t.track({ type: "match", deviceId: "d1", env: "prod", mode: "cpu", result: "win", turns: 8 });
    nowIso = "2026-09-01T13:00:00Z"; // JST 22時
    t.track({ type: "match", deviceId: "d2", env: "prod", mode: "online" });
    nowIso = "2026-09-02T01:00:00Z"; // 翌日 JST 10時
    t.track({ type: "match", deviceId: "d1", env: "prod", mode: "cpu", result: "lose" });

    // 9/1のみ・終日
    const day1 = t.rangeStats("2026-09-01", "2026-09-01", 0, 23) as Range;
    expect(day1.matches).toBe(2);
    expect(day1.opens).toBe(1);
    expect(day1.cpuWins).toBe(1);
    expect(day1.onlineMatches).toBe(1);
    expect(day1.devices).toBe(2);
    expect(day1.hourly[10]).toBe(1);
    expect(day1.hourly[22]).toBe(1);

    // 9/1の朝〜昼だけ（10時の対戦だけが入る）
    const morning = t.rangeStats("2026-09-01", "2026-09-01", 6, 12) as Range;
    expect(morning.matches).toBe(1);
    expect(morning.onlineMatches).toBe(0);

    // 日またぎの時間帯（22時〜2時）
    const night = t.rangeStats("2026-09-01", "2026-09-02", 22, 2) as Range;
    expect(night.matches).toBe(1);
    expect(night.onlineMatches).toBe(1);

    // 2日間・終日
    const both = t.rangeStats("2026-09-01", "2026-09-02", 0, 23) as Range;
    expect(both.matches).toBe(3);
    expect(both.daily.length).toBe(2);
    expect(both.recordedSince).toBe("2026-09-01T01:00");
  });
});

import { describe, expect, it } from "vitest";
import { Tourney, TourneyRoomInfo } from "../core/tourney";

/** 部屋の偽物。テストから結果を自由に差し込める */
function fakeRooms() {
  let seq = 0;
  const rooms = new Map<string, TourneyRoomInfo>();
  return {
    adapter: {
      createRoom: () => {
        const code = `R${++seq}`;
        rooms.set(code, {
          started: false,
          joinedDevices: [],
          finished: false,
          winnerDevice: null,
        });
        return { code };
      },
      info: (code: string) => rooms.get(code) ?? null,
    },
    /** 対局を終わらせる */
    finish(code: string, winnerDevice: string) {
      rooms.set(code, { started: true, joinedDevices: [], finished: true, winnerDevice });
    },
    join(code: string, device: string) {
      const r = rooms.get(code);
      if (r) r.joinedDevices.push(device);
    },
    remove(code: string) {
      rooms.delete(code);
    },
  };
}

/** シャッフルなし（並び順のまま）でテストを決定的にする */
const noShuffle = (n: number) => [...Array(n).keys()];

function setup(startAt = 0) {
  let now = startAt;
  const f = fakeRooms();
  const t = new Tourney(f.adapter, () => now, noShuffle);
  return { t, f, tick: (ms: number) => (now += ms) };
}

const join4 = (t: Tourney) => {
  t.join("d1", "A");
  t.join("d2", "B");
  t.join("d3", "C");
  t.join("d4", "D");
};

describe("オンライントーナメント", () => {
  it("4人そろうと準決勝2試合が自動で始まる", () => {
    const { t } = setup();
    t.join("d1", "A");
    expect(t.status("d1").phase).toBe("waiting");
    join4(t);
    const s = t.status("d1");
    expect(s.phase).toBe("semi");
    expect(s.inTournament).toBe(true);
    expect(s.bracket?.semis).toHaveLength(2);
    expect(s.yourMatchCode).toBe("R1");
    expect(t.status("d3").yourMatchCode).toBe("R2");
    // ロビーは空に戻る
    expect(s.lobbyCount).toBe(0);
  });

  it("準決勝の勝者2人で決勝が作られ、勝者が優勝になる", () => {
    const { t, f } = setup();
    join4(t);
    f.finish("R1", "d1");
    f.finish("R2", "d4");
    let s = t.status("d1");
    expect(s.phase).toBe("final");
    expect(s.yourMatchCode).toBe("R3");
    expect(t.status("d4").yourMatchCode).toBe("R3");
    // 敗者は決勝を観戦できる
    const loser = t.status("d2");
    expect(loser.yourMatchCode).toBeNull();
    expect(loser.watchCode).toBe("R3");
    f.finish("R3", "d4");
    s = t.status("d4");
    expect(s.phase).toBe("done");
    expect(s.bracket?.champion).toBe("D");
    expect(s.bracket?.championIsYou).toBe(true);
    expect(t.status("d1").bracket?.championIsYou).toBe(false);
  });

  it("期限までに入室しないと不戦敗になる", () => {
    const { t, f, tick } = setup();
    join4(t);
    f.join("R1", "d1"); // d2 は来ない
    tick(91_000);
    // d3/d4 はハートビートを続けている想定で状況確認
    const s = t.status("d1");
    expect(s.bracket?.semis[0].winner).toBe("A");
  });

  it("片方の準決勝が両者不参加なら、残った勝者がそのまま優勝", () => {
    const { t, f, tick } = setup();
    join4(t);
    f.finish("R1", "d2");
    tick(91_000); // R2 は誰も来ない
    const s = t.status("d2");
    expect(s.phase).toBe("done");
    expect(s.bracket?.champion).toBe("B");
  });

  it("ポーリングが途切れた人はロビーから外れる", () => {
    const { t, tick } = setup();
    t.join("d1", "A");
    t.join("d2", "B");
    tick(13_000);
    t.join("d3", "C"); // join が tick を誘発
    const s = t.status("d3");
    expect(s.lobbyCount).toBe(1);
    expect(s.lobbyNames).toEqual(["C"]);
  });

  it("開催中に5人目が来たら次の回のロビーに並ぶ", () => {
    const { t } = setup();
    join4(t);
    t.join("d5", "E");
    const s = t.status("d5");
    expect(s.phase).toBe("semi");
    expect(s.inTournament).toBe(false);
    expect(s.inLobby).toBe(true);
    expect(s.lobbyCount).toBe(1);
    // 部屋コードは参加者以外に渡さない
    expect(s.yourMatchCode).toBeNull();
    expect(s.watchCode).toBeNull();
  });

  it("対局が終わって部屋が消えても、控えた結果で勝者が決まる", () => {
    const { t, f } = setup();
    join4(t);
    f.finish("R1", "d1");
    t.status("d1"); // ここで lastInfo に控えられる
    f.remove("R1");
    f.finish("R2", "d3");
    const s = t.status("d1");
    expect(s.bracket?.semis[0].winner).toBe("A");
    expect(s.phase).toBe("final");
  });
});

import { describe, expect, it } from "vitest";
import { viewFor } from "../view";
import { act, fieldInst, makeState } from "./helpers";

describe("カード効果", () => {
  it("渋谷(華):【登場時】相手の学科-4（0未満にはならない）", () => {
    const state = makeState({ hand: ["shibuya_hana"] }, { academic: 2 });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[1].academic).toBe(0);
  });

  it("達成済みのトラックもマイナス効果で押し戻せる（達成は確定しない）", () => {
    const state = makeState({ hand: ["shibuya_hana"] }, { academic: 10, skill: 5 });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[1].academic).toBe(6);
  });

  it("武田: 山札上2枚にインストラクターが1枚なら自動で手札へ、残りは山札の下へ", () => {
    const state = makeState({
      hand: ["takeda"],
      deck: ["uketsuke", "sato", "suzuki"], // 上2枚: 受付(サポート), 佐藤(インストラクター)
    });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[0].hand).toContain("sato");
    expect(a.state.players[0].deck).toEqual(["suzuki", "uketsuke"]); // 残りが下へ
    expect(a.state.phase.type).toBe("main");
  });

  it("武田: 2枚ともインストラクターなら選択フェイズになり、選んだ方が手札へ", () => {
    const state = makeState({
      hand: ["takeda"],
      deck: ["sato", "suzuki", "tanaka"],
    });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.phase.type).toBe("choice");
    const b = act(a.state, { type: "resolveChoice", player: 0, optionIndex: 1 });
    expect(b.state.players[0].hand).toContain("suzuki");
    expect(b.state.players[0].deck).toEqual(["tanaka", "sato"]);
    expect(b.state.phase.type).toBe("main");
  });

  it("武田: インストラクターが無ければ2枚とも山札の下へ", () => {
    const state = makeState({
      hand: ["takeda"],
      deck: ["uketsuke", "ouen", "sato"],
    });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[0].hand).not.toContain("uketsuke");
    expect(a.state.players[0].deck).toEqual(["sato", "uketsuke", "ouen"]);
  });

  it("選択中の公開カードは相手のビューから見えない", () => {
    const state = makeState({
      hand: ["takeda"],
      deck: ["sato", "suzuki", "tanaka"],
    });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const oppView = viewFor(a.state, 1);
    expect(oppView.phase.type).toBe("choice");
    if (oppView.phase.type === "choice") {
      expect(oppView.phase.pending.revealed).toEqual([]);
    }
    const selfView = viewFor(a.state, 0);
    if (selfView.phase.type === "choice") {
      expect(selfView.phase.pending.revealed).toEqual(["sato", "suzuki"]);
    }
  });

  it("ミーティング: メインフェイズに使えて1枚引く", () => {
    const state = makeState({ hand: ["meeting"], deck: ["sato", "suzuki"] });
    const a = act(state, { type: "playSupport", player: 0, handIndex: 0 });
    expect(a.state.players[0].hand).toEqual(["sato"]);
    expect(a.state.players[0].outOfPlay).toContain("meeting");
  });

  it("ミーティングはバトル中には使えない", () => {
    const atk = fieldInst("kato");
    const def = fieldInst("ito", { rested: true });
    const state = makeState({ field: [atk] }, { field: [def], hand: ["meeting"] });
    const a = act(state, {
      type: "declareBattle",
      player: 0,
      attackerUid: atk.uid,
      defenderUid: def.uid,
    });
    expect(() => act(a.state, { type: "playSupport", player: 1, handIndex: 0 })).toThrow(
      /バトル中に使えません/
    );
  });

  it("効果によるドローは山札切れでも敗北にならない", () => {
    const state = makeState({ hand: ["meeting"], deck: [] });
    const a = act(state, { type: "playSupport", player: 0, handIndex: 0 });
    expect(a.state.phase.type).toBe("main");
  });

  it("教頭（担当カード）:【自分のターン終了時】学科+1", () => {
    const state = makeState({ tantou: "kyoto" });
    const a = act(state, { type: "endTurn", player: 0 });
    expect(a.state.players[0].academic).toBe(1);
  });

  it("相手のビューには自分の手札と山札の中身が見えない", () => {
    const state = makeState({ hand: ["sato", "uketsuke"] });
    const v = viewFor(state, 1);
    expect(v.opponent.handCount).toBe(2);
    expect((v.opponent as unknown as { hand?: string[] }).hand).toBeUndefined();
    expect((v.opponent as unknown as { deck?: string[] }).deck).toBeUndefined();
  });
});

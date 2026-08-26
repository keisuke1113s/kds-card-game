import { describe, expect, it } from "vitest";
import { createGame } from "../createGame";
import { ACADEMIC_GOAL, SKILL_GOAL } from "../types";
import { act, ctx, fieldInst, makeState, startedGame } from "./helpers";
import { cpuDeck, defaultDeck } from "@/data/cards";

describe("セットアップ", () => {
  it("両者5枚引いて開始し、先攻はターン開始時に1枚引いて6枚になる", () => {
    const { state } = startedGame(7, 0);
    expect(state.players[0].hand.length).toBe(6);
    expect(state.players[1].hand.length).toBe(5);
    expect(state.phase).toEqual({ type: "main", canPlayInstructor: true });
    expect(state.turnPlayer).toBe(0);
  });

  it("マリガンで手札を引き直せる", () => {
    const { state } = createGame(ctx, {
      seed: 7,
      decks: [defaultDeck, cpuDeck],
      firstPlayer: 0,
    });
    const before = [...state.players[0].hand];
    const a = act(state, { type: "mulligan", player: 0, redraw: true });
    expect(a.state.players[0].hand.length).toBe(5);
    expect(a.state.players[0].hand).not.toEqual(before);
  });

  it("不正なデッキ（20枚未満）は開始できない", () => {
    expect(() =>
      createGame(ctx, {
        seed: 1,
        decks: [{ main: ["i_okumura", "i_iida"], tantou: "t_sasaki" }, defaultDeck],
      })
    ).toThrow(/20枚以上/);
  });

  it("担当カードでサポート上限が7枚になる（佐々木系）", () => {
    // defaultDeck のサポート5枚に2枚足して7枚に
    const deck7 = {
      main: [...defaultDeck.main, "s_iwase", "s_morita"],
      tantou: "t_sasaki", // supportLimit 7
    };
    expect(() =>
      createGame(ctx, { seed: 1, decks: [deck7, cpuDeck] })
    ).not.toThrow();
    // 通常の担当だと7枚はエラー
    expect(() =>
      createGame(ctx, { seed: 1, decks: [{ ...deck7, tantou: "t_kuji" }, cpuDeck] })
    ).toThrow(/サポートカードは5枚以下/);
  });
});

describe("メインフェイズ", () => {
  it("インストラクターは1ターンに1枚しか出せない", () => {
    const state = makeState({ hand: ["i_okumura", "i_iida"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(() =>
      act(a.state, { type: "playInstructor", player: 0, handIndex: 0 })
    ).toThrow(/最初だけ/);
  });

  it("行動を始めた後はインストラクターを出せない", () => {
    const inst = fieldInst("i_okumura");
    const state = makeState({ hand: ["i_iida"], field: [inst] });
    const a = act(state, {
      type: "instructorAction",
      player: 0,
      uid: inst.uid,
      action: "skill",
    });
    expect(() =>
      act(a.state, { type: "playInstructor", player: 0, handIndex: 0 })
    ).toThrow(/最初だけ/);
  });

  it("登場したターンにそのまま行動できる（召喚酔いなし）", () => {
    const state = makeState({ hand: ["i_okumura"] }); // 奥村 3/3 効果なし
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const uid = a.state.players[0].field[0].uid;
    const b = act(a.state, { type: "instructorAction", player: 0, uid, action: "academic" });
    expect(b.state.players[0].academic).toBe(3);
  });

  it("教習した後は休憩状態になり、再行動できない", () => {
    const inst = fieldInst("i_okumura");
    const state = makeState({ field: [inst] });
    const a = act(state, { type: "instructorAction", player: 0, uid: inst.uid, action: "skill" });
    expect(a.state.players[0].field[0].rested).toBe(true);
    expect(() =>
      act(a.state, { type: "instructorAction", player: 0, uid: inst.uid, action: "skill" })
    ).toThrow(/行動済み/);
  });

  it("なにもしない場合は元気状態のまま", () => {
    const inst = fieldInst("i_okumura");
    const state = makeState({ field: [inst] });
    const a = act(state, { type: "instructorAction", player: 0, uid: inst.uid, action: "doNothing" });
    expect(a.state.players[0].field[0].rested).toBe(false);
    expect(a.state.players[0].field[0].actedThisTurn).toBe(true);
  });

  it("残り時限を超える教習力は切り捨てられる", () => {
    const inst = fieldInst("i_konno"); // 教4
    const state = makeState({ field: [inst], academic: ACADEMIC_GOAL - 1 });
    const a = act(state, { type: "instructorAction", player: 0, uid: inst.uid, action: "academic" });
    expect(a.state.players[0].academic).toBe(ACADEMIC_GOAL);
    expect(a.state.phase.type).toBe("main");
  });
});

describe("勝敗", () => {
  it("学科と技能の両方を達成したら勝利", () => {
    const inst = fieldInst("i_okumura");
    const state = makeState({
      field: [inst],
      academic: ACADEMIC_GOAL,
      skill: SKILL_GOAL - 1,
    });
    const a = act(state, { type: "instructorAction", player: 0, uid: inst.uid, action: "skill" });
    expect(a.state.phase).toEqual({
      type: "finished",
      winner: 0,
      reason: "bothTracksComplete",
    });
  });

  it("ターン開始時に山札が引けなければ敗北", () => {
    const state = makeState({}, { deck: [] });
    const a = act(state, { type: "endTurn", player: 0 });
    expect(a.state.phase).toEqual({ type: "finished", winner: 0, reason: "deckOut" });
  });

  it("ターン交代で新しいターンプレイヤーのインストラクターが元気になる", () => {
    const inst = fieldInst("i_okumura", { rested: true, actedThisTurn: true });
    const state = makeState({}, { field: [inst] });
    const a = act(state, { type: "endTurn", player: 0 });
    expect(a.state.turnPlayer).toBe(1);
    expect(a.state.players[1].field[0].rested).toBe(false);
    expect(a.state.players[1].field[0].actedThisTurn).toBe(false);
  });
});

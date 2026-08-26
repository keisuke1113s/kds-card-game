import { describe, expect, it } from "vitest";
import { createGame } from "../createGame";
import { ACADEMIC_GOAL, SKILL_GOAL } from "../types";
import { act, ctx, fieldInst, makeState, startedGame } from "./helpers";
import { defaultDeck } from "@/data/cards";

describe("セットアップ", () => {
  it("両者5枚引いて開始し、先攻はターン開始時に1枚引いて6枚になる", () => {
    const { state } = startedGame(7, 0);
    expect(state.players[0].hand.length).toBe(6); // 5 + スタートフェイズの1枚
    expect(state.players[1].hand.length).toBe(5);
    expect(state.phase).toEqual({ type: "main", canPlayInstructor: true });
    expect(state.turnPlayer).toBe(0);
  });

  it("マリガンで手札を引き直せる", () => {
    const { state } = createGame(ctx, {
      seed: 7,
      decks: [defaultDeck, defaultDeck],
      firstPlayer: 0,
    });
    const before = [...state.players[0].hand];
    const a = act(state, { type: "mulligan", player: 0, redraw: true });
    expect(a.state.players[0].hand.length).toBe(5);
    // 引き直し後も総カード数は不変
    expect(a.state.players[0].deck.length + 5).toBe(state.players[0].deck.length + 5);
    expect(a.state.players[0].hand).not.toEqual(before); // seed7では変化する
  });

  it("不正なデッキ（20枚未満）は開始できない", () => {
    expect(() =>
      createGame(ctx, {
        seed: 1,
        decks: [{ main: ["sato", "suzuki"], tantou: "kocho" }, defaultDeck],
      })
    ).toThrow(/20枚以上/);
  });
});

describe("メインフェイズ", () => {
  it("インストラクターは1ターンに1枚しか出せない", () => {
    const state = makeState({ hand: ["sato", "suzuki"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(() =>
      act(a.state, { type: "playInstructor", player: 0, handIndex: 0 })
    ).toThrow(/最初だけ/);
  });

  it("行動を始めた後はインストラクターを出せない", () => {
    const inst = fieldInst("tanaka");
    const state = makeState({ hand: ["sato"], field: [inst] });
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
    const state = makeState({ hand: ["watanabe"] }); // 渡辺 戦2教3
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const uid = a.state.players[0].field[0].uid;
    const b = act(a.state, {
      type: "instructorAction",
      player: 0,
      uid,
      action: "academic",
    });
    expect(b.state.players[0].academic).toBe(3);
  });

  it("教習した後は休憩状態になり、再行動できない", () => {
    const inst = fieldInst("ito");
    const state = makeState({ field: [inst] });
    const a = act(state, {
      type: "instructorAction",
      player: 0,
      uid: inst.uid,
      action: "skill",
    });
    expect(a.state.players[0].field[0].rested).toBe(true);
    expect(() =>
      act(a.state, { type: "instructorAction", player: 0, uid: inst.uid, action: "skill" })
    ).toThrow(/行動済み/);
  });

  it("なにもしない場合は元気状態のまま", () => {
    const inst = fieldInst("ito");
    const state = makeState({ field: [inst] });
    const a = act(state, {
      type: "instructorAction",
      player: 0,
      uid: inst.uid,
      action: "doNothing",
    });
    expect(a.state.players[0].field[0].rested).toBe(false);
    expect(a.state.players[0].field[0].actedThisTurn).toBe(true);
  });

  it("残り時限を超える教習力は切り捨てられる", () => {
    const inst = fieldInst("yamamoto"); // 教4
    const state = makeState({ field: [inst], academic: ACADEMIC_GOAL - 1 });
    const a = act(state, {
      type: "instructorAction",
      player: 0,
      uid: inst.uid,
      action: "academic",
    });
    expect(a.state.players[0].academic).toBe(ACADEMIC_GOAL);
    // 技能が未達成なので勝利にはならない
    expect(a.state.phase.type).toBe("main");
  });
});

describe("勝敗", () => {
  it("学科と技能の両方を達成したら勝利", () => {
    const inst = fieldInst("sato"); // 教1
    const state = makeState({
      field: [inst],
      academic: ACADEMIC_GOAL,
      skill: SKILL_GOAL - 1,
    });
    const a = act(state, {
      type: "instructorAction",
      player: 0,
      uid: inst.uid,
      action: "skill",
    });
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
    const inst = fieldInst("ito", { rested: true, actedThisTurn: true });
    const state = makeState({}, { field: [inst] });
    const a = act(state, { type: "endTurn", player: 0 });
    expect(a.state.turnPlayer).toBe(1);
    expect(a.state.players[1].field[0].rested).toBe(false);
    expect(a.state.players[1].field[0].actedThisTurn).toBe(false);
  });
});

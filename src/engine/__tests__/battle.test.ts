import { describe, expect, it } from "vitest";
import { act, fieldInst, makeState } from "./helpers";
import { GameState } from "../types";

// 効果を持たない/バトルに干渉しない実カードで素のバトルルールを検証する
// i_sato 3/3, i_tomino 2/2, i_suwa 2/2, i_okumura 3/3, i_umemoto 3/3

function declare(state: GameState, attackerUid: string, defenderUid: string) {
  return act(state, { type: "declareBattle", player: 0, attackerUid, defenderUid });
}

describe("バトル", () => {
  it("元気状態の相手にはバトルを仕掛けられない", () => {
    const attacker = fieldInst("i_sato");
    const defender = fieldInst("i_tomino", { rested: false });
    const state = makeState({ field: [attacker] }, { field: [defender] });
    expect(() => declare(state, attacker.uid, defender.uid)).toThrow(/休憩状態/);
  });

  it("休憩中のインストラクターはバトルを仕掛けられない", () => {
    const attacker = fieldInst("i_sato", { rested: true });
    const defender = fieldInst("i_tomino", { rested: true });
    const state = makeState({ field: [attacker] }, { field: [defender] });
    expect(() => declare(state, attacker.uid, defender.uid)).toThrow(/休憩中/);
  });

  it("宣言した攻撃側は即座に休憩状態になり、優先権は防御側から", () => {
    const attacker = fieldInst("i_sato"); // 戦3
    const defender = fieldInst("i_tomino", { rested: true }); // 戦2
    const state = makeState({ field: [attacker] }, { field: [defender] });
    const a = declare(state, attacker.uid, defender.uid);
    expect(a.state.players[0].field[0].rested).toBe(true);
    expect(a.state.phase.type).toBe("battleSupport");
    if (a.state.phase.type === "battleSupport") {
      expect(a.state.phase.battle.priority).toBe(1);
    }
  });

  it("両者パスで解決され、戦闘力の低い方が場外へ", () => {
    const attacker = fieldInst("i_sato"); // 戦3
    const defender = fieldInst("i_tomino", { rested: true }); // 戦2
    const state = makeState({ field: [attacker] }, { field: [defender] });
    let r = declare(state, attacker.uid, defender.uid);
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[1].field.length).toBe(0);
    expect(r.state.players[1].outOfPlay).toContain("i_tomino");
    expect(r.state.players[0].field.length).toBe(1);
    expect(r.state.phase).toEqual({ type: "main", canPlayInstructor: false });
  });

  it("戦闘力が同じ場合は両方退場", () => {
    const atk = fieldInst("i_tomino"); // 戦2
    const def = fieldInst("i_suwa", { rested: true }); // 戦2
    const s = makeState({ field: [atk] }, { field: [def] });
    let r = declare(s, atk.uid, def.uid);
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[0].field.length).toBe(0);
    expect(r.state.players[1].field.length).toBe(0);
  });

  it("防御側がサポートカードで逆転できる（上野 戦+2）", () => {
    const attacker = fieldInst("i_sato"); // 戦3
    const defender = fieldInst("i_tomino", { rested: true }); // 戦2 → +2 = 4
    const state = makeState({ field: [attacker] }, { field: [defender], hand: ["s_ueno"] });
    let r = declare(state, attacker.uid, defender.uid);
    r = act(r.state, { type: "playSupport", player: 1, handIndex: 0 });
    r = act(r.state, { type: "passSupport", player: 0 });
    r = act(r.state, { type: "passSupport", player: 1 });
    expect(r.state.players[0].field.length).toBe(0);
    expect(r.state.players[1].field.length).toBe(1);
    expect(r.state.players[1].outOfPlay).toContain("s_ueno");
  });

  it("サポートの応酬: 防御→攻撃→防御と交互に出し合える", () => {
    const attacker = fieldInst("i_sato"); // 3 + 2 = 5
    const defender = fieldInst("i_okumura", { rested: true }); // 3 + 2 = 5 → 両者退場
    const state = makeState(
      { field: [attacker], hand: ["s_nakamura"] },
      { field: [defender], hand: ["s_ueno"] }
    );
    let r = declare(state, attacker.uid, defender.uid);
    r = act(r.state, { type: "playSupport", player: 1, handIndex: 0 });
    r = act(r.state, { type: "playSupport", player: 0, handIndex: 0 });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[0].field.length).toBe(0);
    expect(r.state.players[1].field.length).toBe(0);
  });

  it("バトル1回ごとにサポートのバフはリセットされる", () => {
    const atk1 = fieldInst("i_tomino"); // 2 + 2 = 4 > 3
    const atk2 = fieldInst("i_sato"); // 3 vs 2 素で勝つ
    const def1 = fieldInst("i_okumura", { rested: true }); // 3
    const def2 = fieldInst("i_suwa", { rested: true }); // 2
    const state = makeState(
      { field: [atk1, atk2], hand: ["s_ueno"] },
      { field: [def1, def2] }
    );
    let r = act(state, { type: "declareBattle", player: 0, attackerUid: atk1.uid, defenderUid: def1.uid });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "playSupport", player: 0, handIndex: 0 });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[1].field.map((f) => f.uid)).toEqual([def2.uid]);

    r = act(r.state, { type: "declareBattle", player: 0, attackerUid: atk2.uid, defenderUid: def2.uid });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[0].field.some((f) => f.uid === atk2.uid)).toBe(true);
    expect(r.state.players[1].field.length).toBe(0);
  });

  it("飯田は登場したターンにアタックできない", () => {
    const state = makeState({ hand: ["i_iida"] }, { field: [fieldInst("i_tomino", { rested: true })] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const iida = a.state.players[0].field[0];
    const target = a.state.players[1].field[0];
    expect(() =>
      act(a.state, { type: "declareBattle", player: 0, attackerUid: iida.uid, defenderUid: target.uid })
    ).toThrow(/登場したターン/);
    // 翌ターン以降は可能（enteredThisTurn が消える）
    const iida2 = fieldInst("i_iida", { enteredThisTurn: false });
    const s2 = makeState({ field: [iida2] }, { field: [fieldInst("i_tomino", { rested: true })] });
    const t = s2.players[1].field[0];
    expect(() =>
      act(s2, { type: "declareBattle", player: 0, attackerUid: iida2.uid, defenderUid: t.uid })
    ).not.toThrow();
  });

  it("志萱のバトル中、志萱の持ち主はサポートを使えない（相手は使える）", () => {
    const shigaya = fieldInst("i_shigaya"); // 戦5
    const defender = fieldInst("i_okumura", { rested: true });
    const state = makeState(
      { field: [shigaya], hand: ["s_ueno"] },
      { field: [defender], hand: ["s_iwase"] }
    );
    let r = act(state, { type: "declareBattle", player: 0, attackerUid: shigaya.uid, defenderUid: defender.uid });
    // 防御側（相手）はサポートを使える
    r = act(r.state, { type: "playSupport", player: 1, handIndex: 0 });
    // 自分（志萱の持ち主）は使えない
    expect(() => act(r.state, { type: "playSupport", player: 0, handIndex: 0 })).toThrow(
      /このバトル中はサポートカードを使えません/
    );
  });
});

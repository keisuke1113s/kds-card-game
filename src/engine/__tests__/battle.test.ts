import { describe, expect, it } from "vitest";
import { act, fieldInst, makeState } from "./helpers";
import { GameState } from "../types";

function battleSetup(opts: {
  attackerCard?: string;
  defenderCard?: string;
  p0Hand?: string[];
  p1Hand?: string[];
}) {
  const attacker = fieldInst(opts.attackerCard ?? "kato"); // 戦3
  const defender = fieldInst(opts.defenderCard ?? "ito", { rested: true }); // 戦2
  const state = makeState(
    { field: [attacker], hand: opts.p0Hand ?? [] },
    { field: [defender], hand: opts.p1Hand ?? [] }
  );
  return { attacker, defender, state };
}

function declare(state: GameState, attackerUid: string, defenderUid: string) {
  return act(state, {
    type: "declareBattle",
    player: 0,
    attackerUid,
    defenderUid,
  });
}

describe("バトル", () => {
  it("元気状態の相手にはバトルを仕掛けられない", () => {
    const attacker = fieldInst("kato");
    const defender = fieldInst("ito", { rested: false });
    const state = makeState({ field: [attacker] }, { field: [defender] });
    expect(() => declare(state, attacker.uid, defender.uid)).toThrow(/休憩状態/);
  });

  it("休憩中のインストラクターはバトルを仕掛けられない", () => {
    const attacker = fieldInst("kato", { rested: true });
    const defender = fieldInst("ito", { rested: true });
    const state = makeState({ field: [attacker] }, { field: [defender] });
    expect(() => declare(state, attacker.uid, defender.uid)).toThrow(/休憩中/);
  });

  it("宣言した攻撃側は即座に休憩状態になり、優先権は防御側から", () => {
    const { attacker, defender, state } = battleSetup({});
    const a = declare(state, attacker.uid, defender.uid);
    expect(a.state.players[0].field[0].rested).toBe(true);
    expect(a.state.phase.type).toBe("battleSupport");
    if (a.state.phase.type === "battleSupport") {
      expect(a.state.phase.battle.priority).toBe(1); // 防御側
    }
  });

  it("両者パスで解決され、戦闘力の低い方が場外へ", () => {
    const { attacker, defender, state } = battleSetup({}); // 戦3 vs 戦2
    let r = declare(state, attacker.uid, defender.uid);
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[1].field.length).toBe(0); // 防御側退場
    expect(r.state.players[1].outOfPlay).toContain("ito");
    expect(r.state.players[0].field.length).toBe(1); // 攻撃側は残る
    expect(r.state.phase).toEqual({ type: "main", canPlayInstructor: false });
  });

  it("戦闘力が同じ場合は両方退場", () => {
    const { attacker, defender, state } = battleSetup({
      attackerCard: "ito", // 戦2
      defenderCard: "kobayashi", // 戦3... 同値にするため defense uses ito? use tanaka 戦2
    });
    // 戦2 vs 戦2 にする
    const atk = fieldInst("ito");
    const def = fieldInst("tanaka", { rested: true });
    const s = makeState({ field: [atk] }, { field: [def] });
    let r = declare(s, atk.uid, def.uid);
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[0].field.length).toBe(0);
    expect(r.state.players[1].field.length).toBe(0);
    void attacker;
    void defender;
    void state;
  });

  it("防御側がサポートカードで逆転できる（受付 戦+2）", () => {
    const { attacker, defender, state } = battleSetup({
      p1Hand: ["uketsuke"], // 戦3 vs 戦2+2=4
    });
    let r = declare(state, attacker.uid, defender.uid);
    r = act(r.state, { type: "playSupport", player: 1, handIndex: 0 });
    // プレイ後、優先権は相手（攻撃側）へ
    r = act(r.state, { type: "passSupport", player: 0 });
    r = act(r.state, { type: "passSupport", player: 1 });
    expect(r.state.players[0].field.length).toBe(0); // 攻撃側が退場
    expect(r.state.players[1].field.length).toBe(1);
    expect(r.state.players[1].outOfPlay).toContain("uketsuke"); // 使用済みサポートは場外
  });

  it("サポートの応酬: 防御→攻撃→防御と交互に出し合える", () => {
    const { attacker, defender, state } = battleSetup({
      p0Hand: ["ouen"], // 攻撃 3+1=4
      p1Hand: ["uketsuke"], // 防御 2+2=4 → 同値で両者退場
    });
    let r = declare(state, attacker.uid, defender.uid);
    r = act(r.state, { type: "playSupport", player: 1, handIndex: 0 });
    r = act(r.state, { type: "playSupport", player: 0, handIndex: 0 });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[0].field.length).toBe(0);
    expect(r.state.players[1].field.length).toBe(0);
  });

  it("バトル1回ごとにバフはリセットされる（持ち越さない）", () => {
    // 1戦目で受付+2を使い、2戦目は素の戦闘力で解決されること
    const atk1 = fieldInst("tanaka"); // 戦2
    const atk2 = fieldInst("kato"); // 戦3
    const def1 = fieldInst("nakamura", { rested: true }); // 戦3
    const def2 = fieldInst("ito", { rested: true }); // 戦2
    const state = makeState(
      { field: [atk1, atk2], hand: ["uketsuke"] },
      { field: [def1, def2] }
    );
    let r = act(state, {
      type: "declareBattle",
      player: 0,
      attackerUid: atk1.uid,
      defenderUid: def1.uid,
    });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "playSupport", player: 0, handIndex: 0 }); // 2+2=4 > 3
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[1].field.map((f) => f.uid)).toEqual([def2.uid]);

    // 2戦目: kato(3) vs ito(2) — バフなしで攻撃側勝利、かつ攻撃側は残る
    r = act(r.state, {
      type: "declareBattle",
      player: 0,
      attackerUid: atk2.uid,
      defenderUid: def2.uid,
    });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[0].field.some((f) => f.uid === atk2.uid)).toBe(true);
    expect(r.state.players[1].field.length).toBe(0);
  });
});

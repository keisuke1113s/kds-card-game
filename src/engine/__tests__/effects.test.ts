import { describe, expect, it } from "vitest";
import { viewFor } from "../view";
import { act, choose, ctx, fieldInst, makeState } from "./helpers";
import { GameState } from "../types";
import { getLegalActions } from "../legalActions";

function jankenBoth(state: GameState, first: number, second: number) {
  let r = choose(state, first);
  return choose(r.state, second);
}

describe("トラック操作系", () => {
  it("渋谷（華）:【登場時】相手の学科-4（0未満にはならない）", () => {
    const state = makeState({ hand: ["i_shibuya_hana"] }, { academic: 2 });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[1].academic).toBe(0);
  });

  it("渋谷:【登場時】相手の技能と学科-2", () => {
    const state = makeState({ hand: ["i_shibuya"] }, { academic: 5, skill: 5 });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[1].academic).toBe(3);
    expect(a.state.players[1].skill).toBe(3);
  });

  it("達成済みのトラックも押し戻せる（達成は確定しない）", () => {
    const state = makeState({ hand: ["i_shibuya_hana"] }, { academic: 10, skill: 5 });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[1].academic).toBe(6);
  });

  it("金野:【登場時】自分の学科+2", () => {
    const state = makeState({ hand: ["i_konno"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[0].academic).toBe(2);
  });

  it("浜田:【ターン終了時】学科か技能を選んで+1", () => {
    const state = makeState({ field: [fieldInst("i_hamada")] });
    const a = act(state, { type: "endTurn", player: 0 });
    expect(a.state.phase.type).toBe("choice");
    const b = choose(a.state, 1); // 技能
    expect(b.state.players[0].skill).toBe(1);
    expect(b.state.turnPlayer).toBe(1); // ターン交代まで進む
  });
});

describe("じゃんけん", () => {
  it("小田: 勝ったら相手を退場、負けたら自分が退場", () => {
    // グー(0) vs チョキ(1) = 勝ち
    const target = fieldInst("i_tomino");
    const state = makeState({ hand: ["i_oda"] }, { field: [target] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.phase.type).toBe("choice");
    const won = jankenBoth(a.state, 0, 1);
    expect(won.state.players[1].field.length).toBe(0);
    expect(won.state.players[0].field.length).toBe(1);

    // チョキ(1) vs グー(0) = 負け → 小田退場
    const b = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const lost = jankenBoth(b.state, 1, 0);
    expect(lost.state.players[0].field.length).toBe(0);
    expect(lost.state.players[1].field.length).toBe(1);
  });

  it("あいこの場合はもう一度", () => {
    const state = makeState({ hand: ["i_kataoka"], deck: ["i_okumura", "i_iida", "i_sato"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    // 片岡: 1枚引いてからじゃんけん
    expect(a.state.players[0].hand.length).toBe(1);
    let r = jankenBoth(a.state, 0, 0); // あいこ
    expect(r.state.phase.type).toBe("choice"); // まだ続く
    r = jankenBoth(r.state, 0, 1); // 勝ち → もう1枚
    expect(r.state.players[0].hand.length).toBe(2);
  });

  it("梨本: 教習時にじゃんけん勝ちで教習力+2", () => {
    const inst = fieldInst("i_nashimoto"); // 教4
    const state = makeState({ field: [inst] });
    const a = act(state, { type: "instructorAction", player: 0, uid: inst.uid, action: "skill" });
    expect(a.state.phase.type).toBe("choice");
    const won = jankenBoth(a.state, 0, 1);
    expect(won.state.players[0].skill).toBe(6); // 4 + 2

    const b = act(state, { type: "instructorAction", player: 0, uid: inst.uid, action: "skill" });
    const lost = jankenBoth(b.state, 1, 0);
    expect(lost.state.players[0].skill).toBe(4);
  });

  it("福本: アタック時じゃんけん勝ちでこのバトル中+2", () => {
    const fuku = fieldInst("i_fukumoto"); // 戦4
    const def = fieldInst("i_iida", { rested: true }); // 戦5
    const state = makeState({ field: [fuku] }, { field: [def] });
    const a = act(state, { type: "declareBattle", player: 0, attackerUid: fuku.uid, defenderUid: def.uid });
    let r = jankenBoth(a.state, 0, 1); // 勝ち → 4+2=6 > 5
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    expect(r.state.players[0].field.length).toBe(1);
    expect(r.state.players[1].field.length).toBe(0);
    // バトル後にバフは消える
    expect(r.state.combatMods.filter((m) => m.until === "battleEnd").length).toBe(0);
  });
});

describe("退場・除去系", () => {
  it("久慈: 起動能力で自分を休憩して相手を1人退場（ターン1回）", () => {
    const kuji = fieldInst("i_kuji");
    const target = fieldInst("i_tomino");
    const state = makeState({ field: [kuji] }, { field: [target] });
    const a = act(state, { type: "activateAbility", player: 0, uid: kuji.uid });
    expect(a.state.players[1].field.length).toBe(0);
    expect(a.state.players[0].field[0].rested).toBe(true);
    // 休憩中はもう使えない（コスト払えない）
    expect(() => act(a.state, { type: "activateAbility", player: 0, uid: kuji.uid })).toThrow();
  });

  it("佐々木:【退場時】相手を1人道連れにする", () => {
    const sasaki = fieldInst("i_sasaki", { rested: true }); // 戦2 休憩中
    const attacker = fieldInst("i_sato"); // 戦3
    const other = fieldInst("i_tomino");
    const state = makeState({ field: [attacker, other] }, { field: [sasaki] }, { turnPlayer: 0 });
    let r = act(state, { type: "declareBattle", player: 0, attackerUid: attacker.uid, defenderUid: sasaki.uid });
    r = act(r.state, { type: "passSupport", player: 1 });
    r = act(r.state, { type: "passSupport", player: 0 });
    // 佐々木が負けて退場 → 退場時効果で相手（プレイヤー0）を1人選んで退場
    expect(r.state.phase.type).toBe("choice");
    const done = choose(r.state, 0); // 攻撃した i_sato を道連れ
    expect(done.state.players[1].field.length).toBe(0);
    expect(done.state.players[0].field.length).toBe(1);
  });

  it("井関: 自分と相手の場の井関以外を全て退場させる", () => {
    const own = fieldInst("i_tomino");
    const opp1 = fieldInst("i_suwa");
    const opp2 = fieldInst("i_sato");
    const state = makeState({ hand: ["i_iseki"], field: [own] }, { field: [opp1, opp2] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[0].field.map((f) => f.cardId)).toEqual(["i_iseki"]);
    expect(a.state.players[1].field.length).toBe(0);
  });

  it("井関: 相手の場の井関は退場させない（同名カードは両者の場で残る）", () => {
    const oppIseki = fieldInst("i_iseki");
    const oppOther = fieldInst("i_tomino");
    const state = makeState({ hand: ["i_iseki"] }, { field: [oppIseki, oppOther] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[0].field.map((f) => f.cardId)).toEqual(["i_iseki"]);
    expect(a.state.players[1].field.map((f) => f.cardId)).toEqual(["i_iseki"]);
  });

  it("奥村は相手の効果で場を離れない（井関のリセットにも耐える）", () => {
    const okumura = fieldInst("i_okumura");
    const state = makeState({ hand: ["i_iseki"] }, { field: [okumura] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[1].field.map((f) => f.cardId)).toEqual(["i_okumura"]);
  });

  it("本間: バトル中の両者を退場させ、バトルは中断される", () => {
    const attacker = fieldInst("i_sato");
    const defender = fieldInst("i_tomino", { rested: true });
    const state = makeState({ field: [attacker] }, { field: [defender], hand: ["s_honma"] });
    let r = act(state, { type: "declareBattle", player: 0, attackerUid: attacker.uid, defenderUid: defender.uid });
    r = act(r.state, { type: "playSupport", player: 1, handIndex: 0 });
    expect(r.state.players[0].field.length).toBe(0);
    expect(r.state.players[1].field.length).toBe(0);
    expect(r.state.phase).toEqual({ type: "main", canPlayInstructor: false });
  });

  it("渡辺（勉）: 相手の休憩中インストラクターを手札に戻す", () => {
    const rested = fieldInst("i_tomino", { rested: true });
    const state = makeState({ hand: ["i_watanabe_tsutomu"] }, { field: [rested] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[1].field.length).toBe(0);
    expect(a.state.players[1].hand).toContain("i_tomino");
    expect(a.state.players[1].outOfPlay.length).toBe(0);
  });
});

describe("手札・山札操作系", () => {
  it("武田: 山札の上2枚からインストラクターを選んで手札へ", () => {
    const state = makeState({
      hand: ["i_takeda"],
      deck: ["i_okumura", "i_iida", "i_sato"],
    });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.phase.type).toBe("choice");
    const b = choose(a.state, 1); // i_iida
    expect(b.state.players[0].hand).toContain("i_iida");
    expect(b.state.players[0].deck).toEqual(["i_sato", "i_okumura"]);
  });

  it("大柳: 1枚引いて1枚捨てる", () => {
    const state = makeState({ hand: ["i_oyanagi"], deck: ["i_sato", "i_iida"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    // 手札は引いた i_sato 1枚のみ → 自動で捨てられる
    expect(a.state.players[0].outOfPlay).toContain("i_sato");
    expect(a.state.players[0].hand.length).toBe(0);
  });

  it("寺島: 3枚引いて2枚を山札の下へ（2回選択）", () => {
    const state = makeState({
      hand: ["i_terashima"],
      deck: ["i_sato", "i_iida", "i_okumura", "i_tomino"],
    });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.players[0].hand.length).toBe(3);
    expect(a.state.phase.type).toBe("choice");
    const b = choose(a.state, 0); // i_sato を下へ
    expect(b.state.phase.type).toBe("choice"); // もう1枚
    const c = choose(b.state, 0); // i_iida を下へ
    expect(c.state.players[0].hand).toEqual(["i_okumura"]);
    expect(c.state.players[0].deck).toEqual(["i_tomino", "i_sato", "i_iida"]);
  });

  it("佐藤: 相手の手札を見て1枚場外へ", () => {
    const state = makeState({ hand: ["i_sato"] }, { hand: ["i_iida", "i_tomino"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.phase.type).toBe("choice");
    if (a.state.phase.type === "choice") {
      // 選択肢に相手の手札が見えている
      expect(a.state.phase.pending.options.map((o) => o.cardId)).toEqual(["i_iida", "i_tomino"]);
    }
    const b = choose(a.state, 0);
    expect(b.state.players[1].hand).toEqual(["i_tomino"]);
    expect(b.state.players[1].outOfPlay).toContain("i_iida");
  });

  it("伊藤: 場外からインストラクターを回収", () => {
    const state = makeState({ hand: ["i_ito"], outOfPlay: ["s_ueno", "i_tomino"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    // インストラクターは i_tomino のみ → 自動回収
    expect(a.state.players[0].hand).toContain("i_tomino");
    expect(a.state.players[0].outOfPlay).toEqual(["s_ueno"]);
  });

  it("瀧本: 相手の手札を全て見る（イベントに記録）", () => {
    const state = makeState({ hand: ["i_takimoto"] }, { hand: ["i_iida", "i_sato"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.events).toContainEqual({
      type: "handRevealed",
      player: 1,
      cardIds: ["i_iida", "i_sato"],
    });
  });

  it("釧路の夕日: 場外のサポートを山札に戻す", () => {
    const state = makeState({
      hand: ["s_kushiro_yuhi"],
      outOfPlay: ["s_ueno", "i_tomino", "s_iwase"],
      deck: ["i_sato"],
    });
    const a = act(state, { type: "playSupport", player: 0, handIndex: 0 });
    expect(a.state.players[0].deck.length).toBe(3); // 1 + 2
    // 使った釧路の夕日自身と i_tomino は場外に残る
    expect(a.state.players[0].outOfPlay.sort()).toEqual(["i_tomino", "s_kushiro_yuhi"]);
  });
});

describe("召喚系", () => {
  it("富野: 手札の諏訪を続けて登場させる（諏訪の効果も連鎖）", () => {
    const state = makeState({ hand: ["i_tomino", "i_suwa"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    // 富野 → 諏訪 が場に出る。諏訪の【登場時】は手札に富野が無いので不発
    expect(a.state.players[0].field.map((f) => f.cardId).sort()).toEqual(["i_suwa", "i_tomino"]);
    expect(a.state.players[0].hand.length).toBe(0);
  });

  it("田中: 自分を休憩して手札からインストラクターを登場させる", () => {
    const state = makeState({ hand: ["i_tanaka", "i_okumura"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const tanaka = a.state.players[0].field.find((f) => f.cardId === "i_tanaka");
    expect(tanaka?.rested).toBe(true);
    expect(a.state.players[0].field.map((f) => f.cardId).sort()).toEqual(["i_okumura", "i_tanaka"]);
  });
});

describe("修正値・元気化系", () => {
  it("平間: 登場ターン中は戦闘力+3、ターンが終わると消える", () => {
    const state = makeState({ hand: ["i_hirama"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    expect(a.state.combatMods).toHaveLength(1);
    const b = act(a.state, { type: "endTurn", player: 0 });
    expect(b.state.combatMods).toHaveLength(0);
  });

  it("永山: このターン中、場全体の教習力+1", () => {
    const i1 = fieldInst("i_tomino"); // 教2
    const state = makeState({ hand: ["s_nagayama"], field: [i1] });
    const a = act(state, { type: "playSupport", player: 0, handIndex: 0 });
    const b = act(a.state, { type: "instructorAction", player: 0, uid: i1.uid, action: "skill" });
    expect(b.state.players[0].skill).toBe(3); // 2 + 1
  });

  it("永山: 全員休憩中は出せない（教習できる相手がいない）", () => {
    const i1 = fieldInst("i_tomino", { rested: true });
    const state = makeState({ hand: ["s_nagayama"], field: [i1] });
    const legal = getLegalActions(ctx, state, 0);
    expect(legal.some((a) => a.type === "playSupport")).toBe(false);
    // 元気なインストラクターがいれば出せる
    const i2 = fieldInst("i_oda");
    const state2 = makeState({ hand: ["s_nagayama"], field: [i1, i2] });
    const legal2 = getLegalActions(ctx, state2, 0);
    expect(legal2.some((a) => a.type === "playSupport")).toBe(true);
  });

  it("担当タイプA: 全員休憩中は起動できない（教習できる相手がいない）", () => {
    const i1 = fieldInst("i_tomino", { rested: true });
    // 担当 t_kuji はタイプA（教習力+1）
    const state = makeState({ hand: [], field: [i1], tantou: "t_kuji" });
    const legal = getLegalActions(ctx, state, 0);
    expect(legal.some((a) => a.type === "activateAbility" && a.uid === undefined)).toBe(false);
    const i2 = fieldInst("i_oda");
    const state2 = makeState({ hand: [], field: [i1, i2], tantou: "t_kuji" });
    const legal2 = getLegalActions(ctx, state2, 0);
    expect(legal2.some((a) => a.type === "activateAbility" && a.uid === undefined)).toBe(true);
  });

  it("送迎サポート: ターン終了時にインストラクターを1人元気にする", () => {
    const i1 = fieldInst("i_tomino");
    const state = makeState({ hand: ["s_sato"], field: [i1] });
    let r = act(state, { type: "playSupport", player: 0, handIndex: 0 });
    r = act(r.state, { type: "instructorAction", player: 0, uid: i1.uid, action: "skill" });
    expect(r.state.players[0].field[0].rested).toBe(true);
    r = act(r.state, { type: "endTurn", player: 0 });
    // 唯一の休憩中インストラクターが自動で元気化されてからターンが渡る
    expect(r.state.turnPlayer).toBe(1);
    expect(r.state.players[0].field[0].rested).toBe(false);
  });

  it("渡邊（孝）:【ターン終了時】自分を元気状態にする", () => {
    const wk = fieldInst("i_watanabe_takashi", { rested: true, actedThisTurn: true });
    const state = makeState({ field: [wk] });
    const a = act(state, { type: "endTurn", player: 0 });
    expect(a.state.players[0].field[0].rested).toBe(false);
  });

  it("担当（田中）: ターン1回、教習力+1", () => {
    const i1 = fieldInst("i_tomino"); // 教2
    const state = makeState({ field: [i1], tantou: "t_tanaka" });
    let r = act(state, { type: "activateAbility", player: 0 });
    expect(() => act(r.state, { type: "activateAbility", player: 0 })).toThrow(); // ターン1回
    r = act(r.state, { type: "instructorAction", player: 0, uid: i1.uid, action: "academic" });
    expect(r.state.players[0].academic).toBe(3); // 2 + 1
  });

  it("担当（武田）: バトル中、アタック側の戦闘力+1", () => {
    const attacker = fieldInst("i_tomino"); // 戦2 → +1 = 3
    const defender = fieldInst("i_okumura", { rested: true }); // 戦3 → 同値で相打ちのはずが…
    const state = makeState({ field: [attacker], tantou: "t_takeda" }, { field: [defender] });
    let r = act(state, { type: "declareBattle", player: 0, attackerUid: attacker.uid, defenderUid: defender.uid });
    r = act(r.state, { type: "passSupport", player: 1 });
    // 自分の優先権で担当能力を起動
    r = act(r.state, { type: "activateAbility", player: 0 });
    r = act(r.state, { type: "passSupport", player: 0 });
    r = act(r.state, { type: "passSupport", player: 1 });
    // 3 vs 3 → 両者退場
    expect(r.state.players[0].field.length).toBe(0);
    expect(r.state.players[1].field.length).toBe(0);
  });
});

describe("情報秘匿", () => {
  it("相手のビューには choice の選択肢が見えない", () => {
    const state = makeState({ hand: ["i_sato"] }, { hand: ["i_iida", "i_tomino"] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const oppView = viewFor(a.state, 1);
    if (oppView.phase.type === "choice") {
      expect(oppView.phase.pending.options).toEqual([]);
    }
    const myView = viewFor(a.state, 0);
    if (myView.phase.type === "choice") {
      expect(myView.phase.pending.options.length).toBe(2);
    }
  });

  it("じゃんけんで相手の出した手はビューから見えない", () => {
    const state = makeState({ hand: ["i_oda"] }, { field: [fieldInst("i_tomino")] });
    const a = act(state, { type: "playInstructor", player: 0, handIndex: 0 });
    const b = choose(a.state, 0); // 自分がグーを出した → 相手の番
    const oppView = viewFor(b.state, 1);
    // 相手には選択肢（グーチョキパー）は見えるが、こちらの手の情報は resolve に無い
    expect(JSON.stringify(oppView)).not.toContain("firstPick");
  });

  it("相手のビューには手札と山札の中身が見えない", () => {
    const state = makeState({ hand: ["i_sato", "s_ueno"] });
    const v = viewFor(state, 1);
    expect(v.opponent.handCount).toBe(2);
    expect((v.opponent as unknown as { hand?: string[] }).hand).toBeUndefined();
  });
});

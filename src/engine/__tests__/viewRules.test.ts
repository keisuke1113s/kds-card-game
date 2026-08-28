import { describe, expect, it } from "vitest";
import { applyAction } from "../reducer";
import { getLegalActions } from "../legalActions";
import { viewFor } from "../view";
import {
  getLegalActionsFromView,
  playerToActFromView,
  usableAbilityFromView,
} from "../viewRules";
import { ctx, fieldInst, makeState } from "./helpers";

// オンライン対戦に向けた「プレイヤー視点だけで判定するルール」のテスト。
//
// とくに重要なのが久慈（ターン1回・休憩コスト）の回帰テスト。
// 旧実装は usableAbility が返すインスタンス参照を reducer が直接
// 書き換えていたため、視点ベースに切り替える際に「消費が反映されず
// 1ターンに何度も使える」壊れ方をしやすい（計画書に記載の地雷）。

describe("視点ベースのルール判定", () => {
  it("久慈の能力: 起動すると休憩し、同じターンにもう一度は使えない", () => {
    const kuji = fieldInst("i_kuji");
    const target = fieldInst("i_hamada");
    const state = makeState(
      { field: [kuji] },
      { field: [target] },
      { phase: { type: "main", canPlayInstructor: false } }
    );

    // 起動前: 合法手に「能力の起動」がある
    const before = getLegalActionsFromView(ctx, viewFor(state, 0));
    expect(
      before.some((a) => a.type === "activateAbility" && a.uid === kuji.uid)
    ).toBe(true);

    // 起動する
    const { state: after } = applyAction(ctx, state, {
      type: "activateAbility",
      player: 0,
      uid: kuji.uid,
    });

    // 消費が state に反映されている（休憩＋ターン1回）
    const kujiAfter = after.players[0].field.find((f) => f.uid === kuji.uid)!;
    expect(kujiAfter.rested).toBe(true);
    expect(kujiAfter.abilityUsedThisTurn).toBe(true);

    // 同じターンにもう一度は起動できない（view 判定でも合法手にも出ない）
    const viewAfter = viewFor(after, 0);
    expect(usableAbilityFromView(ctx, viewAfter, kuji.uid)).toBeNull();
    expect(
      getLegalActionsFromView(ctx, viewAfter).some(
        (a) => a.type === "activateAbility" && a.uid === kuji.uid
      )
    ).toBe(false);
  });

  it("getLegalActions は view 版と常に同じ結果を返す（ラッパの整合）", () => {
    const state = makeState(
      { hand: ["i_hamada", "s_ueno"], field: [fieldInst("i_konno")] },
      { field: [fieldInst("i_iida", { rested: true })] }
    );
    for (const player of [0, 1] as const) {
      expect(getLegalActions(ctx, state, player)).toEqual(
        getLegalActionsFromView(ctx, viewFor(state, player))
      );
    }
  });

  it("マリガンの手番は player 0 → 1 の順（どちらの視点でも同じ）", () => {
    const state = makeState(
      { mulliganDecided: false },
      { mulliganDecided: false },
      { phase: { type: "mulligan" } }
    );
    expect(playerToActFromView(viewFor(state, 0))).toBe(0);
    expect(playerToActFromView(viewFor(state, 1))).toBe(0);

    state.players[0].mulliganDecided = true;
    expect(playerToActFromView(viewFor(state, 0))).toBe(1);
    expect(playerToActFromView(viewFor(state, 1))).toBe(1);
  });

  it("view の山札の中身は辞書順（実際の並び順を明かさない）", () => {
    const state = makeState({ deck: ["s_ueno", "i_hamada", "i_konno"] });
    const view = viewFor(state, 0);
    expect(view.self.deckContents).toEqual(["i_hamada", "i_konno", "s_ueno"]);
    // 元の state の並びは変わらない
    expect(state.players[0].deck).toEqual(["s_ueno", "i_hamada", "i_konno"]);
  });

  it("達成済みのトラックを進める行動は選べない（無意味な休憩を防ぐ）", () => {
    // 技能は達成済み・学科はあと1つの状況
    const state = makeState({ skill: 19, academic: 9, field: [fieldInst("i_konno")] });
    const actions = getLegalActionsFromView(ctx, viewFor(state, 0));
    expect(actions.some((a) => a.type === "instructorAction" && a.action === "skill")).toBe(false);
    expect(actions.some((a) => a.type === "instructorAction" && a.action === "academic")).toBe(true);
    expect(actions.some((a) => a.type === "instructorAction" && a.action === "doNothing")).toBe(true);
  });
});

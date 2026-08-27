import { describe, expect, it } from "vitest";
import { cpuDeck, defaultDeck } from "@/data/cards";
import { createGame } from "../createGame";
import { getLegalActions } from "../legalActions";
import { applyAction, playerToAct } from "../reducer";
import { nextInt } from "../rng";
import { redactEventsFor, viewFor } from "../view";
import { GameEvent, GameState, PlayerId } from "../types";
import { ctx } from "./helpers";

/**
 * 漏洩プロパティテスト。
 *
 * ランダム対局を進めながら、各プレイヤーが受け取るもの
 * （viewFor の結果＋redactEventsFor 済みイベント）を JSON にし、
 * そこに「相手だけが持つ秘匿カードのID」が1度も現れないことを確かめる。
 *
 * オンライン対戦でクライアントに送るのはまさにこの2つなので、
 * これが通る限り、通信を盗み見ても相手の手札・山札は分からない。
 */

/** このステップで正当に公開されたカードID（見る資格がある移動・公開） */
function legitimatelyRevealed(events: GameEvent[]): Set<string> {
  const ok = new Set<string>();
  for (const e of events) {
    switch (e.type) {
      case "handRevealed":
        for (const id of e.cardIds) ok.add(id);
        break;
      case "cardsRevealed":
        for (const id of e.cardIds ?? []) ok.add(id);
        break;
      case "cardSalvaged": // 場外（公開）から手札へ
      case "instructorBounced": // 場（公開）から手札へ
        ok.add(e.cardId);
        break;
      default:
        break;
    }
  }
  return ok;
}

/** 受け手 viewer から見て秘匿であるべき相手のカードID */
function hiddenOpponentIds(state: GameState, viewer: PlayerId): Set<string> {
  const opp = state.players[1 - viewer];
  const me = state.players[viewer];
  const hidden = new Set([...opp.hand, ...opp.deck]);
  // 公開ゾーンにも存在するIDは秘匿と断定できない（同名カードは各デッキに1枚ずつ持てる）
  const publicIds = [
    ...me.hand,
    ...me.deck,
    ...me.field.map((f) => f.cardId),
    ...opp.field.map((f) => f.cardId),
    ...me.outOfPlay,
    ...opp.outOfPlay,
    me.tantou,
    opp.tantou,
  ];
  for (const id of publicIds) hidden.delete(id);
  return hidden;
}

describe("秘匿情報の漏洩検査", () => {
  it("30対局: 相手の手札・山札のカードIDが view にも秘匿済みイベントにも現れない", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let { state, events } = createGame(ctx, { seed, decks: [defaultDeck, cpuDeck] });
      let botRng = seed ^ 0x9e3779b9;
      let steps = 0;

      const check = (st: GameState, evs: GameEvent[]) => {
        for (const viewer of [0, 1] as PlayerId[]) {
          const redacted = redactEventsFor(evs, viewer);
          const view = viewFor(st, viewer);
          const allowed = legitimatelyRevealed(redacted);
          // 効果の選択肢として本人に提示されたカードは、見る資格がある
          // （例: 相手の手札から選んで場外に置く効果）。viewFor は選ぶ本人に
          // しか options を入れないので、ここに入っていれば正当な公開
          if (view.phase.type === "choice") {
            for (const o of view.phase.pending.options) {
              if (o.cardId) allowed.add(o.cardId);
            }
          }
          const hidden = hiddenOpponentIds(st, viewer);
          for (const id of allowed) hidden.delete(id);
          if (hidden.size === 0) continue;
          const payload = JSON.stringify(view) + JSON.stringify(redacted);
          for (const id of hidden) {
            expect(payload.includes(`"${id}"`), `viewer${viewer} に ${id} が漏れた`).toBe(
              false
            );
          }
        }
      };

      check(state, events);
      while (state.phase.type !== "finished") {
        steps++;
        expect(steps).toBeLessThan(5000);
        const actor = playerToAct(state)!;
        const legal = getLegalActions(ctx, state, actor);
        const r = nextInt(botRng, legal.length);
        botRng = r.rngState;
        const result = applyAction(ctx, state, legal[r.value]);
        state = result.state;
        events = result.events;
        check(state, events);
      }
    }
  });

  it("redactEventsFor: 他人のドローと山札公開の中身が落ちる", () => {
    const events: GameEvent[] = [
      { type: "cardDrawn", player: 0, cardId: "i_konno" },
      { type: "cardDrawn", player: 1, cardId: "i_hamada" },
      { type: "cardsRevealed", player: 1, count: 2, cardIds: ["s_ueno", "i_iida"] },
      { type: "handRevealed", player: 1, cardIds: ["s_honma"] },
    ];
    const forP0 = redactEventsFor(events, 0);
    // 自分のドローは見える
    expect(forP0[0]).toEqual({ type: "cardDrawn", player: 0, cardId: "i_konno" });
    // 相手のドローは事実だけ残り、中身は消える
    expect(forP0[1]).toEqual({ type: "cardDrawn", player: 1 });
    // 相手の山札公開は枚数だけ
    expect(forP0[2]).toEqual({ type: "cardsRevealed", player: 1, count: 2 });
    // 手札公開は素通し（見る資格が両者にある）
    expect(forP0[3]).toEqual({ type: "handRevealed", player: 1, cardIds: ["s_honma"] });
  });
});

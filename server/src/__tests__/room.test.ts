import { describe, expect, it } from "vitest";
import { cardRegistry, cpuDeck, defaultDeck } from "@/data/cards";
import { HeuristicAI } from "@/ai/heuristic";
import { DIFFICULTY_PARAMS } from "@/ai/difficulty";
import { getLegalActionsFromView, playerToActFromView } from "@/engine/viewRules";
import { GameContext, GameEvent, PlayerId, PlayerView } from "@/engine/types";
import { Matchmaker } from "../core/matchmaker";
import { RoomCore, ServerMessage } from "../core/room";

const ctx: GameContext = { defs: cardRegistry };

/** テスト用クライアント: 受信メッセージを貯め、AIで手を選ぶ */
class TestClient {
  received: ServerMessage[] = [];
  view: PlayerView | null = null;
  seat: PlayerId | null = null;
  sessionToken = "";
  private ai: HeuristicAI;

  // 2人が同じ乱数列を持つと、じゃんけんで永遠にあいこになり得るため、
  // クライアントごとに必ず別のシードを使う
  constructor(seed: number) {
    this.ai = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.hard, seed);
  }

  readonly send = (msg: ServerMessage): void => {
    this.received.push(msg);
    if (msg.type === "joined") {
      this.seat = msg.seat;
      this.sessionToken = msg.sessionToken;
    }
    if (msg.type === "update") this.view = msg.view;
  };

  /** いま自分の手番か（AIの乱数は消費しない） */
  isMyTurn(): boolean {
    if (!this.view || this.seat === null) return false;
    return playerToActFromView(this.view) === this.seat;
  }

  /** 自分の手番なら1手選んで返す（呼ぶたびにAIの乱数が進む） */
  pickAction(): unknown | null {
    if (!this.isMyTurn()) return null;
    const legal = getLegalActionsFromView(ctx, this.view!);
    if (legal.length === 0) return null;
    return this.ai.chooseAction(this.view!, legal);
  }
}

function setupMatch(): { room: RoomCore; a: TestClient; b: TestClient } {
  const room = new RoomCore(ctx, "TEST01");
  const a = new TestClient(42);
  const b = new TestClient(1337);
  expect("seat" in room.join("たろう", defaultDeck, a.send)).toBe(true);
  expect("seat" in room.join("はなこ", cpuDeck, b.send)).toBe(true);
  room.setReady(0);
  room.setReady(1);
  return { room, a, b };
}

describe("RoomCore（サーバーの権威ロジック）", () => {
  it("2クライアントで終局まで対局できる", () => {
    const { room, a, b } = setupMatch();
    const clients = [a, b];
    let steps = 0;
    for (;;) {
      steps++;
      expect(steps).toBeLessThan(5000);
      const finished = a.view?.phase.type === "finished";
      if (finished) break;
      const actor = clients.find((c) => c.isMyTurn());
      expect(actor, "誰も手番でないのに終局していない").toBeDefined();
      room.handleAction(actor!.seat!, actor!.pickAction());
    }
    expect(a.view?.phase.type).toBe("finished");
    expect(b.view?.phase.type).toBe("finished");
  });

  it("非手番のアクションは拒否され、盤面は変わらない", () => {
    const { room, a, b } = setupMatch();
    const clients = [a, b];
    const actor = clients.find((c) => c.isMyTurn())!;
    const waiter = clients.find((c) => c !== actor)!;

    const before = JSON.stringify(waiter.view);
    // 待ち側が手番側の合法手をなりすまして送る（player を自席に書き換え）
    const stolen = actor.pickAction() as { type: string; player: number };
    room.handleAction(waiter.seat!, { ...stolen, player: waiter.seat });
    const errors = waiter.received.filter((m) => m.type === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(waiter.view)).toBe(before);
  });

  it("席と action.player が一致しない手は拒否される", () => {
    const { room, a, b } = setupMatch();
    const clients = [a, b];
    const actor = clients.find((c) => c.isMyTurn())!;
    const action = actor.pickAction() as { player: number };
    const other = clients.find((c) => c !== actor)!;
    // 手番プレイヤーの正しい手を、相手の席から送る（player は手番側のまま）
    const before = JSON.stringify(actor.view);
    room.handleAction(other.seat!, action);
    expect(other.received.some((m) => m.type === "error")).toBe(true);
    expect(JSON.stringify(actor.view)).toBe(before);
  });

  it("合法手一覧にない手は拒否される", () => {
    const { room, a, b } = setupMatch();
    const clients = [a, b];
    const actor = clients.find((c) => c.isMyTurn())!;
    const before = JSON.stringify(actor.view);
    room.handleAction(actor.seat!, {
      type: "instructorAction",
      player: actor.seat,
      uid: "存在しないUID",
      action: "skill",
    });
    expect(actor.received.some((m) => m.type === "error")).toBe(true);
    expect(JSON.stringify(actor.view)).toBe(before);
  });

  it("不正なデッキでは入室できない", () => {
    const room = new RoomCore(ctx, "TEST02");
    const c = new TestClient(7);
    const bad = { main: ["i_konno", "i_konno"], tantou: "t_kuji" }; // 枚数不足＋同名重複
    const res = room.join("ずる", bad, c.send);
    expect("error" in res).toBe(true);
  });

  it("送信データに相手の手札・山札のカードIDが現れない", () => {
    const { room, a, b } = setupMatch();
    const clients = [a, b];
    // 数十手すすめて、各クライアントの受信全文を検査する
    for (let i = 0; i < 60 && a.view?.phase.type !== "finished"; i++) {
      const actor = clients.find((c) => c.isMyTurn());
      if (!actor) break;
      room.handleAction(actor.seat!, actor.pickAction());
    }
    for (const me of clients) {
      const opp = clients.find((c) => c !== me)!;
      const payload = JSON.stringify(me.received);
      // 相手の view にしか出てこない秘匿情報（相手の手札）を、
      // 自分宛の受信データが1バイトも含まないことを確認する
      const oppHand = opp.view!.self.hand;
      const myPayloadVisible = new Set(
        [
          ...me.view!.self.hand,
          ...me.view!.self.deckContents,
          ...me.view!.self.outOfPlay,
          ...me.view!.opponent.outOfPlay,
          ...me.view!.self.field.map((f) => f.cardId),
          ...me.view!.opponent.field.map((f) => f.cardId),
        ]
      );
      for (const id of oppHand) {
        if (myPayloadVisible.has(id)) continue; // 同名カードは自分側にも存在しうる
        // 手札公開効果や、効果の選択肢として本人に提示されたカードなど、
        // 見る資格のある公開があった場合は許容する
        const legitimately = me.received.some(
          (m) =>
            m.type === "update" &&
            (m.events.some(
              (e: GameEvent) =>
                (e.type === "handRevealed" && e.cardIds.includes(id)) ||
                (e.type === "cardsRevealed" && (e.cardIds ?? []).includes(id)) ||
                ((e.type === "cardSalvaged" || e.type === "instructorBounced") &&
                  e.cardId === id)
            ) ||
              (m.view.phase.type === "choice" &&
                m.view.phase.pending.options.some((o) => o.cardId === id)))
        );
        if (legitimately) continue;
        expect(payload.includes(`"${id}"`), `相手の手札 ${id} が漏れている`).toBe(false);
      }
    }
  });

  it("切断してもトークンで復帰でき、最新盤面が届く", () => {
    const { room, a, b } = setupMatch();
    room.markDisconnected(a.seat!);
    const a2 = new TestClient(8);
    const res = room.reattach(a.sessionToken, a2.send);
    expect("seat" in res).toBe(true);
    expect(a2.received.some((m) => m.type === "update")).toBe(true);
    // 間違ったトークンでは復帰できない
    const res2 = room.reattach("でたらめ", new TestClient(9).send);
    expect("error" in res2).toBe(true);
    void b;
  });

  it("投了すると相手の勝ちで終局する", () => {
    const { room, a, b } = setupMatch();
    room.resign(a.seat!);
    expect(a.view?.phase.type).toBe("finished");
    if (a.view?.phase.type === "finished") {
      expect(a.view.phase.winner).toBe(b.seat);
    }
  });
});

describe("Matchmaker（部屋の管理）", () => {
  it("部屋コードで作成・参加でき、紛らわしい文字を含まない", () => {
    const mm = new Matchmaker(ctx);
    const { code, room } = mm.createRoom();
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(mm.findRoom(code)).toBe(room);
    expect(mm.findRoom(code.toLowerCase())).toBe(room);
    expect(mm.findRoom("ZZZZZZ")).toBeNull();
  });

  it("ランダムマッチは2人目が同じ部屋に入る", () => {
    const mm = new Matchmaker(ctx);
    const first = mm.joinQueue();
    const c1 = new TestClient(10);
    first.room.join("ひとりめ", defaultDeck, c1.send);
    const second = mm.joinQueue();
    expect(second.code).toBe(first.code);
    const third = mm.joinQueue();
    expect(third.code).not.toBe(first.code);
  });

  it("期限切れの空き待ち部屋は掃除される", () => {
    let now = 0;
    const mm = new Matchmaker(ctx, () => now);
    const { code } = mm.createRoom();
    expect(mm.findRoom(code)).not.toBeNull();
    now = 11 * 60 * 1000; // 11分後
    expect(mm.findRoom(code)).toBeNull();
  });
});

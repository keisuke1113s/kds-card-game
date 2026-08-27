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
  // 両者そろうと先攻を決めるじゃんけんが始まる
  expect(a.received.some((m) => m.type === "jankenStart")).toBe(true);
  room.handleJanken(0, "rock");
  room.handleJanken(1, "scissors"); // 席0の勝ち → 席0が先攻で開始
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

  it("切断したまま猶予が過ぎると切断側の負けになる", () => {
    // 手動で発火できる偽タイマーを注入する
    const pending: (() => void)[] = [];
    const room = new RoomCore(ctx, "TESTGRACE", {
      setTimer: (fn) => {
        pending.push(fn);
        return pending.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: (t) => {
        pending[(t as unknown as number) - 1] = () => {};
      },
    });
    const a = new TestClient(21);
    const b = new TestClient(22);
    room.join("たろう", defaultDeck, a.send);
    room.join("はなこ", cpuDeck, b.send);
    room.setReady(0);
    room.setReady(1);
    room.handleJanken(0, "paper");
    room.handleJanken(1, "rock"); // 席0の勝ちで対局開始

    // A が切断 → 猶予タイマーが仕掛かる
    const base = pending.length;
    room.markDisconnected(a.seat!);
    expect(pending.length).toBe(base + 1);

    // 復帰すればタイマーは解除され、負けにならない
    room.reattach(a.sessionToken, a.send);
    pending.forEach((fn) => fn());
    expect(a.view?.phase.type).not.toBe("finished");

    // もう一度切断し、今度は復帰せず猶予切れ → A の負け
    room.markDisconnected(a.seat!);
    const timerCount = pending.length;
    room.markDisconnected(a.seat!); // 二重呼び出しでもタイマーは増えない
    expect(pending.length).toBe(timerCount);
    pending.forEach((fn) => fn());
    expect(b.view?.phase.type).toBe("finished");
    if (b.view?.phase.type === "finished") {
      expect(b.view.phase.winner).toBe(b.seat);
    }
  });

  it("投了すると相手の勝ちで終局する", () => {
    const { room, a, b } = setupMatch();
    room.resign(a.seat!);
    expect(a.view?.phase.type).toBe("finished");
    if (a.view?.phase.type === "finished") {
      expect(a.view.phase.winner).toBe(b.seat);
    }
  });

  it("両者が再戦を希望すると、じゃんけんからやり直して新しい対局が始まる", () => {
    const { room, a, b } = setupMatch();
    room.resign(a.seat!);
    // 対局中の rematch は無視される前提はここでは略。終局後に両者希望
    room.handleRematch(a.seat!);
    expect(b.received.some((m) => m.type === "rematchOffered")).toBe(true);
    expect(room.started).toBe(true); // まだ古い対局のまま
    room.handleRematch(b.seat!);
    // じゃんけんが再開している
    const starts = a.received.filter((m) => m.type === "jankenStart").length;
    expect(starts).toBeGreaterThanOrEqual(2);
    room.handleJanken(0, "rock");
    room.handleJanken(1, "scissors");
    expect(room.started).toBe(true);
    expect(a.view?.phase.type).not.toBe("finished");
  });

  it("スタンプは相手に中継され、連打は抑止される", () => {
    const { room, a, b } = setupMatch();
    room.handleStamp(a.seat!, "nice");
    expect(b.received.some((m) => m.type === "stamp" && m.id === "nice")).toBe(true);
    const before = b.received.filter((m) => m.type === "stamp").length;
    room.handleStamp(a.seat!, "nice"); // 1.5秒以内の連打
    expect(b.received.filter((m) => m.type === "stamp").length).toBe(before);
    room.handleStamp(a.seat!, "でたらめ" as never);
    expect(b.received.filter((m) => m.type === "stamp").length).toBe(before);
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

  it("待機中に切断した幽霊とはマッチせず、待ち人数にも数えない", () => {
    const mm = new Matchmaker(ctx);
    const first = mm.joinQueue();
    const ghost = new TestClient(30);
    const joined = first.room.join("ゆうれい", defaultDeck, ghost.send);
    expect("seat" in joined).toBe(true);
    expect(mm.waitingCount).toBe(1);
    // 待機中にタブを閉じた（対局前なので猶予タイマーは掛からない）
    first.room.markDisconnected(ghost.seat!);
    expect(mm.waitingCount).toBe(0);
    // 次の人は幽霊の部屋ではなく新しい部屋で待つ
    const second = mm.joinQueue();
    expect(second.code).not.toBe(first.code);
  });

  it("開始時点で切断していた席は猶予切れで相手の不戦勝になる", () => {
    const pending: (() => void)[] = [];
    const room = new RoomCore(ctx, "TESTGHOST", {
      setTimer: (fn) => {
        pending.push(fn);
        return pending.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: (t) => {
        pending[(t as unknown as number) - 1] = () => {};
      },
    });
    const a = new TestClient(31);
    const b = new TestClient(32);
    room.join("ゆうれい", defaultDeck, a.send);
    room.join("いきてる", cpuDeck, b.send);
    // A は ready 送信後に切断（対局前なのでタイマーは仕掛からない）
    room.setReady(a.seat!);
    room.markDisconnected(a.seat!);
    expect(pending.length).toBe(0);
    // B の ready でじゃんけん開始。A は放置なので時間切れの自動選択で
    // （あいこなら再抽選しながら）対局が始まる
    room.setReady(b.seat!);
    expect(pending.length).toBe(1);
    let fired = 0;
    const fireAll = () => {
      while (fired < pending.length) pending[fired++]();
    };
    for (let i = 0; i < 30 && !room.started; i++) fireAll();
    expect(room.started).toBe(true);
    // 開始時に切断していた A の猶予タイマーが仕掛かっている → 発火で B の不戦勝
    fireAll();
    expect(b.view?.phase.type).toBe("finished");
    if (b.view?.phase.type === "finished") {
      expect(b.view.phase.winner).toBe(b.seat);
    }
  });

  it("じゃんけんの勝者が先攻になり、あいこはやり直しになる", () => {
    const room = new RoomCore(ctx, "TESTJANKEN");
    const a = new TestClient(33);
    const b = new TestClient(34);
    room.join("たろう", defaultDeck, a.send);
    room.join("はなこ", cpuDeck, b.send);
    room.setReady(0);
    room.setReady(1);
    // あいこ → 両者に winner: null が届き、まだ始まらない
    room.handleJanken(0, "rock");
    room.handleJanken(1, "rock");
    const tie = a.received.find((m) => m.type === "jankenResult");
    expect(tie && tie.type === "jankenResult" && tie.winner).toBeNull();
    expect(room.started).toBe(false);
    // やり直し: パーがグーに勝つ → 席1が先攻で開始
    room.handleJanken(0, "rock");
    room.handleJanken(1, "paper");
    expect(room.started).toBe(true);
    const started = b.received.find(
      (m): m is Extract<ServerMessage, { type: "update" }> => m.type === "update"
    );
    const ev = started?.events.find((e) => e.type === "gameStarted");
    expect(ev && ev.type === "gameStarted" && ev.firstPlayer).toBe(1);
    // 一度選んだ手は変更できない（上書きしても結果は変わらない）
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

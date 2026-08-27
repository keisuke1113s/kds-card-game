import { createGame } from "@/engine/createGame";
import { getLegalActions } from "@/engine/legalActions";
import { applyAction, playerToAct } from "@/engine/reducer";
import { redactEventsFor, viewFor } from "@/engine/view";
import { DeckList, validateDeck } from "@/engine/deckRules";
import {
  GameAction,
  GameContext,
  GameEvent,
  GameState,
  PlayerId,
  PlayerView,
} from "@/engine/types";

/**
 * 1つの対戦部屋の権威ロジック。
 *
 * 通信（WebSocket）には一切依存しない。席ごとの send コールバックに
 * メッセージを渡すだけなので、テストではスタブを渡してソケット無しで
 * まるごと検証できる。
 *
 * 権威ループ（サーバーが信頼するのは自分の状態だけ）:
 *   action 受信
 *   → 送信者の席と action.player が一致するか（なりすまし防止）
 *   → いまその席の手番か
 *   → 合法手の一覧に含まれるか
 *   → applyAction
 *   → 各席に「その席の視点の view ＋ 秘匿済みイベント」を配る
 */

/** サーバー→クライアントのメッセージ */
export type ServerMessage =
  | { type: "joined"; seat: PlayerId; sessionToken: string }
  | { type: "opponentJoined"; name: string }
  | { type: "matchStart"; seat: PlayerId }
  | { type: "update"; seq: number; view: PlayerView; events: GameEvent[] }
  | { type: "opponentLeft" }
  | { type: "error"; message: string };

export interface Seat {
  name: string;
  deck: DeckList;
  sessionToken: string;
  ready: boolean;
  connected: boolean;
  send: (msg: ServerMessage) => void;
}

/** 暗号学的乱数が使える環境ではそれを使う */
function randomInt32(): number {
  const g = globalThis as {
    crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array };
  };
  if (g.crypto?.getRandomValues) {
    return g.crypto.getRandomValues(new Uint32Array(1))[0] | 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  const g = globalThis as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.getRandomValues) g.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** キーの並び順に依存しない構造比較（合法手の照合用） */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter(
    (k) => (a as Record<string, unknown>)[k] !== undefined
  );
  const kb = Object.keys(b as object).filter(
    (k) => (b as Record<string, unknown>)[k] !== undefined
  );
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}

export class RoomCore {
  readonly id: string;
  private readonly ctx: GameContext;
  private seats: (Seat | null)[] = [null, null];
  private state: GameState | null = null;
  private seq = 0;

  constructor(ctx: GameContext, id: string) {
    this.ctx = ctx;
    this.id = id;
  }

  /** 対局が始まっているか */
  get started(): boolean {
    return this.state !== null;
  }

  get playerCount(): number {
    return this.seats.filter((s) => s !== null).length;
  }

  /**
   * 入室。デッキはこの時点で検証し、不正なら断る（対戦中の中断を防ぐ）。
   * 成功したら席番号と復帰用トークンを返す。
   */
  join(
    name: string,
    deck: DeckList,
    send: (msg: ServerMessage) => void
  ): { seat: PlayerId; sessionToken: string } | { error: string } {
    const errors = validateDeck(this.ctx.defs, deck);
    if (errors.length > 0) {
      return { error: `デッキがルールを満たしていません: ${errors[0]}` };
    }
    const seatIndex = this.seats.findIndex((s) => s === null);
    if (seatIndex === -1) return { error: "この部屋は満席です" };

    const seat: Seat = {
      name,
      deck,
      sessionToken: randomToken(),
      ready: false,
      connected: true,
      send,
    };
    this.seats[seatIndex] = seat;
    seat.send({ type: "joined", seat: seatIndex as PlayerId, sessionToken: seat.sessionToken });
    const other = this.seats[1 - seatIndex];
    if (other) other.send({ type: "opponentJoined", name });
    return { seat: seatIndex as PlayerId, sessionToken: seat.sessionToken };
  }

  /** 切断からの復帰。トークンが合えば送信先を差し替えて最新盤面を送り直す */
  reattach(
    sessionToken: string,
    send: (msg: ServerMessage) => void
  ): { seat: PlayerId } | { error: string } {
    const seatIndex = this.seats.findIndex((s) => s?.sessionToken === sessionToken);
    if (seatIndex === -1) return { error: "この部屋に復帰できる席がありません" };
    const seat = this.seats[seatIndex]!;
    seat.send = send;
    seat.connected = true;
    seat.send({ type: "joined", seat: seatIndex as PlayerId, sessionToken });
    if (this.state) {
      seat.send({
        type: "update",
        seq: this.seq,
        view: viewFor(this.state, seatIndex as PlayerId),
        events: [],
      });
    }
    return { seat: seatIndex as PlayerId };
  }

  /** 準備完了。両者そろったら対局を開始する */
  setReady(seatIndex: PlayerId): void {
    const seat = this.seats[seatIndex];
    if (!seat || this.state) return;
    seat.ready = true;
    const [a, b] = this.seats;
    if (a?.ready && b?.ready) this.startMatch();
  }

  private startMatch(): void {
    const [a, b] = this.seats;
    if (!a || !b) return;
    // seed と先攻はサーバーが決める（seed は絶対にクライアントへ送らない）
    const { state, events } = createGame(this.ctx, {
      seed: randomInt32(),
      decks: [a.deck, b.deck],
      firstPlayer: (randomInt32() & 1) as PlayerId,
    });
    this.state = state;
    this.seats.forEach((s, i) => s?.send({ type: "matchStart", seat: i as PlayerId }));
    this.broadcast(events);
  }

  /** クライアントからの手。検証してから適用する */
  handleAction(seatIndex: PlayerId, action: unknown): void {
    const seat = this.seats[seatIndex];
    if (!seat) return;
    if (!this.state) {
      seat.send({ type: "error", message: "対局はまだ始まっていません" });
      return;
    }
    const a = action as GameAction;
    // なりすまし防止: 席と action.player の一致
    if (typeof a !== "object" || a === null || a.player !== seatIndex) {
      seat.send({ type: "error", message: "不正な操作です（席が一致しません）" });
      return;
    }
    // 手番の確認
    if (playerToAct(this.state) !== seatIndex) {
      seat.send({ type: "error", message: "あなたの手番ではありません" });
      return;
    }
    // 合法手に含まれるか（構造比較）
    const legal = getLegalActions(this.ctx, this.state, seatIndex);
    if (!legal.some((l) => deepEqual(l, a))) {
      seat.send({ type: "error", message: "その手は選べません" });
      return;
    }
    const { state, events } = applyAction(this.ctx, this.state, a);
    this.state = state;
    this.broadcast(events);
  }

  /** 投了。相手の勝ちで終局させる */
  resign(seatIndex: PlayerId): void {
    if (!this.state || this.state.phase.type === "finished") return;
    const winner = (1 - seatIndex) as PlayerId;
    this.state = {
      ...this.state,
      phase: { type: "finished", winner, reason: "bothTracksComplete" },
    };
    this.broadcast([
      { type: "gameEnded", winner, reason: "bothTracksComplete" },
    ]);
  }

  /** 退室。対局中なら相手に通知する */
  leave(seatIndex: PlayerId): void {
    const seat = this.seats[seatIndex];
    if (!seat) return;
    this.seats[seatIndex] = null;
    const other = this.seats[1 - seatIndex];
    if (other) other.send({ type: "opponentLeft" });
  }

  markDisconnected(seatIndex: PlayerId): void {
    const seat = this.seats[seatIndex];
    if (seat) seat.connected = false;
  }

  /** 全席に、それぞれの視点の盤面と秘匿済みイベントを配る */
  private broadcast(events: GameEvent[]): void {
    if (!this.state) return;
    this.seq++;
    this.seats.forEach((seat, i) => {
      if (!seat) return;
      seat.send({
        type: "update",
        seq: this.seq,
        view: viewFor(this.state!, i as PlayerId),
        events: redactEventsFor(events, i as PlayerId),
      });
    });
  }
}

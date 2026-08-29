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

/** じゃんけんの手 */
export type JankenHand = "rock" | "scissors" | "paper";

/** サーバー→クライアントのメッセージ */
export type ServerMessage =
  | { type: "joined"; seat: PlayerId; sessionToken: string }
  | { type: "opponentJoined"; name: string; title?: string }
  | { type: "jankenStart" }
  | { type: "jankenResult"; hands: [JankenHand, JankenHand]; winner: PlayerId | null }
  | { type: "matchStart"; seat: PlayerId }
  | { type: "update"; seq: number; view: PlayerView; events: GameEvent[] }
  | { type: "opponentLeft" }
  | { type: "opponentConnection"; connected: boolean }
  /** 相手が再戦を希望した */
  | { type: "rematchOffered" }
  /** 相手からの定型スタンプ */
  | { type: "stamp"; id: string }
  | { type: "error"; message: string };

/** 送り合える定型スタンプ（自由入力は無し＝モデレーション不要） */
export const STAMP_IDS = [
  "yoroshiku",
  "nice",
  "yaruna",
  "arigatou",
  "gg",
  "tsuyoi",
  "makenai",
  "yarune",
  "benkyou",
  "safety",
  "mouikkai",
  "gaman",
] as const;

export interface Seat {
  name: string;
  /** 実績で獲得した称号（表示用） */
  title?: string;
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

/** 切断したまま復帰しないときに負けになるまでの猶予 */
export const DISCONNECT_GRACE_MS = 60 * 1000;

/** じゃんけんで手を選ばないまま放置されたとき、自動で手を割り当てるまでの時間 */
export const JANKEN_TIMEOUT_MS = 30 * 1000;

const JANKEN_HANDS: JankenHand[] = ["rock", "scissors", "paper"];

/** じゃんけんの勝者。あいこは null */
function jankenWinner(a: JankenHand, b: JankenHand): 0 | 1 | null {
  if (a === b) return null;
  const beats: Record<JankenHand, JankenHand> = {
    rock: "scissors",
    scissors: "paper",
    paper: "rock",
  };
  return beats[a] === b ? 0 : 1;
}

export class RoomCore {
  readonly id: string;
  private readonly ctx: GameContext;
  private seats: (Seat | null)[] = [null, null];
  private state: GameState | null = null;
  private seq = 0;
  private graceTimers: (ReturnType<typeof setTimeout> | null)[] = [null, null];
  /** 先攻を決めるじゃんけん（両者 ready 後、対局開始前） */
  private jankenActive = false;
  private jankenHands: (JankenHand | null)[] = [null, null];
  private jankenTimer: ReturnType<typeof setTimeout> | null = null;
  /** 再戦の希望（両者そろったらじゃんけんからやり直す） */
  private rematchWants: [boolean, boolean] = [false, false];
  /** スタンプの連打防止（席ごとの最終送信時刻） */
  private lastStampAt: [number, number] = [0, 0];
  private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (t: ReturnType<typeof setTimeout>) => void;

  constructor(
    ctx: GameContext,
    id: string,
    timers?: {
      setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
      clearTimer: (t: ReturnType<typeof setTimeout>) => void;
    }
  ) {
    this.ctx = ctx;
    this.id = id;
    this.setTimer = timers?.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = timers?.clearTimer ?? ((t) => clearTimeout(t));
  }

  /** 対局が始まっているか */
  get started(): boolean {
    return this.state !== null;
  }

  get playerCount(): number {
    return this.seats.filter((s) => s !== null).length;
  }

  /** いま接続が生きている席の数（待機中に閉じた「幽霊」を見分けるため） */
  get connectedCount(): number {
    return this.seats.filter((s) => s?.connected).length;
  }

  /**
   * 入室。デッキはこの時点で検証し、不正なら断る（対戦中の中断を防ぐ）。
   * 成功したら席番号と復帰用トークンを返す。
   */
  join(
    name: string,
    deck: DeckList,
    send: (msg: ServerMessage) => void,
    title?: string
  ): { seat: PlayerId; sessionToken: string } | { error: string } {
    const errors = validateDeck(this.ctx.defs, deck);
    if (errors.length > 0) {
      return { error: `デッキがルールを満たしていません: ${errors[0]}` };
    }
    const seatIndex = this.seats.findIndex((s) => s === null);
    if (seatIndex === -1) return { error: "この部屋は満席です" };

    const seat: Seat = {
      name,
      title,
      deck,
      sessionToken: randomToken(),
      ready: false,
      connected: true,
      send,
    };
    this.seats[seatIndex] = seat;
    seat.send({ type: "joined", seat: seatIndex as PlayerId, sessionToken: seat.sessionToken });
    const other = this.seats[1 - seatIndex];
    if (other) {
      other.send({ type: "opponentJoined", name, title });
      // 後から入った側にも、すでにいる相手の名前を教える
      seat.send({ type: "opponentJoined", name: other.name, title: other.title });
    }
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
    // 相手に「復帰した」ことを知らせる
    const other = this.seats[1 - seatIndex];
    if (other?.connected) other.send({ type: "opponentConnection", connected: true });
    // 復帰できたので、切断負けの猶予タイマーを解除する
    const timer = this.graceTimers[seatIndex];
    if (timer) {
      this.clearTimer(timer);
      this.graceTimers[seatIndex] = null;
    }
    seat.send({ type: "joined", seat: seatIndex as PlayerId, sessionToken });
    // じゃんけんの途中で復帰したら、手の選択画面を出し直す
    if (this.jankenActive && this.jankenHands[seatIndex] === null) {
      seat.send({ type: "jankenStart" });
    }
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

  /** 準備完了。両者そろったら先攻を決めるじゃんけんを始める */
  setReady(seatIndex: PlayerId): void {
    const seat = this.seats[seatIndex];
    if (!seat || this.state || this.jankenActive) return;
    seat.ready = true;
    const [a, b] = this.seats;
    if (a?.ready && b?.ready) this.beginJanken();
  }

  /** 説明書どおり、先攻後攻はじゃんけんで決める */
  private beginJanken(): void {
    this.jankenActive = true;
    this.jankenHands = [null, null];
    this.seats.forEach((s) => s?.send({ type: "jankenStart" }));
    this.armJankenTimer();
  }

  /** 手を選ばないまま放置されても対戦が始まるよう、時間切れで自動的に手を割り当てる */
  private armJankenTimer(): void {
    if (this.jankenTimer) this.clearTimer(this.jankenTimer);
    this.jankenTimer = this.setTimer(() => {
      this.jankenTimer = null;
      if (!this.jankenActive) return;
      for (let i = 0; i < 2; i++) {
        if (this.jankenHands[i] === null) {
          this.jankenHands[i] = JANKEN_HANDS[Math.abs(randomInt32()) % 3];
        }
      }
      this.resolveJanken();
    }, JANKEN_TIMEOUT_MS);
  }

  /** クライアントが選んだじゃんけんの手。一度選んだら変更できない */
  handleJanken(seatIndex: PlayerId, hand: JankenHand): void {
    if (!this.jankenActive || this.state) return;
    if (!this.seats[seatIndex]) return;
    if (this.jankenHands[seatIndex] !== null) return;
    this.jankenHands[seatIndex] = hand;
    if (this.jankenHands[0] !== null && this.jankenHands[1] !== null) {
      this.resolveJanken();
    }
  }

  private resolveJanken(): void {
    const [a, b] = this.jankenHands;
    if (a === null || b === null) return;
    const winner = jankenWinner(a, b);
    this.seats.forEach((s) => s?.send({ type: "jankenResult", hands: [a, b], winner }));
    if (winner === null) {
      // あいこ。もう一度
      this.jankenHands = [null, null];
      this.armJankenTimer();
      return;
    }
    this.jankenActive = false;
    if (this.jankenTimer) {
      this.clearTimer(this.jankenTimer);
      this.jankenTimer = null;
    }
    this.startMatch(winner);
  }

  private startMatch(firstPlayer: PlayerId): void {
    const [a, b] = this.seats;
    if (!a || !b) return;
    // seed はサーバーが決める（絶対にクライアントへ送らない）。先攻はじゃんけんの勝者
    const { state, events } = createGame(this.ctx, {
      seed: randomInt32(),
      decks: [a.deck, b.deck],
      firstPlayer,
    });
    this.state = state;
    this.seats.forEach((s, i) => s?.send({ type: "matchStart", seat: i as PlayerId }));
    this.broadcast(events);
    // 開始時点ですでに切断している席（待機中にタブを閉じた等）は、
    // 対局開始前の切断には猶予タイマーが無いためここで仕掛け直す。
    // 復帰しなければ猶予切れで相手の不戦勝になり、永遠の待ちを防ぐ
    this.seats.forEach((s, i) => {
      if (s && !s.connected) this.markDisconnected(i as PlayerId);
    });
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

  /**
   * 再戦の希望。終局後のみ受け付け、両者がそろったら
   * じゃんけんからやり直して新しい対局を始める
   */
  handleRematch(seatIndex: PlayerId): void {
    const seat = this.seats[seatIndex];
    if (!seat) return;
    if (!this.state || this.state.phase.type !== "finished") return;
    if (this.rematchWants[seatIndex]) return;
    this.rematchWants[seatIndex] = true;
    const other = this.seats[1 - seatIndex];
    other?.send({ type: "rematchOffered" });
    if (this.rematchWants[0] && this.rematchWants[1]) {
      // 対局をリセットして、先攻決めのじゃんけんから
      this.state = null;
      this.rematchWants = [false, false];
      this.beginJanken();
    }
  }

  /** 定型スタンプを相手に中継する（1.5秒に1回まで） */
  handleStamp(seatIndex: PlayerId, id: string): void {
    if (!(STAMP_IDS as readonly string[]).includes(id)) return;
    const now = Date.now();
    if (now - this.lastStampAt[seatIndex] < 1500) return;
    this.lastStampAt[seatIndex] = now;
    this.seats[1 - seatIndex]?.send({ type: "stamp", id });
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
    if (!seat) return;
    seat.connected = false;
    // 相手に「接続が切れた（復帰待ち）」を知らせる
    const other = this.seats[1 - seatIndex];
    if (other?.connected) other.send({ type: "opponentConnection", connected: false });
    // 対局中の切断は、猶予以内に復帰しなければ切断側の負けにする
    if (this.state && this.state.phase.type !== "finished" && !this.graceTimers[seatIndex]) {
      this.graceTimers[seatIndex] = this.setTimer(() => {
        this.graceTimers[seatIndex] = null;
        const s = this.seats[seatIndex];
        if (s && !s.connected && this.state && this.state.phase.type !== "finished") {
          this.resign(seatIndex);
        }
      }, DISCONNECT_GRACE_MS);
    }
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

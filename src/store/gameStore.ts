import { create } from "zustand";
import { playSe, SeKey } from "@/audio/sound";
import { DIFFICULTY_PARAMS } from "@/ai/difficulty";
import { HeuristicAI } from "@/ai/heuristic";
import { AIController, Difficulty } from "@/ai/types";
import { cardRegistry } from "@/data/cards";
import { createGame } from "@/engine/createGame";
import { DeckList } from "@/engine/deckRules";
import { getLegalActions } from "@/engine/legalActions";
import { applyAction, playerToAct } from "@/engine/reducer";
import { redactEventsFor, viewFor } from "@/engine/view";
import { useRecordStore } from "@/store/recordStore";
import {
  GameAction,
  GameContext,
  GameEvent,
  GameState,
  PlayerId,
  PlayerView,
} from "@/engine/types";

export const HUMAN: PlayerId = 0;
export const CPU: PlayerId = 1;

const ctx: GameContext = { defs: cardRegistry };

interface GameStore {
  state: GameState | null;
  /**
   * 人間視点のビュー。UI はこれだけを見る（state は直接見ない）。
   * オンライン対戦ではサーバーから届くのがこの形になる。
   */
  view: PlayerView | null;
  /** これまでの全イベント（ログ表示用） */
  eventLog: GameEvent[];
  /** 直近のアクションで発生したイベント */
  lastEvents: GameEvent[];
  aiThinking: boolean;
  aiSpeedMs: number;
  /** 演出（カード実況）表示中はCPUの次の手を待たせる */
  presentationBusy: boolean;
  /** 練習対戦（チュートリアル）中かどうか。ヒント表示に使う */
  tutorial: boolean;
  /** 自動プレイ。ONの間は自分の手もAIが選ぶ（観戦モード） */
  autoPlay: boolean;
  setAutoPlay: (v: boolean) => void;
  setPresentationBusy: (v: boolean) => void;

  /** 対戦の種類。online のとき dispatch はサーバーへ送るだけになる */
  mode: "local" | "online";
  /** オンライン接続の進行状況 */
  onlineStatus:
    | "idle"
    | "connecting"
    | "waitingOpponent"
    | "playing"
    | "opponentLeft"
    | "error";
  onlineError: string | null;
  /** 合言葉（部屋コード）。相手に伝えて入ってもらう */
  roomCode: string | null;
  opponentName: string | null;
  /** オンライン対戦を開始する（部屋を作る／合言葉で入る／ランダム） */
  connectOnline: (opts: {
    serverUrl: string;
    mode: "create" | "join" | "queue";
    code?: string;
    name: string;
    deck: DeckList;
  }) => void;
  /** オンライン対戦の投了 */
  resignOnline: () => void;
  /**
   * ランダムマッチの待機を維持したままかどうか。
   * true の間はCPU対戦をしていても、相手が見つかったら切り替わる
   */
  queueActive: boolean;
  /** 相手が見つかった瞬間の通知（battle 画面が全画面で知らせて消す） */
  matchFound: string | null;
  clearMatchFound: () => void;

  startGame: (opts: {
    playerDeck: DeckList;
    cpuDeck: DeckList;
    difficulty: Difficulty;
    aiSpeedMs?: number;
    seed?: number;
    tutorial?: boolean;
    /** じゃんけんで決まった先攻。省略すると乱数で決まる */
    firstPlayer?: PlayerId;
  }) => void;
  /** 人間のアクションを適用する。不正な手は無視（UIは合法手のみ出す前提の保険） */
  dispatch: (action: GameAction) => void;
  legalActions: () => GameAction[];
  quitGame: () => void;
  /** ランダムマッチの相手待ちを解除して終了したことをホーム画面で知らせるための印 */
  queueCancelledNotice: boolean;
  clearQueueCancelledNotice: () => void;
}

/**
 * 対戦ごとの乱数の種。デッキのシャッフル順はここから決まるため、
 * 毎回必ず違う値になるよう暗号学的乱数を優先して使う
 * （時刻だけだと、連続で開始したときに同じ種になりうる）。
 */
function randomSeed(): number {
  try {
    const g = globalThis as {
      crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array };
    };
    if (g.crypto?.getRandomValues) {
      const arr = new Uint32Array(1);
      g.crypto.getRandomValues(arr);
      return arr[0] | 0;
    }
  } catch {
    // 利用できない環境では下のフォールバックを使う
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
}

let ai: AIController | null = null;
/** 自動プレイで自分の手を選ぶAI（常に最強設定） */
let humanAi: AIController | null = null;
/** オンライン対戦のWebSocket（local のときは null） */
let socket: WebSocket | null = null;
/** 復帰用の接続情報（部屋コード＋セッショントークン） */
let onlineSession: { serverUrl: string; code: string; sessionToken: string } | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
/** オンラインの受信バッファ（演出中に届いた更新をため、順に流す） */
let pendingUpdates: { view: PlayerView; events: GameEvent[] }[] = [];
/** 実況が捌けたときに受信バッファを流すためのフック */
let onlineDrain: (() => void) | null = null;

function closeSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  pendingUpdates = [];
  onlineDrain = null;
  if (socket) {
    try {
      socket.onclose = null;
      socket.close();
    } catch {
      // すでに閉じていれば無視
    }
    socket = null;
  }
}
let aiTimer: ReturnType<typeof setTimeout> | null = null;
let gameToken = 0; // 対局をまたいだ古いタイマーの発火防止

export const useGameStore = create<GameStore>()((set, get) => {
  function clearAiTimer() {
    if (aiTimer !== null) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
  }

  /** いま手番のプレイヤーをAIが担当するか（CPUは常に、自分は自動プレイ中のみ） */
  function aiFor(actor: PlayerId): AIController | null {
    if (actor === CPU) return ai;
    return get().autoPlay ? humanAi : null;
  }

  /** AIの手番なら1手ずつ間隔を空けて進める */
  function scheduleAI() {
    const token = gameToken;
    const { state, aiSpeedMs } = get();
    if (!state || !ai) return;
    if (state.phase.type === "finished") {
      set({ aiThinking: false });
      return;
    }
    const actor = playerToAct(state);
    if (actor === null || !aiFor(actor)) {
      set({ aiThinking: false });
      return;
    }
    set({ aiThinking: actor === CPU });
    clearAiTimer();
    aiTimer = setTimeout(() => {
      if (token !== gameToken) return;
      // 演出表示中は捌けるまで待つ（実況を読み飛ばさないため）
      if (get().presentationBusy) {
        scheduleAI();
        return;
      }
      const cur = get().state;
      if (!cur) return;
      const curActor = playerToAct(cur);
      if (curActor === null) return;
      const controller = aiFor(curActor);
      if (!controller) return;
      const legal = getLegalActions(ctx, cur, curActor);
      if (legal.length === 0) return;
      const action = controller.chooseAction(viewFor(cur, curActor), legal);
      applyAndContinue(action);
    }, get().presentationBusy ? 200 : aiSpeedMs);
  }

  /** このアクションで起きたイベントに対応する効果音（重複除去・最大3つ） */
  function playEventSounds(events: GameEvent[]) {
    const keys = new Set<SeKey>();
    for (const e of events) {
      switch (e.type) {
        case "gameEnded":
          // 勝敗音だけ鳴らす
          playSe(e.winner === HUMAN ? "win" : "lose");
          return;
        case "cardDrawn":
        case "cardSalvaged":
          keys.add("draw");
          break;
        case "instructorPlayed":
          keys.add("play");
          break;
        case "battleDeclared":
          keys.add("battle");
          break;
        case "instructorRemoved":
        case "cardDiscarded":
          keys.add("hit");
          break;
        case "trackAdvanced":
          if (e.amount > 0) keys.add("advance");
          break;
        case "supportPlayed":
        case "abilityActivated":
        case "instructorBounced":
          keys.add("support");
          break;
        case "jankenPlayed": {
          const humanWon = (e.owner === HUMAN) === e.won;
          keys.add(humanWon ? "janken_win" : "janken_lose");
          break;
        }
      }
    }
    [...keys].slice(0, 3).forEach((k) => playSe(k));
  }

  function applyAndContinue(action: GameAction) {
    const prev = get().state;
    if (!prev) return;
    try {
      const { state, events } = applyAction(ctx, prev, action);
      // UI に渡すイベントは、人間視点の秘匿処理を必ず通す。
      // オンラインで相手に送るものと同じ形にしておくことで、
      // 「通信に載せたら漏れる」バグをオフライン開発中に再現できる
      const visible = redactEventsFor(events, HUMAN);
      set({
        state,
        view: viewFor(state, HUMAN),
        lastEvents: visible,
        eventLog: [...get().eventLog, ...visible],
      });
      // 決着したら成績に記録する（途中でやめた対局は数えない）
      for (const e of events) {
        if (e.type === "gameEnded") {
          const rec = useRecordStore.getState();
          if (e.winner === HUMAN) rec.addWin();
          else rec.addLoss();
        }
      }
      playEventSounds(events);
      scheduleAI();
    } catch (e) {
      // UIは合法手のみを出す設計だが、万一の場合もクラッシュさせない
      console.warn("アクションを適用できませんでした:", e);
    }
  }

  return {
    state: null,
    view: null,
    mode: "local" as const,
    onlineStatus: "idle" as const,
    onlineError: null,
    roomCode: null,
    opponentName: null,
    queueActive: false,
    matchFound: null,
    clearMatchFound: () => set({ matchFound: null }),
    queueCancelledNotice: false,
    clearQueueCancelledNotice: () => set({ queueCancelledNotice: false }),
    eventLog: [],
    lastEvents: [],
    aiThinking: false,
    aiSpeedMs: 600,
    presentationBusy: false,
    tutorial: false,
    autoPlay: false,
    setAutoPlay: (autoPlay) => {
      set({ autoPlay });
      if (autoPlay) scheduleAI(); // ONにしたら即、自分の手番から動き出す
    },
    setPresentationBusy: (presentationBusy) => {
      set({ presentationBusy });
      if (!presentationBusy) {
        scheduleAI(); // 演出が終わったらすぐ再開
        onlineDrain?.(); // オンラインならたまった更新を流す
      }
    },

    startGame: ({
      playerDeck,
      cpuDeck,
      difficulty,
      aiSpeedMs = 600,
      seed,
      tutorial = false,
      firstPlayer,
    }) => {
      gameToken++;
      clearAiTimer();
      // ランダムマッチの待機中は接続を維持したままCPU対戦を回す
      // （相手が見つかったら matchStart がこの対局を破棄して切り替える）
      if (get().queueActive) {
        set({ mode: "local" });
      } else {
        closeSocket();
        set({ mode: "local", onlineStatus: "idle", onlineError: null, roomCode: null, opponentName: null });
      }
      const realSeed = seed ?? randomSeed();
      ai = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS[difficulty], realSeed ^ 0x55aa);
      // 自動プレイ用。自分側は常に最強設定で打つ
      humanAi = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.hard, realSeed ^ 0x1234);
      const { state, events } = createGame(ctx, {
        seed: realSeed,
        decks: [playerDeck, cpuDeck],
        firstPlayer,
      });
      const visible = redactEventsFor(events, HUMAN);
      set({
        state,
        view: viewFor(state, HUMAN),
        eventLog: visible,
        lastEvents: visible,
        aiThinking: false,
        aiSpeedMs,
        presentationBusy: false,
        tutorial,
        autoPlay: false,
      });
      // マリガンはCPUが後から決めても問題ないため、人間の入力を待つ
      scheduleAI();
    },

    connectOnline: ({ serverUrl, mode, code, name, deck }) => {
      // 既存の対局・接続を片づけてから始める
      gameToken++;
      clearAiTimer();
      closeSocket();
      onlineSession = null;
      set({
        mode: "online",
        queueActive: mode === "queue",
        matchFound: null,
        onlineStatus: "connecting",
        onlineError: null,
        roomCode: null,
        opponentName: null,
        state: null,
        view: null,
        eventLog: [],
        lastEvents: [],
        aiThinking: false,
        presentationBusy: false,
        tutorial: false,
        autoPlay: false,
      });

      /** たまった更新を1件ずつ流す（演出中は待つ）。まとまっていたら早送り */
      const drainUpdates = () => {
        if (pendingUpdates.length === 0) return;
        if (get().presentationBusy) return;
        // 3件以上たまっていたら早送り: イベントはログへ一括、盤面は最新だけ
        if (pendingUpdates.length >= 3) {
          const all = pendingUpdates;
          pendingUpdates = [];
          const events = all.flatMap((u) => u.events);
          set({
            view: all[all.length - 1].view,
            lastEvents: [],
            eventLog: [...get().eventLog, ...events],
          });
          return;
        }
        const next = pendingUpdates.shift()!;
        set({
          view: next.view,
          lastEvents: next.events,
          eventLog: [...get().eventLog, ...next.events],
        });
        playEventSounds(next.events);
      };
      onlineDrain = drainUpdates;

      const open = (isReconnect: boolean) => {
        let ws: WebSocket;
        try {
          ws = new WebSocket(serverUrl);
        } catch (e) {
          set({ onlineStatus: "error", onlineError: `サーバーに接続できません: ${e}` });
          return;
        }
        socket = ws;

        ws.onopen = () => {
          reconnectAttempt = 0;
          if (isReconnect && onlineSession) {
            ws.send(
              JSON.stringify({
                type: "reattach",
                code: onlineSession.code,
                sessionToken: onlineSession.sessionToken,
              })
            );
            return;
          }
          if (mode === "create") {
            ws.send(JSON.stringify({ type: "createRoom", name, deck }));
          } else if (mode === "join") {
            ws.send(JSON.stringify({ type: "joinRoom", code, name, deck }));
          } else {
            ws.send(JSON.stringify({ type: "joinQueue", name, deck }));
          }
          set({ onlineStatus: "waitingOpponent" });
        };

        ws.onmessage = (ev) => {
          if (socket !== ws) return; // 古い接続からの残響は無視
          let msg: {
            type: string;
            code?: string;
            name?: string;
            message?: string;
            seat?: number;
            sessionToken?: string;
            seq?: number;
            view?: PlayerView;
            events?: GameEvent[];
          };
          try {
            msg = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          switch (msg.type) {
            case "joined":
              // 復帰用にトークンを控えて、準備完了を送る
              if (msg.sessionToken) {
                onlineSession = {
                  serverUrl,
                  code: onlineSession?.code ?? get().roomCode ?? code ?? "",
                  sessionToken: msg.sessionToken,
                };
              }
              ws.send(JSON.stringify({ type: "ready" }));
              break;
            case "roomCreated":
              set({ roomCode: msg.code ?? null });
              if (onlineSession) onlineSession.code = msg.code ?? "";
              break;
            case "opponentJoined":
              set({ opponentName: msg.name ?? null });
              break;
            case "matchStart": {
              // 待機中にCPU対戦をしていた場合はそれを破棄して切り替える
              gameToken++;
              clearAiTimer();
              pendingUpdates = [];
              set({
                mode: "online",
                onlineStatus: "playing",
                onlineError: null,
                queueActive: false,
                matchFound: get().opponentName ?? "相手",
                state: null,
                lastEvents: [],
                eventLog: [],
                aiThinking: false,
                presentationBusy: false,
                tutorial: false,
                autoPlay: false,
              });
              break;
            }
            case "update": {
              const view = msg.view ?? null;
              const events = msg.events ?? [];
              if (!view) break;
              // 秘匿はサーバー側で済んでいる。演出中はためて順に流す
              pendingUpdates.push({ view, events });
              drainUpdates();
              break;
            }
            case "opponentLeft":
              set({ onlineStatus: "opponentLeft" });
              break;
            case "error":
              set({ onlineError: msg.message ?? "エラーが発生しました" });
              break;
          }
        };

        ws.onerror = () => {
          if (socket !== ws) return;
          if (!onlineSession) {
            set({
              onlineStatus: "error",
              onlineError:
                "サーバーに接続できません。アドレスとサーバーの起動を確認してください。",
            });
          }
        };
        ws.onclose = () => {
          if (socket !== ws) return;
          const st = get();
          // 対局に入る前に切れた → エラー表示
          if (!onlineSession || st.mode !== "online") {
            if (st.onlineStatus !== "error" && st.mode === "online" && st.view === null) {
              set({ onlineStatus: "error", onlineError: "接続が切れました" });
            }
            return;
          }
          // 対局中の切断 → 自動で再接続を試みる（1,2,4,8…最大15秒間隔）
          reconnectAttempt++;
          const delay = Math.min(15000, 1000 * 2 ** (reconnectAttempt - 1));
          set({ onlineError: "接続が切れました。再接続しています…" });
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            open(true);
          }, delay);
        };
      };

      open(false);
    },

    resignOnline: () => {
      if (socket) socket.send(JSON.stringify({ type: "resign" }));
    },

    dispatch: (action) => {
      // オンラインでは手をサーバーに送るだけ。適用と検証はサーバーが行う
      if (get().mode === "online") {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "action", action }));
        }
        return;
      }
      const state = get().state;
      if (!state) return;
      if (playerToAct(state) !== action.player) return;
      applyAndContinue(action);
    },

    legalActions: () => {
      const state = get().state;
      if (!state) return [];
      return getLegalActions(ctx, state, HUMAN);
    },

    quitGame: () => {
      gameToken++;
      clearAiTimer();
      // ランダムマッチの相手待ち中にやめたときは、待ちの解除をホームで知らせる
      const wasQueued = get().queueActive;
      if (socket) {
        try {
          socket.send(JSON.stringify({ type: "leave" }));
        } catch {
          // 送れなくても閉じる
        }
      }
      closeSocket();
      onlineSession = null;
      set({ queueActive: false, matchFound: null, queueCancelledNotice: wasQueued });
      ai = null;
      set({
        state: null,
        view: null,
        mode: "local",
        onlineStatus: "idle",
        onlineError: null,
        roomCode: null,
        opponentName: null,
        eventLog: [],
        lastEvents: [],
        aiThinking: false,
        presentationBusy: false,
        tutorial: false,
      });
    },
  };
});

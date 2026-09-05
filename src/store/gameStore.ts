import { create } from "zustand";
import { playSe, SeKey } from "@/audio/sound";
import { applyPersona, DIFFICULTY_PARAMS } from "@/ai/difficulty";
import { HeuristicAI } from "@/ai/heuristic";
import { AIController, Difficulty } from "@/ai/types";
import { cardRegistry } from "@/data/cards";
import { createGame } from "@/engine/createGame";
import { DeckList } from "@/engine/deckRules";
import { getLegalActions } from "@/engine/legalActions";
import { applyAction, playerToAct } from "@/engine/reducer";
import { redactEventsFor, viewFor } from "@/engine/view";
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { evaluateAchievements, useAchievementStore } from "@/store/achievementStore";
import { ReplayData, useRecordStore } from "@/store/recordStore";
import { useMissionStore } from "@/store/missionStore";
import { useTournamentStore } from "@/store/tournamentStore";
import { noteCommitMs } from "@/perf";
import { getDeviceId, trackEvent } from "@/data/telemetry";
import { useRankStore } from "@/store/rankStore";
import { useSettingsStore } from "@/store/settingsStore";
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

/** オンライン対戦のじゃんけんの手（サーバーのプロトコルと同じ値） */
export type JankenHand = "rock" | "scissors" | "paper";

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

  /** 対戦の種類。online のとき dispatch はサーバーへ送るだけになる。
   * spectate は観戦（対戦画面をそのまま読み取り専用で使う） */
  mode: "local" | "online" | "spectate";
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
  /** 相手が名乗っている称号（実績で獲得したもの） */
  opponentTitle: string | null;
  /** 相手の端末ID（挑戦状の宛先に使う。個人特定には使わない） */
  opponentDevice: string | null;
  /** 挑戦状から始まった「因縁の再戦」か */
  revengeMatch: boolean;
  /** 観戦者からの応援（battle 画面が拾って流す） */
  cheers: { key: number; emoji: string }[];
  /** いまの観戦者数 */
  spectatorCount: number;
  /** オンライン対戦を開始する（部屋を作る／合言葉で入る／ランダム） */
  connectOnline: (opts: {
    serverUrl: string;
    mode: "create" | "join" | "queue";
    code?: string;
    name: string;
    deck: DeckList;
    /** 挑戦状から始まる対戦（「因縁の再戦」演出になる） */
    revenge?: boolean;
  }) => void;
  /** 観戦を始める（対戦画面そのままの観戦。/spectate から呼ぶ） */
  connectSpectate: (opts: {
    serverUrl: string;
    code: string;
    names: [string, string];
  }) => void;
  /** 観戦者からの応援を送る */
  sendCheer: (emoji: string) => void;
  /** 観戦中: プレイヤー0（画面下側）の手札枚数（中身は届かない） */
  spectateHandCount: number;
  /** 観戦中: [下側, 上側] の表示名 */
  spectateNames: [string, string] | null;
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
  /** オンライン対戦の先攻を決めるじゃんけん */
  jankenActive: boolean;
  jankenHand: JankenHand | null;
  jankenResult: { myHand: JankenHand; oppHand: JankenHand; result: "win" | "lose" | "tie" } | null;
  sendJanken: (hand: JankenHand) => void;
  /** 再戦（オンライン）。両者が希望するとじゃんけんからやり直す */
  rematchRequested: boolean;
  rematchOffered: boolean;
  requestRematch: () => void;
  /** 相手の接続状態（オンライン。false=切断中・復帰待ち） */
  opponentConnected: boolean;
  /** 定型スタンプ */
  incomingStamp: string | null;
  myStamp: string | null;
  sendStamp: (id: string) => void;

  startGame: (opts: {
    playerDeck: DeckList;
    cpuDeck: DeckList;
    difficulty: Difficulty;
    aiSpeedMs?: number;
    seed?: number;
    tutorial?: boolean;
    /** じゃんけんで決まった先攻。省略すると乱数で決まる */
    firstPlayer?: PlayerId;
    /** 「インストラクターに挑戦」の相手のカードID */
    kyokan?: string;
    /** トーナメントの1戦かどうか */
    tournament?: boolean;
  }) => void;
  /** トーナメントの1戦の最中か（結果画面の導線に使う） */
  tournamentMatch: boolean;
  /** 「インストラクターに挑戦」中の相手のカードID（通常対戦は null） */
  kyokanId: string | null;
  /** 人間のアクションを適用する。不正な手は無視（UIは合法手のみ出す前提の保険） */
  dispatch: (action: GameAction) => void;
  legalActions: () => GameAction[];
  quitGame: () => void;
  /** ランダムマッチの相手待ちを解除して終了したことをホーム画面で知らせるための印 */
  queueCancelledNotice: boolean;
  clearQueueCancelledNotice: () => void;
  /** リプレイ再生（CPU対戦の記録を再現する） */
  replayActive: boolean;
  replaySpeed: 1 | 2;
  setReplaySpeed: (s: 1 | 2) => void;
  /** リプレイの一時停止 */
  replayPaused: boolean;
  toggleReplayPause: () => void;
  /** リプレイを1手戻す（最初から高速で作り直す） */
  replayStepBack: () => void;
  startReplay: (replay: ReplayData) => void;
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
/** 自分の席番号（じゃんけんの勝敗判定に使う。view が届く前に必要） */
let onlineSeat: number | null = null;
/** じゃんけん結果の表示を自動で閉じるためのタイマー */
let jankenTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * いま進行中の対局の記録用メモ。決着時に対戦記録として保存する。
 * 練習対戦（tutorial）は記録しない
 */
let matchMeta: {
  mode: "cpu" | "online";
  difficulty: string | null;
  deckName: string;
  startedAt: number;
  tutorial: boolean;
  turns: number;
  firstIsMe: boolean | null;
  /** メタ分析用: 自分のデッキのカードID一覧（匿名集計に送る） */
  myCards: string[];
  /** 「インストラクターに挑戦」の相手のカードID */
  kyokan: string | null;
  /** トーナメントの1戦か */
  tournament: boolean;
  /** リプレイ用（CPU対戦のみ）: 種・デッキ・全アクション */
  replaySeed: number | null;
  replayDecks: [DeckList, DeckList] | null;
  replayFirst: PlayerId | null;
  replayActions: GameAction[];
} | null = null;

/** 教習が連続で進んだときのコンボ段数（効果音の音程が半音ずつ上がる） */
let advanceCombo = 0;
let lastAdvanceAt = 0;

/** スタンプ表示を自動で消すタイマー */
let stampTimer: ReturnType<typeof setTimeout> | null = null;
let myStampTimer: ReturnType<typeof setTimeout> | null = null;

/** リプレイ再生用のタイマーと残り手順 */
let replayTimer: ReturnType<typeof setTimeout> | null = null;
let replayQueue: GameAction[] = [];
// 1手戻し用に、再生中のリプレイ全体と適用済み手数を持っておく
let replayData: ReplayData | null = null;
let replayApplied = 0;

/** イベントを見て対戦メモを進め、決着していたら対戦記録に保存する */
function trackMatchEvents(
  events: GameEvent[],
  viewAfter: PlayerView | null,
  myId: PlayerId
): void {
  if (!matchMeta) return;
  for (const e of events) {
    if (e.type === "gameStarted") {
      matchMeta.firstIsMe = e.firstPlayer === myId;
      matchMeta.replayFirst = e.firstPlayer;
    }
    if (e.type === "turnStarted") matchMeta.turns = e.turnNumber;
    if (e.type === "battleResolved" && !matchMeta.tutorial) {
      const won =
        e.attackerTotal > e.defenderTotal
          ? e.attackerPlayer === myId
          : e.defenderTotal > e.attackerTotal
            ? e.attackerPlayer !== myId
            : false;
      if (won) useMissionStore.getState().report("battleWin");
    }
    if (e.type === "gameEnded") {
      const meta = matchMeta;
      matchMeta = null; // 二重記録を防ぐ
      if (meta.tutorial) return; // 練習対戦は記録しない
      const opponentName = meta.mode === "online" ? (useGameStore.getState().opponentName ?? "相手") : null;
      // 通算・連戦の勝敗カウント（CPU・オンライン共通。練習対戦は上で除外済み）
      if (e.winner === myId) useRecordStore.getState().addWin();
      else useRecordStore.getState().addLoss();
      // トーナメントの進行
      if (meta.tournament) {
        useTournamentStore.getState().reportResult(e.winner === myId);
      }
      // デイリーミッションへ報告
      useMissionStore.getState().report("match");
      if (e.winner === myId) {
        useMissionStore.getState().report("win");
        if (meta.kyokan) useMissionStore.getState().report("kyokanWin");
      }
      useRecordStore.getState().addMatch({
        at: new Date().toISOString(),
        mode: meta.mode,
        opponentName,
        difficulty: meta.difficulty,
        result: e.winner === myId ? "win" : "lose",
        reason: e.reason === "deckOut" ? "deckOut" : "complete",
        myDeckName: meta.deckName,
        kyokan: meta.kyokan ?? undefined,
        first: meta.firstIsMe ?? true,
        turns: meta.turns,
        durationSec: Math.max(0, Math.round((Date.now() - meta.startedAt) / 1000)),
        myAcademic: viewAfter?.self.academic ?? 0,
        mySkill: viewAfter?.self.skill ?? 0,
        oppAcademic: viewAfter?.opponent.academic ?? 0,
        oppSkill: viewAfter?.opponent.skill ?? 0,
        // CPU対戦はリプレイできるよう手順一式も残す
        replay:
          meta.mode === "cpu" &&
          meta.replaySeed !== null &&
          meta.replayDecks !== null &&
          meta.replayFirst !== null
            ? {
                seed: meta.replaySeed,
                playerDeck: meta.replayDecks[0],
                cpuDeck: meta.replayDecks[1],
                firstPlayer: meta.replayFirst,
                actions: meta.replayActions,
              }
            : undefined,
      });
      // 新しく達成した実績があればお知らせを出す
      evaluateAchievements();
      // 利用状況の集計。名前は本人が免許証に付けた表示名だけを
      // 週間ランキングの掲示に使う（未設定ならランキングに載らない）
      trackEvent("match", {
        mode: meta.mode,
        result: e.winner === myId ? "win" : "lose",
        difficulty: meta.difficulty,
        turns: meta.turns,
        durationSec: Math.max(0, Math.round((Date.now() - meta.startedAt) / 1000)),
        first: meta.firstIsMe ?? undefined,
        // メタ分析用（カード別の使用率・勝率）
        cards: meta.myCards,
        // デッキ分析用（この時点のアクティブデッキ名。入れ替え設定時は近似）
        deckName: resolveActiveDeck(useDeckStore.getState()).name,
        name: useRankStore.getState().playerName.trim() || undefined,
        streak: useRecordStore.getState().streak,
      });
      return;
    }
  }
}
/** 挑戦状の宛先交換用に、端末IDを先読みしておく */
let cachedDevice = "";
void getDeviceId().then((d) => {
  cachedDevice = d;
});

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

// ===== CPU思考の別レーン（Web Worker）。画面のアニメーションを止めないため =====
// 使えない環境・失敗時は従来どおりメインスレッドで考える（挙動は同一）
let aiWorker: Worker | null = null;
let aiWorkerBroken = false;
let aiReqSeq = 0;
let aiPending: { id: number; token: number; timeout: ReturnType<typeof setTimeout> } | null = null;

function disposeAiWorker() {
  if (aiPending) {
    clearTimeout(aiPending.timeout);
    aiPending = null;
  }
  try {
    aiWorker?.terminate();
  } catch {
    // 終了に失敗しても実害なし
  }
  aiWorker = null;
}

/** 行動の一致（キーの並び順に依存しない構造比較。Workerの答えの検証用） */
function sameAction(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    sameAction((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}

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

  /**
   * Workerの答え（または保険のnull）から着手を確定する。
   * 適用のタイミング・順序はこれまでの scheduleAI と完全に同じ流れ
   */
  function finishAiChoice(action: GameAction | null) {
    const cur = get().state;
    if (!cur || cur.phase.type === "finished") return;
    const curActor = playerToAct(cur);
    if (curActor === null) return;
    const controller = aiFor(curActor);
    if (!controller) return;
    const legal = getLegalActions(ctx, cur, curActor);
    if (legal.length === 0) return;
    if (action && legal.some((l) => sameAction(l, action))) {
      applyAndContinue(action);
      return;
    }
    // Workerの答えが使えないときは、その場で従来どおり考える（保険）
    applyAndContinue(controller.chooseAction(viewFor(cur, curActor), legal));
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
      // 対応環境ではWorkerに考えさせ、思考中も画面のアニメーションを止めない。
      // 着手の適用は finishAiChoice（従来と同じ検証と流れ）で行う
      if (aiWorker && !aiWorkerBroken && !aiPending) {
        const id = ++aiReqSeq;
        const timeout = setTimeout(() => {
          // 返事が来なければWorkerを見限り、従来方式で続行する
          if (aiPending?.id !== id) return;
          aiPending = null;
          aiWorkerBroken = true;
          disposeAiWorker();
          if (token !== gameToken) return;
          finishAiChoice(null);
        }, 4000);
        aiPending = { id, token, timeout };
        aiWorker.postMessage({
          type: "choose",
          id,
          actor: curActor,
          cpuActor: CPU,
          view: viewFor(cur, curActor),
        });
        return;
      }
      const action = controller.chooseAction(viewFor(cur, curActor), legal);
      applyAndContinue(action);
    }, get().presentationBusy ? 200 : aiSpeedMs);
  }

  /** このアクションで起きたイベントに対応する効果音（重複除去・最大3つ） */
  function playEventSounds(events: GameEvent[]) {
    // バトル解決の一括イベント（退場音など）は、勝敗カットインの専用効果音と
    // 被らないよう鳴らさない（勝敗音はカットイン側が再生する）
    if (events.some((e) => e.type === "battleResolved")) {
      for (const e of events) {
        if (e.type === "gameEnded") playSe(e.winner === HUMAN ? "win" : "lose");
      }
      return;
    }
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
          // advance はコンボで音程が変わるため keys ではなく個別に鳴らす
          break;
        case "supportPlayed":
        case "abilityActivated":
        case "battleBuffApplied":
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
    // 教習が進む音: 短い間隔で連続すると半音ずつ音程が上がる（コンボの快感）
    if (events.some((e) => e.type === "gameStarted")) {
      advanceCombo = 0;
    }
    if (events.some((e) => e.type === "trackAdvanced" && e.amount > 0)) {
      const now = Date.now();
      advanceCombo = now - lastAdvanceAt < 15000 ? advanceCombo + 1 : 0;
      lastAdvanceAt = now;
      playSe("advance", 1 + Math.min(0.3, advanceCombo * 0.06));
    }
  }

  function applyAndContinue(action: GameAction) {
    const prev = get().state;
    if (!prev) return;
    // 1手の適用〜画面反映までの時間を計測する（性能ログ用）
    const commitStart =
      typeof performance !== "undefined" && typeof requestAnimationFrame === "function"
        ? performance.now()
        : 0;
    if (commitStart) {
      requestAnimationFrame(() => noteCommitMs(performance.now() - commitStart));
    }
    // リプレイ用に全アクションを順番どおり控える（CPU対戦のみ）
    if (matchMeta?.mode === "cpu" && !get().replayActive) {
      matchMeta.replayActions.push(action);
    }
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
      // 決着時の成績カウントは trackMatchEvents 側で行う（オンラインと共通化）
      trackMatchEvents(events, get().view, HUMAN);
      playEventSounds(events);
      scheduleAI();
    } catch (e) {
      // UIは合法手のみを出す設計だが、万一の場合もクラッシュさせない
      console.warn("アクションを適用できませんでした:", e);
    }
  }

  /** リプレイ: 記録された手順を一定間隔で1手ずつ適用する */
  function scheduleReplayStep() {
    if (replayTimer) clearTimeout(replayTimer);
    const token = gameToken;
    const step = () => {
      if (token !== gameToken) return;
      const st = get();
      if (!st.replayActive || !st.state || st.state.phase.type === "finished") return;
      // 一時停止中・演出中は捌けるまで待つ
      if (st.replayPaused || st.presentationBusy) {
        replayTimer = setTimeout(step, 200);
        return;
      }
      const action = replayQueue.shift();
      if (!action) return;
      replayApplied++;
      try {
        const { state, events } = applyAction(ctx, st.state, action);
        const visible = redactEventsFor(events, HUMAN);
        set({
          state,
          view: viewFor(state, HUMAN),
          lastEvents: visible,
          eventLog: [...get().eventLog, ...visible],
        });
        playEventSounds(events);
      } catch (e) {
        console.warn("リプレイの再生に失敗しました:", e);
        return;
      }
      replayTimer = setTimeout(step, Math.max(260, 900 / get().replaySpeed));
    };
    replayTimer = setTimeout(step, 900);
  }

  return {
    state: null,
    view: null,
    mode: "local" as const,
    onlineStatus: "idle" as const,
    onlineError: null,
    roomCode: null,
    opponentName: null,
    opponentTitle: null,
    opponentDevice: null,
    revengeMatch: false,
    cheers: [],
    spectatorCount: 0,
    spectateHandCount: 0,
    spectateNames: null,
    queueActive: false,
    matchFound: null,
    clearMatchFound: () => set({ matchFound: null }),
    queueCancelledNotice: false,
    clearQueueCancelledNotice: () => set({ queueCancelledNotice: false }),
    replayActive: false,
    replaySpeed: 1 as const,
    setReplaySpeed: (replaySpeed) => set({ replaySpeed }),
    replayPaused: false,
    toggleReplayPause: () => set({ replayPaused: !get().replayPaused }),
    replayStepBack: () => {
      if (!replayData || replayApplied <= 0) return;
      // 最初から (適用済み-1) 手までを音・演出なしで一気に適用し直す
      const target = replayApplied - 1;
      try {
        let { state } = createGame(ctx, {
          seed: replayData.seed,
          decks: [replayData.playerDeck, replayData.cpuDeck],
          firstPlayer: replayData.firstPlayer,
        });
        const log: GameEvent[] = [];
        for (let i = 0; i < target; i++) {
          const r = applyAction(ctx, state, replayData.actions[i]);
          state = r.state;
          log.push(...redactEventsFor(r.events, HUMAN));
        }
        replayQueue = replayData.actions.slice(target);
        replayApplied = target;
        set({
          state,
          view: viewFor(state, HUMAN),
          lastEvents: [],
          eventLog: log,
          replayPaused: true, // 戻した後は止めて見られるように
          presentationBusy: false,
        });
        scheduleReplayStep();
      } catch (e) {
        console.warn("リプレイの巻き戻しに失敗しました:", e);
      }
    },
    startReplay: (replay) => {
      // 進行中の対局や接続を片づけてから、記録どおりに対局を作り直す
      gameToken++;
      clearAiTimer();
      if (replayTimer) clearTimeout(replayTimer);
      closeSocket();
      onlineSession = null;
      matchMeta = null; // リプレイは対戦記録に入れない
      ai = null;
      const { state, events } = createGame(ctx, {
        seed: replay.seed,
        decks: [replay.playerDeck, replay.cpuDeck],
        firstPlayer: replay.firstPlayer,
      });
      replayQueue = [...replay.actions];
      replayData = replay;
      replayApplied = 0;
      const visible = redactEventsFor(events, HUMAN);
      set({
        state,
        view: viewFor(state, HUMAN),
        mode: "local",
        onlineStatus: "idle",
        onlineError: null,
        roomCode: null,
        opponentName: null,
        queueActive: false,
        matchFound: null,
        eventLog: visible,
        lastEvents: visible,
        aiThinking: false,
        presentationBusy: false,
        tutorial: false,
        autoPlay: true, // 実況を自動送りにする
        replayActive: true,
        replaySpeed: 1,
        replayPaused: false,
      });
      scheduleReplayStep();
    },
    rematchRequested: false,
    rematchOffered: false,
    requestRematch: () => {
      if (get().rematchRequested) return;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "rematch" }));
      set({ rematchRequested: true });
    },
    opponentConnected: true,
    incomingStamp: null,
    myStamp: null,
    sendStamp: (id) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "stamp", id }));
      if (myStampTimer) clearTimeout(myStampTimer);
      set({ myStamp: id });
      myStampTimer = setTimeout(() => {
        myStampTimer = null;
        set({ myStamp: null });
      }, 3000);
    },
    jankenActive: false,
    jankenHand: null,
    jankenResult: null,
    sendJanken: (hand) => {
      if (!get().jankenActive || get().jankenHand !== null) return;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "janken", hand }));
      set({ jankenHand: hand });
    },
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

    kyokanId: null,
    tournamentMatch: false,
    startGame: ({
      playerDeck,
      cpuDeck,
      difficulty,
      aiSpeedMs = 600,
      seed,
      tutorial = false,
      firstPlayer,
      kyokan,
      tournament = false,
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
      set({ kyokanId: kyokan ?? null, tournamentMatch: tournament });
      const realSeed = seed ?? randomSeed();
      // 設定されたCPUの個性（こうげき型／まもり型）を反映する。練習対戦は素のまま
      const persona = tutorial ? "balanced" : useSettingsStore.getState().cpuPersona;
      ai = new HeuristicAI(
        cardRegistry,
        applyPersona(DIFFICULTY_PARAMS[difficulty], persona),
        realSeed ^ 0x55aa
      );
      // 自動プレイ用。自分側は常に最強設定で打つ
      humanAi = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.hard, realSeed ^ 0x1234);
      // CPU思考の別レーンを起動（対応環境のみ。失敗したら従来方式のまま）
      disposeAiWorker();
      aiWorkerBroken = false;
      if (typeof Worker !== "undefined") {
        try {
          aiWorker = new Worker(new URL("../ai/aiWorker.ts", import.meta.url), {
            type: "module",
          });
          aiWorker.onerror = () => {
            aiWorkerBroken = true;
            disposeAiWorker();
          };
          aiWorker.onmessage = (ev: MessageEvent) => {
            const data = ev.data as { id: number; action: GameAction | null };
            const p = aiPending;
            if (!p || p.id !== data.id) return;
            clearTimeout(p.timeout);
            aiPending = null;
            if (p.token !== gameToken) return;
            finishAiChoice(data.action ?? null);
          };
          aiWorker.postMessage({ type: "init", difficulty, persona, seed: realSeed });
        } catch {
          aiWorkerBroken = true;
          aiWorker = null;
        }
      }
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
        replayActive: false,
      });
      // 対戦記録用のメモを始める（決着時に保存。練習対戦は保存しない）
      matchMeta = {
        mode: "cpu",
        difficulty,
        deckName: resolveActiveDeck(useDeckStore.getState()).name,
        startedAt: Date.now(),
        tutorial,
        turns: 0,
        firstIsMe: null,
        myCards: [...playerDeck.main, playerDeck.tantou],
        kyokan: kyokan ?? null,
        tournament,
        replaySeed: realSeed,
        replayDecks: [playerDeck, cpuDeck],
        replayFirst: firstPlayer ?? null,
        replayActions: [],
      };
      trackMatchEvents(events, get().view, HUMAN);
      // マリガンはCPUが後から決めても問題ないため、人間の入力を待つ
      scheduleAI();
    },

    connectOnline: ({ serverUrl, mode, code, name, deck, revenge }) => {
      // 新しいオンライン対戦の始まり＝「今回の連戦」をここから数え直す
      // （再戦は接続を張り直さないので連戦カウントは続く）
      useRecordStore.getState().resetSession();
      // 既存の対局・接続を片づけてから始める
      gameToken++;
      clearAiTimer();
      closeSocket();
      onlineSession = null;
      set({
        opponentConnected: true,
        mode: "online",
        // 合言葉の部屋を作って待つ間もランダムマッチと同様にCPU対戦できるようにする
        queueActive: mode === "queue" || mode === "create",
        matchFound: null,
        onlineStatus: "connecting",
        onlineError: null,
        roomCode: null,
        opponentName: null,
        opponentDevice: null,
        revengeMatch: revenge ?? false,
        cheers: [],
        spectatorCount: 0,
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
          const latest = all[all.length - 1].view;
          set({
            view: latest,
            lastEvents: [],
            eventLog: [...get().eventLog, ...events],
          });
          trackMatchEvents(events, latest, latest.playerId);
          return;
        }
        const next = pendingUpdates.shift()!;
        set({
          view: next.view,
          lastEvents: next.events,
          eventLog: [...get().eventLog, ...next.events],
        });
        trackMatchEvents(next.events, next.view, next.view.playerId);
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
          if (isReconnect && onlineSession && onlineSession.code) {
            ws.send(
              JSON.stringify({
                type: "reattach",
                code: onlineSession.code,
                sessionToken: onlineSession.sessionToken,
              })
            );
            return;
          }
          // 実績で選んだ称号があれば一緒に名乗る
          const title = useAchievementStore.getState().selectedTitle ?? undefined;
          const device = cachedDevice || undefined;
          if (mode === "create") {
            ws.send(JSON.stringify({ type: "createRoom", name, title, deck, device }));
          } else if (mode === "join") {
            ws.send(JSON.stringify({ type: "joinRoom", code, name, title, deck, device }));
          } else {
            ws.send(JSON.stringify({ type: "joinQueue", name, title, deck, device }));
          }
          set({ onlineStatus: "waitingOpponent" });
        };

        ws.onmessage = (ev) => {
          if (socket !== ws) return; // 古い接続からの残響は無視
          let msg: {
            type: string;
            code?: string;
            name?: string;
            title?: string;
            message?: string;
            seat?: number;
            sessionToken?: string;
            seq?: number;
            view?: PlayerView;
            events?: GameEvent[];
            hands?: [JankenHand, JankenHand];
            winner?: number | null;
            device?: string;
            emoji?: string;
            count?: number;
          };
          try {
            msg = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          switch (msg.type) {
            case "joined":
              // 復帰用にトークンと席番号を控えて、準備完了を送る
              if (typeof msg.seat === "number") onlineSeat = msg.seat;
              if (msg.sessionToken) {
                onlineSession = {
                  serverUrl,
                  // ランダムマッチでは部屋コードを知らないままだったため、
                  // joined がサーバーから部屋コードを教えてくれる（切断復帰用）
                  code:
                    (msg as { code?: string }).code ??
                    onlineSession?.code ??
                    get().roomCode ??
                    code ??
                    "",
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
              set({
                opponentName: msg.name ?? null,
                opponentTitle: msg.title ?? null,
                opponentDevice: msg.device ?? null,
              });
              break;
            case "cheer":
              // 観戦者からの応援。直近5件だけ持ち、battle 画面が流す
              if (msg.emoji) {
                set({
                  cheers: [
                    ...get().cheers.slice(-4),
                    { key: Date.now() + Math.random(), emoji: msg.emoji },
                  ],
                });
              }
              break;
            case "spectators":
              set({ spectatorCount: msg.count ?? 0 });
              break;
            case "jankenStart":
              // 先攻を決めるじゃんけん。CPU対戦中でも全画面で選択画面をかぶせる
              if (jankenTimer) {
                clearTimeout(jankenTimer);
                jankenTimer = null;
              }
              set({
                jankenActive: true,
                jankenHand: null,
                jankenResult: null,
                rematchRequested: false,
                rematchOffered: false,
              });
              break;
            case "jankenResult": {
              const hands = msg.hands;
              if (!hands) break;
              const seat = onlineSeat === 1 ? 1 : 0;
              const winner = msg.winner ?? null;
              const result: "win" | "lose" | "tie" =
                winner === null ? "tie" : winner === seat ? "win" : "lose";
              set({
                jankenResult: { myHand: hands[seat], oppHand: hands[1 - seat], result },
              });
              if (jankenTimer) clearTimeout(jankenTimer);
              if (result === "tie") {
                // あいこ表示を少し見せてから、もう一度選ばせる
                jankenTimer = setTimeout(() => {
                  jankenTimer = null;
                  set({ jankenHand: null, jankenResult: null });
                }, 1600);
              } else {
                // 勝敗を見せてから閉じる（裏ではすでに対局が始まっている）
                jankenTimer = setTimeout(() => {
                  jankenTimer = null;
                  set({ jankenActive: false, jankenHand: null, jankenResult: null });
                }, 2400);
              }
              break;
            }
            case "matchStart": {
              // 待機中にCPU対戦をしていた場合はそれを破棄して切り替える
              gameToken++;
              clearAiTimer();
              pendingUpdates = [];
              // 対戦記録用のメモ（オンライン対戦。リプレイは保存しない）
              matchMeta = {
                mode: "online",
                difficulty: null,
                deckName: resolveActiveDeck(useDeckStore.getState()).name,
                startedAt: Date.now(),
                tutorial: false,
                turns: 0,
                firstIsMe: null,
                myCards: (() => {
                  const d = resolveActiveDeck(useDeckStore.getState()).list;
                  return [...d.main, d.tantou];
                })(),
                kyokan: null,
                tournament: false,
                replaySeed: null,
                replayDecks: null,
                replayFirst: null,
                replayActions: [],
              };
              set({
                mode: "online",
                onlineStatus: "playing",
                onlineError: null,
                queueActive: false,
                // じゃんけんの結果表示が出ているときは「見つかりました」は出さない
                matchFound: get().jankenActive ? null : (get().opponentName ?? "相手"),
                state: null,
                lastEvents: [],
                eventLog: [],
                aiThinking: false,
                presentationBusy: false,
                tutorial: false,
                autoPlay: false,
                replayActive: false,
              });
              break;
            }
            case "update": {
              const view = msg.view ?? null;
              const events = msg.events ?? [];
              if (!view) break;
              // 盤面が届いた＝接続は生きている。切断表示が残っていれば消す
              if (get().onlineError) set({ onlineError: null });
              // 秘匿はサーバー側で済んでいる。演出中はためて順に流す
              pendingUpdates.push({ view, events });
              drainUpdates();
              break;
            }
            case "rematchOffered":
              set({ rematchOffered: true });
              break;
            case "stamp": {
              const id = (msg as { id?: string }).id ?? null;
              if (!id) break;
              if (stampTimer) clearTimeout(stampTimer);
              set({ incomingStamp: id });
              stampTimer = setTimeout(() => {
                stampTimer = null;
                set({ incomingStamp: null });
              }, 3000);
              break;
            }
            case "opponentLeft":
              set({ onlineStatus: "opponentLeft" });
              break;
            case "opponentConnection":
              set({ opponentConnected: (msg as { connected?: boolean }).connected !== false });
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

    connectSpectate: ({ serverUrl, code, names }) => {
      // 観戦は対局を持たない読み取り専用モード。既存の対局・接続を片づけてから始める
      gameToken++;
      clearAiTimer();
      closeSocket();
      onlineSession = null;
      onlineSeat = null;
      set({
        mode: "spectate",
        onlineStatus: "connecting",
        onlineError: null,
        roomCode: code,
        opponentName: names[1],
        opponentTitle: null,
        opponentDevice: null,
        spectateNames: names,
        spectateHandCount: 0,
        revengeMatch: false,
        queueActive: false,
        matchFound: null,
        cheers: [],
        spectatorCount: 0,
        state: null,
        view: null,
        eventLog: [],
        lastEvents: [],
        aiThinking: false,
        presentationBusy: false,
        tutorial: false,
        autoPlay: false,
        jankenActive: false,
        jankenHand: null,
        jankenResult: null,
        rematchRequested: false,
        rematchOffered: false,
        opponentConnected: true,
        incomingStamp: null,
        myStamp: null,
        replayActive: false,
      });

      // 対戦者と同じく、演出中はためて順に流す（成績・記録には一切残さない）
      let pending: { view: PlayerView; events: GameEvent[] }[] = [];
      const drain = () => {
        if (pending.length === 0) return;
        if (get().presentationBusy) return;
        if (pending.length >= 3) {
          const all = pending;
          pending = [];
          const events = all.flatMap((u) => u.events);
          set({
            view: all[all.length - 1].view,
            lastEvents: [],
            eventLog: [...get().eventLog, ...events],
          });
          return;
        }
        const next = pending.shift()!;
        set({
          view: next.view,
          lastEvents: next.events,
          eventLog: [...get().eventLog, ...next.events],
        });
        playEventSounds(next.events);
      };
      onlineDrain = drain;

      let ws: WebSocket;
      try {
        ws = new WebSocket(serverUrl);
      } catch (e) {
        set({ onlineStatus: "error", onlineError: `サーバーに接続できません: ${e}` });
        return;
      }
      socket = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "spectate", code }));
      };
      ws.onmessage = (ev) => {
        if (socket !== ws) return;
        let msg: {
          type?: string;
          view?: PlayerView;
          events?: GameEvent[];
          selfHandCount?: number;
          emoji?: string;
          message?: string;
        };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === "spectateState") {
          if (!msg.view) return; // ビュー未対応の旧サーバーでは簡易画面だけ使う
          if (get().onlineStatus !== "playing") set({ onlineStatus: "playing" });
          if (typeof msg.selfHandCount === "number") {
            set({ spectateHandCount: msg.selfHandCount });
          }
          pending.push({ view: msg.view, events: msg.events ?? [] });
          drain();
        } else if (msg.type === "cheer" && msg.emoji) {
          set({
            cheers: [
              ...get().cheers.slice(-4),
              { key: Date.now() + Math.random(), emoji: msg.emoji },
            ],
          });
        } else if (msg.type === "error") {
          set({ onlineStatus: "error", onlineError: msg.message ?? "観戦できませんでした" });
        }
      };
      ws.onclose = () => {
        if (socket !== ws) return;
        if (get().mode !== "spectate") return;
        set({ onlineStatus: "error", onlineError: "接続が切れました。観戦をやり直してください" });
      };
    },

    sendCheer: (emoji) => {
      try {
        socket?.send(JSON.stringify({ type: "cheer", emoji }));
      } catch {
        // 応援が送れなくても観戦は続けられる
      }
    },

    resignOnline: () => {
      if (socket) socket.send(JSON.stringify({ type: "resign" }));
    },

    dispatch: (action) => {
      // リプレイ中は操作を受け付けない（記録どおりに進める）
      if (get().replayActive) return;
      // 観戦は見るだけ（保険。UI側でも操作はふさいでいる）
      if (get().mode === "spectate") return;
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
      matchMeta = null; // 途中でやめた対局は記録しない
      if (replayTimer) {
        clearTimeout(replayTimer);
        replayTimer = null;
      }
      replayQueue = [];
      // ランダムマッチの相手待ち中にCPU対戦をやめたときは、待ちの解除をホームで知らせる
      // （オンライン画面の「やめる」で自分から解除した場合は知らせない）
      const wasQueued = get().queueActive && get().mode === "local" && get().state !== null;
      if (socket) {
        try {
          socket.send(JSON.stringify({ type: "leave" }));
        } catch {
          // 送れなくても閉じる
        }
      }
      closeSocket();
      onlineSession = null;
      onlineSeat = null;
      if (jankenTimer) {
        clearTimeout(jankenTimer);
        jankenTimer = null;
      }
      set({
        queueActive: false,
        matchFound: null,
        queueCancelledNotice: wasQueued,
        jankenActive: false,
        jankenHand: null,
        jankenResult: null,
        replayActive: false,
        rematchRequested: false,
        rematchOffered: false,
        incomingStamp: null,
        myStamp: null,
        spectateHandCount: 0,
        spectateNames: null,
      });
      ai = null;
      set({
        state: null,
        view: null,
        mode: "local",
        onlineStatus: "idle",
        onlineError: null,
        roomCode: null,
        opponentName: null,
        opponentTitle: null,
        eventLog: [],
        lastEvents: [],
        aiThinking: false,
        presentationBusy: false,
        tutorial: false,
      });
    },
  };
});

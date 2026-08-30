import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  DimensionValue,
  Dimensions,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  BounceIn,
  type SharedValue,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInLeft,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { KYOKAN_LIST, KyokanDef } from "@/data/kyokan";
import { HeuristicAI } from "@/ai/heuristic";
import { DIFFICULTY_PARAMS } from "@/ai/difficulty";
import { shareResultImage } from "@/data/shareImage";
import { useAchievementStore } from "@/store/achievementStore";
import {
  pauseBgm,
  playBgm,
  playSe,
  playVoice,
  stopBgm,
  warmVoices,
  type VoiceKey,
} from "@/audio/sound";
import { haptic } from "@/audio/haptics";
import { CardDetail } from "@/components/CardDetail";
import { cardRegistry, getCard } from "@/data/cards";
import { GameEvent, PlayerView, Track } from "@/engine/types";

import {
  effectiveCombatFromView,
  effectiveLessonFromView,
  getLegalActionsFromView,
  playerToActFromView,
} from "@/engine/viewRules";
import {
  ACADEMIC_GOAL,
  GameAction,
  InstructorOnField,
  SKILL_GOAL,
} from "@/engine/types";
import { CardFace } from "@/components/CardFace";
import { OnlineJanken } from "@/components/OnlineJanken";
import { TrackBar } from "@/components/TrackBar";
import { eventText } from "@/components/eventText";
import { STAMPS, stampOf } from "@/data/stamps";
import { hintFor } from "@/tutorial/hints";
import {
  cpuDeckFor,
  randomizeDecksForMatch,
  resolveActiveDeck,
  useDeckStore,
} from "@/store/deckStore";
import { CPU, HUMAN, useGameStore } from "@/store/gameStore";
import { useRecordStore } from "@/store/recordStore";
import { getDeviceId } from "@/data/telemetry";
import { useRankStore } from "@/store/rankStore";
import { DEFAULT_SERVER_URL } from "@/app/online";
import { useSettingsStore } from "@/store/settingsStore";
import { useTournamentStore } from "@/store/tournamentStore";
import { setPerfScene, startFrameWatch, usePerfStore } from "@/perf";
import { colors } from "@/theme";

const ctx = { defs: cardRegistry };

const TRACK_LABEL: Record<Track, string> = { academic: "学科", skill: "技能" };

/**
 * 相手の呼び名。オフラインは「CPU」、オンラインは相手の名前（無ければ「相手」）。
 * 深い部品にまで props で配るのは大げさなので、モジュール変数で共有する
 * （BattleScreen が描画のたびに更新する）。
 */
let oppLabel = "CPU";

/** その視点で見た、指定プレイヤーの場（自分でも相手でも同じ形で取れる） */
function fieldOf(view: PlayerView, player: number): InstructorOnField[] {
  return player === view.playerId ? view.self.field : view.opponent.field;
}

/** カードの持ち主（拡大表示のバッジに使う） */
type Owner = "self" | "cpu";

/**
 * 中央に出す演出は種類が違っても必ずこのキューを通す。
 * 別々のタイマーで動かすと、ターン帯・実況・教習が同時に出て読めなくなるため。
 */
interface Announcement {
  key: number;
  /** "turn"=帯 / "battle"=バトル / "lesson"=教習の増減 / "power"=教習力の増減 / "text"=実況 */
  kind:
    | "text"
    | "turn"
    | "battle"
    | "lesson"
    | "power"
    | "battleResult"
    | "recycle"
    | "trackComplete";
  text: string;
  cardId?: string;
  emph?: boolean;
  owner?: Owner;
  /** カードの移動演出が終わるのを待ってから表示するまでの時間 */
  delayMs?: number;
  /** 決着の一手（最後の教習の進み）。スローモーションの特別演出になる */
  finalBlow?: boolean;
  /** 同じバッチで効果が連続したときのチェイン番号（2以上で表示） */
  chain?: number;
  /** この実況が画面に出た瞬間に鳴らす実況ボイス */
  voice?: VoiceKey;
  /** この実況が画面に出た瞬間に歓声も鳴らす */
  cheer?: boolean;
  /** kind === "turn" のとき、自分の番かどうか */
  mine?: boolean;
  /** kind === "battle" のとき、ぶつかり合う2枚 */
  atkCardId?: string;
  defCardId?: string;
  atkIsCpu?: boolean;
  /** kind === "lesson" のときの内訳 */
  track?: Track;
  amount?: number;
  newValue?: number;
  goal?: number;
  /** kind === "battleResult" のときの内訳 */
  resTie?: boolean;
  resAtk?: number;
  resDef?: number;
  /** kind === "recycle" のときの枚数 */
  recycleCount?: number;
  /** kind === "power" のとき、何の力か（教習力／戦闘力） */
  powerLabel?: string;
}

let annSeq = 0;

/** 空のハイライト集合（毎描画で作り直さないための共有インスタンス） */
const EMPTY_UID_SET = new Set<string>();

/** 演出部品用: ひかえめモードまたは自動軽量化が効いているか */
function useLightFx(): boolean {
  const fxLevel = useSettingsStore((s) => s.fxLevel);
  const autoLight = usePerfStore((s) => s.autoLight);
  return autoLight || fxLevel === "light";
}


/**
 * 山札・場外の中身を表示用に並べ替える。
 * 実際の並び順が分からないよう、種別→名前の順に固定して並べる。
 */
function sortedPile(ids: string[]): string[] {
  const typeOrder: Record<string, number> = { instructor: 0, support: 1, tantou: 2 };
  return [...ids].sort((a, b) => {
    const ca = getCard(a);
    const cb = getCard(b);
    const t = (typeOrder[ca.type] ?? 9) - (typeOrder[cb.type] ?? 9);
    return t !== 0 ? t : ca.name.localeCompare(cb.name, "ja");
  });
}

/** 選択肢のカードが相手のものかどうか（拡大表示のバッジ用） */
function choiceOwner(purpose: string): Owner {
  return ["removeOpp", "bounceOpp", "discardOpp", "debuffTarget"].includes(purpose)
    ? "cpu"
    : "self";
}

/** イベント列から実況表示を組み立てる。view はバトルの2枚を引くのに使う */
function announcementsFor(events: GameEvent[], view: PlayerView | null): Announcement[] {
  // 自分の席番号。オンラインでは 1 になることもある（後手で入室した側）
  const ME = view?.playerId ?? 0;
  const OPP = 1 - ME;
  const ownerOf = (player: number): Owner => (player === ME ? "self" : "cpu");
  const out: Announcement[] = [];
  const add = (text: string, cardId?: string, emph?: boolean, owner?: Owner) =>
    out.push({ key: ++annSeq, kind: "text", text, cardId, emph, owner });
  // 自分がカードを出したバッチでは、登場時効果（教習が進む等）のカットインが
  // カードの移動演出と重ならないよう、最初の実況に待ち時間を入れる
  const myPlayDelay = events.some((e) => e.type === "instructorPlayed" && e.player === ME)
    ? 950
    : events.some((e) => e.type === "supportPlayed" && e.player === ME)
      ? 650
      : 0;
  // このバッチで決着している場合、修了のお祝いは勝利演出に譲る
  const endsGame = events.some((e) => e.type === "gameEnded");

  for (const e of events) {
    switch (e.type) {
      case "turnStarted":
        out.push({
          key: ++annSeq,
          kind: "turn",
          text: e.player === ME ? "あなたのターン" : `${oppLabel}のターン`,
          mine: e.player === ME,
          // 長期戦突入のひとことは、ターン12の帯が出た瞬間に合わせる
          voice: e.turnNumber === 12 ? "voice_longgame" : undefined,
        });
        break;
      // 誰の行動かはバッジで示すので、文章では繰り返さない
      case "instructorPlayed":
        // 場に出す移動演出（約0.9秒）が終わってから詳細を見せる
        if (e.player === OPP)
          out.push({
            key: ++annSeq,
            kind: "text",
            text: `「${getCard(e.cardId).name}」を場に出した！`,
            cardId: e.cardId,
            owner: "cpu",
            delayMs: 950,
          });
        break;
      case "cardDrawn":
        // 自分のドローだけ公開（CPUの手札は非公開情報）。
        // 山札から引くアニメーション（約0.8秒）を見せてから確認画面を出す
        if (e.player === ME && e.cardId)
          out.push({
            key: ++annSeq,
            kind: "text",
            text: `「${getCard(e.cardId).name}」を引いた`,
            cardId: e.cardId,
            owner: "self",
            delayMs: 850,
          });
        break;
      case "instructorActed":
        if (e.player === OPP) {
          if (e.action === "doNothing") {
            add(`「${getCard(e.cardId).name}」は様子を見ている…`, e.cardId, false, "cpu");
          } else {
            add(
              `「${getCard(e.cardId).name}」が${e.action === "skill" ? "技能" : "学科"}教習！`,
              e.cardId,
              false,
              "cpu"
            );
          }
        }
        break;
      case "supportPlayed":
        if (e.player === OPP)
          out.push({
            key: ++annSeq,
            kind: "text",
            text: `サポート「${getCard(e.cardId).name}」を使った！`,
            cardId: e.cardId,
            owner: "cpu",
            delayMs: 650,
          });
        break;
      case "abilityActivated":
        if (e.player === OPP)
          add(`「${getCard(e.cardId).name}」の力を使った！`, e.cardId, false, "cpu");
        break;
      case "lessonModApplied":
        if (e.amount !== 0) {
          out.push({
            key: ++annSeq,
            kind: "power",
            text: "",
            mine: e.player === ME,
            amount: e.amount,
            powerLabel: "教習力",
          });
        }
        break;
      case "combatModApplied":
        if (e.amount !== 0) {
          out.push({
            key: ++annSeq,
            kind: "power",
            text: "",
            mine: e.player === ME,
            amount: e.amount,
            powerLabel: "戦闘力",
          });
        }
        break;
      case "battleBuffApplied":
        // バトル中のサポート等による上乗せも全画面で見せる
        if (e.amount !== 0) {
          out.push({
            key: ++annSeq,
            kind: "power",
            text: "",
            mine: e.player === ME,
            amount: e.amount,
            powerLabel: "戦闘力",
          });
        }
        break;
      case "battleDeclared": {
        // 宣言直後は両者とも場にいるので、uid からカードを引ける
        const atk = view
          ? fieldOf(view, e.attackerPlayer).find((f) => f.uid === e.attackerUid)
          : undefined;
        const def = view
          ? fieldOf(view, 1 - e.attackerPlayer).find((f) => f.uid === e.defenderUid)
          : undefined;
        out.push({
          key: ++annSeq,
          kind: "battle",
          text: e.attackerPlayer === OPP ? `${oppLabel}がバトルを仕掛けた！` : "あなたのバトル！",
          atkCardId: atk?.cardId,
          defCardId: def?.cardId,
          atkIsCpu: e.attackerPlayer === OPP,
        });
        break;
      }
      case "trackAdvanced": {
        // 進んだときも戻されたときも、全画面で大きく知らせる
        const goal = e.track === "academic" ? ACADEMIC_GOAL : SKILL_GOAL;
        if (e.amount !== 0) {
          out.push({
            key: ++annSeq,
            kind: "lesson",
            text: "",
            mine: e.player === ME,
            track: e.track,
            amount: e.amount,
            newValue: e.newValue,
            goal,
            // この一手で決着するなら、スローモーションの特別演出
            finalBlow: endsGame && e.amount > 0 && e.newValue >= goal,
          });
        }
        // 全課程修了！（両方そろって勝利したときは勝利演出に譲る）
        if (e.amount > 0 && e.newValue >= goal && !endsGame) {
          out.push({
            key: ++annSeq,
            kind: "trackComplete",
            text: "",
            mine: e.player === ME,
            track: e.track,
          });
        }
        break;
      }
      case "jankenPlayed": {
        const humanWon = (e.owner === ME) === e.won;
        // 双方の出した手も見せる（0=グー 1=チョキ 2=パー）
        const HANDS = ["✊", "✌️", "✋"];
        const myHand = HANDS[e.owner === ME ? e.ownerHand : e.otherHand] ?? "";
        const oppHand = HANDS[e.owner === ME ? e.otherHand : e.ownerHand] ?? "";
        add(
          `あなた ${myHand} vs ${oppHand} 相手\nじゃんけんに${humanWon ? "勝った！" : "負けた…"}`,
          undefined,
          true
        );
        break;
      }
      case "instructorRemoved":
        add(`「${getCard(e.cardId).name}」が場外へ！`, e.cardId, true, ownerOf(e.player));
        break;
      case "instructorBounced":
        add(`「${getCard(e.cardId).name}」が手札に戻された`, e.cardId, false, ownerOf(e.player));
        break;
      case "cardDiscarded":
        add(
          `「${getCard(e.cardId).name}」が場外に置かれた！`,
          e.cardId,
          false,
          ownerOf(e.player)
        );
        break;
      case "cardSalvaged":
        add(`場外から「${getCard(e.cardId).name}」を回収した！`, e.cardId, true, ownerOf(e.player));
        break;
      case "battleResolved": {
        const winner =
          e.attackerTotal > e.defenderTotal
            ? e.attackerPlayer
            : e.defenderTotal > e.attackerTotal
              ? 1 - e.attackerPlayer
              : null;
        out.push({
          key: ++annSeq,
          kind: "battleResult",
          text: "",
          mine: winner === null ? undefined : winner === ME,
          resTie: winner === null,
          resAtk: e.attackerTotal,
          resDef: e.defenderTotal,
        });
        break;
      }
      case "supportsRecycled":
        // 場外→山札のリサイクルは全画面で見せる
        out.push({
          key: ++annSeq,
          kind: "recycle",
          text: "",
          mine: e.player === ME,
          recycleCount: e.count,
        });
        break;
    }
  }
  // 効果の連鎖（教習・力の増減が2つ以上続く）はチェイン数を数えて爽快感を出す
  let chainN = 0;
  for (const a of out) {
    if (a.kind === "lesson" || a.kind === "power") {
      chainN++;
      if (chainN >= 2) a.chain = chainN;
    }
  }
  if (myPlayDelay > 0 && out.length > 0 && out[0].delayMs === undefined) {
    out[0].delayMs = myPlayDelay;
  }
  return out;
}

/**
 * 対戦画面の入口。対局が無いときは案内だけを出し、
 * 対局があるときだけ本体（BattleInner）を組み立てる。
 * 対局が消えた瞬間は本体ごと取り外されるため、
 * フック数の食い違いによる白画面クラッシュが起きない
 */
export default function BattleScreen() {
  const hasGame = useGameStore((s) => s.view !== null);
  if (!hasGame) return <NoGameScreen />;
  return <BattleInner />;
}

/** 対局が無いときの案内（オンラインのじゃんけん待ちはここでも出す） */
function NoGameScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.bannerText}>対局がありません</Text>
        <ActionButton label="ホームへ" color={colors.primary} onPress={() => router.replace("/")} />
      </View>
      {/* CPU対戦の破棄直後〜オンライン初回盤面が届くまでの間もじゃんけんを出し続ける */}
      <OnlineJanken />
    </SafeAreaView>
  );
}

function BattleInner() {
  const router = useRouter();
  const viewLive = useGameStore((s) => s.view);
  // 対局が消えた瞬間の一瞬は直前の盤面のまま描き、フック数を絶対に変えない
  // （親のBattleScreenが直後にこの本体ごと取り外す）
  const lastViewRef = useRef(viewLive);
  if (viewLive) lastViewRef.current = viewLive;
  const view = viewLive ?? lastViewRef.current;
  // 自分の席番号（オフラインは常に0。オンラインの後手は1になる）
  const ME = (view?.playerId ?? HUMAN) as 0 | 1;
  const OPP = (1 - ME) as 0 | 1;
  const dispatch = useGameStore((s) => s.dispatch);
  const quitGame = useGameStore((s) => s.quitGame);
  const eventLog = useGameStore((s) => s.eventLog);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const startGame = useGameStore((s) => s.startGame);
  const setPresentationBusy = useGameStore((s) => s.setPresentationBusy);
  const tutorial = useGameStore((s) => s.tutorial);
  const autoPlay = useGameStore((s) => s.autoPlay);
  const setAutoPlay = useGameStore((s) => s.setAutoPlay);
  const matchMode = useGameStore((s) => s.mode);
  const opponentName = useGameStore((s) => s.opponentName);
  const queueActive = useGameStore((s) => s.queueActive);
  const matchFound = useGameStore((s) => s.matchFound);
  const clearMatchFound = useGameStore((s) => s.clearMatchFound);
  const opponentTitle = useGameStore((s) => s.opponentTitle);
  const rematchRequested = useGameStore((s) => s.rematchRequested);
  const rematchOffered = useGameStore((s) => s.rematchOffered);
  const requestRematch = useGameStore((s) => s.requestRematch);
  const incomingStamp = useGameStore((s) => s.incomingStamp);
  const myStamp = useGameStore((s) => s.myStamp);
  const sendStamp = useGameStore((s) => s.sendStamp);
  const replayActive = useGameStore((s) => s.replayActive);
  const cheers = useGameStore((s) => s.cheers);
  const spectatorCount = useGameStore((s) => s.spectatorCount);
  const revengeMatch = useGameStore((s) => s.revengeMatch);
  const opponentDevice = useGameStore((s) => s.opponentDevice);
  // 挑戦状（リベンジ予約）を送ったか
  const [challengeSent, setChallengeSent] = useState(false);
  const sendChallenge = async () => {
    if (!opponentDevice) return;
    haptic("medium");
    try {
      const device = await getDeviceId();
      const httpUrl = DEFAULT_SERVER_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      const res = await fetch(`${httpUrl}/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromDevice: device,
          fromName: useRankStore.getState().playerName.trim() || "教習生",
          toDevice: opponentDevice,
          toName: oppLabel,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (data.id) setChallengeSent(true);
    } catch {
      // 送れなくても結果画面はそのまま
    }
  };
  const jankenActive = useGameStore((s) => s.jankenActive);
  const kyokanId = useGameStore((s) => s.kyokanId);
  const tournamentMatch = useGameStore((s) => s.tournamentMatch);
  const kyokanDef = kyokanId ? KYOKAN_LIST.find((k) => k.cardId === kyokanId) : undefined;
  const replaySpeed = useGameStore((s) => s.replaySpeed);
  const replayPaused = useGameStore((s) => s.replayPaused);
  const toggleReplayPause = useGameStore((s) => s.toggleReplayPause);
  const replayStepBack = useGameStore((s) => s.replayStepBack);
  const setReplaySpeed = useGameStore((s) => s.setReplaySpeed);
  const isOnline = matchMode === "online";
  oppLabel = isOnline ? (opponentName ?? "相手") : kyokanDef ? `${kyokanDef.name}インストラクター` : "CPU";
  const difficulty = useSettingsStore((s) => s.difficulty);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const deckState = useDeckStore();
  const record = useRecordStore();

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [targetingUid, setTargetingUid] = useState<string | null>(null);
  // バトル相手を選ぶとき、いきなり決定せず詳細を確認してから仕掛ける
  const [targetPreview, setTargetPreview] = useState<{ uid: string; cardId: string } | null>(null);
  const [previewHandIndex, setPreviewHandIndex] = useState<number | null>(null);
  const [revealedHand, setRevealedHand] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<{ cardId: string; owner?: Owner } | null>(null);
  const setDetailCardId = useCallback(
    (cardId: string | null, owner?: Owner) => setDetail(cardId ? { cardId, owner } : null),
    []
  );
  const detailCardId = detail?.cardId ?? null;
  const [showLog, setShowLog] = useState(false);
  const [pileView, setPileView] = useState<"deck" | "outOfPlay" | "cpuOutOfPlay" | null>(null);
  const [choicePreview, setChoicePreview] = useState<number | null>(null);
  const [annQueue, setAnnQueue] = useState<Announcement[]>([]);
  // 実況ボイスを裏で先読みして、演出の瞬間のカクつきを防ぐ
  useEffect(() => {
    warmVoices();
  }, []);
  const [currentAnn, setCurrentAnn] = useState<Announcement | null>(null);
  const bgmEnabled = useSettingsStore((s) => s.bgmEnabled);
  const seEnabled = useSettingsStore((s) => s.seEnabled);
  // 大きめ文字（実況の読みやすさ）
  const largeText = useSettingsStore((s) => s.largeText);
  const annBigger = largeText ? { fontSize: 19, lineHeight: 28 } : null;
  // 演出の量（light はカットイン短縮・飛翔系の演出を省略）
  const fxLevel = useSettingsStore((s) => s.fxLevel);
  // カクつき検知でこの対戦の間だけ「ひかえめ」相当に自動で落とす
  const autoLight = usePerfStore((s) => s.autoLight);
  const effFxLevel = autoLight ? "light" : fxLevel;
  const fxScale = effFxLevel === "light" ? 0.6 : effFxLevel === "normal" ? 0.85 : 1;
  // 日替わりの天気。雨・雪の日は対戦画面にうっすら天気演出（豆知識の季節感と連動）
  const weather = useMemo<"sunny" | "rain" | "snow">(() => {
    const d = new Date();
    const month = d.getMonth() + 1;
    const h = (((d.getFullYear() * 10000 + month * 100 + d.getDate()) * 2654435761) >>> 0) % 5;
    if (h === 0) return "rain";
    if ((month === 12 || month <= 2) && h === 1) return "snow";
    return "sunny";
  }, []);
  // 自動軽量化のお知らせ（1回だけ数秒表示）
  const [autoLightNote, setAutoLightNote] = useState(false);
  useEffect(() => {
    if (!autoLight || fxLevel === "light") return;
    setAutoLightNote(true);
    const t = setTimeout(() => setAutoLightNote(false), 4000);
    return () => clearTimeout(t);
  }, [autoLight, fxLevel]);
  // フレーム監視（対戦ごとにリセットして開始）
  useEffect(() => startFrameWatch(), []);

  // 画面シェイク（退場・バトル解決時）＋ヒットストップの押し込み
  const shakeX = useSharedValue(0);
  const punch = useSharedValue(1);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { scale: punch.value }],
  }));

  // リーチ演出（学科技能の残りが合計2時限以下になった瞬間）
  const [reachFx, setReachFx] = useState<{ mine: boolean; double?: boolean } | null>(null);
  // 両者リーチ（運命の最終局面）
  const [doubleReachOn, setDoubleReachOn] = useState(false);
  const doubleReachShown = useRef(false);
  const [reachOn, setReachOn] = useState(false);
  // 実況の表示時間の計算から参照する（effectの再実行を増やさないためref越し）
  const reachOnRef = useRef(false);
  reachOnRef.current = reachOn;
  const fxScaleRef = useRef(1);
  fxScaleRef.current = fxScale;

  // 入場バナー（リベンジマッチ／連勝の勢い）。
  // 開始演出（手札を配る→VS）が終わってから出す（配り中に被せない）
  const [entryBanner, setEntryBanner] = useState<string | null>(null);
  const entryBannerTextRef = useRef<string | null>(null);
  const fireEntryBanner = useCallback(() => {
    const text = entryBannerTextRef.current;
    if (!text) return;
    entryBannerTextRef.current = null;
    setEntryBanner(text);
    setTimeout(() => setEntryBanner(null), 1800);
  }, []);
  useEffect(() => {
    if (replayActive) return;
    const last = useRecordStore.getState().history[0];
    const streak = useRecordStore.getState().streak;
    let text: string | null = null;
    if (last && last.result === "lose") {
      const sameKyokan = kyokanId && last.kyokan === kyokanId;
      const sameOnline = isOnline && last.mode === "online" && last.opponentName === opponentName;
      const sameCpu = !isOnline && !kyokanId && last.mode === "cpu" && !last.kyokan;
      if (sameKyokan || sameOnline || sameCpu) text = "⚡ REVENGE MATCH！";
    }
    if (!text && streak >= 3) text = `🔥 ${streak}連勝中の勢い！`;
    if (!text) return;
    entryBannerTextRef.current = text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // スタンプの飛翔（送信=下から上へ、受信=上から下へ）
  const [flyStamps, setFlyStamps] = useState<{ key: number; emoji: string; up: boolean }[]>([]);
  const stampSeq = useRef(0);
  useEffect(() => {
    if (!myStamp) return;
    const emoji = stampOf(myStamp)?.emoji ?? "👍";
    const key = ++stampSeq.current;
    setFlyStamps((q) => [...q.slice(-3), { key, emoji, up: true }]);
    const t = setTimeout(() => setFlyStamps((q) => q.filter((f) => f.key !== key)), 1200);
    return () => clearTimeout(t);
  }, [myStamp]);
  useEffect(() => {
    if (!incomingStamp) return;
    const emoji = stampOf(incomingStamp)?.emoji ?? "👍";
    const key = ++stampSeq.current;
    setFlyStamps((q) => [...q.slice(-3), { key, emoji, up: false }]);
    const t = setTimeout(() => setFlyStamps((q) => q.filter((f) => f.key !== key)), 1200);
    return () => clearTimeout(t);
  }, [incomingStamp]);

  // 相手の接続状態（オンライン）
  const opponentConnected = useGameStore((st) => st.opponentConnected);

  // バトルで狙われている（防御側）のカードは怯えて震える
  const scaredUid =
    view?.phase.type === "battleSupport" ? view.phase.battle.defenderUid : null;
  const scaredPlayer =
    view?.phase.type === "battleSupport" ? ((1 - view.phase.battle.attackerPlayer) as 0 | 1) : null;

  // 121: ヒント（AIのおすすめ手を1つだけ教える）
  const [hintText, setHintText] = useState<string | null>(null);
  const hintAiRef = useRef<HeuristicAI | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = () => {
    if (!view || legal.length === 0) return;
    if (!hintAiRef.current) {
      hintAiRef.current = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.hard, 20260830);
    }
    try {
      const action = hintAiRef.current.chooseAction(view, legal);
      setHintText(describeAction(view, action));
    } catch {
      setHintText("いまは様子を見るのも手です");
    }
    haptic("light");
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintText(null), 5000);
  };
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    []
  );

  // 101: 場外送りなどの浮き上がりテキスト
  const [floatTexts, setFloatTexts] = useState<{ key: number; text: string; mine: boolean }[]>([]);
  const floatSeq = useRef(0);
  useEffect(() => {
    const adds = lastEvents
      .filter((e) => e.type === "instructorRemoved")
      .map((e) => ({
        key: ++floatSeq.current,
        text: "場外へ！",
        mine: (e as { player: number }).player === ME,
      }));
    if (adds.length === 0) return;
    setFloatTexts((q) => [...q.slice(-3), ...adds]);
    const t = setTimeout(
      () => setFloatTexts((q) => q.filter((f) => !adds.some((a) => a.key === f.key))),
      1400
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);

  // カードの移動演出（出す・引く・退場・サポート叩きつけ）
  const [flyFx, setFlyFx] = useState<FlyItem[]>([]);
  const flySeq = useRef(0);
  // 効果を発動したカードの金フラッシュ（cardId単位）
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  // 対戦入場の暗転ワイプ → 顔合わせ「VS」画面
  const [enterWipe, setEnterWipe] = useState(true);
  const [vsIntro, setVsIntro] = useState(false);
  // 開始演出は「暗転 → 手札を配る → VS → 手札の確認」の順に流す
  const wipeDoneRef = useRef(false);
  const dealDoneRef = useRef(false);
  const vsShownRef = useRef(false);
  // 検定開始アナウンス（VSの後に「準備はいいですか？…始め！」）
  const [examBand, setExamBand] = useState(false);
  const showVsIntro = useCallback(() => {
    if (vsShownRef.current || replayActive) return;
    vsShownRef.current = true;
    playVoice(isOnline && revengeMatch ? "voice_revenge" : "voice_start");
    setVsIntro(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive]);
  useEffect(() => {
    const adds: FlyItem[] = [];
    for (const e of lastEvents) {
      if (e.type === "instructorPlayed") {
        adds.push({ key: ++flySeq.current, kind: "play", cardId: e.cardId, mine: e.player === ME });
      } else if (e.type === "supportPlayed") {
        adds.push({ key: ++flySeq.current, kind: "slam", cardId: e.cardId, mine: e.player === ME });
      } else if (e.type === "cardDrawn" && e.player !== ME) {
        // 自分のドローは既存の手札演出があるため、相手のぶんだけ飛ばす
        adds.push({
          key: ++flySeq.current,
          kind: "draw",
          cardId: e.cardId ?? "cardback",
          mine: false,
        });
      } else if (e.type === "instructorRemoved") {
        adds.push({ key: ++flySeq.current, kind: "remove", cardId: e.cardId, mine: e.player === ME });
      }
    }
    if (adds.length > 0 && fxScaleRef.current > 0.6) setFlyFx((q) => [...q.slice(-4), ...adds]);
    // 自分のサポート発動・担当の力のひとこと（実況チャンネルが重なりを防ぐ）
    if (lastEvents.some((e) => e.type === "supportPlayed" && e.player === ME)) {
      playVoice("voice_support");
    } else if (lastEvents.some((e) => e.type === "abilityActivated" && e.player === ME)) {
      playVoice("voice_ability");
    }
    // 効果発動カードの金フラッシュ。連鎖したときは順番に1枚ずつ光らせる
    const flashed = lastEvents
      .filter((e) => e.type === "abilityActivated" || e.type === "supportPlayed")
      .map((e) => (e as { cardId: string }).cardId);
    if (flashed.length > 0) {
      const ts: ReturnType<typeof setTimeout>[] = [];
      flashed.forEach((cardId, i) => {
        ts.push(setTimeout(() => setFlashIds(new Set([cardId])), i * 300));
      });
      ts.push(setTimeout(() => setFlashIds(new Set()), flashed.length * 300 + 600));
      return () => ts.forEach(clearTimeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);
  const removeFly = (key: number) => setFlyFx((q) => q.filter((f) => f.key !== key));

  // CPUの口上セリフ（CPU対戦のみ。リプレイ観戦では出さない）
  const [cpuSpeech, setCpuSpeech] = useState<string | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (lines: readonly string[], kind?: keyof KyokanDef["lines"]) => {
    if (isOnline || replayActive) return;
    const src = kind && kyokanDef ? kyokanDef.lines[kind] : lines;
    setCpuSpeech(pickLine(src));
    if (speechTimer.current) clearTimeout(speechTimer.current);
    speechTimer.current = setTimeout(() => setCpuSpeech(null), 3400);
  };
  useEffect(
    () => () => {
      if (speechTimer.current) clearTimeout(speechTimer.current);
    },
    []
  );
  useEffect(() => {
    // 対戦開始のあいさつ
    if (isOnline || replayActive) return;
    const t = setTimeout(() => say(CPU_LINES.start, "start"), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 初対戦のガイド（吹き出しナビ）。最初のCPU対戦を終えると出なくなる
  const guideDone = useSettingsStore((s) => s.guideDone);
  const setGuideDone = useSettingsStore((s) => s.setGuideDone);
  const guideActive = !guideDone && !isOnline && !replayActive;
  const guideSeenSteps = useRef(new Set<string>());
  const [guideText, setGuideText] = useState<string | null>(null);
  useEffect(() => {
    if (!guideActive || !view) return;
    const show = (k: string, text: string) => {
      if (guideSeenSteps.current.has(k)) return;
      guideSeenSteps.current.add(k);
      setGuideText(text);
    };
    if (view.phase.type === "mulligan") {
      show("mulligan", "最初の手札です。気に入らなければ1回だけ引き直せます。");
    } else if (view.phase.type === "main" && view.self.field.length === 0) {
      show("play", "手札のインストラクターをタップして、場に出してみましょう。");
    } else if (view.phase.type === "main" && view.self.field.length > 0) {
      show("action", "場に出したカードをタップすると、学科・技能を進めたりバトルをしたりできます。");
    } else if (view.phase.type === "battleSupport") {
      show("support", "バトル中はサポートカードで戦闘力を足せます。無ければ「パス」で大丈夫です。");
    }
    if (view.phase.type === "finished") {
      setGuideDone(true);
      setGuideText(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideActive, view?.phase.type, view?.self.field.length]);
  // 実況が流れている間は待ち、捌けてから表示する（演出の重なり防止）
  const [pendingReach, setPendingReach] = useState<{ mine: boolean; double?: boolean } | null>(null);
  const reachShown = useRef({ me: false, opp: false });

  // 進捗バーの表示値。学科技能の全画面演出が終わってから動かす
  const [shownTracks, setShownTracks] = useState<{
    ma: number;
    ms: number;
    oa: number;
    os: number;
  } | null>(null);

  // 進捗バーの折返し（学科5・技能10）のお祝い
  const [milestone, setMilestone] = useState<{ key: number; label: string } | null>(null);
  const milestonePrev = useRef({ ma: 0, ms: 0 });
  useEffect(() => {
    const ma = shownTracks?.ma ?? view?.self.academic ?? 0;
    const ms = shownTracks?.ms ?? view?.self.skill ?? 0;
    const prev = milestonePrev.current;
    milestonePrev.current = { ma, ms };
    const label =
      prev.ma < 5 && ma >= 5 && ma < ACADEMIC_GOAL
        ? "✨ 学科 折返し！"
        : prev.ms < 10 && ms >= 10 && ms < SKILL_GOAL
          ? "✨ 技能 折返し！"
          : null;
    if (!label) return;
    haptic("success");
    setMilestone({ key: Date.now(), label });
    const t = setTimeout(() => setMilestone(null), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownTracks?.ma, shownTracks?.ms, view?.self.academic, view?.self.skill]);

  // オンライン対戦: 相手の考え中の経過秒数
  const [oppThinkSec, setOppThinkSec] = useState(0);

  // バトル解決・退場のときに画面全体を一瞬光らせる
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  // イベント → 実況キュー＋シェイク
  // 相手が見つかってオンライン対局に切り替わったら、CPU対戦の演出の残りを片づける
  useEffect(() => {
    if (!matchFound) return;
    setAnnQueue([]);
    dismissAnn();
    setPendingDraw(null);
    setDrawFx(null);
    setPendingOuts([]);
    setOutFx(null);
    const t = setTimeout(() => clearMatchFound(), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchFound]);

  useEffect(() => {
    // 決着したら、たまっていた実況・演出を片づける。
    // ただし「決着の一手」（最後のゲージの進み）だけは残して、
    // スローモーション演出を見せてから結果画面に進む
    if (lastEvents.some((e) => e.type === "gameEnded")) {
      const finalAnns = announcementsFor(lastEvents, view).filter((a) => a.finalBlow);
      setAnnQueue(finalAnns);
      dismissAnn();
      setPendingDraw(null);
      setDrawFx(null);
      setPendingOuts([]);
      setOutFx(null);
      return;
    }
    const anns = announcementsFor(lastEvents, view);
    if (anns.length > 0) setAnnQueue((q) => [...q, ...anns]);
    // 出来事に応じて振動で手応えを返す
    for (const e of lastEvents) {
      if (e.type === "gameEnded") haptic(e.winner === ME ? "success" : "error");
      else if (e.type === "instructorRemoved") haptic("heavy");
      else if (e.type === "battleDeclared") haptic("heavy");
      else if (e.type === "instructorPlayed") haptic("medium");
      else if (e.type === "jankenPlayed") haptic((e.owner === ME) === e.won ? "success" : "warning");
      else if (e.type === "trackAdvanced" && e.player === ME && e.amount < 0) haptic("warning");
    }
    if (lastEvents.some((e) => e.type === "instructorRemoved" || e.type === "battleResolved")) {
      // ヒットストップ: 一瞬押し込んで止めてから揺らす
      punch.value = withSequence(
        withTiming(1.04, { duration: 60 }),
        withDelay(110, withTiming(1, { duration: 160 }))
      );
      shakeX.value = withDelay(
        130,
        withSequence(
          withTiming(-10, { duration: 55 }),
          withTiming(9, { duration: 55 }),
          withTiming(-6, { duration: 50 }),
          withTiming(5, { duration: 50 }),
          withTiming(0, { duration: 45 })
        )
      );
      // 衝撃の白フラッシュ
      flash.value = withSequence(
        withTiming(0.55, { duration: 60 }),
        withTiming(0, { duration: 320 })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);

  // リーチ判定: 残り時限の合計が2以下になった最初の瞬間に全画面カットイン。
  // どちらかがリーチの間はBGMを少し速くして緊迫感を出す
  useEffect(() => {
    if (!view || view.phase.type === "finished") {
      setReachOn(false);
      return;
    }
    const remain = (p: { academic: number; skill: number }) =>
      Math.max(0, ACADEMIC_GOAL - p.academic) + Math.max(0, SKILL_GOAL - p.skill);
    const meReach = remain(view.self) <= 2;
    const oppReach = remain(view.opponent) <= 2;
    const both = meReach && oppReach;
    if (both && !doubleReachShown.current) {
      // 両者リーチ＝運命の最終局面。あとから追いついた側で演出を変える
      doubleReachShown.current = true;
      const mineCaught = !reachShown.current.me;
      reachShown.current.me = true;
      reachShown.current.opp = true;
      setPendingReach({ mine: mineCaught, double: true });
      say(mineCaught ? CPU_LINES.playerReach : CPU_LINES.cpuReach, mineCaught ? "playerReach" : "cpuReach");
    } else if (meReach && !reachShown.current.me) {
      reachShown.current.me = true;
      setPendingReach({ mine: true });
      say(CPU_LINES.playerReach, "playerReach");
    } else if (oppReach && !reachShown.current.opp) {
      reachShown.current.opp = true;
      setPendingReach({ mine: false });
      say(CPU_LINES.cpuReach, "cpuReach");
    }
    if (!meReach) reachShown.current.me = false;
    if (!oppReach) reachShown.current.opp = false;
    if (!both) doubleReachShown.current = false;
    setDoubleReachOn(both);
    setReachOn(meReach || oppReach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.self.academic, view?.self.skill, view?.opponent.academic, view?.opponent.skill, view?.phase.type]);

  // リーチ演出は、流れている実況が捌けてから表示する
  useEffect(() => {
    if (!pendingReach) return;
    if (currentAnn !== null || annQueue.length > 0) return;
    setReachFx(pendingReach);
    setPendingReach(null);
    haptic(pendingReach.mine ? "success" : "warning");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReach, currentAnn, annQueue]);

  // 進捗バーは、学科技能の全画面演出が「閉じた瞬間」にその値まで進める。
  // カットインが閉じるのを検知して、そのカットインが示した値を反映する
  const prevAnnRef = useRef<Announcement | null>(null);
  useEffect(() => {
    const prev = prevAnnRef.current;
    if (prev && prev.kind === "lesson" && prev !== currentAnn) {
      setShownTracks((cur) => {
        if (!cur || prev.newValue === undefined) return cur;
        const next = { ...cur };
        if (prev.track === "academic") {
          if (prev.mine) next.ma = prev.newValue;
          else next.oa = prev.newValue;
        } else {
          if (prev.mine) next.ms = prev.newValue;
          else next.os = prev.newValue;
        }
        return next;
      });
    }
    prevAnnRef.current = currentAnn;
  }, [currentAnn]);

  // 保険の同期: 学科技能の演出が一切控えていないときだけ、表示値を実際の値に合わせる
  // （初期化・早送り・演出破棄などのケースを拾う）
  useEffect(() => {
    if (!view) {
      setShownTracks(null);
      return;
    }
    const lessonBusy =
      currentAnn?.kind === "lesson" ||
      annQueue.some((a) => a.kind === "lesson") ||
      // 演出キューに積まれる前の同じ描画サイクルもここで塞ぐ
      lastEvents.some((e) => e.type === "trackAdvanced" && e.amount !== 0);
    if (shownTracks !== null && lessonBusy) return;
    const next = {
      ma: view.self.academic,
      ms: view.self.skill,
      oa: view.opponent.academic,
      os: view.opponent.skill,
    };
    setShownTracks((cur) =>
      cur && cur.ma === next.ma && cur.ms === next.ms && cur.oa === next.oa && cur.os === next.os
        ? cur
        : next
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentAnn, annQueue, lastEvents]);

  // リーチ演出は少し見せて自動で閉じる
  useEffect(() => {
    if (!reachFx) return;
    const t = setTimeout(() => setReachFx(null), reachFx.double ? 2800 : 2000);
    return () => clearTimeout(t);
  }, [reachFx]);

  // 両者リーチの間は心臓の音がドクン…ドクン…と鳴り続ける
  useEffect(() => {
    if (!doubleReachOn || view?.phase.type === "finished") return;
    const timer = setInterval(() => playSe("heartbeat"), 1900);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doubleReachOn, view?.phase.type]);

  // 場にインストラクターが5人そろったら「フルライン！」
  const fullLineShown = useRef(false);
  useEffect(() => {
    const n = view?.self.field.length ?? 0;
    if (view && view.phase.type !== "finished" && n >= 5 && !fullLineShown.current) {
      fullLineShown.current = true;
      setAnnQueue((q) => [
        ...q,
        {
          key: ++annSeq,
          kind: "text",
          text: "🖐️ フルライン！！\n場にインストラクターが5人そろった！",
          emph: true,
          voice: "voice_fullline",
          cheer: true,
        },
      ]);
    }
    if (n < 5) fullLineShown.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.self.field.length, view?.phase.type]);

  // 手札が残り1枚になった瞬間・山札が残りわずかになった瞬間のひとこと
  const lastHandRef = useRef({ prev: 99, at: 0 });
  useEffect(() => {
    const n = view?.self.hand.length ?? 99;
    const r = lastHandRef.current;
    if (
      view &&
      view.phase.type !== "finished" &&
      n === 1 &&
      r.prev > 1 &&
      Date.now() - r.at > 30000
    ) {
      r.at = Date.now();
      playVoice("voice_lasthand");
    }
    r.prev = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.self.hand.length, view?.phase.type]);
  // 相手の場ががら空き／自分の場が全滅のひとこと。
  // 状態が変わった瞬間ではなく、実況と退場アニメーションが終わってから鳴らす
  const prevFieldsRef = useRef({ me: 0, opp: 0 });
  const pendingFieldVoice = useRef<"voice_openfield" | "voice_wipedout" | null>(null);
  useEffect(() => {
    const meN = view?.self.field.length ?? 0;
    const opN = view?.opponent.field.length ?? 0;
    const prev = prevFieldsRef.current;
    if (view && view.phase.type !== "finished") {
      if (prev.opp > 0 && opN === 0) pendingFieldVoice.current = "voice_openfield";
      else if (prev.me > 0 && meN === 0) pendingFieldVoice.current = "voice_wipedout";
    }
    prevFieldsRef.current = { me: meN, opp: opN };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.self.field.length, view?.opponent.field.length, view?.phase.type]);
  const deckLowShown = useRef(false);
  useEffect(() => {
    const n = view?.self.deckContents.length ?? 99;
    if (view && view.phase.type !== "finished" && n <= 2 && !deckLowShown.current) {
      deckLowShown.current = true;
      playVoice("voice_decklow");
    }
    if (n > 5) deckLowShown.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.self.deckContents.length, view?.phase.type]);

  // 🔥 名勝負メーターの材料（逆転・チェイン・接戦・両者リーチ）を数える
  const heatRef = useRef({ flips: 0, maxChain: 0, closeBattles: 0, doubleReach: false, prevSign: 0 });

  // 🎙️ 煽り実況: 状況を読んで盛り上げのひとことを差し込む
  const hypeShown = useRef({ lastLap: false, oppLastLap: false, flip: false });
  const prevLeadRef = useRef(0);
  useEffect(() => {
    if (!view || view.phase.type === "finished" || replayActive) return;
    const remainOf = (p: { academic: number; skill: number }) =>
      Math.max(0, ACADEMIC_GOAL - p.academic) + Math.max(0, SKILL_GOAL - p.skill);
    const meR = remainOf(view.self);
    const opR = remainOf(view.opponent);
    const pushHype = (text: string, voice?: VoiceKey, cheer?: boolean) =>
      setAnnQueue((q) => [
        ...q,
        { key: ++annSeq, kind: "text" as const, text, emph: true, voice, cheer },
      ]);
    if (meR === 1 && !hypeShown.current.lastLap) {
      hypeShown.current.lastLap = true;
      pushHype("🎙️ あと1時限で卒業だーー！！");
    }
    if (meR > 1) hypeShown.current.lastLap = false;
    if (opR === 1 && !hypeShown.current.oppLastLap) {
      hypeShown.current.oppLastLap = true;
      pushHype(`🎙️ ${oppLabel}、卒業まであと1時限…！`);
    }
    if (opR > 1) hypeShown.current.oppLastLap = false;
    // 形勢逆転: 3以上のビハインドからリードを奪った瞬間
    const lead = opR - meR; // 正の値=自分がリード
    if (prevLeadRef.current <= -3 && lead >= 1 && !hypeShown.current.flip) {
      hypeShown.current.flip = true;
      pushHype("🎙️ 形勢逆転！！ 会場がどよめいている！", "voice_flip", true);
    }
    if (lead <= -1) hypeShown.current.flip = false;
    // 名勝負メーター: リードの入れ替わりを数える
    const sign = Math.sign(lead);
    if (sign !== 0 && heatRef.current.prevSign !== 0 && sign !== heatRef.current.prevSign) {
      heatRef.current.flips++;
    }
    if (sign !== 0) heatRef.current.prevSign = sign;
    prevLeadRef.current = lead;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.self.academic, view?.self.skill, view?.opponent.academic, view?.opponent.skill, view?.phase.type]);

  // 名勝負メーター: チェイン最大値・接戦バトル・両者リーチを数える
  useEffect(() => {
    if (currentAnn?.chain) {
      heatRef.current.maxChain = Math.max(heatRef.current.maxChain, currentAnn.chain);
    }
  }, [currentAnn]);
  useEffect(() => {
    for (const e of lastEvents) {
      if (e.type === "battleResolved" && Math.abs(e.attackerTotal - e.defenderTotal) <= 1) {
        heatRef.current.closeBattles++;
      }
    }
  }, [lastEvents]);
  useEffect(() => {
    if (doubleReachOn) heatRef.current.doubleReach = true;
  }, [doubleReachOn]);

  // 🥋 昇段・降段のかかった一戦と、挑戦状の「因縁の再戦」は開始時に知らせる
  useEffect(() => {
    if (!lastEvents.some((e) => e.type === "gameStarted")) return;
    heatRef.current = { flips: 0, maxChain: 0, closeBattles: 0, doubleReach: false, prevSign: 0 };
    if (replayActive || autoPlay || tutorial) return;
    const adds: Announcement[] = [];
    if (isOnline && revengeMatch) {
      adds.push({
        key: ++annSeq,
        kind: "text",
        text: "⚡ 因縁の再戦！！\n挑戦状の決着をつけろ！",
        emph: true,
      });
    }
    if (adds.length > 0) setAnnQueue((q) => [...q, ...adds]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);

  // 観戦者の応援が届いたら小さく音を鳴らす
  useEffect(() => {
    if (cheers.length > 0) playSe("tap", 1.5);
  }, [cheers.length]);

  // オンライン対戦: 相手の手番の経過時間を数える
  useEffect(() => {
    if (!isOnline || !view || view.phase.type === "finished") {
      setOppThinkSec(0);
      return;
    }
    const oppTurn = playerToActFromView(view) === OPP;
    if (!oppTurn) {
      setOppThinkSec(0);
      return;
    }
    setOppThinkSec(0);
    const timer = setInterval(() => setOppThinkSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, view]);

  // 実況を1件ずつ表示。表示中はCPUの次の手を待たせる（読み飛ばし防止）
  // タイマーは ref で持つ（cleanup を返すと再レンダーのたびに消えてしまうため）
  const annTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 移動演出が終わるまで実況を隠しておくためのフラグ
  const [annShown, setAnnShown] = useState(true);
  const annDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissAnn = useCallback(() => {
    if (annTimer.current) {
      clearTimeout(annTimer.current);
      annTimer.current = null;
    }
    if (annDelayTimer.current) {
      clearTimeout(annDelayTimer.current);
      annDelayTimer.current = null;
    }
    setCurrentAnn(null);
  }, []);

  useEffect(() => {
    if (currentAnn !== null || annQueue.length === 0) return;
    const [next, ...rest] = annQueue;
    setCurrentAnn(next);
    setAnnQueue(rest);
    if (annTimer.current) {
      clearTimeout(annTimer.current);
      annTimer.current = null;
    }
    if (annDelayTimer.current) {
      clearTimeout(annDelayTimer.current);
      annDelayTimer.current = null;
    }
    // カードを場に出す移動演出が終わってから詳細を見せる
    const delay = Math.round((next.delayMs ?? 0) * fxScaleRef.current);
    // 実況が画面に出た瞬間、対応するボイス・歓声を鳴らす（演出と同期させる）
    const speak = () => {
      if (next.voice) playVoice(next.voice);
      if (next.cheer) playSe("cheer");
    };
    if (delay > 0) {
      setAnnShown(false);
      annDelayTimer.current = setTimeout(() => {
        annDelayTimer.current = null;
        setAnnShown(true);
        speak();
      }, delay);
    } else {
      setAnnShown(true);
      speak();
    }
    // カード付きの実況はタップするまで表示したままにする（読み逃し防止）。
    // ただし自動プレイ中とオンライン対戦では、少し見せてから自動で進める
    // （オンラインで止めると相手を待たせてしまうため）
    if (!next.cardId || autoPlay || isOnline) {
      annTimer.current = setTimeout(
        () => {
          annTimer.current = null;
          setCurrentAnn(null);
        },
        Math.round(
          (next.kind === "turn"
            ? 900
            : next.kind === "battleResult" && reachOnRef.current
              ? 5600 // ラストバトルはカウントアップ（約2.1秒）＋ため（約1秒）の分だけ長く見せる
              : next.kind === "battle" || next.kind === "battleResult"
              ? 3200 // いざ勝負！と勝敗はしっかり見せる
              : next.kind === "trackComplete"
              ? 2600 // 全課程修了のお祝い
              : next.kind === "lesson" && next.finalBlow
                ? 4200 // 決着の一手はスローモーションでたっぷり見せる
              : next.kind === "lesson" || next.kind === "power" || next.kind === "recycle"
                ? 2000
                : next.cardId
                  ? 1600
                  : next.emph
                    ? 1300
                    : 850) * fxScaleRef.current
        ) + delay
      );
    }
  }, [currentAnn, annQueue, autoPlay, isOnline]);

  useEffect(
    () => () => {
      if (annTimer.current) clearTimeout(annTimer.current);
      if (annDelayTimer.current) clearTimeout(annDelayTimer.current);
    },
    []
  );

  // 実況が残っている間はCPUを待たせる
  const busy = currentAnn !== null || annQueue.length > 0;
  useEffect(() => {
    setPresentationBusy(busy);
  }, [busy, setPresentationBusy]);

  // 選択が発生したら、開いていた手札の拡大表示を閉じる
  // （選択画面と重なって、どちらも操作できなくなるため）
  const choiceActive =
    view?.phase.type === "choice" && view.phase.pending.player === ME;
  useEffect(() => {
    if (choiceActive) setPreviewHandIndex(null);
  }, [choiceActive]);

  // 「場外」リンクの画面上の位置。場外へ飛ぶ演出の着地点に使う
  const outPos = useRef<{ mine: { x: number; y: number } | null; cpu: { x: number; y: number } | null }>({
    mine: null,
    cpu: null,
  });
  const myOutRef = useRef<View>(null);
  const cpuOutRef = useRef<View>(null);
  const measureOutLinks = useCallback(() => {
    myOutRef.current?.measureInWindow((x, y, w, h) => {
      outPos.current.mine = { x: x + w / 2, y: y + h / 2 };
    });
    cpuOutRef.current?.measureInWindow((x, y, w, h) => {
      outPos.current.cpu = { x: x + w / 2, y: y + h / 2 };
    });
  }, []);

  // 場外へ飛んでいくカードの演出。実況を読み終えてから再生する
  const [pendingOuts, setPendingOuts] = useState<{ cardId: string; mine: boolean }[]>([]);
  const [outFx, setOutFx] = useState<{ key: number; cards: { cardId: string; mine: boolean }[] } | null>(null);
  useEffect(() => {
    const outs = lastEvents
      .filter((e) => e.type === "instructorRemoved" || e.type === "cardDiscarded")
      .map((e) => ({
        cardId: (e as { cardId: string }).cardId,
        mine: (e as { player: number }).player === ME,
      }));
    if (outs.length > 0) {
      setPendingOuts((q) => [...q, ...outs]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);
  useEffect(() => {
    if (pendingOuts.length === 0 || busy || outFx) return;
    setOutFx({ key: Date.now(), cards: pendingOuts });
    setPendingOuts([]);
    // 場外へ飛んでいくアニメーションと同時にひとこと
    playVoice("voice_out");
  }, [pendingOuts, busy, outFx]);

  // がら空き・全滅のひとことは、実況と退場アニメーションが終わってから
  useEffect(() => {
    const v = pendingFieldVoice.current;
    if (!v) return;
    if (busy || flyFx.length > 0 || outFx) return;
    pendingFieldVoice.current = null;
    if (!view || view.phase.type === "finished") return;
    // 鳴らす直前にもう一度確認（その間に場が埋まっていたら鳴らさない）
    if (v === "voice_openfield" && view.opponent.field.length !== 0) return;
    if (v === "voice_wipedout" && view.self.field.length !== 0) return;
    playVoice(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, flyFx.length, outFx, view]);

  // 山札から1枚引いたときの演出。実況とぶつからないよう、実況が捌けてから出す
  // 読み終えたヒント。盤面が変わって別の内容になれば、また出す
  const [readHint, setReadHint] = useState<string | null>(null);
  const [pendingDraw, setPendingDraw] = useState<string | null>(null);
  const [drawFx, setDrawFx] = useState<{ key: number; cardId: string } | null>(null);
  const handScroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (!view || view.phase.type === "mulligan") return;
    const drawn = lastEvents.find(
      (e) => e.type === "cardDrawn" && e.player === ME && e.cardId
    );
    if (drawn && drawn.type === "cardDrawn" && drawn.cardId) setPendingDraw(drawn.cardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);
  useEffect(() => {
    if (!pendingDraw || drawFx) return;
    // 実況が出ている間は待つ。ただし「引いた」確認画面の待ち時間中は、
    // 先にドロー演出（山札からめくれて手札へ）を見せる
    const myDrawAnnWaiting =
      currentAnn?.kind === "text" && currentAnn.cardId === pendingDraw && !annShown;
    if (busy && !myDrawAnnWaiting) return;
    setDrawFx({ key: Date.now(), cardId: pendingDraw });
    setPendingDraw(null);
    // 引いたカードは右端に加わる。隠れないよう手札を送る
    setTimeout(() => handScroll.current?.scrollToEnd({ animated: true }), 120);
  }, [pendingDraw, busy, drawFx, currentAnn, annShown]);

  // BGM: ふだんは bgm_main、バトルの流れ（いざ勝負！〜サポート）の間は bgm_battle、
  // リーチ中は bgm_reach、対戦が終わったら勝敗に応じたリザルト曲。
  // 勝敗のカットイン中はBGMを止めて勝敗の効果音だけを響かせる
  const battleResultCutinShowing = currentAnn?.kind === "battleResult";
  const battleBgmOn =
    !battleResultCutinShowing &&
    (view?.phase.type === "battleSupport" ||
      currentAnn?.kind === "battle" ||
      annQueue.some((a) => a.kind === "battle" || a.kind === "battleResult"));
  // 決着演出（最後のゲージの進み）が終わってから結果画面を出すための待ち
  const [resultShown, setResultShown] = useState(false);
  // 決着の一手をあとで「もう一度」再生できるように取っておく
  const finalBlowAnnRef = useRef<Announcement | null>(null);
  useEffect(() => {
    if (currentAnn?.finalBlow) finalBlowAnnRef.current = currentAnn;
  }, [currentAnn]);
  const finishedOutcome =
    view?.phase.type === "finished" && !replayActive
      ? view.phase.winner === ME
        ? "win"
        : "lose"
      : null;
  // 新しい対局では挑戦状の送信済み表示をリセットする
  useEffect(() => {
    if (!finishedOutcome) setChallengeSent(false);
  }, [finishedOutcome]);
  // 決着していても、最後の実況（決着ゲージ等）が流れ終わるまで結果は出さない
  useEffect(() => {
    if (!finishedOutcome) {
      setResultShown(false);
      return;
    }
    if (busy || flyFx.length > 0) return;
    const t = setTimeout(() => setResultShown(true), 350);
    return () => clearTimeout(t);
  }, [finishedOutcome, busy, flyFx.length]);
  useEffect(() => {
    if (!bgmEnabled && !seEnabled) {
      stopBgm();
      return;
    }
    if (battleResultCutinShowing) {
      pauseBgm();
      return;
    }
    if (finishedOutcome) {
      // 決着の瞬間: チャイムを鳴らしてBGMを止める（決着ゲージの演出に集中させる）
      if (!resultShown) {
        playSe("chime");
        pauseBgm();
        return;
      }
      // 結果画面が出てからリザルト曲へ
      const t = setTimeout(() => {
        if (!playBgm(finishedOutcome === "win" ? "bgm_result_win" : "bgm_result_lose")) pauseBgm();
        // 勝利したら教習車のクラクションでお祝い（プップー！）
        if (finishedOutcome === "win") playSe("horn");
      }, 900);
      return () => clearTimeout(t);
    }
    if (jankenActive) {
      // オンラインの先攻決めじゃんけん中はドラムロール曲
      if (!playBgm("bgm_janken")) pauseBgm();
      return;
    }
    if (battleBgmOn) {
      // バトルBGMは効果音設定に連動。オフ（や曲なし）の間はふだんの曲を流し続ける
      if (!playBgm("bgm_battle") && !playBgm("bgm_main")) pauseBgm();
      return;
    }
    if (reachOn) {
      // リーチBGMも効果音設定に連動。両者リーチはさらに激しい曲へ
      if (doubleReachOn && playBgm("bgm_reach2")) return;
      if (!playBgm("bgm_reach") && !playBgm("bgm_main")) pauseBgm();
      return;
    }
    // 演出の切り替わりの一瞬の隙間でメイン曲に戻らないよう、少し待ってから戻す
    const t = setTimeout(() => {
      // BGM設定がオフならメイン曲は流さず、鳴りっぱなしの戦闘系BGMだけ止める
      if (!playBgm("bgm_main")) pauseBgm();
    }, 350);
    return () => clearTimeout(t);
  }, [bgmEnabled, seEnabled, battleBgmOn, battleResultCutinShowing, finishedOutcome, resultShown, reachOn, doubleReachOn, jankenActive]);
  useEffect(() => () => stopBgm(), []);

  // 大逆転判定: 相手がリーチ状態のまま自分が勝ったか
  const oppWasReach =
    view != null &&
    Math.max(0, ACADEMIC_GOAL - view.opponent.academic) +
      Math.max(0, SKILL_GOAL - view.opponent.skill) <=
      2;
  const comebackWin = finishedOutcome === "win" && oppWasReach;
  const [comebackFx, setComebackFx] = useState(false);
  useEffect(() => {
    if (!comebackWin) return;
    const t1 = setTimeout(() => {
      setComebackFx(true);
      playVoice("voice_comeback");
    }, 400);
    const t2 = setTimeout(() => setComebackFx(false), 2600);
    playSe("comeback");
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comebackWin]);

  // リザルトの実況: 完全勝利or勝利（負けなら敗北）→ 名勝負S → 連勝、を
  // 決着ボイス・チャイムと重ならないよう一拍おいて順番に流す
  const resultVoicePlayed = useRef(false);
  useEffect(() => {
    if (!resultShown || !finishedOutcome || replayActive) {
      if (!finishedOutcome) resultVoicePlayed.current = false;
      return;
    }
    if (resultVoicePlayed.current) return;
    resultVoicePlayed.current = true;
    const seq: { key: Parameters<typeof playVoice>[0]; dur: number }[] = [];
    if (finishedOutcome === "win") {
      const perfect =
        view != null &&
        view.opponent.academic + view.opponent.skill <= (ACADEMIC_GOAL + SKILL_GOAL) / 2;
      // 大逆転勝利は既存の大逆転ボイスに譲る
      if (!comebackWin) {
        seq.push(
          perfect ? { key: "voice_perfect", dur: 2800 } : { key: "voice_result_win", dur: 3000 }
        );
      }
      if (heatRef.current && heat?.rank === "S") seq.push({ key: "voice_heat_s", dur: 2400 });
      if (record.streak >= 5) seq.push({ key: "voice_streak", dur: 2600 });
    } else {
      seq.push({ key: "voice_result_lose", dur: 3000 });
    }
    let delay = 1500;
    const timers = seq.slice(0, 3).map((v) => {
      const t = setTimeout(() => playVoice(v.key), delay);
      delay += v.dur;
      return t;
    });
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultShown, finishedOutcome, replayActive]);

  // 🔥 名勝負度: 逆転・チェイン・接戦・両者リーチ・大逆転・決着の一手から採点
  const heat = useMemo(() => {
    if (!finishedOutcome || !view) return null;
    const h = heatRef.current;
    const score =
      h.flips * 2 +
      Math.max(0, h.maxChain - 1) +
      h.closeBattles * 2 +
      (h.doubleReach ? 3 : 0) +
      (comebackWin ? 3 : 0) +
      (finalBlowAnnRef.current ? 2 : 0) +
      (view.turnNumber >= 12 ? 1 : 0);
    const rank = score >= 9 ? "S" : score >= 6 ? "A" : score >= 3 ? "B" : "C";
    return { score, rank } as { score: number; rank: "S" | "A" | "B" | "C" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedOutcome]);

  // 自己ベスト更新の判定（最少ターン／最速勝利）
  const bestBadge = useMemo(() => {
    if (finishedOutcome !== "win" || replayActive) return null;
    const hist = record.history;
    const cur = hist[0];
    if (!cur || cur.result !== "win") return null;
    const prevWins = hist.slice(1).filter((r) => r.result === "win");
    if (prevWins.length === 0) return null;
    const bestTurns = Math.min(...prevWins.map((r) => (r.turns > 0 ? r.turns : 99)));
    const bestDur = Math.min(...prevWins.map((r) => (r.durationSec > 0 ? r.durationSec : 99999)));
    if (cur.turns > 0 && cur.turns < bestTurns) {
      return `🏅 自己ベスト更新！ 最少${cur.turns}ターン勝利`;
    }
    if (cur.durationSec > 0 && cur.durationSec < bestDur) {
      return `🏅 自己ベスト更新！ 最速 ${Math.floor(cur.durationSec / 60)}分${cur.durationSec % 60}秒`;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedOutcome]);

  // インストラクター撃破の認定証（勝利の少し後に出す）
  const [certShown, setCertShown] = useState(false);
  useEffect(() => {
    if (finishedOutcome === "win" && kyokanId) {
      const t = setTimeout(() => setCertShown(true), 1600);
      return () => clearTimeout(t);
    }
    setCertShown(false);
  }, [finishedOutcome, kyokanId]);

  // 決着時のCPUのひとこと（勝てば称賛、負ければ励まし）＋勝利の3連振動
  useEffect(() => {
    if (!finishedOutcome) return;
    say(
      finishedOutcome === "win" ? CPU_LINES.cpuLose : CPU_LINES.cpuWin,
      finishedOutcome === "win" ? "cpuLose" : "cpuWin"
    );
    if (finishedOutcome === "win") {
      const ts = [0, 180, 360].map((ms) => setTimeout(() => haptic("success"), ms));
      return () => ts.forEach(clearTimeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedOutcome]);

  const legal = useMemo(
    () => (view ? getLegalActionsFromView(ctx, view) : []),
    [view]
  );

  // 開幕（と引き直し）に、山札から手札を配る演出
  const [dealing, setDealing] = useState<{ key: number; cards: string[] } | null>(null);

  // 遅延ログ用: いま画面に出ている演出の名前を perf に知らせる
  useEffect(() => {
    setPerfScene(
      finishedOutcome
        ? resultShown
          ? "結果画面"
          : "決着演出"
        : dealing
          ? "配り"
          : vsIntro
            ? "VS"
            : jankenActive
              ? "じゃんけん"
              : outFx
                ? "場外"
                : drawFx
                  ? "ドロー"
                  : currentAnn
                    ? `実況:${currentAnn.finalBlow ? "決着の一手" : currentAnn.kind}`
                    : flyFx.length > 0
                      ? "カード移動"
                      : aiThinking
                        ? "CPU思考"
                        : "待機"
    );
  }, [finishedOutcome, resultShown, dealing, vsIntro, jankenActive, outFx, drawFx, currentAnn, flyFx.length, aiThinking]);
  const dealtRef = useRef("");
  useEffect(() => {
    if (!view || view.phase.type !== "mulligan") return;
    if (view.self.mulliganDecided) return;
    const sig = view.self.hand.join(",");
    if (dealtRef.current === sig) return;
    dealtRef.current = sig;
    setDealing({ key: Date.now(), cards: [...view.self.hand] });
  }, [view]);

  // 練習対戦のヒント（盤面から判断して出すので、台本に依存せず壊れにくい）
  const hint = useMemo(() => {
    if (!tutorial || !view) return null;
    const myTurnCount = Math.ceil(view.turnNumber / 2);
    return hintFor(cardRegistry, view, legal, { myTurnCount });
  }, [tutorial, view, legal]);


  // 瀧本などで相手の手札が公開されたらオーバーレイ表示
  useEffect(() => {
    for (const e of lastEvents) {
      if (e.type === "handRevealed" && e.player === OPP) {
        setRevealedHand(e.cardIds);
      }
    }
  }, [lastEvents]);

  if (!view) {
    // 起動直後に対局が無いままここへ来た場合のみ（通常は親が防いでいる）
    return null;
  }

  const me = view.self;
  const cpu = view.opponent;

  const isMyMain = view.phase.type === "main" && view.turnPlayer === ME;
  const actor = playerToActFromView(view);

  const can = (pred: (a: GameAction) => boolean) => legal.some(pred);
  const doAction = (action: GameAction) => {
    setSelectedUid(null);
    setTargetingUid(null);
    setTargetPreview(null);
    setPreviewHandIndex(null);
    setChoicePreview(null);
    dispatch(action);
  };

  /**
   * 手札の一覧に出す短い札。「薄いのはなぜか」をカードを開かずに分かるようにする。
   * （バトル専用のサポートは自分の番では使えないため、薄いまま並ぶ）
   */
  const handTagFor = (index: number): string | null => {
    if (handActionFor(index) !== null) return null;
    const cardId = me.hand[index];
    if (cardId === undefined) return null;
    const def = getCard(cardId);

    if (view.phase.type === "battleSupport") {
      if (def.type === "instructor") return "バトル後";
      if (def.timing === "main") return "自分の番用";
      return null;
    }
    if (view.turnPlayer !== ME) return null;
    if (def.type === "instructor") return "次のターン";
    if (def.timing === "battle") return "バトル用";
    return null;
  };

  /**
   * その手札が今使えない理由。使えるときは null。
   * 「引いたのに使えない」と迷わせないよう、拡大表示で理由を伝える。
   */
  const cannotUseReason = (index: number): string | null => {
    if (handActionFor(index) !== null) return null;
    const cardId = me.hand[index];
    if (cardId === undefined) return null;
    const def = getCard(cardId);

    if (view.phase.type === "mulligan") return "対戦の準備中です。手札を決めてから使えます。";
    if (view.phase.type === "finished") return "対戦は終わりました。";
    if (view.phase.type === "choice") return "先に、表示されている選択を済ませてください。";

    if (view.phase.type === "battleSupport") {
      if (def.type === "instructor") {
        return "バトル中はインストラクターを場に出せません。バトルが終わってから出せます。";
      }
      if (def.timing === "main") return "このサポートカードは、自分の番にだけ使えます（バトル中は使えません）。";
      if (!battleInfo?.myPriority) return "いまは相手がサポートカードを使う番です。少し待ってください。";
      return "このバトルではサポートカードを使えません（相手の効果で封じられています）。";
    }

    // メインフェイズ
    if (view.turnPlayer !== ME) return "いまは相手の番です。自分の番になるまで待ちましょう。";
    if (def.type === "instructor") {
      return "インストラクターを出せるのは、まだ誰も行動していない間だけです。このターンはもう出せません。";
    }
    if (def.timing === "battle") {
      return "このサポートカードは、バトルの最中にだけ使えます。バトルが始まったら手札から選べます。";
    }
    return "いまは使えません。";
  };

  const handActionFor = (index: number): GameAction | null =>
    legal.find(
      (a) =>
        (a.type === "playInstructor" || a.type === "playSupport") && a.handIndex === index
    ) ?? null;

  const battleTargets = (attackerUid: string): Set<string> =>
    new Set(
      legal
        .filter((a) => a.type === "declareBattle" && a.attackerUid === attackerUid)
        .map((a) => (a.type === "declareBattle" ? a.defenderUid : ""))
    );

  const instActions = (uid: string) =>
    legal.filter(
      (a) =>
        (a.type === "instructorAction" && a.uid === uid) ||
        (a.type === "declareBattle" && a.attackerUid === uid) ||
        (a.type === "activateAbility" && a.uid === uid)
    );


  // ===== 盤面の再描画封じ込め =====
  // FieldRow・手札行に渡す値は、盤面が変わったときだけ作り直す。
  // 実況や演出のこまかい状態変化では同じ参照のままにして、
  // メモ化した行コンポーネントの再計算をスキップさせる
  const cpuHighlights = useMemo(
    () => (targetingUid ? battleTargets(targetingUid) : EMPTY_UID_SET),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetingUid, legal]
  );
  const myHighlights = useMemo(
    () => new Set(me.field.filter((f) => instActions(f.uid).length > 0).map((f) => f.uid)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, legal]
  );

  const onPressCpuField = useCallback(
    (uid: string) => {
      if (targetingUid && battleTargets(targetingUid).has(uid)) {
        const inst = cpu.field.find((f) => f.uid === uid);
        if (inst) {
          haptic("light");
          setTargetPreview({ uid, cardId: inst.cardId });
        }
      } else if (!targetingUid) {
        const inst = cpu.field.find((f) => f.uid === uid);
        if (inst) setDetailCardId(inst.cardId, "cpu");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetingUid, view, legal]
  );
  const onPressMyField = useCallback(
    (uid: string) => {
      if (instActions(uid).length > 0) {
        setSelectedUid(uid);
        setTargetingUid(null);
      } else {
        const inst = me.field.find((f) => f.uid === uid);
        if (inst) setDetailCardId(inst.cardId, "self");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, legal]
  );
  // 手札行に渡す1枚ごとの情報（出せるか・短い札）も盤面が変わったときだけ再計算
  const handMeta = useMemo(
    () => me.hand.map((_, i) => ({ playable: handActionFor(i) !== null, tag: handTagFor(i) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, legal]
  );

  const onPressHandIndex = useCallback((i: number) => setPreviewHandIndex(i), []);

  const tantouUsable = can((a) => a.type === "activateAbility" && a.uid === undefined);

  const battleInfo = (() => {
    if (view.phase.type !== "battleSupport") return null;
    const b = view.phase.battle;
    const atkInst = fieldOf(view, b.attackerPlayer).find((f) => f.uid === b.attackerUid);
    const defInst = fieldOf(view, 1 - b.attackerPlayer).find((f) => f.uid === b.defenderUid);
    if (!atkInst || !defInst) return null;
    const buff = (p: number) =>
      b.buffs.filter((x) => x.player === p).reduce((a, x) => a + x.amount, 0);
    return {
      attackerName: getCard(atkInst.cardId).name,
      defenderName: getCard(defInst.cardId).name,
      attackerCardId: atkInst.cardId,
      defenderCardId: defInst.cardId,
      attackerIsCpu: b.attackerPlayer === OPP,
      attackerTotal:
        effectiveCombatFromView(ctx, view, b.attackerPlayer, atkInst) + buff(b.attackerPlayer),
      defenderTotal:
        effectiveCombatFromView(ctx, view, (1 - b.attackerPlayer) as 0 | 1, defInst) +
        buff(1 - b.attackerPlayer),
      myPriority: b.priority === ME,
    };
  })();

  const allLogLines = eventLog
    .map((e) => eventText(e, ME, oppLabel))
    .filter((t): t is string => t !== null);
  // 中央エリアは高さが限られるので、直近3件だけ出す（全文は「すべてのログを見る」）
  const logLines = allLogLines.slice(-3);

  const humanChoice =
    view.phase.type === "choice" && view.phase.pending.player === ME
      ? view.phase.pending
      : null;

  /** 誰の番か・何をすべきかを、色つきの帯で示す */
  const status = (() => {
    if (view.phase.type === "finished") {
      return { who: "対戦終了", detail: "", mine: false, waiting: false };
    }
    if (actor === OPP || aiThinking) {
      // オンラインでは相手の考え中の経過秒数も見せる
      const detail =
        isOnline && oppThinkSec >= 3 ? `考えています…（${oppThinkSec}秒）` : "考えています…";
      return { who: `${oppLabel}の番`, detail, mine: false, waiting: true };
    }
    if (view.phase.type === "mulligan") {
      return { who: "あなたの番", detail: "手札を確認してください", mine: true, waiting: false };
    }
    if (view.phase.type === "battleSupport") {
      return battleInfo?.myPriority
        ? {
            who: "あなたの番",
            detail: "サポートカードや担当の力を使えます",
            mine: true,
            waiting: false,
          }
        : { who: `${oppLabel}の番`, detail: "相手の応答を待っています", mine: false, waiting: true };
    }
    if (view.phase.type === "choice") {
      return { who: "あなたの番", detail: "カードを選んでください", mine: true, waiting: false };
    }
    if (isMyMain) {
      return { who: "あなたの番", detail: "行動を選びましょう", mine: true, waiting: false };
    }
    return null;
  })();

  const rematch = () => {
    // 「対戦するごとに入れ替える」設定なら、もう一度遊ぶときも組み直す
    const st = useSettingsStore.getState();
    randomizeDecksForMatch(st.randomizeStandard, st.randomizeChallenger);
    const latest = useDeckStore.getState();
    const deck = resolveActiveDeck(latest);
    startGame({
      playerDeck: deck.list,
      cpuDeck: cpuDeckFor(deck, latest.builtinOverrides).list,
      difficulty,
      aiSpeedMs,
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <Animated.View style={[styles.shakeWrap, shakeStyle]}>
      {/* ===== 相手エリア ===== */}
      <View style={[styles.zone, { backgroundColor: colors.boardOpponent, borderBottomColor: colors.boardOpponentEdge }]}>
        <View style={styles.infoRow}>
          <Text style={styles.playerLabel}>
            {isOnline ? (opponentName ?? "相手") : kyokanDef ? `${kyokanDef.name}インストラクター` : "CPU"}
          </Text>
          {!isOnline && aiThinking && <ThinkingDots />}
          {/* 相手の称号（実績で獲得したもの） */}
          {isOnline && opponentTitle && (
            <View style={styles.titleBadge}>
              <Text style={styles.titleBadgeText}>{opponentTitle}</Text>
            </View>
          )}
          <Text style={styles.infoText}>手札 {cpu.handCount}</Text>
          <DeckCount count={cpu.deckCount} baseStyle={styles.infoText} />
          <Pressable
            ref={cpuOutRef}
            onPress={() => setPileView("cpuOutOfPlay")}
            hitSlop={6}
            onLayout={measureOutLinks}
          >
            <Text style={styles.infoLink}>場外 {cpu.outOfPlay.length} ▸</Text>
          </Pressable>
          <CardFace cardId={cpu.tantou} size="sm" onPress={() => setDetailCardId(cpu.tantou, "cpu")} />
        </View>
        {/* 相手の接続が切れている間のお知らせ */}
        {isOnline && !opponentConnected && (
          <View style={styles.reconnectBand}>
            <Text style={styles.reconnectText}>📶 相手の接続が切れました…復帰を待っています</Text>
          </View>
        )}
        {/* CPUの口上セリフ（吹き出し） */}
        {cpuSpeech && !isOnline && (
          <View style={styles.cpuSpeechBubble} pointerEvents="none">
            <Text style={styles.cpuSpeechText} allowFontScaling={false}>
              💬 {cpuSpeech}
            </Text>
          </View>
        )}
        <TrackBar label="学科" kind="academic" value={shownTracks?.oa ?? cpu.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" kind="skill" value={shownTracks?.os ?? cpu.skill} goal={SKILL_GOAL} color={colors.success} />
        <FieldRow
          flashIds={flashIds}
          scaredUid={scaredUid}
          view={view}
          player={OPP}
          field={cpu.field}
          highlightUids={cpuHighlights}
          highlightColor={colors.target}
          onPress={onPressCpuField}
        />
      </View>

      {/* ===== 中央: 状況とログ ===== */}
      <View style={styles.middle}>
        {/* 当校ロゴの透かし */}
        <Image
          source={require("../../assets/images/logo-watermark.png")}
          style={styles.logoWatermark}
          contentFit="contain"
          pointerEvents="none"
        />
        {/* 設定画面へ（対戦をやめる操作もそこから行う）。手札に重ならないよう中央エリアの右上に置く */}
        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={8}
          style={styles.settingsButton}
        >
          <Text style={styles.settingsText}>⚙️ 設定</Text>
        </Pressable>
        {/* AIのおすすめ手を1つだけ教えるヒント（自分の手番のみ） */}
        {!isOnline && !replayActive && !autoPlay && view.turnPlayer === ME && view.phase.type !== "finished" && (
          <Pressable onPress={showHint} hitSlop={8} style={styles.hintButton}>
            <Text style={styles.settingsText}>💡 ヒント</Text>
          </Pressable>
        )}
        {hintText && (
          <View style={styles.hintBubble} pointerEvents="none">
            <Text style={styles.hintBubbleText}>💡 {hintText}</Text>
          </View>
        )}
        {/* オンライン: 定型スタンプの送信ボタンと吹き出し */}
        {isOnline && (
          <View style={styles.stampRow}>
            {STAMPS.map((s) => {
              // 実績で解禁されるスタンプ（未解禁は薄く表示して押せない）
              const locked =
                "unlock" in s && !!s.unlock && !useAchievementStore.getState().earned[s.unlock];
              return (
                <Pressable
                  key={s.id}
                  style={[styles.stampButton, locked && { opacity: 0.25 }]}
                  disabled={locked}
                  onPress={() => {
                    haptic("light");
                    sendStamp(s.id);
                  }}
                >
                  <Text style={styles.stampButtonEmoji}>{locked ? "🔒" : s.emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {incomingStamp && stampOf(incomingStamp) && (
          <View style={[styles.stampBubble, styles.stampBubbleOpp]} pointerEvents="none">
            <Text style={styles.stampBubbleText}>
              {stampOf(incomingStamp)!.emoji} {stampOf(incomingStamp)!.label}
            </Text>
          </View>
        )}
        {myStamp && stampOf(myStamp) && (
          <View style={[styles.stampBubble, styles.stampBubbleMine]} pointerEvents="none">
            <Text style={styles.stampBubbleText}>
              {stampOf(myStamp)!.emoji} {stampOf(myStamp)!.label}
            </Text>
          </View>
        )}
        {/* ランダムマッチの相手を探しながらCPU対戦しているときの目印 */}
        {queueActive && !isOnline && (
          <View style={styles.queueBadge} pointerEvents="none">
            <Text style={styles.queueBadgeText}>🌐 相手を探しています…</Text>
          </View>
        )}
        {/* カクつき検知で演出を軽くしたお知らせ */}
        {autoLightNote && (
          <View style={styles.autoLightNote} pointerEvents="none">
            <Text style={styles.autoLightNoteText}>⚡ 動きが重いため、演出を自動で軽くしました</Text>
          </View>
        )}
        {/* 自動プレイ（観戦）。ONの間は自分の手もAIが選ぶ。オンラインでは出さない */}
        {!isOnline && (
        <Pressable
          onPress={() => {
            haptic("light");
            const next = !autoPlay;
            setAutoPlay(next);
            // タップ待ちの実況が残っていたら、自動送りに切り替える
            if (next && currentAnn?.cardId && !annTimer.current) {
              annTimer.current = setTimeout(() => {
                annTimer.current = null;
                setCurrentAnn(null);
              }, 1200);
            }
          }}
          hitSlop={8}
          style={[styles.autoButton, autoPlay && styles.autoButtonOn]}
        >
          <Text style={[styles.settingsText, autoPlay && styles.autoTextOn]}>
            {autoPlay ? "⏸ 自動中" : "▶ 自動"}
          </Text>
        </Pressable>
        )}
        {battleInfo && (
          <Animated.View entering={ZoomIn.duration(250)} style={styles.battleBanner}>
            <View style={styles.battleRow}>
              <Animated.View entering={SlideInLeft.duration(320)} style={styles.battleSide}>
                <CardFace cardId={battleInfo.attackerCardId} size="md" />
                <Text style={styles.battleSideLabel}>
                  {battleInfo.attackerIsCpu ? oppLabel : "あなた"}・アタック
                </Text>
                <Animated.Text
                  key={`a${battleInfo.attackerTotal}`}
                  entering={ZoomIn.duration(250)}
                  style={[styles.battleTotal, { color: colors.danger }]}
                >
                  {battleInfo.attackerTotal}
                </Animated.Text>
              </Animated.View>
              <Text style={styles.vsText}>VS</Text>
              <Animated.View entering={SlideInRight.duration(320)} style={styles.battleSide}>
                <CardFace cardId={battleInfo.defenderCardId} size="md" />
                <Text style={styles.battleSideLabel}>
                  {battleInfo.attackerIsCpu ? "あなた" : oppLabel}・ディフェンス
                </Text>
                <Animated.Text
                  key={`d${battleInfo.defenderTotal}`}
                  entering={ZoomIn.duration(250)}
                  style={[styles.battleTotal, { color: colors.primary }]}
                >
                  {battleInfo.defenderTotal}
                </Animated.Text>
              </Animated.View>
            </View>
          </Animated.View>
        )}
        {targetingUid && (
          <View style={styles.battleBanner}>
            <Text style={styles.battleText}>
              バトルする相手（休憩中）を選んでください{"\n"}タップすると詳細を確認してから仕掛けられます
            </Text>
            <ActionButton
              label="キャンセル"
              color={colors.textMuted}
              small
              onPress={() => setTargetingUid(null)}
            />
          </View>
        )}
        {status && (
          <View
            style={[
              styles.statusBar,
              status.mine ? styles.statusBarMine : styles.statusBarOpponent,
            ]}
          >
            <SignalLight
              state={
                !status.mine
                  ? "red"
                  : view.phase.type === "choice" ||
                      view.phase.type === "battleSupport" ||
                      view.phase.type === "mulligan"
                    ? "yellow"
                    : "green"
              }
            />
            <Text
              style={[
                styles.statusWho,
                { color: status.mine ? colors.success : colors.danger },
              ]}
            >
              {status.who}
            </Text>
            {!!status.detail && <Text style={styles.statusDetail}>{status.detail}</Text>}
            {status.waiting && <ThinkingDots />}
          </View>
        )}
        <View style={styles.log}>
          {/* ボタンを先頭に置き、ログが増えても隠れないようにする */}
          <Pressable onPress={() => setShowLog(true)} hitSlop={6} style={styles.logButtonRow}>
            <Text style={styles.logButton}>すべてのログを見る ▸</Text>
          </Pressable>
          {/* バトル表示・相手選択の表示中は場所が足りないため、ログの行は出さない（記録は残る） */}
          {!battleInfo && !targetingUid && (
            <>
              {logLines.slice(0, -1).map((line, i) => (
                <Text key={`${i}-${line}`} style={styles.logLine} numberOfLines={1}>
                  {line}
                </Text>
              ))}
              {logLines.length > 0 && (
                <LatestLogLine key={allLogLines.length} text={logLines[logLines.length - 1]} />
              )}
            </>
          )}
        </View>
      </View>

      {/* ===== 自分エリア ===== */}
      <View style={[styles.zone, { backgroundColor: colors.boardSelf, borderTopColor: colors.boardSelfEdge }]}>
        <FieldRow
          flashIds={flashIds}
          scaredUid={scaredUid}
          view={view}
          player={ME}
          field={me.field}
          highlightUids={myHighlights}
          highlightColor={colors.highlight}
          selectedUid={selectedUid}
          onPress={onPressMyField}
        />
        <TrackBar label="学科" kind="academic" value={shownTracks?.ma ?? me.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" kind="skill" value={shownTracks?.ms ?? me.skill} goal={SKILL_GOAL} color={colors.success} />
        <View style={styles.infoRow}>
          <Text style={styles.playerLabel}>あなた</Text>
          {/* 山札・場外はタップで中身を確認できる */}
          <Pressable onPress={() => setPileView("deck")} hitSlop={6}>
            <DeckCount count={me.deckCount} baseStyle={styles.infoLink} suffix=" ▸" />
          </Pressable>
          <Pressable
            ref={myOutRef}
            onPress={() => setPileView("outOfPlay")}
            hitSlop={6}
            onLayout={measureOutLinks}
          >
            <Text style={styles.infoLink}>場外 {me.outOfPlay.length} ▸</Text>
          </Pressable>
          <PulseRing active={tantouUsable} style={tantouUsable ? styles.tantouUsable : undefined}>
            {/* 担当カードはタップすると拡大表示。そこから力を使う。
                決着時は勝てば跳ねて喜び、負ければしゅんと沈む */}
            <TantouMood mood={finishedOutcome}>
              <CardFace
                cardId={me.tantou}
                size="sm"
                onPress={() => setDetailCardId(me.tantou, "self")}
              />
            </TantouMood>
          </PulseRing>
          <View style={{ flex: 1 }} />
          {battleInfo?.myPriority && (
            <ActionButton
              label="パス"
              color={colors.textMuted}
              onPress={() => doAction({ type: "passSupport", player: ME })}
            />
          )}
          <ActionButton
            label="ターン終了"
            color={can((a) => a.type === "endTurn") ? colors.accent : colors.border}
            onPress={() =>
              can((a) => a.type === "endTurn") && doAction({ type: "endTurn", player: ME })
            }
          />
        </View>
      </View>

      {/* ===== 手札 ===== */}
      <View style={styles.handArea}>
        {/* 山札から引いたカードが、上から降りてきて手札に加わる */}
        {drawFx && (
          <DrawnCard
            key={drawFx.key}
            cardId={drawFx.cardId}
            onDone={() => setDrawFx(null)}
          />
        )}
        <HandRow
          hand={me.hand}
          meta={handMeta}
          dimUnplayable={isMyMain || view.phase.type === "battleSupport"}
          scrollRef={handScroll}
          onPressIndex={onPressHandIndex}
        />
        {/* 手札が残り1枚の緊張感 */}
        {me.hand.length === 1 && view.phase.type !== "finished" && (
          <View
            style={styles.lastCardChip}
            {...({ dataSet: { kdsanim: "breathe" } } as object)}
            pointerEvents="none"
          >
            <Text style={styles.lastCardChipText} allowFontScaling={false}>⚠️ ラスト1枚！</Text>
          </View>
        )}
      </View>

      </Animated.View>

      {/* 場外へ飛んでいくカード */}
      {outFx && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {outFx.cards.map((c, i) => (
            <FlyToOut
              key={`${outFx.key}-${i}`}
              cardId={c.cardId}
              mine={c.mine}
              index={i}
              target={c.mine ? outPos.current.mine : outPos.current.cpu}
              onDone={i === outFx.cards.length - 1 ? () => setOutFx(null) : undefined}
            />
          ))}
        </View>
      )}

      {/* 衝撃の白フラッシュ（バトル解決・退場） */}
      <Animated.View style={[styles.flashLayer, flashStyle]} pointerEvents="none" />

      {/* ===== 手札を配る演出（開幕・引き直し） ===== */}
      {dealing && (
        <OpeningDeal
          key={dealing.key}
          cards={dealing.cards}
          onDone={() => {
            setDealing(null);
            dealDoneRef.current = true;
            if (wipeDoneRef.current) showVsIntro();
          }}
        />
      )}

      {/* 観戦者数と応援（オンライン対戦） */}
      {isOnline && spectatorCount > 0 && view.phase.type !== "finished" && (
        <View style={styles.specChip} pointerEvents="none">
          <Text style={styles.specChipText} allowFontScaling={false}>
            👀 {spectatorCount}人が観戦中
          </Text>
        </View>
      )}
      {isOnline && cheers.map((c) => <CheerFloat key={c.key} emoji={c.emoji} />)}

      {/* 日替わりの天気（雨・雪）。軽量モード中は出さない */}
      {weather !== "sunny" && effFxLevel !== "light" && view.phase.type !== "finished" && (
        <WeatherLayer kind={weather} />
      )}

      {/* ===== 実況表示: カード付きは大きく詳細表示（タップで次へ） ===== */}
      {currentAnn && annShown && (
        <Pressable
          style={[
            styles.annLayer,
            currentAnn.kind === "turn" && styles.annLayerBand,
            currentAnn.kind === "battle" && styles.annLayerBattle,
            (currentAnn.kind === "lesson" || currentAnn.kind === "power") &&
              styles.annLayerLesson,
            currentAnn.kind === "text" && currentAnn.emph && styles.annLayerEmph,
            currentAnn.cardId && styles.annLayerDim,
          ]}
          onPress={dismissAnn}
        >
          {currentAnn.kind === "power" ? (
            <PowerCutIn
              key={currentAnn.key}
              mine={currentAnn.mine ?? false}
              amount={currentAnn.amount ?? 0}
              label={currentAnn.powerLabel ?? "教習力"}
            />
          ) : currentAnn.kind === "lesson" ? (
            <LessonCutIn
              key={currentAnn.key}
              mine={currentAnn.mine ?? false}
              track={currentAnn.track ?? "academic"}
              amount={currentAnn.amount ?? 0}
              newValue={currentAnn.newValue ?? 0}
              goal={currentAnn.goal ?? 10}
              finalBlow={currentAnn.finalBlow ?? false}
            />
          ) : currentAnn.kind === "battle" ? (
            <BattleCutIn
              key={currentAnn.key}
              subtitle={currentAnn.text}
              atkCardId={currentAnn.atkCardId}
              defCardId={currentAnn.defCardId}
              atkIsCpu={currentAnn.atkIsCpu ?? false}
            />
          ) : currentAnn.kind === "battleResult" ? (
            <BattleResultCutIn
              key={currentAnn.key}
              mine={currentAnn.mine}
              tie={currentAnn.resTie ?? false}
              atk={currentAnn.resAtk ?? 0}
              def={currentAnn.resDef ?? 0}
              deciding={reachOn}
            />
          ) : currentAnn.kind === "trackComplete" ? (
            <TrackCompleteCutIn
              key={currentAnn.key}
              mine={currentAnn.mine ?? false}
              track={currentAnn.track ?? "academic"}
              oppName={oppLabel}
            />
          ) : currentAnn.kind === "recycle" ? (
            <RecycleCutIn
              key={currentAnn.key}
              mine={currentAnn.mine ?? false}
              count={currentAnn.recycleCount ?? 0}
              oppName={oppLabel}
            />
          ) : currentAnn.kind === "turn" ? (
            <Animated.View
              key={currentAnn.key}
              entering={SlideInLeft.duration(260)}
              exiting={SlideOutRight.duration(240)}
              style={[
                styles.turnFxBand,
                { backgroundColor: currentAnn.mine ? colors.success : colors.danger },
              ]}
            >
              <Text
                style={[
                  styles.turnFxText,
                  // 「◯◯インストラクターのターン」など長い名前でも1行に収める
                  currentAnn.text.length > 9 && styles.turnFxTextLong,
                ]}
                numberOfLines={1}
              >
                {currentAnn.text}
              </Text>
              <TurnCar mine={currentAnn.mine ?? false} />
            </Animated.View>
          ) : currentAnn.cardId ? (
            <Animated.View
              key={currentAnn.key}
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(200)}
              style={styles.annCardBox}
            >
              {currentAnn.owner && <OwnerBadge owner={currentAnn.owner} />}
              <Text style={[styles.annCardTitle, annBigger]}>{currentAnn.text}</Text>
              {annQueue.length > 0 && (
                <Text style={styles.annHint}>あと{annQueue.length}件</Text>
              )}
              <CardDetail cardId={currentAnn.cardId} scroll={false} />
              <ActionButton label="次へ ▶" color={colors.primary} onPress={dismissAnn} />
            </Animated.View>
          ) : currentAnn.emph ? (
            <Animated.View
              key={currentAnn.key}
              entering={ZoomIn.springify().damping(10)}
              exiting={ZoomOut.duration(200)}
            >
              <TypewriterText text={currentAnn.text} style={styles.annBigText} />
            </Animated.View>
          ) : (
            <Animated.View
              key={currentAnn.key}
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(200)}
              style={styles.annBox}
            >
              <Text style={[styles.annText, annBigger]}>{currentAnn.text}</Text>
            </Animated.View>
          )}
          {(currentAnn.chain ?? 0) >= 2 && (
            <ChainBadge key={`chain-${currentAnn.key}`} n={currentAnn.chain ?? 2} />
          )}
        </Pressable>
      )}

      {/*
       * 練習対戦のヒント。
       * 実況やターン帯より手前に、手札のすぐ上へ固定して出す
       * （中央に置くと演出に隠れて読めなくなるため）。
       */}
      {hint && hint.title !== readHint && !dealing && view.phase.type !== "finished" && (
        <Animated.View
          key={hint.title}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(160)}
          style={styles.hintBox}
        >
          <Text style={styles.hintLabel}>ヒント</Text>
          <Text style={styles.hintTitle}>{hint.title}</Text>
          <Text style={styles.hintBody}>{hint.body}</Text>
          <Pressable
            onPress={() => {
              haptic("light");
              setReadHint(hint.title);
            }}
            style={styles.hintOk}
          >
            <Text style={styles.hintOkText}>OK</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* リプレイ中: 操作を受け付けず、終了と速度の操作バーだけを出す */}
      {replayActive && (
        <View style={styles.replayBar} pointerEvents="box-none">
          <View style={styles.replayBadge}>
            <Text style={styles.replayBadgeText}>
              {replayPaused ? "⏸ 一時停止中" : "▶ リプレイ再生中"}
            </Text>
          </View>
          <Pressable style={styles.replayButton} onPress={() => replayStepBack()}>
            <Text style={styles.replayButtonText}>⏪ 1手戻す</Text>
          </Pressable>
          <Pressable style={styles.replayButton} onPress={() => toggleReplayPause()}>
            <Text style={styles.replayButtonText}>{replayPaused ? "▶ 再生" : "⏸ 停止"}</Text>
          </Pressable>
          <Pressable
            style={styles.replayButton}
            onPress={() => setReplaySpeed(replaySpeed === 1 ? 2 : 1)}
          >
            <Text style={styles.replayButtonText}>{replaySpeed === 1 ? "×1" : "×2"}</Text>
          </Pressable>
          <Pressable
            style={[styles.replayButton, { backgroundColor: colors.danger }]}
            onPress={() => {
              quitGame();
              router.replace("/records");
            }}
          >
            <Text style={styles.replayButtonText}>終了</Text>
          </Pressable>
        </View>
      )}

      {/* リーチ演出（残り2時限以下になった瞬間の全画面カットイン） */}
      {reachFx &&
        (reachFx.double ? (
          <DoubleReachCutIn mineCaught={reachFx.mine} oppName={oppLabel} />
        ) : (
          <ReachCutIn mine={reachFx.mine} oppName={oppLabel} />
        ))}
      {/* カードの移動演出（出す・引く・退場・サポート） */}
      {flyFx.map((f) => (
        <FlyCard key={f.key} item={f} onDone={removeFly} />
      ))}
      {/* 場外送りなどの浮き上がりテキスト */}
      {floatTexts.map((f) => (
        <FloatTextFx key={f.key} text={f.text} mine={f.mine} />
      ))}
      {/* ターンカウンタ（常駐） */}
      {view.turnNumber > 0 && view.phase.type !== "finished" && <TurnCounter n={view.turnNumber} />}
      {/* 対戦入場の暗転ワイプ → 顔合わせ */}
      {enterWipe && (
        <BattleEnterWipe
          onDone={() => {
            setEnterWipe(false);
            wipeDoneRef.current = true;
            // 手札を配る演出が控えている場合はその完了を待ってからVSを出す
            const dealingExpected =
              !dealDoneRef.current &&
              (dealing !== null ||
                view === null ||
                (view.phase.type === "mulligan" && !view.self.mulliganDecided));
            if (!dealingExpected) showVsIntro();
          }}
        />
      )}
      {examBand && (
        <ExamStartBand
          final={tournamentMatch && useTournamentStore.getState().stage >= 3}
          onDone={() => {
            setExamBand(false);
            fireEntryBanner();
          }}
        />
      )}
      {vsIntro && (
        <VsIntro
          oppName={oppLabel}
          kyokanCardId={kyokanDef?.cardId}
          onDone={() => {
            setVsIntro(false);
            setExamBand(true);
          }}
        />
      )}
      {/* 入場バナー（リベンジ／連勝） */}
      {entryBanner && <EntryBanner text={entryBanner} />}
      {/* 大逆転勝利の特別カットイン */}
      {comebackFx && <ComebackFx />}
      {/* スタンプの飛翔 */}
      {flyStamps.map((f) => (
        <FlyingStamp key={f.key} emoji={f.emoji} up={f.up} />
      ))}
      {/* インストラクター撃破の認定証 */}
      {certShown && kyokanDef && (
        <CertificateFx name={kyokanDef.name} onClose={() => setCertShown(false)} />
      )}
      {/* リーチ中は画面のフチが赤く脈動する */}
      {reachOn && view.phase.type !== "finished" && <ReachVignette double={doubleReachOn} />}
      {/* 進捗の折返し到達のお祝い */}
      {milestone && <MilestonePop key={milestone.key} label={milestone.label} />}
      {/* 初対戦のガイド（吹き出しナビ。タップで閉じる） */}
      {guideText && (
        <Pressable style={styles.guideBubble} onPress={() => setGuideText(null)}>
          <Text style={styles.guideBubbleText}>🔰 {guideText}</Text>
          <Text style={styles.guideBubbleClose}>タップで閉じる</Text>
        </Pressable>
      )}

      {/* 相手が見つかったときの、先攻を決めるじゃんけん（待機中CPU対戦の上にかぶせる） */}
      <OnlineJanken />

      {/* 相手が見つかった通知（CPU対戦からの切り替え） */}
      {matchFound && (
        <Pressable style={styles.matchFoundLayer} onPress={clearMatchFound}>
          {/* AI生成の激突背景で「対戦が始まる」高揚感を出す */}
          <Image
            source={require("../../assets/images/fx/fx_battle.webp")}
            style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}
            contentFit="cover"
          />
          <Animated.View entering={ZoomIn.springify().damping(10)} style={styles.matchFoundBox}>
            <Text style={styles.matchFoundEmoji}>🌐</Text>
            <Text style={styles.matchFoundTitle}>対戦相手が見つかりました！</Text>
            <Text style={styles.matchFoundSub}>{matchFound} さんとの対戦を始めます</Text>
          </Animated.View>
        </Pressable>
      )}

      {/* ===== オーバーレイ ===== */}
      {showLog && (
        <Overlay title="対戦ログ" onClose={() => setShowLog(false)}>
          <ScrollView style={styles.logScroll} contentContainerStyle={{ gap: 4 }}>
            {allLogLines.map((line, i) => (
              <Text key={i} style={styles.logFullLine}>
                {line}
              </Text>
            ))}
          </ScrollView>
          <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setShowLog(false)} />
        </Overlay>
      )}

      {view.phase.type === "mulligan" && !me.mulliganDecided && !dealing && !enterWipe && !vsIntro && !autoPlay && (
        <Overlay title="この手札で始めますか？">
          <Text style={styles.annHint}>カードをタップすると拡大して確認できます</Text>
          <View style={styles.overlayCards}>
            {me.hand.map((id, i) => (
              <CardFace
                key={i}
                cardId={id}
                size="md"
                onPress={() => setDetailCardId(id, "self")}
              />
            ))}
          </View>
          <View style={styles.overlayButtons}>
            <ActionButton
              label="この手札で始める"
              color={colors.primary}
              onPress={() => doAction({ type: "mulligan", player: ME, redraw: false })}
            />
            <ActionButton
              label="引き直す（1回だけ）"
              color={colors.accent}
              onPress={() => {
                playVoice("voice_mulligan");
                doAction({ type: "mulligan", player: ME, redraw: true });
              }}
            />
          </View>
        </Overlay>
      )}

      {selectedUid && (
        <Overlay
          title={`「${nameOf(view, ME, selectedUid)}」の行動`}
          onClose={() => setSelectedUid(null)}
        >
          <View style={styles.menuCardRow}>
            <CardFace cardId={cardIdOf(view, selectedUid)} size="md" />
            <View style={styles.menuEffectFlex}>
              {/* 現在の値（サポートなどの補正込み）を見せる */}
              <View style={styles.menuStatsRow}>
                <Text style={[styles.menuStatBadge, { backgroundColor: colors.danger }]}>
                  戦闘力 {combatOf(view, selectedUid)}
                </Text>
                <Text style={[styles.menuStatBadge, { backgroundColor: colors.primary }]}>
                  教習力 {lessonOf(view, selectedUid)}
                </Text>
              </View>
              {!!effectTextOf(view, selectedUid) && (
                <Text style={styles.menuEffectText}>{effectTextOf(view, selectedUid)}</Text>
              )}
            </View>
          </View>
          <View style={styles.overlayButtons}>
            {instActions(selectedUid).some(
              (a) => a.type === "instructorAction" && a.action === "academic"
            ) && (
              <ActionButton
                label={`学科を進める（+${lessonOf(view, selectedUid)}）`}
                color={colors.primary}
                onPress={() =>
                  doAction({ type: "instructorAction", player: ME, uid: selectedUid, action: "academic" })
                }
              />
            )}
            {instActions(selectedUid).some(
              (a) => a.type === "instructorAction" && a.action === "skill"
            ) && (
              <ActionButton
                label={`技能を進める（+${lessonOf(view, selectedUid)}）`}
                color={colors.success}
                onPress={() =>
                  doAction({ type: "instructorAction", player: ME, uid: selectedUid, action: "skill" })
                }
              />
            )}
            {instActions(selectedUid).some((a) => a.type === "declareBattle") && (
              <ActionButton
                label="バトルをする"
                color={colors.danger}
                onPress={() => {
                  setTargetingUid(selectedUid);
                  setSelectedUid(null);
                }}
              />
            )}
            {instActions(selectedUid).some((a) => a.type === "activateAbility") && (
              <ActionButton
                label={`特技: ${abilityLabelOf(view, selectedUid)}`}
                color={colors.tantou}
                onPress={() =>
                  doAction({ type: "activateAbility", player: ME, uid: selectedUid })
                }
              />
            )}
            {instActions(selectedUid).some(
              (a) => a.type === "instructorAction" && a.action === "doNothing"
            ) && (
              <ActionButton
                label="なにもしない（元気のまま）"
                color={colors.textMuted}
                onPress={() =>
                  doAction({ type: "instructorAction", player: ME, uid: selectedUid, action: "doNothing" })
                }
              />
            )}
            <ActionButton
              label="キャンセル"
              color={colors.cancel}
              onPress={() => setSelectedUid(null)}
            />
          </View>
        </Overlay>
      )}

      {previewHandIndex !== null && me.hand[previewHandIndex] !== undefined && !humanChoice && (
        <Overlay
          title={getCard(me.hand[previewHandIndex]).name}
          onClose={() => setPreviewHandIndex(null)}
        >
          <CardDetail cardId={me.hand[previewHandIndex]} />
          <View style={styles.overlayButtons}>
            {(() => {
              const action = handActionFor(previewHandIndex);
              if (action) {
                return (
                  <ActionButton
                    label={action.type === "playInstructor" ? "場に出す" : "使う"}
                    color={colors.primary}
                    onPress={() => doAction(action)}
                  />
                );
              }
              const reason = cannotUseReason(previewHandIndex);
              if (!reason) return null;
              return (
                <View style={styles.cannotBox}>
                  <Text style={styles.cannotLabel}>いま使えません</Text>
                  <Text style={styles.cannotText}>{reason}</Text>
                </View>
              );
            })()}
            <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setPreviewHandIndex(null)} />
          </View>
        </Overlay>
      )}

      {/* 実況・ドロー・カード移動・場外送りの演出が残っている間は出さない
          （「手札に戻すカードを選んでください」等が演出と重ならないように） */}
      {humanChoice && !busy && !drawFx && flyFx.length === 0 && !outFx && !autoPlay && (
        <Overlay title={humanChoice.prompt}>
          {humanChoice.purpose === "janken" ? (
            <View style={styles.jankenRow}>
              {humanChoice.options.map((o, i) => (
                <Pressable
                  key={i}
                  style={styles.jankenButton}
                  onPress={() => doAction({ type: "resolveChoice", player: ME, optionIndex: i })}
                >
                  <Text style={styles.jankenEmoji}>{o.label.split(" ")[1] ?? o.label}</Text>
                  <Text style={styles.jankenLabel}>{o.label.split(" ")[0]}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <>
            {/* 案内文はカードを並べる箱の外に置く（中に入れると並びが崩れる） */}
            {humanChoice.options.some((o) => o.cardId) && (
              <Text style={styles.annHint}>カードをタップすると拡大して確認できます</Text>
            )}
            <View style={styles.overlayCards}>
              {humanChoice.options.map((o, i) =>
                o.cardId ? (
                  <CardFace
                    key={i}
                    cardId={o.cardId}
                    size="md"
                    onPress={() => setChoicePreview(i)}
                  />
                ) : (
                  <ActionButton
                    key={i}
                    label={o.label}
                    color={colors.primary}
                    onPress={() => doAction({ type: "resolveChoice", player: ME, optionIndex: i })}
                  />
                )
              )}
            </View>
            </>
          )}
        </Overlay>
      )}

      {/* 選択肢のカードを拡大して確認し、そこから選ぶ */}
      {humanChoice && choicePreview !== null && humanChoice.options[choicePreview]?.cardId && (
        <Overlay
          title={getCard(humanChoice.options[choicePreview].cardId!).name}
          onClose={() => setChoicePreview(null)}
        >
          <OwnerBadge owner={choiceOwner(humanChoice.purpose)} />
          <CardDetail cardId={humanChoice.options[choicePreview].cardId!} />
          <ActionButton
            label="このカードを選ぶ"
            color={colors.primary}
            onPress={() =>
              doAction({ type: "resolveChoice", player: ME, optionIndex: choicePreview })
            }
          />
          <ActionButton
            label="戻る"
            color={colors.cancel}
            onPress={() => setChoicePreview(null)}
          />
        </Overlay>
      )}

      {revealedHand && !busy && !drawFx && flyFx.length === 0 && (
        <Overlay title="相手の手札" onClose={() => setRevealedHand(null)}>
          <Text style={styles.annHint}>カードをタップすると拡大して確認できます</Text>
          <View style={styles.overlayCards}>
            {revealedHand.map((id, i) => (
              <CardFace
                key={i}
                cardId={id}
                size="md"
                onPress={() => setDetailCardId(id, "cpu")}
              />
            ))}
          </View>
          <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setRevealedHand(null)} />
        </Overlay>
      )}

      {pileView && (() => {
        const isCpu = pileView === "cpuOutOfPlay";
        const cards = sortedPile(
          pileView === "deck" ? me.deckContents : isCpu ? cpu.outOfPlay : me.outOfPlay
        );
        const title =
          pileView === "deck"
            ? `山札の中身（${cards.length}枚）`
            : `${isCpu ? `${oppLabel}の` : "あなたの"}場外（${cards.length}枚）`;
        return (
          <Overlay title={title} onClose={() => setPileView(null)}>
            {pileView === "deck" && (
              <Text style={styles.pileNote}>
                ※ カードの種類と枚数を確認できます。ここに並んでいる順番は、実際の山札の並び順とは違います。
              </Text>
            )}
            <ScrollView style={styles.pileScroll} contentContainerStyle={styles.pileContent}>
              {cards.length === 0 ? (
                <Text style={styles.infoText}>カードはありません</Text>
              ) : (
                <View style={styles.overlayCards}>
                  {cards.map((id, i) => (
                    <CardFace
                      key={`${id}-${i}`}
                      cardId={id}
                      size="md"
                      onPress={() => setDetailCardId(id, isCpu ? "cpu" : "self")}
                    />
                  ))}
                </View>
              )}
            </ScrollView>
            <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setPileView(null)} />
          </Overlay>
        );
      })()}

      {/* カード詳細は他のオーバーレイの上に重ねる（最後に描画する） */}
      {targetPreview && targetingUid && (
        <Overlay
          title={`${getCard(targetPreview.cardId).name} にバトル？`}
          onClose={() => setTargetPreview(null)}
        >
          <OwnerBadge owner="cpu" />
          <CardDetail cardId={targetPreview.cardId} />
          {/* 戦闘力の比較（いまの修正値込み） */}
          {(() => {
            const atkInst = me.field.find((f) => f.uid === targetingUid);
            const defInst = cpu.field.find((f) => f.uid === targetPreview.uid);
            if (!atkInst || !defInst) return null;
            const atkPow = effectiveCombatFromView(ctx, view, ME, atkInst);
            const defPow = effectiveCombatFromView(ctx, view, OPP, defInst);
            return (
              <View style={styles.targetCompareRow}>
                <Text style={styles.targetCompareText} allowFontScaling={false}>
                  ⚔️ あなたの「{getCard(atkInst.cardId).name}」 戦闘力{" "}
                  <Text style={styles.targetCompareNum}>{atkPow}</Text>
                  {"  vs  "}
                  <Text style={styles.targetCompareNum}>{defPow}</Text>
                  {" 相手"}
                </Text>
                <Text style={styles.targetCompareHint} allowFontScaling={false}>
                  {atkPow > defPow
                    ? "このままなら勝てる！（サポートで逆転されることもあります）"
                    : atkPow === defPow
                      ? "同じ戦闘力。このままだと相打ちに！"
                      : "このままだと負ける…サポートカードでの上乗せが必要かも"}
                </Text>
              </View>
            );
          })()}
          <ActionButton
            label="⚔️ このカードにバトルを仕掛ける！"
            color={colors.danger}
            onPress={() => {
              const uid = targetPreview.uid;
              const atk = targetingUid;
              if (!atk) return;
              doAction({
                type: "declareBattle",
                player: ME,
                attackerUid: atk,
                defenderUid: uid,
              });
            }}
          />
          <ActionButton
            label="やめておく（ほかのカードも見られます）"
            color={colors.textMuted}
            onPress={() => setTargetPreview(null)}
          />
        </Overlay>
      )}

      {detailCardId && (
        <Overlay title={getCard(detailCardId).name} onClose={() => setDetailCardId(null)}>
          {detail?.owner && <OwnerBadge owner={detail.owner} />}
          <CardDetail cardId={detailCardId} />
          {detailCardId === me.tantou && tantouUsable && (
            <ActionButton
              label={`この力を使う: ${getCard(me.tantou).ability?.label ?? ""}`}
              color={colors.tantou}
              onPress={() => {
                setDetailCardId(null);
                doAction({ type: "activateAbility", player: ME });
              }}
            />
          )}
          <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setDetailCardId(null)} />
        </Overlay>
      )}

      {view.phase.type === "finished" && resultShown && view.phase.winner === ME && (
        <>
          {/* AI生成の祝福背景（金色バースト＋紙吹雪） */}
          <Image
            source={require("../../assets/images/fx/fx_victory.webp")}
            style={[StyleSheet.absoluteFill, { opacity: 0.88 }]}
            contentFit="cover"
            pointerEvents="none"
          />
          <Confetti />
          {/* 自分のデッキの全カード（担当含む）が舞う */}
          <CardRain
            cardIds={[
              ...me.deckContents,
              ...me.hand,
              ...me.field.map((f) => f.cardId),
              ...me.outOfPlay,
              me.tantou,
            ]}
          />
          {/* 通算勝利数の節目は花火大会でお祝い */}
          {[50, 100, 200, 300, 500, 1000].includes(record.wins) && (
            <Fireworks label={`🎆 通算${record.wins}勝 達成！！`} />
          )}
        </>
      )}

      {/* 敗北: 画面が暗く沈み、雨が降り、カードが力なく落ちていく */}
      {view.phase.type === "finished" && resultShown && view.phase.winner === OPP && (
        <LossScene cardIds={[...me.hand, ...me.field.map((f) => f.cardId), me.tantou]} />
      )}

      {view.phase.type === "finished" && resultShown && (
        <Overlay
          translucent
          title={
            view.phase.winner === ME
              ? // 勝ち方によって見出しを変える（圧勝・接戦・通常）
                view.phase.reason === "deckOut"
                  ? "🎉 勝利！"
                  : cpu.academic + cpu.skill <= (ACADEMIC_GOAL + SKILL_GOAL) / 2
                    ? "👑 完全勝利！！"
                    : ACADEMIC_GOAL - cpu.academic + SKILL_GOAL - cpu.skill <= 4
                      ? "🔥 大接戦を制した！"
                      : "🎉 勝利！"
              : "😢 敗北…"
          }
          entering="bounce"
        >
          {/* 検定員の採点ボード → 判子 → 講評 */}
          <KenteiBoard
            won={view.phase.winner === ME}
            turns={view.turnNumber}
            oppOut={cpu.outOfPlay.length}
            comeback={comebackWin}
          />
          <KenteiHanko pass={view.phase.winner === ME} />
          <Text style={styles.resultText}>
            {view.phase.reason === "deckOut"
              ? view.phase.winner === ME
                ? `${oppLabel}の山札が切れました`
                : "山札が切れてしまいました"
              : view.phase.winner === ME
                ? cpu.academic + cpu.skill <= (ACADEMIC_GOAL + SKILL_GOAL) / 2
                  ? `${oppLabel}を大きく引き離しての卒業！お見事！`
                  : "学科10時限・技能19時限を達成！卒業おめでとう！"
                : `${oppLabel}が先に教習を修了しました`}
          </Text>
          {bestBadge && (
            <View style={styles.bestBadge}>
              <Text style={styles.bestBadgeText}>{bestBadge}</Text>
            </View>
          )}
          {/* 学科・技能の到達度をカウントアップで見せる */}
          <ResultScores
            meA={me.academic}
            meS={me.skill}
            opA={cpu.academic}
            opS={cpu.skill}
            oppLabelText={oppLabel}
          />
          {/* 名勝負度（逆転・接戦・チェインなどの白熱度） */}
          {heat && <NetsuMeter rank={heat.rank} score={heat.score} />}
          {/* インストラクターの講評（教習原簿の所見欄風・CPU戦のみ） */}
          {!isOnline && (
            <View style={styles.kouhyouBox}>
              <Text style={styles.kouhyouLabel}>📔 {oppLabel}の所見</Text>
              <Text style={styles.kouhyouText}>
                {kouhyouFor(view.phase.winner === ME, view.turnNumber, comebackWin, cpu.outOfPlay.length)}
              </Text>
            </View>
          )}
          {/* 連勝の勢いを見せる（3連勝で炎、5連勝で金） */}
          {view.phase.winner === ME && record.streak >= 3 && (
            <View
              style={[
                styles.streakBanner,
                record.streak >= 5 && styles.streakBannerGold,
                record.streak >= 10 && styles.streakBannerRainbow,
              ]}
            >
              {record.streak >= 10 ? (
                <RainbowText text={`🌈⚡ ${record.streak}連勝中！ 伝説の走り！`} size={15} />
              ) : (
                <Text style={styles.streakBannerText}>
                  {record.streak >= 5 ? "👑" : "🔥"} {record.streak}連勝中！
                  {record.streak >= 5 ? " 無敵の勢い！" : " ノリにノってる！"}
                </Text>
              )}
            </View>
          )}
          {/* 今回の連戦と通算の成績 */}
          <View style={styles.recordRow}>
            <Text style={styles.recordSession}>
              今回の連戦{" "}
              <Text style={styles.recordWin}>{record.sessionWins}勝</Text>{" "}
              <Text style={styles.recordLose}>{record.sessionLosses}敗</Text>
            </Text>
            <Text style={styles.recordText}>
              通算 {record.wins}勝 {record.losses}敗
            </Text>
            {record.streak >= 2 && record.streak < 3 && (
              <Text style={styles.recordStreak}>🔥 {record.streak}連勝中！</Text>
            )}
          </View>
          {/* オンライン: 再戦の申し込み */}
          {isOnline && (
            <View style={{ gap: 6, alignSelf: "stretch", alignItems: "center" }}>
              {rematchOffered && !rematchRequested && (
                <Text style={styles.rematchOfferText}>
                  🔔 {oppLabel} さんが再戦を希望しています！
                </Text>
              )}
              {rematchRequested ? (
                <Text style={styles.rematchWaitText}>
                  {rematchOffered
                    ? "まもなく再戦が始まります…"
                    : `再戦を申し込みました。${oppLabel} さんの返事を待っています…`}
                </Text>
              ) : (
                <ActionButton
                  label={rematchOffered ? "🔥 再戦を受ける！" : "もう一度対戦を申し込む"}
                  color={colors.primary}
                  onPress={() => {
                    haptic("medium");
                    requestRematch();
                  }}
                />
              )}
              {/* 負けたら挑戦状（後日のリベンジ予約）を送れる */}
              {view.phase.winner === OPP &&
                opponentDevice &&
                (challengeSent ? (
                  <Text style={styles.challengeSentText}>
                    🔥 挑戦状を送りました！相手が受けると「オンライン対戦」画面に現れます
                  </Text>
                ) : (
                  <ActionButton
                    label="📮 挑戦状を送る（後日リベンジ！）"
                    color={colors.danger}
                    onPress={() => void sendChallenge()}
                  />
                ))}
            </View>
          )}
          <View style={styles.overlayButtons}>
            {replayActive && (
              <ActionButton
                label="記録へ戻る"
                color={colors.primary}
                onPress={() => {
                  quitGame();
                  router.replace("/records");
                }}
              />
            )}
            {tournamentMatch ? (
              <ActionButton
                label="🏆 トーナメントへ戻る"
                color={colors.accent}
                onPress={() => {
                  quitGame();
                  router.replace("/tournament");
                }}
              />
            ) : (
              !isOnline &&
              !replayActive && (
                <ActionButton label="もう一度遊ぶ" color={colors.primary} onPress={rematch} />
              )
            )}
            {finalBlowAnnRef.current && !replayActive && (
              <ActionButton
                label="🎬 決着の瞬間をもう一度"
                color={colors.accent}
                onPress={() => {
                  haptic("medium");
                  const ann = finalBlowAnnRef.current;
                  if (!ann) return;
                  setResultShown(false);
                  setAnnQueue((q) => [...q, { ...ann, key: ++annSeq }]);
                }}
              />
            )}
            {Platform.OS === "web" && !replayActive && (
              <ActionButton
                label="📸 結果を画像で保存・共有"
                color={colors.support}
                onPress={() => {
                  haptic("light");
                  void shareResultImage({
                    won: view.phase.type === "finished" && view.phase.winner === ME,
                    myAcademic: me.academic,
                    mySkill: me.skill,
                    oppAcademic: cpu.academic,
                    oppSkill: cpu.skill,
                    deckName: resolveActiveDeck(useDeckStore.getState()).name,
                    oppLabel,
                    streak: record.streak,
                    title: useAchievementStore.getState().selectedTitle,
                  });
                }}
              />
            )}
            <ActionButton
              label="ホームへ"
              color={colors.textMuted}
              onPress={() => {
                quitGame();
                router.replace("/");
              }}
            />
          </View>
        </Overlay>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- 部品

/** ヒント用: AIが選んだ手を日本語のひとことにする */
function describeAction(view: PlayerView, a: GameAction): string {
  const my = view.playerId as 0 | 1;
  switch (a.type) {
    case "mulligan":
      return a.redraw ? "手札を引き直すのがおすすめ" : "この手札のまま始めてOK";
    case "playInstructor": {
      const id = view.self.hand[a.handIndex];
      return id ? `「${getCard(id).name}」を場に出してみよう` : "インストラクターを場に出そう";
    }
    case "instructorAction": {
      const name = nameOf(view, my, a.uid);
      if (a.action === "academic") return `「${name}」で学科を進めよう`;
      if (a.action === "skill") return `「${name}」で技能を進めよう`;
      return `「${name}」は温存（なにもしない）が良さそう`;
    }
    case "declareBattle": {
      const atk = nameOf(view, my, a.attackerUid);
      const def = nameOf(view, (1 - my) as 0 | 1, a.defenderUid);
      return `「${atk}」で「${def}」にバトルを仕掛けよう！`;
    }
    case "playSupport": {
      const id = view.self.hand[a.handIndex];
      return id ? `サポート「${getCard(id).name}」を使おう` : "サポートを使おう";
    }
    case "passSupport":
      return "ここはパスでOK";
    case "activateAbility":
      return "特技を使うのがおすすめ";
    default:
      return "先頭の選択肢を選んでみよう";
  }
}

function nameOf(view: PlayerView, player: 0 | 1, uid: string): string {
  const inst = fieldOf(view, player).find((f) => f.uid === uid);
  return inst ? getCard(inst.cardId).name : "";
}

function lessonOf(view: PlayerView, uid: string): number {
  const inst = view.self.field.find((f) => f.uid === uid);
  if (!inst) return 0;
  return effectiveLessonFromView(ctx, view, view.playerId, inst);
}

function combatOf(view: PlayerView, uid: string): number {
  const inst = view.self.field.find((f) => f.uid === uid);
  if (!inst) return 0;
  return effectiveCombatFromView(ctx, view, view.playerId, inst);
}

function abilityLabelOf(view: PlayerView, uid: string): string {
  const inst = view.self.field.find((f) => f.uid === uid);
  return inst ? (getCard(inst.cardId).ability?.label ?? "") : "";
}

function effectTextOf(view: PlayerView, uid: string): string {
  const inst = view.self.field.find((f) => f.uid === uid);
  return inst ? (getCard(inst.cardId).effectText ?? "") : "";
}

function cardIdOf(view: PlayerView, uid: string): string {
  const inst = view.self.field.find((f) => f.uid === uid);
  return inst ? inst.cardId : "";
}

/** 選べる対象カードの上で上下に跳ねる矢印 */
function TargetArrow({ color }: { color: string }) {
  const bounce = useSharedValue(0);
  useEffect(() => {
    bounce.value = withRepeat(
      withSequence(withTiming(6, { duration: 320 }), withTiming(0, { duration: 320 })),
      -1
    );
  }, [bounce]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }] }));
  return (
    <Animated.Text
      style={[styles.targetArrow, { color }, style]}
      pointerEvents="none"
      allowFontScaling={false}
    >
      ▼
    </Animated.Text>
  );
}

/**
 * 手札の一列。盤面（view・合法手）が変わったときだけ再描画されるようメモ化。
 * 実況や演出のこまかい状態変化ではスキップされ、カクつきを生まない
 */
const HandRow = React.memo(function HandRow({
  hand,
  meta,
  dimUnplayable,
  scrollRef,
  onPressIndex,
}: {
  hand: string[];
  meta: { playable: boolean; tag: string | null }[];
  dimUnplayable: boolean;
  scrollRef: React.RefObject<ScrollView | null>;
  onPressIndex: (i: number) => void;
}) {
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hand}
    >
      {hand.map((cardId, i) => {
        const playable = meta[i]?.playable ?? false;
        // 手札をわずかに扇状に並べる（中央が高く、端がわずかに沈んで傾く）
        const mid = (hand.length - 1) / 2;
        const fanRot = (i - mid) * 2.2;
        const fanDrop = Math.abs(i - mid) * 2.5;
        return (
          <Animated.View
            key={`${cardId}-${i}`}
            entering={FadeInDown.duration(250)}
            style={{ transform: [{ rotate: `${fanRot}deg` }, { translateY: fanDrop }] }}
          >
            {/* 出せるカードはゆっくり浮き沈みして、目で追えるようにする */}
            <FloatIdle active={playable} offset={i}>
              <View style={playable ? styles.playableCard : undefined}>
                {playable && <GoldPulseBorder />}
                <CardFace
                  cardId={cardId}
                  size="md"
                  dimmed={!playable && dimUnplayable}
                  onPress={() => onPressIndex(i)}
                />
                {meta[i]?.tag ? (
                  <View style={styles.handTag} pointerEvents="none">
                    <Text style={styles.handTagText} numberOfLines={1}>
                      {meta[i]?.tag}
                    </Text>
                  </View>
                ) : null}
              </View>
            </FloatIdle>
          </Animated.View>
        );
      })}
      {hand.length === 0 && <Text style={styles.infoText}>手札がありません</Text>}
    </ScrollView>
  );
});

const FieldRow = React.memo(function FieldRow({
  view,
  player,
  field,
  highlightUids,
  highlightColor,
  selectedUid,
  onPress,
  flashIds,
  scaredUid,
}: {
  view: PlayerView;
  player: 0 | 1;
  field: InstructorOnField[];
  highlightUids: Set<string>;
  highlightColor: string;
  selectedUid?: string | null;
  onPress: (uid: string) => void;
  /** 効果を発動して金色に光らせるカードID */
  flashIds?: Set<string>;
  /** バトルで狙われている（怯えて震える）カードのuid */
  scaredUid?: string | null;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.fieldRow}
    >
      {field.length === 0 && <Text style={styles.emptyField}>インストラクターなし</Text>}
      {field.map((inst) => {
        const combat = effectiveCombatFromView(ctx, view, player, inst);
        const base = getCard(inst.cardId).combat ?? 0;
        // 効果で教習力が変わっているときは、差分を「教+1」のように示す
        const lesson = effectiveLessonFromView(ctx, view, player, inst);
        const lessonBase = getCard(inst.cardId).lesson ?? 0;
        const lessonDiff = lesson - lessonBase;
        return (
          <SlamEnter key={inst.uid}>
            <Pressable
              onPress={() => onPress(inst.uid)}
              style={[
                styles.fieldSlot,
                highlightUids.has(inst.uid) && {
                  borderColor: highlightColor,
                  borderWidth: 2,
                  borderRadius: 8,
                },
                selectedUid === inst.uid && {
                  borderColor: colors.accent,
                  borderWidth: 2,
                  borderRadius: 8,
                },
              ]}
            >
              {/* 選べる対象には跳ねる矢印を出して迷わせない */}
              {highlightUids.has(inst.uid) && <TargetArrow color={highlightColor} />}
              <RestRotator rested={inst.rested}>
                {/* 元気なカードはゆっくり呼吸するように揺れ、狙われていると怯えて震える */}
                <Tremble active={scaredUid === inst.uid}>
                <Breathe active={!inst.rested}>
                  <View>
                    <CardFace cardId={inst.cardId} size="sm" dimmed={inst.actedThisTurn && !inst.rested} />
                    {/* 効果を発動した瞬間、金色に光る */}
                    {flashIds?.has(inst.cardId) && <GoldFlash key={inst.uid + "f"} />}
                  </View>
                </Breathe>
                </Tremble>
              </RestRotator>
              <Text style={styles.fieldCaption}>
                {inst.rested ? "休憩 " : ""}
                {combat !== base ? `戦${combat}(${combat - base > 0 ? "+" : ""}${combat - base}) ` : ""}
                {lessonDiff !== 0 && (
                  <Text style={lessonDiff > 0 ? styles.captionUp : styles.captionDown}>
                    教{lesson}({lessonDiff > 0 ? "+" : ""}
                    {lessonDiff})
                  </Text>
                )}
              </Text>
            </Pressable>
          </SlamEnter>
        );
      })}
    </ScrollView>
  );
});

/** CPUの思考中を示す、ゆっくり明滅する点 */
/**
 * バトル勝敗の全画面カットイン。
 * 勝ち: 祝福背景に「バトル勝利！」／負け: 沈む闇に「バトル敗北…」／相打ちは激突背景
 */
export function BattleResultCutIn({
  mine,
  tie,
  atk,
  def,
  deciding,
}: {
  mine?: boolean;
  tie: boolean;
  atk: number;
  def: number;
  /** どちらかがリーチ中の「決着がかかったバトル」。カウントアップの特別演出にする */
  deciding?: boolean;
}) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const flash = useSharedValue(0);
  // 戦闘力の差が1以内の「接戦」は、ひと呼吸ためてから決着を見せる
  const close = !deciding && !tie && Math.abs(atk - def) <= 1;
  const [reveal, setReveal] = useState(!deciding && !close);
  const [shown, setShown] = useState<{ atk: number; def: number }>(
    deciding ? { atk: 0, def: 0 } : { atk, def }
  );
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 140 });
    const revealFx = () => {
      playSe(tie ? "battle_tie" : mine ? "battle_win" : "battle_lose");
      if (tie) playVoice("voice_tie");
      else if (mine) playVoice("voice_battlewin");
      haptic(tie ? "heavy" : mine ? "success" : "warning");
      if (tie) {
        // 相打ちは白い閃光と衝撃の揺れ
        flash.value = withSequence(
          withTiming(0.85, { duration: 70 }),
          withTiming(0, { duration: 420 })
        );
        scale.value = withSequence(
          withTiming(1.2, { duration: 140, easing: Easing.out(Easing.cubic) }),
          withTiming(0.96, { duration: 90 }),
          withTiming(1.04, { duration: 80 }),
          withTiming(1, { duration: 80 })
        );
        return;
      }
      scale.value = withSequence(
        withTiming(1.15, { duration: 200, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 150 })
      );
    };
    if (close) {
      // 接戦: 「大接戦…！」と見せて一拍ためる
      playSe("battle");
      playVoice("voice_close");
      haptic("medium");
      scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      const t = setTimeout(() => {
        setReveal(true);
        revealFx();
      }, 900);
      return () => clearTimeout(t);
    }
    if (!deciding) {
      revealFx();
      return;
    }
    // ラストバトル: ドラムロールとともに両者の戦闘力がゆっくりカウントアップし、
    // 出そろってから一呼吸ためて決着を見せる
    playSe("battle");
    playVoice("voice_lastbattle");
    haptic("heavy");
    scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    const steps = 14;
    const interval = 150;
    let i = 0;
    const tick = setInterval(() => {
      i++;
      setShown({
        atk: Math.min(atk, Math.round((atk * i) / steps)),
        def: Math.min(def, Math.round((def * i) / steps)),
      });
      playSe("tap");
      haptic("light");
    }, interval);
    // カウントが出そろったら、ためている間だけ鼓動のように脈打たせる
    const counted = setTimeout(() => {
      clearInterval(tick);
      setShown({ atk, def });
      haptic("heavy");
      scale.value = withRepeat(
        withSequence(withTiming(1.05, { duration: 190 }), withTiming(1, { duration: 190 })),
        2
      );
    }, interval * steps + 80);
    // 一拍（約1秒）ためてから決着
    const done = setTimeout(() => {
      setReveal(true);
      revealFx();
    }, interval * steps + 1080);
    return () => {
      clearInterval(tick);
      clearTimeout(counted);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const flashSt = useAnimatedStyle(() => ({ opacity: flash.value }));
  const bg = !reveal
    ? require("../../assets/images/fx/fx_battle.webp")
    : tie
      ? require("../../assets/images/fx/fx_battle.webp")
      : mine
        ? require("../../assets/images/fx/fx_victory.webp")
        : require("../../assets/images/fx/fx_down.webp");
  const title = !reveal
    ? deciding
      ? "🏁 ラストバトル！！"
      : "⚡ 大接戦…！！"
    : tie
      ? "⚡ 相打ち！！"
      : mine
        ? "🔥 バトル勝利！"
        : "💥 バトル敗北…";
  const color = !reveal ? "#ffd54d" : tie ? "#8fd3ee" : mine ? "#ffd54d" : "#90a4c8";
  return (
    <View style={styles.reachLayer} pointerEvents="none">
      <Image source={bg} style={[StyleSheet.absoluteFill, { opacity: 0.85 }]} contentFit="cover" />
      <Animated.View style={[styles.reachBox, box]}>
        <Text
          style={[styles.reachTitle, { color }, !reveal && styles.reachTitleLong]}
          allowFontScaling={false}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={styles.battleResultScore} allowFontScaling={false}>
          {shown.atk} <Text style={styles.battleResultVs}>vs</Text> {shown.def}
        </Text>
        <Text style={styles.reachSub}>
          {!reveal
            ? deciding
              ? "勝敗の行方は…！？"
              : "ほぼ互角！勝つのはどっちだ…！？"
            : tie
              ? "両者のインストラクターが場外へ！"
              : mine
                ? "相手のインストラクターを場外に追いやった！"
                : "インストラクターが場外へ送られた…"}
        </Text>
      </Animated.View>
      {/* 相打ちの閃光 */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#ffffff" }, flashSt]}
        pointerEvents="none"
      />
    </View>
  );
}

/**
 * 学科・技能の全課程修了の全画面カットイン。
 * 実況キュー経由で表示されるため、他のカットインとは重ならない。
 * 両方そろって勝利したときは勝利演出に譲る（表示しない）
 */
function TrackCompleteCutIn({
  mine,
  track,
  oppName,
}: {
  mine: boolean;
  track: Track;
  oppName: string;
}) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  useEffect(() => {
    playSe(mine ? "janken_win" : "hit");
    haptic(mine ? "success" : "warning");
    scale.value = withSequence(
      withTiming(1.12, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 150 })
    );
    opacity.value = withTiming(1, { duration: 140 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const bg = mine
    ? require("../../assets/images/fx/fx_up.webp")
    : require("../../assets/images/fx/fx_down.webp");
  const label = track === "academic" ? "学科" : "技能";
  const other = track === "academic" ? "技能" : "学科";
  const emoji = track === "academic" ? "🎓" : "🚗";
  return (
    <View style={styles.reachLayer} pointerEvents="none">
      <Image source={bg} style={[StyleSheet.absoluteFill, { opacity: 0.85 }]} contentFit="cover" />
      <Animated.View style={[styles.reachBox, box]}>
        <Text
          style={[styles.reachTitle, styles.reachTitleLong, { color: mine ? "#ffd54d" : "#ff8a80" }]}
          allowFontScaling={false}
          numberOfLines={1}
        >
          {mine ? `${emoji} ${label} 全課程修了！！` : `⚠️ 相手が${label}を修了！`}
        </Text>
        <Text style={styles.reachSub}>
          {mine
            ? `おめでとう！ 卒業まで、あとは「${other}」だけ！`
            : `${oppName}の卒業が近い…！ 追い上げよう！`}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * 場外のサポートが山札に戻るリサイクルの全画面演出。
 * カードが渦を巻きながら中央（山札）へ吸い込まれていく
 */
function RecycleCutIn({
  mine,
  count,
  oppName,
}: {
  mine: boolean;
  count: number;
  oppName: string;
}) {
  const opacity = useSharedValue(0);
  const pop = useSharedValue(0.5);
  useEffect(() => {
    playSe("support");
    opacity.value = withTiming(1, { duration: 160 });
    pop.value = withSequence(
      withTiming(1.1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 150 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    opacity: opacity.value,
  }));
  return (
    <View style={styles.reachLayer} pointerEvents="none">
      <Image
        source={require("../../assets/images/fx/fx_up.webp")}
        style={[StyleSheet.absoluteFill, { opacity: 0.8 }]}
        contentFit="cover"
      />
      {Array.from({ length: Math.min(Math.max(count, 3), 7) }, (_, i) => (
        <RecycleCard key={i} index={i} />
      ))}
      <Animated.View style={[styles.reachBox, box]}>
        <Text
          style={[styles.reachTitle, { color: "#7ce6a0", fontSize: 34 }]}
          allowFontScaling={false}
        >
          ♻️ 山札にリサイクル！
        </Text>
        <Text style={styles.reachSub}>
          {mine ? "あなた" : oppName}の場外からサポート{count}枚が山札に戻った！
        </Text>
      </Animated.View>
    </View>
  );
}

/** リサイクル演出で渦を巻いて吸い込まれるカード */
function RecycleCard({ index }: { index: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      index * 140,
      withTiming(1, { duration: 950, easing: Easing.in(Easing.cubic) })
    );
  }, [index, p]);
  const startAngle = (index / 7) * Math.PI * 2;
  const style = useAnimatedStyle(() => {
    const angle = startAngle + p.value * 3.6;
    const dist = (1 - p.value) * 190;
    return {
      opacity: p.value < 0.92 ? 1 : (1 - p.value) / 0.08,
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist },
        { rotate: `${p.value * 540}deg` },
        { scale: 0.9 - p.value * 0.55 },
      ],
    };
  });
  return (
    <Animated.View style={[styles.recycleCard, style]} pointerEvents="none">
      <CardFace cardId="cardback" size="sm" faceDown />
    </Animated.View>
  );
}

/**
 * リーチの全画面カットイン。
 * 自分: 金色に輝く「リーチ！」／相手: 赤い警告「相手がリーチ！」
 */
function ReachCutIn({ mine, oppName }: { mine: boolean; oppName: string }) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    playSe(mine ? "janken_win" : "battle");
    playVoice(mine ? "voice_reach" : "voice_reach_opp");
    // 自分のリーチは「みきわめ 良好」の印が押される頃にひとこと続ける
    const tMiki = mine ? setTimeout(() => playVoice("voice_mikiwame"), 2100) : null;
    scale.value = withSequence(
      withTiming(1.15, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 150 })
    );
    opacity.value = withTiming(1, { duration: 150 });
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 350 }), withTiming(0.4, { duration: 350 })),
      -1
    );
    return () => {
      if (tMiki) clearTimeout(tMiki);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const color = mine ? "#ffd54d" : "#ff6b6b";
  return (
    <View style={styles.reachLayer} pointerEvents="none">
      {/* AI生成の集中線バースト背景（自分=金 / 相手=赤） */}
      <Image
        source={
          mine
            ? require("../../assets/images/fx/fx_reach_gold.webp")
            : require("../../assets/images/fx/fx_reach_red.webp")
        }
        style={[StyleSheet.absoluteFill, { opacity: 0.85 }]}
        contentFit="cover"
      />
      {/* 自分のリーチは相手側を暗くして、自分の陣地にスポットライトを当てる */}
      {mine && <View style={styles.spotDim} pointerEvents="none" />}
      <Animated.View style={[styles.reachBox, box]}>
        <Animated.Text style={[styles.reachTitle, { color }, glowStyle]} allowFontScaling={false}>
          {mine ? "⚡ リーチ！" : "⚠️ 相手がリーチ！"}
        </Animated.Text>
        <Text style={styles.reachSub}>
          {mine
            ? "あと少しで卒業！このまま勝ち切ろう！"
            : `${oppName}が卒業目前！追い上げよう！`}
        </Text>
        {/* 教習所の「みきわめ 良好」印（自分のリーチのみ） */}
        {mine && (
          <View style={styles.mikiwameStamp}>
            <Text style={styles.mikiwameText} allowFontScaling={false}>みきわめ</Text>
            <Text style={styles.mikiwameGood} allowFontScaling={false}>良 好</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/** 山札の枚数表示。残り3枚以下になると赤く点滅して山札切れを警告する */
function DeckCount({
  count,
  baseStyle,
  suffix = "",
}: {
  count: number;
  baseStyle: object;
  suffix?: string;
}) {
  const low = count <= 3;
  const critical = count <= 1;
  const blink = useSharedValue(1);
  const tremble = useSharedValue(0);
  useEffect(() => {
    if (low) {
      blink.value = withRepeat(
        withSequence(withTiming(0.35, { duration: 450 }), withTiming(1, { duration: 450 })),
        -1
      );
    } else {
      blink.value = 1;
    }
    // 残り1枚はカタカタ震えて崖っぷち感を出す
    if (critical) {
      tremble.value = withRepeat(
        withSequence(withTiming(-1.2, { duration: 60 }), withTiming(1.2, { duration: 60 })),
        -1
      );
    } else {
      tremble.value = withTiming(0, { duration: 80 });
    }
  }, [low, critical, blink, tremble]);
  const style = useAnimatedStyle(() => ({
    opacity: blink.value,
    transform: [{ translateX: tremble.value }],
  }));
  // 山札残量をガソリンメーター風に（16枚=満タン。山札切れ=ガス欠負け）
  const segs = 8;
  const filled = Math.max(0, Math.min(segs, Math.ceil((count / 16) * segs)));
  return (
    <Animated.View style={[style, styles.fuelWrap]}>
      <Text style={[baseStyle, low && { color: colors.danger, fontWeight: "900" }]}>
        {low ? "⚠️ " : ""}山札 {count}
        {suffix}
      </Text>
      <View style={styles.fuelGauge}>
        <Text style={styles.fuelLabel} allowFontScaling={false}>E</Text>
        {Array.from({ length: segs }, (_, i) => (
          <View
            key={i}
            style={[
              styles.fuelSeg,
              i < filled && { backgroundColor: low ? colors.danger : i < 2 ? "#e8a03a" : "#57b060" },
            ]}
          />
        ))}
        <Text style={styles.fuelLabel} allowFontScaling={false}>F⛽</Text>
      </View>
    </Animated.View>
  );
}

function ThinkingDots() {
  // Webではブラウザ合成のCSSアニメーションで回す（JSが混んでいても滑らか）
  if (Platform.OS === "web") {
    return (
      <Text
        {...({ dataSet: { kdsanim: "dots" } } as object)}
        style={[
          styles.thinkingDots,
          {
            animationDuration: "1040ms",
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
          } as unknown as TextStyle,
        ]}
      >
        ●●●
      </Text>
    );
  }
  const o = useSharedValue(0.25);
  useEffect(() => {
    o.value = withRepeat(
      withSequence(withTiming(1, { duration: 520 }), withTiming(0.25, { duration: 520 })),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.Text style={[styles.thinkingDots, style]}>●●●</Animated.Text>;
}

/** 最新ログ: 大きく飛び出してから元のサイズに収まり、ハイライトが消える */
function LatestLogLine({ text }: { text: string }) {
  const scale = useSharedValue(1.18);
  const glow = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 13, stiffness: 160 });
    glow.value = withDelay(500, withTiming(0, { duration: 800 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: `rgba(255, 213, 79, ${glow.value * 0.45})`,
  }));
  return (
    <Animated.Text style={[styles.logLatest, style]} numberOfLines={2}>
      {text}
    </Animated.Text>
  );
}

/**
 * 山札から1枚引いたときの演出。
 * 手札の少し上に裏向きで現れ、めくれながら手札の列に吸い込まれていく。
 */
function DrawnCard({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const p = useSharedValue(0);
  const flip = useSharedValue(0);

  useEffect(() => {
    playSe("draw");
    haptic("light");
    p.value = withTiming(1, { duration: 700, easing: Easing.inOut(Easing.cubic) });
    flip.value = withDelay(120, withTiming(1, { duration: 260 }));
    const t = setTimeout(onDone, 780);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrap = useAnimatedStyle(() => ({
    // 手札に重なる直前で消して、実際のカードと入れ替わったように見せる
    opacity: p.value > 0.8 ? (1 - p.value) * 5 : 1,
    transform: [
      { translateY: -70 + p.value * 70 },
      { scale: 1.15 - p.value * 0.15 },
      { rotate: `${(1 - p.value) * -8}deg` },
    ],
  }));

  const back = useAnimatedStyle(() => ({
    transform: [{ perspective: 700 }, { rotateY: `${flip.value * 180}deg` }],
  }));
  const front = useAnimatedStyle(() => ({
    transform: [{ perspective: 700 }, { rotateY: `${flip.value * 180 - 180}deg` }],
  }));

  return (
    <Animated.View style={[styles.drawFx, wrap]} pointerEvents="none">
      <Animated.View style={[styles.dealFace, back]}>
        <CardFace cardId="cardback" size="md" faceDown />
      </Animated.View>
      <Animated.View style={[styles.dealFace, styles.dealFront, front]}>
        <CardFace cardId={cardId} size="md" />
      </Animated.View>
    </Animated.View>
  );
}

/** 配るテンポ（ミリ秒） */
const DEAL_INTERVAL = 230;

/**
 * 開幕に、山札から手札を1枚ずつ配る演出。
 * カードは弧を描いて飛び、手前で表にめくれて扇状に並ぶ。
 */
function OpeningDeal({ cards, onDone }: { cards: string[]; onDone: () => void }) {
  useEffect(() => {
    // 最後の1枚がめくり終わるのを待ってから確認画面に渡す
    const t = setTimeout(onDone, (cards.length - 1) * DEAL_INTERVAL + 1150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.dealLayer} pointerEvents="none">
      <Animated.View entering={FadeIn.duration(300)} style={styles.dealCaption}>
        <View style={styles.dealStep}>
          <Text style={styles.dealStepText}>3</Text>
        </View>
        <Text style={styles.dealTitle}>
          山札の上から{cards.length}枚引いて手札にします
        </Text>
      </Animated.View>
      <View style={styles.dealStage}>
        {/* 配り元の山札 */}
        <View style={styles.dealDeck}>
          <CardFace cardId="cardback" size="sm" faceDown />
        </View>
        {cards.map((id, i) => (
          <DealtCard key={i} cardId={id} index={i} total={cards.length} />
        ))}
      </View>
    </View>
  );
}

function DealtCard({
  cardId,
  index,
  total,
}: {
  cardId: string;
  index: number;
  total: number;
}) {
  const fly = useSharedValue(0); // 山札 → 手札の位置
  const flip = useSharedValue(0); // 0=裏 1=表

  const center = (total - 1) / 2;
  const targetX = (index - center) * 60;
  const targetY = 128;
  const targetRot = (index - center) * 6;

  useEffect(() => {
    const delay = index * DEAL_INTERVAL;
    fly.value = withDelay(delay, withSpring(1, { damping: 15, stiffness: 120 }));
    flip.value = withDelay(delay + 250, withTiming(1, { duration: 300 }));
    const t = setTimeout(() => {
      playSe("draw");
      haptic("light");
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrap = useAnimatedStyle(() => ({
    opacity: fly.value > 0.02 ? 1 : 0,
    transform: [
      { translateX: fly.value * targetX },
      // 途中で少し持ち上げて、弧を描かせる
      { translateY: fly.value * targetY - Math.sin(fly.value * Math.PI) * 44 },
      { rotate: `${fly.value * targetRot}deg` },
      { scale: 0.82 + fly.value * 0.18 },
    ],
  }));

  const back = useAnimatedStyle(() => ({
    transform: [{ perspective: 700 }, { rotateY: `${flip.value * 180}deg` }],
  }));
  const front = useAnimatedStyle(() => ({
    transform: [{ perspective: 700 }, { rotateY: `${flip.value * 180 - 180}deg` }],
  }));

  return (
    <Animated.View style={[styles.dealCard, wrap]}>
      <Animated.View style={[styles.dealFace, back]}>
        <CardFace cardId="cardback" size="sm" faceDown />
      </Animated.View>
      <Animated.View style={[styles.dealFace, styles.dealFront, front]}>
        <CardFace cardId={cardId} size="sm" />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * 場に出た瞬間、大きく振りかぶって叩きつけるように着地する。
 * entering ではなく共有値で動かす（web では entering 中のカードが
 * レイアウトから外れ、左端に重なって見えることがあるため）。
 */
function SlamEnter({ children }: { children: React.ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(1, { damping: 13, stiffness: 140 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 3),
    transform: [
      { scale: 1.6 - p.value * 0.6 },
      { translateY: (1 - p.value) * -26 },
      { rotate: `${(1 - p.value) * -10}deg` },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * 使えるカードをゆっくり浮き沈みさせる。
 * `offset` をずらすことで、手札が波打つように見える。
 */
function FloatIdle({
  active,
  offset = 0,
  children,
}: {
  active: boolean;
  offset?: number;
  children: React.ReactNode;
}) {
  // Webではブラウザ合成のCSSアニメーションで回す（JSが混んでいても滑らか）
  if (Platform.OS === "web") {
    const anim = active
      ? ({
          animationDuration: "1800ms",
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
          animationDelay: `${(offset % 4) * 160}ms`,
        } as unknown as ViewStyle)
      : null;
    return (
      <View {...(active ? ({ dataSet: { kdsanim: "float" } } as object) : null)} style={anim}>
        {children}
      </View>
    );
  }
  const y = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      y.value = withTiming(0, { duration: 200 });
      return;
    }
    y.value = withDelay(
      (offset % 4) * 160,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, offset]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** 使えるカードのまわりを脈打たせて気づかせる */
function PulseRing({
  active,
  style,
  children,
}: {
  active: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  // Webではブラウザ合成のCSSアニメーションで回す（JSが混んでいても滑らか）
  if (Platform.OS === "web") {
    const anim = active
      ? ({
          animationDuration: "1240ms",
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
        } as unknown as ViewStyle)
      : null;
    return (
      <View {...(active ? ({ dataSet: { kdsanim: "pulsering" } } as object) : null)} style={[style, anim]}>
        {/* 光は別レイヤーにして不透明度だけを脈打たせる（拡縮と同期・低コスト） */}
        {active && (
          <View
            {...({ dataSet: { kdsanim: "glowpulse" } } as object)}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: 8,
                shadowColor: colors.highlight,
                shadowOpacity: 0.9,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 0 },
                animationDuration: "1240ms",
                animationTimingFunction: "ease-in-out",
                animationIterationCount: "infinite",
              } as unknown as ViewStyle,
            ]}
          />
        )}
        {children}
      </View>
    );
  }
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      p.value = withTiming(0, { duration: 200 });
      return;
    }
    p.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 620, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + p.value * 0.06 }],
    shadowColor: colors.highlight,
    shadowOpacity: p.value * 0.9,
    shadowRadius: 4 + p.value * 8,
    shadowOffset: { width: 0, height: 0 },
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * バトル宣言のカットイン（全画面）。
 * 暗転した画面に赤い斜め帯が交差し、対戦する2枚のカードが
 * 左右から飛び込んでぶつかり、「いざ、勝負！」が飛び出す。
 */

/** 🔥 名勝負度。白熱した対局ほどランクが上がる（Sは虹色でお祝い） */
function NetsuMeter({ rank, score }: { rank: "S" | "A" | "B" | "C"; score: number }) {
  useEffect(() => {
    if (rank === "S") {
      playSe("cheer");
      haptic("success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const color =
    rank === "S" ? "#c9971b" : rank === "A" ? "#d84315" : rank === "B" ? "#1c5fb0" : "#78909c";
  const label =
    rank === "S"
      ? "歴史に残る名勝負！！"
      : rank === "A"
        ? "白熱の好勝負！"
        : rank === "B"
          ? "見ごたえある勝負"
          : "静かな決着";
  return (
    <View style={[styles.netsuBox, { borderColor: color }]}>
      <Text style={styles.netsuTitle} allowFontScaling={false}>
        🔥 名勝負度{" "}
        {rank === "S" ? (
          <Text style={{ color, fontSize: 24 }}>S</Text>
        ) : (
          <Text style={{ color, fontSize: 22 }}>{rank}</Text>
        )}
      </Text>
      <View style={styles.netsuBarBg}>
        <View
          style={[
            styles.netsuBarFill,
            { width: `${Math.min(100, (score / 12) * 100)}%` as DimensionValue, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.netsuLabel}>{label}</Text>
    </View>
  );
}

/** 観戦者の応援。画面の下から絵文字がふわっと上っていく */
function CheerFloat({ emoji }: { emoji: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) });
  }, [p]);
  const st = useAnimatedStyle(() => ({
    opacity: p.value < 0.7 ? 1 : (1 - p.value) / 0.3,
    transform: [
      { translateY: -p.value * 260 },
      { translateX: Math.sin(p.value * 6) * 18 },
      { scale: 1 + p.value * 0.4 },
    ],
  }));
  return (
    <Animated.View style={[styles.cheerFloat, st]} pointerEvents="none">
      <Text style={{ fontSize: 34 }}>{emoji}</Text>
    </Animated.View>
  );
}

/** 両者リーチ。「運命の最終局面」の紫カットイン。追いついた側で文言が変わる */
function DoubleReachCutIn({ mineCaught, oppName }: { mineCaught: boolean; oppName: string }) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    playSe("battle");
    playSe("heartbeat");
    playVoice("voice_double");
    haptic("heavy");
    const t = mineCaught ? setTimeout(() => playSe("cheer"), 450) : null;
    scale.value = withSequence(
      withTiming(1.18, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 160 })
    );
    opacity.value = withTiming(1, { duration: 150 });
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 330 }), withTiming(0.45, { duration: 330 })),
      -1
    );
    return () => {
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <View style={styles.reachLayer} pointerEvents="none">
      <Image
        source={require("../../assets/images/fx/fx_battle.webp")}
        style={[StyleSheet.absoluteFill, { opacity: 0.8 }]}
        contentFit="cover"
      />
      {/* 紫の帳で「運命の最終局面」を演出 */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#2a0a4ac9" }]}
        pointerEvents="none"
      />
      <Animated.View style={[styles.reachBox, box]}>
        {mineCaught && (
          <View style={styles.doubleReachBand}>
            <Text style={styles.doubleReachBandText} allowFontScaling={false}>
              🔥 追いついた！！
            </Text>
          </View>
        )}
        <Animated.Text
          style={[styles.reachTitle, styles.doubleReachTitle, glowStyle]}
          allowFontScaling={false}
          numberOfLines={1}
        >
          ⚡ 運命の最終局面 ⚡
        </Animated.Text>
        <Text style={styles.reachSub}>
          {mineCaught
            ? "両者リーチ！ 次の一手がすべてを決める！"
            : `${oppName}に並ばれた…！ 先に卒業するのはどっちだ！？`}
        </Text>
      </Animated.View>
    </View>
  );
}

/** 効果チェインの回数表示。連鎖のたびに数字が跳ね上がり音程も上がる */
function ChainBadge({ n }: { n: number }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    playSe("achievement", Math.min(2, 1 + (n - 2) * 0.16));
    if (n === 2) playVoice("voice_chain");
    haptic("light");
    pop.value = withSequence(
      withTiming(1.3, { duration: 170, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 130 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 3),
    transform: [{ scale: pop.value }, { rotate: "-6deg" }],
  }));
  return (
    <Animated.View style={[styles.chainBadge, st]} pointerEvents="none">
      <Text style={styles.chainBadgeText} allowFontScaling={false}>
        🔗 {n} CHAIN!
      </Text>
    </Animated.View>
  );
}

/** 1文字ずつダダダッと表示する実況テキスト */
function TypewriterText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const [shownLen, setShownLen] = useState(text.length <= 6 ? text.length : 1);
  useEffect(() => {
    if (text.length <= 6) return;
    let i = 1;
    const timer = setInterval(() => {
      i += 2;
      if (i >= text.length) {
        setShownLen(text.length);
        clearInterval(timer);
      } else {
        setShownLen(i);
      }
    }, 40);
    return () => clearInterval(timer);
  }, [text]);
  // 幅がガタつかないよう、未表示分は透明で敷いておく
  return (
    <Text style={style}>
      {text.slice(0, shownLen)}
      <Text style={{ opacity: 0 }}>{text.slice(shownLen)}</Text>
    </Text>
  );
}

/** 節目のお祝い花火。色とりどりの光の輪が次々に開く */
function Fireworks({ label }: { label: string }) {
  const lightFx = useLightFx();
  useEffect(() => {
    playSe("cheer");
    const t = setTimeout(() => playSe("horn"), 750);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      {Array.from({ length: lightFx ? 4 : 10 }, (_, i) => (
        <FireworkBurst key={i} index={i} />
      ))}
      <View style={styles.fireworksLabelWrap}>
        <Text style={styles.fireworksLabel} allowFontScaling={false}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function FireworkBurst({ index }: { index: number }) {
  const p = useSharedValue(0);
  // 位置と色は固定値で散らす（乱数だと再レンダーで変わってしまう）
  const left = ((index * 37 + 11) % 78) + 8;
  const top = ((index * 53 + 13) % 42) + 8;
  const hue = ["#ffd54d", "#ff8a8a", "#8fd3ee", "#b0f2a0", "#d9a6ff", "#ffc37d"][index % 6];
  const isWeb = Platform.OS === "web";
  useEffect(() => {
    if (isWeb) return; // WebはCSSアニメに任せる
    p.value = withDelay(
      index * 430,
      withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }), -1, false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value * 6 : Math.max(0, 1 - (p.value - 0.15) / 0.65),
    transform: [{ scale: 0.2 + p.value * 2.1 }],
  }));
  if (isWeb) {
    return (
      <View
        {...({ dataSet: { kdsanim: "burst" } } as object)}
        style={[
          styles.fireworkDot,
          { left: `${left}%` as DimensionValue, top: `${top}%` as DimensionValue, borderColor: hue },
          {
            animationDuration: "1500ms",
            animationDelay: `${index * 430}ms`,
            animationTimingFunction: "ease-out",
            animationIterationCount: "infinite",
            opacity: 0,
          } as unknown as ViewStyle,
        ]}
        pointerEvents="none"
      />
    );
  }
  return (
    <Animated.View
      style={[
        styles.fireworkDot,
        { left: `${left}%` as DimensionValue, top: `${top}%` as DimensionValue, borderColor: hue },
        st,
      ]}
    />
  );
}

/** ロゴ配色で1文字ずつ色を変えるお祝いテキスト */
const RAINBOW_COLORS = ["#ff6b6b", "#ffc37d", "#ffe86b", "#b0f2a0", "#8fd3ee", "#d9a6ff"];

function RainbowText({ text, size }: { text: string; size: number }) {
  return (
    <Text style={{ fontSize: size, fontWeight: "900" }} allowFontScaling={false}>
      {Array.from(text).map((ch, i) => (
        <Text key={i} style={{ color: RAINBOW_COLORS[i % RAINBOW_COLORS.length] }}>
          {ch}
        </Text>
      ))}
    </Text>
  );
}

/** 日替わりの天気演出（雨/雪）。ブラウザ合成のCSSアニメーションで軽く流す */
function WeatherLayer({ kind }: { kind: "rain" | "snow" }) {
  if (Platform.OS !== "web") return null;
  const count = kind === "rain" ? 14 : 12;
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden", zIndex: 18 }]} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => {
        const left = `${(i * 61.8 + 9) % 97}%`;
        const duration = kind === "rain" ? 900 + ((i * 977) % 700) : 3800 + ((i * 977) % 2600);
        const delay = (i * 1371) % 3200;
        return (
          <View
            key={i}
            {...({ dataSet: { kdsanim: "fall" } } as object)}
            style={[
              kind === "rain" ? styles.weatherDrop : styles.weatherFlake,
              { left: left as DimensionValue },
              {
                animationDuration: `${duration}ms`,
                animationDelay: `${delay}ms`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
              } as unknown as ViewStyle,
            ]}
          />
        );
      })}
      <View style={styles.weatherChip}>
        <Text style={styles.weatherChipText} allowFontScaling={false}>
          {kind === "rain" ? "☔ 本日は雨天教習" : "⛄ 本日は雪道教習"}
        </Text>
      </View>
    </View>
  );
}

/** バトル激突時に飛び散る火花のひとつ */
function ClashSpark({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const st = useAnimatedStyle(() => {
    const a = (index / 8) * Math.PI * 2 + 0.4;
    const d = progress.value * (70 + (index % 3) * 34);
    return {
      opacity: progress.value === 0 ? 0 : Math.max(0, 1 - progress.value),
      transform: [
        { translateX: Math.cos(a) * d },
        { translateY: Math.sin(a) * d },
        { scale: 1 - progress.value * 0.5 },
      ],
    };
  });
  return <Animated.View style={[styles.spark, index % 2 === 0 && styles.sparkGold, st]} />;
}

export function BattleCutIn({
  subtitle,
  atkCardId,
  defCardId,
  atkIsCpu,
}: {
  subtitle: string;
  atkCardId?: string;
  defCardId?: string;
  atkIsCpu: boolean;
}) {
  const lightFx = useLightFx();
  const slashA = useSharedValue(0);
  const slashB = useSharedValue(0);
  const cardL = useSharedValue(0);
  const cardR = useSharedValue(0);
  const pop = useSharedValue(0);
  const clash = useSharedValue(0);
  const sparks = useSharedValue(0);

  useEffect(() => {
    playSe("battle");
    playVoice("voice_battle");
    slashA.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    slashB.value = withDelay(90, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
    // カードが左右から飛び込む
    cardL.value = withDelay(180, withSpring(1, { damping: 14, stiffness: 130 }));
    cardR.value = withDelay(260, withSpring(1, { damping: 14, stiffness: 130 }));
    // ぶつかった衝撃で全体が揺れる
    clash.value = withDelay(
      560,
      withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(-0.7, { duration: 60 }),
        withTiming(0.4, { duration: 55 }),
        withTiming(0, { duration: 50 })
      )
    );
    pop.value = withDelay(620, withSpring(1, { damping: 9, stiffness: 160 }));
    // ぶつかった瞬間に火花が散る
    sparks.value = withDelay(560, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => haptic("heavy"), 560);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slashAStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: "-12deg" }, { translateX: (1 - slashA.value) * -600 }],
    opacity: slashA.value * 0.85,
  }));
  const slashBStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: "8deg" }, { translateX: (1 - slashB.value) * 600 }],
    opacity: slashB.value * 0.85,
  }));
  const cardLStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cardL.value * 2),
    transform: [
      { translateX: (1 - cardL.value) * -320 + clash.value * 8 },
      { rotate: `${-8 + (1 - cardL.value) * -14}deg` },
      { scale: 1 + clash.value * 0.06 },
    ],
  }));
  const cardRStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cardR.value * 2),
    transform: [
      { translateX: (1 - cardR.value) * 320 - clash.value * 8 },
      { rotate: `${8 + (1 - cardR.value) * 14}deg` },
      { scale: 1 + clash.value * 0.06 },
    ],
  }));
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: clash.value * 10 }],
  }));
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [{ scale: 0.3 + pop.value * 0.7 }, { rotate: `${(1 - pop.value) * 14 - 4}deg` }],
  }));

  // 左に攻撃側、右に守備側を置く
  const leftLabel = atkIsCpu ? `${oppLabel}・アタック` : "あなた・アタック";
  const rightLabel = atkIsCpu ? "あなた・ディフェンス" : `${oppLabel}・ディフェンス`;

  return (
    <Animated.View style={[styles.cutinWrap, shakeStyle]} pointerEvents="none">
      {/* AI生成の激突エネルギー背景（青vs赤） */}
      <Image
        source={require("../../assets/images/fx/fx_battle.webp")}
        style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
        contentFit="cover"
      />
      <Animated.View style={[styles.cutinSlash, styles.cutinSlashA, slashAStyle]} />
      <Animated.View style={[styles.cutinSlash, styles.cutinSlashB, slashBStyle]} />

      {/* 激突の火花（軽量時は省略） */}
      {!lightFx && (
        <View style={styles.sparkWrap} pointerEvents="none">
          {Array.from({ length: 8 }, (_, i) => (
            <ClashSpark key={i} index={i} progress={sparks} />
          ))}
        </View>
      )}

      {atkCardId && defCardId && (
        <View style={styles.cutinCards}>
          <Animated.View style={[styles.cutinCard, cardLStyle]}>
            <CardFace cardId={atkCardId} size="lg" />
            <Text style={[styles.cutinLabel, styles.cutinLabelAtk]}>{leftLabel}</Text>
          </Animated.View>
          <Animated.View style={[styles.cutinCard, styles.cutinCardRight, cardRStyle]}>
            <CardFace cardId={defCardId} size="lg" />
            <Text style={[styles.cutinLabel, styles.cutinLabelDef]}>{rightLabel}</Text>
          </Animated.View>
        </View>
      )}

      <Animated.View style={[styles.cutinTitleWrap, popStyle]}>
        <Text style={styles.cutinTitle} allowFontScaling={false}>
          いざ、勝負！
        </Text>
        <Text style={styles.cutinSub}>{subtitle}</Text>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * 教習が進んだ／戻されたときの全画面カットイン。
 * 進み: トラック色の光とともに 🚗/📖 が走り、「＋N時限」が飛び出す。
 * 戻り: 赤い警告とともに 🚧/📕 が落ち、「−N時限」が突き刺さる。
 */
function LessonCutIn({
  mine,
  track,
  amount,
  newValue,
  goal,
  finalBlow = false,
}: {
  mine: boolean;
  track: Track;
  amount: number;
  newValue: number;
  goal: number;
  /** この一手で決着（スローモーションの特別演出） */
  finalBlow?: boolean;
}) {
  const gained = amount > 0;
  const pop = useSharedValue(0);
  const run = useSharedValue(0);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const stamp = useSharedValue(0);

  useEffect(() => {
    if (finalBlow) {
      // ===== 決着の一手: スローモーション =====
      // ゆっくり低い音で進み → ため → 白いフラッシュ＋決着スタンプ
      playSe("advance", 0.55);
      haptic("medium");
      run.value = withTiming(1, { duration: 2600, easing: Easing.out(Easing.cubic) });
      pop.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 90 }));
      const t1 = setTimeout(() => {
        playSe(mine ? "battle_win" : "battle_lose");
        if (mine) playSe("cheer");
        playVoice("voice_kessyaku");
        haptic("heavy");
        flash.value = withSequence(
          withTiming(1, { duration: 90 }),
          withTiming(0, { duration: 500 })
        );
        stamp.value = withSequence(
          withTiming(1.15, { duration: 160, easing: Easing.in(Easing.cubic) }),
          withTiming(1, { duration: 140 })
        );
      }, 2500);
      return () => clearTimeout(t1);
    }
    playSe(gained ? "advance" : "hit");
    if (gained && mine && amount >= 4) playVoice("voice_bigstep");
    if (!gained && mine && amount <= -3) playVoice("voice_setback");
    run.value = withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) });
    pop.value = withDelay(150, withSpring(1, { damping: 9, stiffness: 170 }));
    if (!gained) {
      shake.value = withDelay(
        250,
        withSequence(
          withTiming(-8, { duration: 50 }),
          withTiming(7, { duration: 50 }),
          withTiming(-5, { duration: 45 }),
          withTiming(0, { duration: 40 })
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emojiStyle = useAnimatedStyle(() => ({
    transform: gained
      ? [
          // 画面の端から端まで走り抜ける
          { translateX: -260 + run.value * 520 },
          { translateY: Math.sin(run.value * 10) * 6 },
        ]
      : [
          // 力なく落ちて傾く
          { translateY: run.value * 60 - 30 },
          { rotate: `${run.value * 30 - 10}deg` },
        ],
  }));
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [
      { scale: (0.4 + pop.value * 0.6) * (finalBlow ? 1.15 : 1) },
      { translateX: shake.value },
    ],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, stamp.value * 3),
    transform: [
      { rotate: "-7deg" },
      { scale: stamp.value === 0 ? 2.4 : 2.4 - stamp.value * 1.4 },
    ],
  }));

  const color = gained ? (track === "academic" ? "#6ab7ff" : "#7ce08f") : "#ff8a8a";
  const emoji = gained
    ? track === "skill"
      ? "\u{1F697}"
      : "\u{1F4D6}"
    : track === "skill"
      ? "\u{1F6A7}"
      : "\u{1F4D5}";

  return (
    <View style={styles.lessonCutWrap} pointerEvents="none">
      {/* AI生成の背景（進む=上昇する光 / 戻る=沈む闇） */}
      <Image
        source={
          gained
            ? require("../../assets/images/fx/fx_up.webp")
            : require("../../assets/images/fx/fx_down.webp")
        }
        style={[StyleSheet.absoluteFill, { opacity: 0.82 }]}
        contentFit="cover"
      />
      {/* 技能の進みは、当校の教習車が走り抜ける */}
      {gained && track === "skill" ? (
        <Animated.View style={[styles.lessonCutCarWrap, emojiStyle]}>
          <Image
            source={require("../../assets/images/kds-car.png")}
            style={styles.lessonCutCar}
            contentFit="contain"
          />
        </Animated.View>
      ) : (
        <Animated.Text style={[styles.lessonCutEmoji, emojiStyle]} allowFontScaling={false}>
          {emoji}
        </Animated.Text>
      )}
      <Animated.View style={[popStyle, styles.lessonCutBody]}>
        <View style={[styles.lessonCutBadge, { backgroundColor: mine ? colors.success : colors.danger }]}>
          <Text style={styles.lessonCutBadgeText}>{mine ? "あなた" : oppLabel}</Text>
        </View>
        <Text style={[styles.lessonCutTitle, { color }]} allowFontScaling={false}>
          {TRACK_LABEL[track]} {gained ? `＋${amount}` : `−${-amount}`}
          <Text style={styles.lessonCutUnit}>時限</Text>
        </Text>
        <Text style={styles.lessonCutSub}>
          {finalBlow
            ? `${TRACK_LABEL[track]}教習 ${newValue}/${goal} —— 全課程達成なるか…！`
            : gained
              ? `${TRACK_LABEL[track]}教習が ${newValue}/${goal} まで進んだ！`
              : `${TRACK_LABEL[track]}教習が ${newValue}/${goal} に戻された…`}
        </Text>
      </Animated.View>
      {/* 決着の瞬間: 白いフラッシュ → 「決着!!」スタンプ */}
      {finalBlow && (
        <>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: "#ffffff" }, flashStyle]}
            pointerEvents="none"
          />
          <Animated.View style={[styles.finalBlowStamp, mine ? styles.finalBlowStampWin : styles.finalBlowStampLose, stampStyle]}>
            <Text style={[styles.finalBlowText, { color: mine ? "#ffd54d" : "#ff8a8a" }]} allowFontScaling={false}>
              {mine ? "決着!!" : "先着…"}
            </Text>
            <Text style={styles.finalBlowSub} allowFontScaling={false}>
              {mine ? "全課程達成！卒業だ！" : `${oppLabel}が先に卒業してしまった…`}
            </Text>
          </Animated.View>
        </>
      )}
    </View>
  );
}

/**
 * 場外へ飛んでいくカード。
 * 画面中央に現れ、回転しながら場外置き場の方向（自分は左下、CPUは左上）へ
 * 吸い込まれて消える。
 */
function FlyToOut({
  cardId,
  mine,
  index,
  target,
  onDone,
}: {
  cardId: string;
  mine: boolean;
  index: number;
  /** 画面上の「場外」リンクの位置。取れなければ方向の決め打ちで飛ばす */
  target: { x: number; y: number } | null;
  onDone?: () => void;
}) {
  const lightFx = useLightFx();
  const p = useSharedValue(0);

  // 画面中央からの差分で着地点を決める
  const win = Dimensions.get("window");
  const dx = target ? target.x - win.width / 2 : -130;
  const dy = target ? target.y - win.height / 2 : mine ? 210 : -260;

  const dust = useSharedValue(0);
  useEffect(() => {
    playSe("hit");
    p.value = withDelay(
      index * 220,
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.cubic) })
    );
    // 着地点にモワッと広がる土煙
    dust.value = withDelay(
      index * 220 + 640,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })
    );
    const t = setTimeout(onDone ?? (() => {}), index * 220 + 950);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    // 出だしで少し拡大して見せてから、場外の位置へ吸い込む
    const appear = Math.min(1, p.value * 4);
    const fly = Math.max(0, (p.value - 0.3) / 0.7);
    return {
      opacity: appear * (1 - Math.max(0, (p.value - 0.9) / 0.1)),
      transform: [
        { translateX: fly * dx },
        { translateY: fly * dy },
        { scale: 0.6 + appear * 0.7 - fly * 1.05 },
        { rotate: `${fly * (mine ? 300 : -300)}deg` },
      ],
    };
  });

  const dustSt = useAnimatedStyle(() => ({
    opacity: dust.value === 0 ? 0 : Math.max(0, 0.7 - dust.value * 0.7),
    transform: [
      { translateX: dx },
      { translateY: dy },
      { scale: 0.3 + dust.value * 1.8 },
    ],
  }));

  return (
    <View style={styles.outFxCenter} pointerEvents="none">
      {!lightFx && <Animated.View style={[styles.dustPuff, dustSt]} />}
      <Animated.View style={style}>
        <CardFace cardId={cardId} size="md" />
      </Animated.View>
    </View>
  );
}

/**
 * 教習力（インストラクターの力）が上がった／下がったときの全画面カットイン。
 * 上がり: 金色の「教習力 ＋N」が輝きとともに飛び出す。
 * 下がり: 青ざめた「教習力 −N」が沈み込み、画面が揺れる。
 */
function PowerCutIn({
  mine,
  amount,
  label,
}: {
  mine: boolean;
  amount: number;
  /** 教習力／戦闘力 */
  label: string;
}) {
  const up = amount > 0;
  const pop = useSharedValue(0);
  const glow = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    playSe(up ? "support" : "hit");
    pop.value = withDelay(100, withSpring(1, { damping: 9, stiffness: 170 }));
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 450 }), withTiming(0.4, { duration: 450 })),
      -1,
      false
    );
    if (!up) {
      shake.value = withDelay(
        220,
        withSequence(
          withTiming(-7, { duration: 50 }),
          withTiming(6, { duration: 50 }),
          withTiming(-4, { duration: 45 }),
          withTiming(0, { duration: 40 })
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [
      { scale: 0.4 + pop.value * 0.6 },
      { translateX: shake.value },
      // 下がりは沈み込む
      { translateY: up ? 0 : pop.value * 10 },
    ],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (up ? 0.5 : 0.3),
    transform: [{ scale: 1.1 + glow.value * 0.35 }],
  }));

  // 教習力は金色、戦闘力は炎のオレンジ。下がりは青ざめた色
  const combat = label === "戦闘力";
  const color = up ? (combat ? "#ff8a65" : "#ffd54f") : "#90a4c8";
  const emoji = up ? (combat ? "\u{2694}\u{FE0F}" : "\u{1F4AA}") : "\u{1F4C9}";

  return (
    <View style={styles.lessonCutWrap} pointerEvents="none">
      {/* AI生成の背景（上がる=上昇する光 / 下がる=沈む闇） */}
      <Image
        source={
          up
            ? require("../../assets/images/fx/fx_up.webp")
            : require("../../assets/images/fx/fx_down.webp")
        }
        style={[StyleSheet.absoluteFill, { opacity: 0.82 }]}
        contentFit="cover"
      />
      {/* 背後で明滅する輝き */}
      <Animated.Text style={[styles.lessonCutEmoji, glowStyle]} allowFontScaling={false}>
        {emoji}
      </Animated.Text>
      <Animated.View style={[popStyle, styles.lessonCutBody]}>
        <View
          style={[
            styles.lessonCutBadge,
            { backgroundColor: mine ? colors.success : colors.danger },
          ]}
        >
          <Text style={styles.lessonCutBadgeText}>{mine ? "あなた" : oppLabel}</Text>
        </View>
        <Text style={[styles.powerCutTitle, { color }]} allowFontScaling={false}>
          {label} {up ? `＋${amount}` : `−${-amount}`}
        </Text>
        <Text style={styles.lessonCutSub}>
          {up ? "インストラクターの力が上がった！" : "インストラクターの力が下がった…"}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * 敗北の演出。
 * 画面全体が青暗く沈み、雨がしとしと降り続け、
 * 手札と場のカードが力なくひらひらと落ちていく。
 */
function LossScene({ cardIds }: { cardIds: string[] }) {
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(1, { duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.55 }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* AI生成の雨夜の背景 */}
      <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
        <Image
          source={require("../../assets/images/fx/fx_defeat.webp")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Animated.View>
      {/* 青暗い沈み込み */}
      <Animated.View style={[styles.lossDim, dimStyle]} />
      {/* 雨 */}
      {Array.from({ length: 26 }, (_, i) => (
        <RainDrop key={`r${i}`} index={i} />
      ))}
      {/* 力なく落ちるカード */}
      {cardIds.slice(0, 8).map((id, i) => (
        <SinkingCard key={`c${i}`} cardId={id} index={i} />
      ))}
    </View>
  );
}

/** 上から落ち続ける雨の線 */
function RainDrop({ index }: { index: number }) {
  const left = `${(index * 41 + 7) % 97}%`;
  const delay = (index % 13) * 140;
  const duration = 900 + (index % 5) * 160;

  // Webではブラウザ合成のCSSアニメで降らせる（敗北画面のカクつき防止）
  if (Platform.OS === "web") {
    return (
      <View
        {...({ dataSet: { kdsanim: "fall" } } as object)}
        style={[
          styles.rainDrop,
          { left: left as DimensionValue },
          {
            animationDuration: `${duration}ms`,
            animationDelay: `${delay}ms`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            opacity: 0,
          } as unknown as ViewStyle,
        ]}
        pointerEvents="none"
      />
    );
  }

  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.in(Easing.quad) }), -1, false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.08 ? p.value * 8 : p.value > 0.85 ? (1 - p.value) * 6 : 0.55,
    transform: [{ translateY: -60 + p.value * 1150 }],
  }));

  return <Animated.View style={[styles.rainDrop, { left: left as DimensionValue }, style]} />;
}

/** 力なくひらひらと落ちていくカード */
function SinkingCard({ cardId, index }: { cardId: string; index: number }) {
  // 黄金角ベースの散布で、位置もタイミングも画面全体に広くばらける
  const left = `${(index * 61.8 + 9) % 88}%`;
  const delay = Math.floor((index * 1371) % 5600);
  const duration = 4800 + ((index * 977) % 2600);
  const sway = (((index * 89) % 7) - 3) * 26 + 12;

  // Webではブラウザ合成のCSSアニメでひらひら落とす
  if (Platform.OS === "web") {
    return (
      <View
        {...({ dataSet: { kdsanim: "cardfall" } } as object)}
        style={[
          styles.rainCard,
          { left: left as DimensionValue },
          {
            animationDuration: `${duration}ms`,
            animationDelay: `${delay}ms`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            opacity: 0,
          } as unknown as ViewStyle,
        ]}
        pointerEvents="none"
      >
        <View
          {...({ dataSet: { kdsanim: "sway" } } as object)}
          style={[
            {
              animationDuration: `${2000 + (index % 4) * 600}ms`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              opacity: 0.6,
            } as unknown as ViewStyle,
          ]}
        >
          <View style={{ transform: [{ scale: 0.72 }] }}>
            <CardFace cardId={cardId} size="sm" />
          </View>
        </View>
      </View>
    );
  }
  void sway;

  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.in(Easing.quad) }), -1, false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.06 ? p.value * 10 : p.value > 0.85 ? (1 - p.value) * 4 : 0.6,
    transform: [
      { translateY: -140 + p.value * 1250 },
      // 木の葉のように左右へ揺れながら落ちる
      { translateX: Math.sin(p.value * 7) * sway },
      { rotate: `${Math.sin(p.value * 5) * 32}deg` },
      { scale: 0.8 },
    ],
  }));

  return (
    <Animated.View style={[styles.rainCard, { left: left as DimensionValue }, style]}>
      <CardFace cardId={cardId} size="sm" />
    </Animated.View>
  );
}

/**
 * 勝利のお祝い。デッキのカードが紙吹雪と一緒に画面いっぱいに舞う。
 */
function CardRain({ cardIds }: { cardIds: string[] }) {
  // 画像の読み込みが一度に集中しないよう最大24枚、軽量時は12枚に抑える
  const lightFx = useLightFx();
  const shown = (lightFx ? cardIds.filter((_, i) => i % 2 === 0) : cardIds).slice(
    0,
    lightFx ? 12 : 24
  );
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      {shown.map((id, i) => (
        <RainCard key={`${id}-${i}`} cardId={id} index={i} />
      ))}
    </View>
  );
}

function RainCard({ cardId, index }: { cardId: string; index: number }) {
  // 見た目を散らすための固定値（乱数だと再レンダーのたびに変わってしまう）。
  // 黄金角ベースの散布で、位置もタイミングも画面全体に広くばらける
  const left = `${(index * 61.8 + 7) % 95}%`;
  const delay = Math.floor((index * 1371) % 4600);
  const duration = 2800 + ((index * 977) % 2400);
  const spin = (index % 2 === 0 ? 1 : -1) * (420 + ((index * 173) % 480));
  const drift = (((index * 89) % 7) - 3) * 30;

  // Webではブラウザ合成のCSSアニメで舞わせる（JSが混んでいても滑らか＝カクつかない）
  if (Platform.OS === "web") {
    const anim = (name: string, dur: number, extra?: object) =>
      ({
        ...({ dataSet: { kdsanim: name } } as object),
        style: [
          {
            animationDuration: `${dur}ms`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            ...extra,
          } as unknown as ViewStyle,
        ],
      }) as object;
    return (
      <View
        {...({ dataSet: { kdsanim: "cardfall" } } as object)}
        style={[
          styles.rainCard,
          { left: left as DimensionValue },
          {
            animationDuration: `${duration}ms`,
            animationDelay: `${delay}ms`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            opacity: 0,
          } as unknown as ViewStyle,
        ]}
        pointerEvents="none"
      >
        <View {...anim("drift", 2200 + ((index * 977) % 1200))}>
          <View {...anim("spin", Math.max(700, Math.round((duration * 360) / Math.abs(spin))))}>
            <View style={{ transform: [{ scale: 0.75 }] }}>
              <CardFace cardId={cardId} size="sm" />
            </View>
          </View>
        </View>
      </View>
    );
  }

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.05 ? progress.value * 20 : progress.value > 0.9 ? (1 - progress.value) * 10 : 1,
    transform: [
      { translateY: -120 + progress.value * 1100 },
      { translateX: Math.sin(progress.value * 5) * drift },
      { rotate: `${progress.value * spin}deg` },
      { scale: 0.75 },
    ],
  }));

  return (
    <Animated.View style={[styles.rainCard, { left: left as DimensionValue }, style]}>
      <CardFace cardId={cardId} size="sm" />
    </Animated.View>
  );
}

/** 勝利したときに舞う紙吹雪 */
const CONFETTI_COLORS = ["#d83030", "#e49c18", "#78b424", "#3d8fd0", "#c9d63a", "#8fd3ee"];

function Confetti() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 26 }, (_, i) => (
        <ConfettiPiece key={i} index={i} />
      ))}
    </View>
  );
}

function ConfettiPiece({ index }: { index: number }) {
  // 見た目を散らすための固定値（乱数だと再レンダーのたびに変わってしまう）
  const left = `${(index * 37) % 100}%`;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 7 + (index % 4) * 2;
  const delay = (index % 9) * 130;
  const duration = 2400 + (index % 5) * 260;
  const drift = ((index % 7) - 3) * 16;

  // Webではブラウザ合成のCSSアニメで降らせる
  if (Platform.OS === "web") {
    return (
      <View
        {...({ dataSet: { kdsanim: "fall" } } as object)}
        style={[
          styles.confettiPiece,
          {
            left: left as DimensionValue,
            width: size,
            height: size,
            backgroundColor: color,
          },
          {
            animationDuration: `${duration}ms`,
            animationDelay: `${delay}ms`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            opacity: 0,
          } as unknown as ViewStyle,
        ]}
        pointerEvents="none"
      >
        <View
          {...({ dataSet: { kdsanim: "spin" } } as object)}
          style={[
            { width: size, height: size, backgroundColor: color },
            {
              animationDuration: `${900 + (index % 4) * 240}ms`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
            } as unknown as ViewStyle,
          ]}
        />
      </View>
    );
  }

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.9 ? 1 : (1 - progress.value) * 10,
    transform: [
      { translateY: -40 + progress.value * 900 },
      { translateX: Math.sin(progress.value * 6) * drift },
      { rotate: `${progress.value * 900}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        { left: left as DimensionValue, width: size, height: size * 1.6, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** 休憩⇄元気の回転アニメーション */
function RestRotator({ rested, children }: { rested: boolean; children: React.ReactNode }) {
  const rotation = useSharedValue(rested ? 90 : 0);
  useEffect(() => {
    rotation.value = withTiming(rested ? 90 : 0, { duration: 280 });
  }, [rested, rotation]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** CPUの口上セリフ（教習所らしい一言。CPU対戦のみ） */
const CPU_LINES = {
  start: [
    "今日も安全運転でいきましょう！",
    "準備はいいですか？出発進行！",
    "焦らず確実に。それが上達のコツです",
    "ミラーよし、シートベルトよし。始めましょう！",
  ],
  playerReach: [
    "おっと、卒業が見えてきましたね…！",
    "ここからが本当の試験ですよ",
    "まだ終わっていませんよ！",
  ],
  cpuReach: [
    "私の教習はもう仕上げ段階です",
    "お先に卒業させてもらいますよ",
    "見えました、卒業検定！",
  ],
  cpuWin: [
    "また一緒に教習しましょう！",
    "今日の反省を次に活かしましょう",
    "運転は焦らないことが一番です",
  ],
  cpuLose: [
    "お見事！卒業おめでとうございます！",
    "完敗です。良いドライバーになれますよ",
    "私も負けていられませんね…！",
  ],
} as const;

function pickLine(lines: readonly string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

/** リーチ中、画面のフチが赤く脈動して緊迫感を出すビネット */
function ReachVignette({ double = false }: { double?: boolean }) {
  // Webではブラウザ合成のCSSアニメーションで回す（JSが混んでいても滑らか）
  if (Platform.OS === "web") {
    return (
      <View
        {...({ dataSet: { kdsanim: "reachpulse" } } as object)}
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 25 },
          {
            animationDuration: "1240ms",
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
          } as unknown as ViewStyle,
        ]}
        pointerEvents="none"
      >
        <ReachVignetteBody purple={double} />
      </View>
    );
  }
  const pulse = useSharedValue(0.2);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.2, { duration: 620, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [pulse]);
  const st = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st, { zIndex: 25 }]} pointerEvents="none">
      <ReachVignetteBody purple={double} />
    </Animated.View>
  );
}

/** リーチ演出の4辺の赤いグラデーション（本体は再描画不要なのでメモ化） */
const ReachVignetteBody = React.memo(function ReachVignetteBody({
  purple = false,
}: {
  purple?: boolean;
}) {
  // 両者リーチは「運命の最終局面」の紫、通常は警告の赤
  const strong = purple ? "#8a3ddfaa" : "#d83030aa";
  const weak = purple ? "#8a3ddf77" : "#d8303077";
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[strong, "transparent"]}
        style={styles.vignetteTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <LinearGradient
        colors={["transparent", strong]}
        style={styles.vignetteBottom}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <LinearGradient
        colors={[weak, "transparent"]}
        style={styles.vignetteLeft}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
      />
      <LinearGradient
        colors={["transparent", weak]}
        style={styles.vignetteRight}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
      />
    </View>
  );
})

/** 進捗の折返し到達のお祝いチップ（ポンと出て消える） */
function MilestonePop({ label }: { label: string }) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withSequence(
      withTiming(1.15, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 140 }),
      withDelay(750, withTiming(0, { duration: 240 }))
    );
  }, [s]);
  const st = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0.01, s.value) }],
    opacity: Math.min(1, s.value * 1.5),
  }));
  return (
    <Animated.View style={[styles.milestonePop, st]} pointerEvents="none">
      <Text style={styles.milestonePopText} allowFontScaling={false}>
        {label}
      </Text>
    </Animated.View>
  );
}

/** 場のカードがゆっくり呼吸するように揺れる（休憩中は止まる） */
function Breathe({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Webではブラウザ合成のCSSアニメーションで回す（JSが混んでいても滑らか）
  if (Platform.OS === "web") {
    const anim = active
      ? ({
          animationDuration: "2500ms",
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
        } as unknown as ViewStyle)
      : null;
    return (
      <View {...(active ? ({ dataSet: { kdsanim: "breathe" } } as object) : null)} style={anim}>
        {children}
      </View>
    );
  }
  const s = useSharedValue(1);
  useEffect(() => {
    if (active) {
      s.value = withRepeat(
        withSequence(
          withTiming(1.022, { duration: 1250, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.quad) })
        ),
        -1
      );
    } else {
      s.value = withTiming(1, { duration: 200 });
    }
  }, [active, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/** カードが飛ぶ演出の種類 */
type FlyKind = "play" | "draw" | "remove" | "slam";
interface FlyItem {
  key: number;
  kind: FlyKind;
  cardId: string;
  mine: boolean;
}

/**
 * カードの移動演出（1枚ぶん）。
 *  play  … 手札から場へ弧を描いて飛び、着地で衝撃リング＋バウンド
 *  draw  … 山札から手札へ滑り込む
 *  remove… 場外へ吹き飛ばされて回転しながら消える
 *  slam  … バトル中のサポートを左右から叩きつける
 */
function FlyCard({ item, onDone }: { item: FlyItem; onDone: (key: number) => void }) {
  const t = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    const dur = item.kind === "slam" ? 300 : item.kind === "remove" ? 620 : item.kind === "draw" ? 380 : 520;
    t.value = withTiming(1, { duration: dur, easing: Easing.out(Easing.cubic) });
    if (item.kind === "play") {
      ring.value = withDelay(dur - 80, withTiming(1, { duration: 340 }));
    }
    const done = setTimeout(() => onDone(item.key), dur + (item.kind === "slam" ? 320 : 380));
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sign = item.mine ? 1 : -1;
  const style = useAnimatedStyle(() => {
    const p = t.value;
    if (item.kind === "play") {
      // 弧: 横は等速、縦はイーズ、最後に小さくバウンド
      const bounce = p > 0.92 ? Math.sin((p - 0.92) / 0.08 * Math.PI) * 6 : 0;
      return {
        transform: [
          { translateY: sign * (260 - 190 * p) - bounce },
          { translateX: 40 * (1 - p) * sign },
          { rotate: `${(1 - p) * -9 * sign}deg` },
          { scale: 0.72 + 0.28 * p },
        ],
        opacity: p > 0.9 ? 1 - (p - 0.9) * 6 : 1,
      };
    }
    if (item.kind === "draw") {
      return {
        transform: [
          { translateX: 130 * (1 - p) },
          { translateY: sign * (110 + 160 * p) },
          { rotate: `${(1 - p) * 12}deg` },
          { scale: 0.55 + 0.12 * p },
        ],
        opacity: p > 0.75 ? 1 - (p - 0.75) * 4 : 0.95,
      };
    }
    if (item.kind === "remove") {
      return {
        transform: [
          { translateX: sign * -1 * (330 * p) },
          { translateY: sign * (90 + 250 * p) },
          { rotate: `${540 * p * sign}deg` },
          { scale: 1 - 0.55 * p },
        ],
        opacity: 1 - p * 0.9,
      };
    }
    // slam
    const shake = p >= 1 ? 0 : 0;
    return {
      transform: [
        { translateX: sign * -1 * 230 * (1 - p) + shake },
        { translateY: sign * 70 },
        { rotate: `${sign * -1 * 14 * (1 - p)}deg` },
        { scale: 0.9 + 0.1 * p },
      ],
      opacity: 1,
    };
  });
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 1 - ring.value,
    transform: [
      { translateY: sign * 70 },
      { scale: 0.4 + ring.value * 1.9 },
    ],
  }));
  return (
    <View style={styles.flyLayer} pointerEvents="none">
      {item.kind === "play" && <Animated.View style={[styles.impactRing, ringStyle]} />}
      <Animated.View style={style}>
        <CardFace cardId={item.cardId} size="sm" faceDown={item.kind === "draw" && !item.mine} />
      </Animated.View>
    </View>
  );
}

/** ターン帯を車がビュンと横切る */
function TurnCar({ mine }: { mine: boolean }) {
  useEffect(() => {
    // ターン交代はウインカーの「カチッカチッ」で合図
    playSe("winker");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) });
  }, [x]);
  const w = Dimensions.get("window").width;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -w / 2 - 40 + x.value * (w + 80) },
      { scaleX: -1 },
    ],
    opacity: x.value < 0.05 ? x.value * 20 : x.value > 0.92 ? (1 - x.value) * 12 : 1,
  }));
  return (
    <Animated.Text style={[styles.turnCar, style]} allowFontScaling={false}>
      {mine ? "🚙" : "🚗"}
    </Animated.Text>
  );
}

/** 効果を発動したカードが金色に光る */
function GoldFlash() {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withSequence(
      withTiming(1, { duration: 160 }),
      withTiming(0.4, { duration: 160 }),
      withTiming(1, { duration: 160 }),
      withTiming(0, { duration: 260 })
    );
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <Animated.View style={[styles.goldFlash, style]} pointerEvents="none" />;
}

/** リザルトの学科・技能スコアをカウントアップで見せる */
function ResultScores({
  meA,
  meS,
  opA,
  opS,
  oppLabelText,
}: {
  meA: number;
  meS: number;
  opA: number;
  opS: number;
  oppLabelText: string;
}) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setP(Math.min(1, i / 22));
      // ドラムロールの刻み（少しずつ音程が上がる）→ 伸び切った瞬間にシンバル
      if (i % 4 === 0 && i < 22) playSe("tap", 1 + i * 0.02);
      if (i >= 22) {
        clearInterval(timer);
        playSe("cymbal");
        haptic("success");
      }
    }, 40);
    return () => clearInterval(timer);
  }, []);
  const row = (label: string, a: number, sk: number, mine: boolean) => (
    <View style={[styles.resultScoreRow, mine && styles.resultScoreRowMine]}>
      <Text style={styles.resultScoreName} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.resultScoreBars}>
        <View style={styles.resultScoreBarWrap}>
          <View
            style={[styles.resultScoreBar, { width: `${(Math.round(a * p) / ACADEMIC_GOAL) * 100}%`, backgroundColor: colors.primary }]}
          />
        </View>
        <View style={styles.resultScoreBarWrap}>
          <View
            style={[styles.resultScoreBar, { width: `${(Math.round(sk * p) / SKILL_GOAL) * 100}%`, backgroundColor: colors.success }]}
          />
        </View>
      </View>
      <Text style={styles.resultScoreNums} allowFontScaling={false}>
        学{Math.round(a * p)}・技{Math.round(sk * p)}
      </Text>
    </View>
  );
  return (
    <View style={styles.resultScores}>
      {row("あなた", meA, meS, true)}
      {row(oppLabelText, opA, opS, false)}
    </View>
  );
}

/** 対戦入場の暗転ワイプ（左右の幕が開き、中央がひと筋光る） */
function BattleEnterWipe({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    // 対戦の始まりはエンジン始動から
    playSe("engine_start");
    const t = setTimeout(onDone, 760);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Webではブラウザ合成のCSSアニメーションで開く。
  // 対戦画面の初期描画（重い）と同じJSスレッドを使わないので滑らか
  if (Platform.OS === "web") {
    const wipeAnim = {
      animationDuration: "520ms",
      animationDelay: "120ms",
      animationTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
      animationFillMode: "forwards",
    } as unknown as ViewStyle;
    return (
      <View style={styles.wipeLayer} pointerEvents="none">
        <View
          {...({ dataSet: { kdsanim: "wipeleft" } } as object)}
          style={[styles.wipeHalf, { left: 0 }, wipeAnim]}
        />
        <View
          {...({ dataSet: { kdsanim: "wiperight" } } as object)}
          style={[styles.wipeHalf, { right: 0 }, wipeAnim]}
        />
        <View
          {...({ dataSet: { kdsanim: "wipebeam" } } as object)}
          style={[styles.wipeBeam, { opacity: 0 }, wipeAnim]}
        />
      </View>
    );
  }
  return <BattleEnterWipeNative />;
}

/** ネイティブ用: reanimated 版のワイプ */
function BattleEnterWipeNative() {
  const open = useSharedValue(0);
  useEffect(() => {
    open.value = withDelay(120, withTiming(1, { duration: 520, easing: Easing.inOut(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const w = Dimensions.get("window").width;
  const left = useAnimatedStyle(() => ({ transform: [{ translateX: -open.value * (w / 2 + 10) }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: open.value * (w / 2 + 10) }] }));
  const beam = useAnimatedStyle(() => ({
    opacity: open.value < 0.3 ? open.value * 3 : 1 - (open.value - 0.3) / 0.7,
  }));
  return (
    <View style={styles.wipeLayer} pointerEvents="none">
      <Animated.View style={[styles.wipeHalf, { left: 0 }, left]} />
      <Animated.View style={[styles.wipeHalf, { right: 0 }, right]} />
      <Animated.View style={[styles.wipeBeam, beam]} />
    </View>
  );
}

/** 大逆転勝利の特別カットイン */
function ComebackFx() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(
      withTiming(1.2, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 180 })
    );
  }, [t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: t.value }],
    opacity: Math.min(1, t.value * 2),
  }));
  return (
    <View style={styles.reachLayer} pointerEvents="none">
      <Image
        source={require("../../assets/images/fx/fx_victory.webp")}
        style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
        contentFit="cover"
      />
      <Animated.View style={[styles.reachBox, style]}>
        <Text style={[styles.reachTitle, styles.reachTitleLong, { color: "#ffd54d" }]} numberOfLines={1} allowFontScaling={false}>
          🔥 大逆転勝利！！
        </Text>
        <Text style={styles.reachSub}>崖っぷちからの見事な卒業！</Text>
      </Animated.View>
    </View>
  );
}

/** 入場バナー（リベンジマッチ／連勝の勢い） */
function EntryBanner({ text }: { text: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withDelay(1200, withTiming(2, { duration: 260 }))
    );
  }, [t]);
  const w = Dimensions.get("window").width;
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      transform: [{ translateX: p <= 1 ? -w * (1 - p) : w * (p - 1) }],
      opacity: p <= 1 ? p : 2 - p,
    };
  });
  return (
    <View style={styles.entryBannerLayer} pointerEvents="none">
      <Animated.View style={[styles.entryBanner, style]}>
        <Text style={styles.entryBannerText} allowFontScaling={false}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

/** インストラクター撃破の認定証（ハンコがドンと押される） */
function CertificateFx({ name, onClose }: { name: string; onClose: () => void }) {
  const inAnim = useSharedValue(0);
  const stamp = useSharedValue(0);
  useEffect(() => {
    inAnim.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    stamp.value = withDelay(
      700,
      withSequence(withTiming(1.25, { duration: 140 }), withTiming(1, { duration: 120 }))
    );
    const t = setTimeout(() => {
      playSe("hit");
      haptic("heavy");
    }, 760);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const boxStyle = useAnimatedStyle(() => ({
    opacity: inAnim.value,
    transform: [{ scale: 0.8 + inAnim.value * 0.2 }],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.value === 0 ? 0 : 1,
    transform: [{ scale: stamp.value }, { rotate: "-12deg" }],
  }));
  return (
    <Pressable style={styles.certLayer} onPress={onClose}>
      <Animated.View style={[styles.certBox, boxStyle]}>
        <Text style={styles.certTitle}>認　定　証</Text>
        <Text style={styles.certBody}>{name}インストラクター 撃破</Text>
        <Text style={styles.certDate}>{new Date().toLocaleDateString("ja-JP")}</Text>
        <Text style={styles.certNote}>KDSトレーディングカードゲーム</Text>
        <Animated.View style={[styles.certStamp, stampStyle]}>
          <Text style={styles.certStampText}>認</Text>
        </Animated.View>
        <Text style={styles.certClose}>タップで閉じる</Text>
      </Animated.View>
    </Pressable>
  );
}

/** スタンプが相手側／自分側へ弧を描いて飛ぶ */
function FlyingStamp({ emoji, up }: { emoji: string; up: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) });
  }, [t]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      transform: [
        { translateY: up ? 260 - 520 * p : -260 + 520 * p },
        { translateX: Math.sin(p * Math.PI) * 60 },
        { scale: 0.8 + Math.sin(p * Math.PI) * 0.5 },
      ],
      opacity: p < 0.1 ? p * 10 : p > 0.9 ? (1 - p) * 10 : 1,
    };
  });
  return (
    <View style={styles.flyLayer} pointerEvents="none">
      <Animated.Text style={[{ fontSize: 44 }, style]} allowFontScaling={false}>
        {emoji}
      </Animated.Text>
    </View>
  );
}

/** バトルで狙われているカードの怯え（小刻みな震え） */
/** 担当カードの喜怒。勝ち=3回ピョンと跳ねる / 負け=しゅんと傾いて沈む */
function TantouMood({
  mood,
  children,
}: {
  mood: "win" | "lose" | null;
  children: React.ReactNode;
}) {
  const y = useSharedValue(0);
  const rot = useSharedValue(0);
  useEffect(() => {
    if (mood === "win") {
      y.value = withDelay(
        600,
        withSequence(
          withTiming(-14, { duration: 180, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
          withTiming(-10, { duration: 160, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) }),
          withTiming(-6, { duration: 140, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) })
        )
      );
    } else if (mood === "lose") {
      y.value = withDelay(600, withTiming(6, { duration: 500, easing: Easing.out(Easing.quad) }));
      rot.value = withDelay(600, withTiming(8, { duration: 500 }));
    } else {
      y.value = withTiming(0, { duration: 150 });
      rot.value = withTiming(0, { duration: 150 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { rotate: `${rot.value}deg` }],
  }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

function Tremble({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Webではブラウザ合成のCSSアニメーションで回す（JSが混んでいても滑らか）
  if (Platform.OS === "web") {
    const anim = active
      ? ({
          animationDuration: "110ms",
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
        } as unknown as ViewStyle)
      : null;
    return (
      <View {...(active ? ({ dataSet: { kdsanim: "tremble" } } as object) : null)} style={anim}>
        {children}
      </View>
    );
  }
  const x = useSharedValue(0);
  useEffect(() => {
    if (active) {
      x.value = withRepeat(
        withSequence(withTiming(-1.6, { duration: 55 }), withTiming(1.6, { duration: 55 })),
        -1
      );
    } else {
      x.value = withTiming(0, { duration: 80 });
    }
  }, [active, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** 出せる手札カードの金縁パルス */
function GoldPulseBorder() {
  // Webではブラウザ合成のCSSアニメーションで回す（JSが混んでいても滑らか）
  if (Platform.OS === "web") {
    return (
      <View
        {...({ dataSet: { kdsanim: "goldpulse" } } as object)}
        style={[
          styles.goldPulseBorder,
          {
            animationDuration: "1400ms",
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
          } as unknown as ViewStyle,
        ]}
        pointerEvents="none"
      />
    );
  }
  const glow = useSharedValue(0.25);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 700 }), withTiming(0.25, { duration: 700 })),
      -1
    );
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <Animated.View style={[styles.goldPulseBorder, style]} pointerEvents="none" />;
}

/** 画面上部に常駐するターンカウンタ。増えるとクルッと回る */
function TurnCounter({ n }: { n: number }) {
  const flip = useSharedValue(0);
  const prev = useRef(n);
  useEffect(() => {
    if (prev.current === n) return;
    prev.current = n;
    flip.value = 0;
    flip.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [n, flip]);
  const style = useAnimatedStyle(() => ({
    transform: [{ perspective: 500 }, { rotateX: `${(1 - flip.value) * -90}deg` }],
  }));
  return (
    <View style={styles.turnCounter} pointerEvents="none">
      <Animated.Text style={[styles.turnCounterText, style]} allowFontScaling={false}>
        TURN {n}
      </Animated.Text>
    </View>
  );
}

/** 対戦開始の顔合わせ「あなた VS ◯◯」 */
/** 教習所の信号機風の手番ランプ（青=あなた / 黄=選択待ち / 赤=相手） */
function SignalLight({ state }: { state: "green" | "yellow" | "red" }) {
  const lamp = (c: string, on: boolean) => (
    <View
      style={[
        styles.signalLamp,
        { backgroundColor: on ? c : "#3a4553" },
        on && { shadowColor: c, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
      ]}
    />
  );
  return (
    <View style={styles.signalBody}>
      {lamp("#35c463", state === "green")}
      {lamp("#f2c40f", state === "yellow")}
      {lamp("#e5484d", state === "red")}
    </View>
  );
}

/** 対戦内容からインストラクターの所見コメントを選ぶ */
function kouhyouFor(won: boolean, turns: number, comeback: boolean, oppOut: number): string {
  if (won && comeback) return "劣勢からの立て直しが見事でした。あきらめない姿勢は路上でも大切です。";
  if (won && turns <= 8) return "思い切りの良い運転（プレイ）でした。判断の速さは大きな武器です。";
  if (won && oppOut >= 3) return "攻めのメリハリが効いていました。安全確認を忘れずにこの調子で！";
  if (won) return "落ち着いた良い教習態度でした。基本に忠実な進め方に好感が持てます。";
  if (!won && turns >= 14) return "粘り強く最後まで走り切りました。次はリーチのかけ方を意識してみましょう。";
  if (!won && oppOut === 0) return "少し受け身だったかも。バトルで相手を場外に送る積極性も試してみましょう。";
  return "今日の敗因を思い出すのが上達への近道。次の教習も待っています！";
}

/** 検定員の採点ボード。項目に順番に✓が入っていく */
function KenteiBoard({
  won,
  turns,
  oppOut,
  comeback,
}: {
  won: boolean;
  turns: number;
  oppOut: number;
  comeback: boolean;
}) {
  const items: { label: string; grade: string }[] = [
    { label: "安全確認", grade: "よし！" },
    { label: "メリハリ", grade: turns <= 12 ? "◎" : "よし！" },
    { label: "積極性", grade: oppOut >= 2 ? "◎" : comeback ? "◎" : "よし！" },
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    items.forEach((_, i) => {
      ts.push(
        setTimeout(() => {
          playSe("tap");
          setShown(i + 1);
        }, 250 + i * 320)
      );
    });
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.kenteiBoard}>
      <Text style={styles.kenteiBoardTitle}>検定員チェック</Text>
      <View style={styles.kenteiBoardRow}>
        {items.map((it, i) => (
          <View key={it.label} style={styles.kenteiBoardItem}>
            <Text style={styles.kenteiBoardLabel}>{it.label}</Text>
            {shown > i && (
              <Animated.Text
                entering={ZoomIn.springify().damping(11)}
                style={[styles.kenteiBoardGrade, !won && i === items.length - 1 && { color: "#b04030" }]}
              >
                ✓{it.grade}
              </Animated.Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** 検定の判子。「合格」は朱色、「再検定」は少し落ち着いた赤で、バンッと押される */
function KenteiHanko({ pass }: { pass: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const se = setTimeout(() => {
      playSe("hit");
      haptic(pass ? "success" : "medium");
    }, 1250);
    t.value = withDelay(
      1250,
      withSequence(
        withTiming(1.06, { duration: 190, easing: Easing.in(Easing.cubic) }),
        withTiming(1, { duration: 120 })
      )
    );
    return () => clearTimeout(se);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 3),
    transform: [
      { rotate: "-10deg" },
      { scale: t.value === 0 ? 2.2 : 2.2 - t.value * 1.2 },
    ],
  }));
  return (
    <View style={styles.hankoWrap} pointerEvents="none">
      <Animated.View
        style={[styles.hanko, !pass && styles.hankoRetry, st]}
      >
        <Text style={[styles.hankoText, !pass && styles.hankoTextRetry]} allowFontScaling={false}>
          {pass ? "合格" : "再検定"}
        </Text>
        <Text style={styles.hankoSub} allowFontScaling={false}>
          KDS釧路自動車学校
        </Text>
      </Animated.View>
    </View>
  );
}

/** 検定員のアナウンス帯。「準備はいいですか？ → 始めてください！」の2段階 */
function ExamStartBand({ final, onDone }: { final: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    playSe("janken");
    if (final) playVoice("voice_kentei");
    const t1 = setTimeout(() => {
      setStep(1);
      playSe("battle");
      haptic("medium");
    }, 900);
    const t2 = setTimeout(onDone, 1900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.examLayer} pointerEvents="none">
      <Animated.View
        key={step}
        entering={step === 0 ? SlideInLeft.duration(260) : ZoomIn.springify().damping(11)}
        style={[styles.examBand, final && styles.examBandFinal]}
      >
        <Text style={styles.examBandText} allowFontScaling={false}>
          {final
            ? step === 0
              ? "🎓 卒業検定"
              : "始めてください！"
            : step === 0
              ? "準備はいいですか？"
              : "始めてください！"}
        </Text>
        {final && step === 0 && (
          <Text style={styles.examBandSub} allowFontScaling={false}>トーナメント決勝戦</Text>
        )}
      </Animated.View>
    </View>
  );
}

function VsIntro({
  oppName,
  kyokanCardId,
  onDone,
}: {
  oppName: string;
  kyokanCardId?: string;
  onDone: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    playSe("battle");
    haptic("medium");
    t.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(onDone, 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const w = Dimensions.get("window").width;
  const leftS = useAnimatedStyle(() => ({ transform: [{ translateX: -w * (1 - t.value) }] }));
  const rightS = useAnimatedStyle(() => ({ transform: [{ translateX: w * (1 - t.value) }] }));
  const vsS = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: 0.3 + t.value * 0.7 }, { rotate: "-8deg" }],
  }));
  return (
    <View style={styles.vsLayer} pointerEvents="none">
      <Animated.View style={[styles.vsSide, styles.vsSideMe, leftS]}>
        <Text style={styles.vsName} allowFontScaling={false}>
          あなた
        </Text>
      </Animated.View>
      <Animated.View style={[styles.vsSide, styles.vsSideOpp, rightS]}>
        {kyokanCardId && <CardFace cardId={kyokanCardId} size="sm" />}
        <Text style={styles.vsName} allowFontScaling={false} numberOfLines={1}>
          {oppName}
        </Text>
      </Animated.View>
      <Animated.Text style={[styles.vsMark, vsS]} allowFontScaling={false}>
        VS
      </Animated.Text>
    </View>
  );
}

/** 場外送りなどの浮き上がりテキスト */
function FloatTextFx({ text, mine }: { text: string; mine: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value * 7 : 1 - t.value * 0.9,
    transform: [{ translateY: (mine ? 120 : -160) - t.value * 44 }],
  }));
  return (
    <View style={styles.flyLayer} pointerEvents="none">
      <Animated.Text style={[styles.floatText, style]} allowFontScaling={false}>
        {text}
      </Animated.Text>
    </View>
  );
}

/** 拡大表示の上部に出す「あなた」「CPU」バッジ */
function OwnerBadge({ owner }: { owner: Owner }) {
  const isSelf = owner === "self";
  return (
    <View
      style={[
        styles.ownerBadge,
        { backgroundColor: isSelf ? colors.success : colors.danger },
      ]}
    >
      <Text style={styles.ownerBadgeText}>{isSelf ? "あなた" : oppLabel}</Text>
    </View>
  );
}

function ActionButton({
  label,
  color,
  onPress,
  small,
}: {
  label: string;
  color: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: color },
        small && styles.actionButtonSmall,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.actionButtonText, small && { fontSize: 12 }]}>{label}</Text>
    </Pressable>
  );
}

function Overlay({
  title,
  children,
  onClose,
  entering,
  translucent,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  entering?: "bounce" | "zoom";
  /** 背景の演出（舞うカード等）が透けて見える半透明の箱にする */
  translucent?: boolean;
}) {
  return (
    <Animated.View
      style={[styles.overlayBg, translucent && styles.overlayBgLight]}
      entering={FadeIn.duration(150)}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        style={[styles.overlayBox, translucent && styles.overlayBoxTranslucent]}
        entering={entering === "bounce" ? BounceIn.duration(500) : ZoomIn.duration(200)}
      >
        <Text style={styles.overlayTitle}>{title}</Text>
        {/* 中身が画面より長いときは箱の中でスクロールさせ、
            途中で切れたり箱の外へはみ出したりしないようにする */}
        <ScrollView
          style={styles.overlayScroll}
          contentContainerStyle={styles.overlayScrollInner}
          showsVerticalScrollIndicator={true}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: "hidden" },
  shakeWrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  annLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  annLayerDim: { backgroundColor: "#00000066" },
  annLayerBattle: { backgroundColor: "#0b1024ee", padding: 0, alignItems: "stretch" },
  // 強調実況（じゃんけん勝敗・教習戻され・バトル解決）は全画面暗転で大きく
  annLayerEmph: { backgroundColor: "#0b1024cc" },
  // 教習カットインは余白なしの全画面（絵文字が途中で切れないように）
  annLayerLesson: {
    backgroundColor: "#0b1024cc",
    padding: 0,
    alignItems: "stretch",
  },
  targetCompareRow: {
    alignSelf: "stretch",
    backgroundColor: "#f4f0e6",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    alignItems: "center",
  },
  targetCompareText: { color: "#3a3a3a", fontSize: 13, fontWeight: "800", textAlign: "center" },
  targetCompareNum: { color: "#c22525", fontSize: 17, fontWeight: "900" },
  targetCompareHint: { color: "#7a6a4a", fontSize: 11, fontWeight: "700", textAlign: "center" },
  challengeSentText: {
    color: "#ffd54d",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  netsuBox: {
    alignSelf: "stretch",
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fffdf5",
  },
  netsuTitle: { fontSize: 16, fontWeight: "900", color: "#3a3a3a" },
  netsuBarBg: {
    alignSelf: "stretch",
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e8e4d8",
    overflow: "hidden",
  },
  netsuBarFill: { height: 8, borderRadius: 999 },
  netsuLabel: { fontSize: 12, fontWeight: "700", color: "#7a6a4a" },
  specChip: {
    position: "absolute",
    top: 40,
    right: 8,
    backgroundColor: "#12308acc",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    zIndex: 30,
  },
  specChipText: { color: "#cfe4ff", fontSize: 11, fontWeight: "800" },
  cheerFloat: {
    position: "absolute",
    bottom: 130,
    right: 30,
    zIndex: 60,
  },
  chainBadge: {
    position: "absolute",
    top: "16%",
    right: 14,
    backgroundColor: "#12308a",
    borderColor: "#ffd54d",
    borderWidth: 3,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chainBadgeText: { color: "#ffd54d", fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  lastCardChip: {
    position: "absolute",
    top: -12,
    alignSelf: "center",
    backgroundColor: "#c22525",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 12,
    zIndex: 5,
  },
  lastCardChipText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  streakBannerRainbow: {
    backgroundColor: "#1a1038",
    borderWidth: 2,
    borderColor: "#d9a6ff",
  },
  doubleReachTitle: { color: "#d9a6ff", fontSize: 30 },
  doubleReachBand: {
    backgroundColor: "#c9971b",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  doubleReachBandText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  fireworkDot: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 999,
    borderWidth: 3,
  },
  fireworksLabelWrap: {
    position: "absolute",
    top: "9%",
    alignSelf: "center",
    backgroundColor: "#000000a8",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#ffd54d",
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  fireworksLabel: { color: "#ffd54d", fontSize: 17, fontWeight: "900" },
  weatherDrop: {
    position: "absolute",
    top: -46,
    width: 2,
    height: 26,
    borderRadius: 2,
    backgroundColor: "#9fc3ee88",
  },
  weatherFlake: {
    position: "absolute",
    top: -46,
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#ffffffcc",
  },
  weatherChip: {
    position: "absolute",
    top: 6,
    right: 8,
    backgroundColor: "#12308acc",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  weatherChipText: { color: "#cfe4ff", fontSize: 10, fontWeight: "800" },
  sparkWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  spark: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: "#ffef9e",
  },
  sparkGold: { backgroundColor: "#ffc37d", width: 13, height: 13 },
  dustPuff: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: "#b89a6a",
  },
  spotDim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "52%",
    backgroundColor: "#04081ab8",
  },
  finalBlowStamp: {
    position: "absolute",
    alignSelf: "center",
    top: "18%",
    borderWidth: 4,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 26,
    alignItems: "center",
    gap: 2,
    backgroundColor: "#000000b8",
  },
  finalBlowStampWin: { borderColor: "#ffd54d" },
  finalBlowStampLose: { borderColor: "#ff8a8a" },
  finalBlowText: { fontSize: 40, fontWeight: "900", letterSpacing: 6 },
  finalBlowSub: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  lessonCutWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  lessonCutEmoji: { position: "absolute", fontSize: 130, opacity: 0.4 },
  lessonCutCarWrap: { position: "absolute", opacity: 0.6 },
  lessonCutCar: { width: 250, height: 95 },
  lessonCutBody: { alignItems: "center", gap: 12 },
  lessonCutBadge: {
    paddingVertical: 6,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  lessonCutBadgeText: { color: "#fff", fontWeight: "900", fontSize: 17 },
  lessonCutTitle: {
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "#000",
    textShadowRadius: 16,
  },
  lessonCutUnit: { fontSize: 24, fontWeight: "900" },
  powerCutTitle: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "#000",
    textShadowRadius: 16,
  },
  lessonCutSub: {
    color: "#ffffffee",
    fontSize: 17,
    paddingHorizontal: 20,
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "#000",
    textShadowRadius: 8,
  },
  annBigText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1,
    lineHeight: 42,
    paddingHorizontal: 16,
    textShadowColor: colors.accent,
    textShadowRadius: 16,
  },
  cutinWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cutinSlash: {
    position: "absolute",
    left: -100,
    right: -100,
    height: 66,
    backgroundColor: colors.danger,
    opacity: 0.9,
  },
  cutinSlashA: { top: "26%" },
  cutinSlashB: { top: "68%" },
  // 2枚のカードが中央で向かい合う。カードは少し重ねてぶつかり感を出す
  cutinCards: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cutinCard: { alignItems: "center", gap: 8, marginHorizontal: -12 },
  cutinCardRight: { marginTop: 46 },
  cutinLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#fff",
    paddingVertical: 3,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: "hidden",
  },
  cutinLabelAtk: { backgroundColor: colors.danger },
  cutinLabelDef: { backgroundColor: colors.primary },
  cutinTitleWrap: { position: "absolute", alignSelf: "center" },
  cutinTitle: {
    color: "#fff",
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: 4,
    textAlign: "center",
    textShadowColor: colors.danger,
    textShadowRadius: 20,
  },
  cutinSub: {
    color: "#ffffffdd",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
    textShadowColor: "#000",
    textShadowRadius: 8,
  },
  // ターンの帯は全画面を暗転させ、端から端まで流す
  annLayerBand: {
    padding: 0,
    alignItems: "stretch",
    backgroundColor: "#0b1024cc",
  },
  flashLayer: { ...StyleSheet.absoluteFill, backgroundColor: "#fff" },
  dealLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0b1f4aee",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  dealCaption: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  dealStep: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#ffffff26",
    borderWidth: 1.5,
    borderColor: "#ffffffaa",
    alignItems: "center",
    justifyContent: "center",
  },
  dealStepText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  dealTitle: { color: "#fff", fontSize: 15, fontWeight: "800", flexShrink: 1 },
  dealStage: { width: "100%", height: 260, alignItems: "center", justifyContent: "flex-start" },
  dealDeck: { position: "absolute", top: 0 },
  dealCard: { position: "absolute", top: 0 },
  dealFace: { backfaceVisibility: "hidden" },
  dealFront: { ...StyleSheet.absoluteFill },
  // 手札エリアの上に重ねる（手札の並びに影響させない）
  // 引いたカードは手札の右端に加わるので、演出も右端に出す
  drawFx: { position: "absolute", right: 12, bottom: 6, zIndex: 10 },
  confettiPiece: { position: "absolute", top: 0, borderRadius: 1 },
  outFxCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  rainCard: { position: "absolute", top: 0 },
  lossDim: { ...StyleSheet.absoluteFill, backgroundColor: "#0b1024" },
  rainDrop: {
    position: "absolute",
    top: 0,
    width: 2,
    height: 46,
    borderRadius: 1,
    backgroundColor: "#9fb3c8",
  },
  turnFxBand: {
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
    // 毎ターン全幅でスライドする帯なので、ぼかしは小さく（カクつき対策）
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  turnFxText: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 2,
    maxWidth: "94%",
    textAlign: "center",
    textShadowColor: "#0006",
    textShadowRadius: 6,
  },
  annCardBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 18,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  annCardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.primaryDark,
    textAlign: "center",
  },
  ownerBadge: {
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  ownerBadgeText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  annBox: {
    backgroundColor: "#ffffffee",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
    maxWidth: 320,
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  annText: { fontSize: 15, fontWeight: "700", color: colors.text, textAlign: "center" },
  annHint: { fontSize: 10, color: colors.textMuted },
  logLatest: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primaryDark,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
    maxWidth: "100%",
    // 左端を軸に拡大させ、右にはみ出して切れないようにする
    transformOrigin: "left center",
  },
  battleRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  battleSide: { alignItems: "center", gap: 3 },
  battleSideLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "700" },
  battleTotal: { fontSize: 26, fontWeight: "900" },
  vsText: { fontSize: 20, fontWeight: "900", color: colors.accent },
  logButton: { fontSize: 11, color: colors.primary, fontWeight: "800" },
  logButtonRow: { alignSelf: "flex-start", paddingVertical: 2 },
  hintBox: {
    position: "absolute",
    left: 8,
    right: 8,
    // 手札の上に重ならない高さ
    bottom: 128,
    zIndex: 50,
    backgroundColor: "#fff8e1",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 3,
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  hintLabel: { fontSize: 10, fontWeight: "800", color: colors.accent },
  hintTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  hintBody: { fontSize: 13, lineHeight: 19, color: colors.text },
  hintOk: {
    alignSelf: "flex-end",
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 22,
  },
  hintOkText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  cannotBox: {
    backgroundColor: "#fff8e1",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  cannotLabel: { fontSize: 11, fontWeight: "800", color: colors.accentDark },
  cannotText: { fontSize: 13, lineHeight: 19, color: colors.text },
  infoLink: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  pileNote: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  pileScroll: { alignSelf: "stretch", maxHeight: 380 },
  pileContent: { paddingBottom: 4 },
  logScroll: { alignSelf: "stretch", maxHeight: 380 },
  logFullLine: { fontSize: 13, color: colors.text, lineHeight: 19 },
  zone: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    borderBottomWidth: 2,
    borderTopWidth: 2,
    borderColor: "transparent",
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  playerLabel: { fontWeight: "800", color: colors.text, fontSize: 14, flexShrink: 0 },
  infoText: { color: colors.textMuted, fontSize: 12, flexShrink: 0 },
  fieldRow: { gap: 10, paddingVertical: 4, alignItems: "center", minHeight: 92 },
  fieldSlot: {
    alignItems: "center",
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffffff55",
    backgroundColor: "#ffffff30",
  },
  restedCard: { transform: [{ rotate: "90deg" }] },
  examLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
  },
  examBand: {
    backgroundColor: "#1c3a5ee8",
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 14,
    alignItems: "center",
    gap: 2,
    borderWidth: 2,
    borderColor: "#ffffff55",
  },
  examBandFinal: { backgroundColor: "#7a5a00e8", borderColor: "#ffd54d" },
  examBandText: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 2 },
  examBandSub: { color: "#ffd54d", fontSize: 12, fontWeight: "800" },
  entryBannerLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
  },
  entryBanner: {
    alignSelf: "stretch",
    backgroundColor: "#0b1226ee",
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#ffd54d",
  },
  entryBannerText: { color: "#ffd54d", fontSize: 24, fontWeight: "900", letterSpacing: 1 },
  certLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000aa",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 80,
  },
  certBox: {
    backgroundColor: "#fffdf4",
    borderWidth: 4,
    borderColor: "#b8973a",
    borderRadius: 6,
    paddingVertical: 28,
    paddingHorizontal: 30,
    alignItems: "center",
    gap: 10,
    width: 320,
  },
  certTitle: { fontSize: 26, fontWeight: "900", color: "#5a4a1a", letterSpacing: 8 },
  certBody: { fontSize: 17, fontWeight: "800", color: "#333" },
  certDate: { fontSize: 13, color: "#666" },
  certNote: { fontSize: 11, color: "#999" },
  certStamp: {
    position: "absolute",
    right: 18,
    bottom: 34,
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: "#d83030",
    alignItems: "center",
    justifyContent: "center",
  },
  certStampText: { fontSize: 30, fontWeight: "900", color: "#d83030" },
  certClose: { fontSize: 11, color: "#999", marginTop: 4 },
  turnFxTextLong: { fontSize: 21, letterSpacing: 0.5 },
  turnCounter: {
    position: "absolute",
    top: 2,
    alignSelf: "center",
    zIndex: 6,
  },
  turnCounterText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffffcc",
    backgroundColor: "#00000055",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    letterSpacing: 1,
  },
  vsLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 85,
    backgroundColor: "#0b1226cc",
  },
  vsSide: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
  },
  vsSideMe: { bottom: "18%" },
  vsSideOpp: { top: "18%" },
  vsName: { fontSize: 30, fontWeight: "900", color: "#fff", maxWidth: "86%" },
  vsMark: {
    fontSize: 74,
    fontWeight: "900",
    color: "#ffd54d",
    textShadowColor: "#000",
    textShadowRadius: 12,
  },
  floatText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ff8a80",
    textShadowColor: "#000",
    textShadowRadius: 8,
  },
  thinkingWrap: { flexDirection: "row", alignItems: "center", gap: 2 },
  thinkingLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  thinkingDot: { fontSize: 8, color: colors.textMuted },
  hintButton: {
    position: "absolute",
    top: 6,
    left: 8,
    zIndex: 20,
    backgroundColor: "#00000033",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  hintBubble: {
    position: "absolute",
    top: 40,
    left: 8,
    right: 8,
    zIndex: 21,
    backgroundColor: "#fffbe8f2",
    borderWidth: 1.5,
    borderColor: "#e4a018",
    borderRadius: 10,
    padding: 10,
  },
  hintBubbleText: { fontSize: 14, fontWeight: "800", color: "#5a4a1a" },
  reconnectBand: {
    backgroundColor: "#d83030",
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 8,
    marginTop: 4,
  },
  reconnectText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  goldPulseBorder: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2.5,
    borderColor: "#ffd54d",
    borderRadius: 8,
    zIndex: 2,
  },
  flyLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 15,
  },
  impactRing: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    borderColor: "#ffd54d",
  },
  turnCar: { position: "absolute", bottom: 4, fontSize: 22, alignSelf: "center" },
  goldFlash: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: "#ffd54d",
    backgroundColor: "#ffd54d33",
    zIndex: 3,
  },
  bestBadge: {
    backgroundColor: "#fff7e0",
    borderWidth: 1.5,
    borderColor: "#e4a018",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  bestBadgeText: { fontSize: 13, fontWeight: "900", color: "#8a5a00" },
  resultScores: { alignSelf: "stretch", gap: 6 },
  resultScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  resultScoreRowMine: { borderWidth: 1.5, borderColor: colors.primary },
  resultScoreName: { width: 64, fontSize: 12, fontWeight: "800", color: colors.text },
  resultScoreBars: { flex: 1, gap: 3 },
  resultScoreBarWrap: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  resultScoreBar: { height: "100%", borderRadius: 3 },
  resultScoreNums: { fontSize: 12, fontWeight: "800", color: colors.text, width: 74, textAlign: "right" },
  wipeLayer: { ...StyleSheet.absoluteFill, zIndex: 90 },
  wipeHalf: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "51%",
    backgroundColor: "#0b1226",
  },
  wipeBeam: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignSelf: "center",
    width: 5,
    backgroundColor: "#fff7cc",
  },
  cpuSpeechBubble: {
    position: "absolute",
    top: 34,
    left: 8,
    zIndex: 30,
    maxWidth: 280,
    backgroundColor: "#ffffffee",
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    borderTopLeftRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cpuSpeechText: { fontSize: 13, fontWeight: "700", color: "#333" },
  vignetteTop: { position: "absolute", top: 0, left: 0, right: 0, height: 90 },
  vignetteBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 90 },
  vignetteLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: 46 },
  vignetteRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: 46 },
  milestonePop: {
    position: "absolute",
    bottom: "40%",
    alignSelf: "center",
    zIndex: 40,
    backgroundColor: "#fff7e0f2",
    borderWidth: 2,
    borderColor: "#e4a018",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  milestonePopText: { fontSize: 17, fontWeight: "900", color: "#8a5a00" },
  guideBubble: {
    position: "absolute",
    top: 46,
    alignSelf: "center",
    zIndex: 60,
    maxWidth: 340,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  guideBubbleText: { fontSize: 14, fontWeight: "700", color: colors.text, lineHeight: 20 },
  guideBubbleClose: { fontSize: 11, color: colors.textMuted, textAlign: "right" },
  fieldCaption: { fontSize: 9, color: colors.textMuted, marginTop: 2, minHeight: 11 },
  captionUp: { color: colors.success, fontWeight: "800" },
  captionDown: { color: colors.danger, fontWeight: "800" },
  emptyField: { color: colors.textMuted, fontSize: 12, paddingVertical: 24 },
  // ログの背景にうっすら敷く当校ロゴ
  logoWatermark: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -120,
    width: 240,
    height: 240,
    opacity: 0.08,
  },
  middle: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.boardCenter,
    // 中身が入りきらないときも、上下の盤面にはみ出して重ならないようにする
    overflow: "hidden",
  },
  battleBanner: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  battleText: { fontWeight: "700", color: colors.text },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: "100%",
  },
  statusBarMine: { backgroundColor: "#eaf7ee", borderColor: colors.success },
  statusBarOpponent: { backgroundColor: "#fdecec", borderColor: colors.danger },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusWho: { fontSize: 14, fontWeight: "900" },
  statusDetail: { fontSize: 12, color: colors.text, flexShrink: 1 },
  thinkingDots: { fontSize: 9, color: colors.danger, letterSpacing: 1 },
  bannerText: { fontSize: 16, fontWeight: "700", color: colors.text },
  log: { gap: 1, overflow: "hidden", flexShrink: 1 },
  logLine: { fontSize: 11, color: colors.textMuted },
  handArea: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hand: { gap: 6, alignItems: "center", paddingRight: 8 },
  // カードの下端に、使えない理由を短く重ねる
  handTag: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#16283cdd",
    paddingVertical: 2,
    alignItems: "center",
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  handTagText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  playableCard: {
    borderColor: colors.highlight,
    borderWidth: 2,
    borderRadius: 8,
    padding: 1,
  },
  tantouUsable: {
    borderColor: colors.highlight,
    borderWidth: 2,
    borderRadius: 8,
    padding: 1,
  },
  autoLightNote: {
    position: "absolute",
    top: 52,
    alignSelf: "center",
    backgroundColor: "#000000b0",
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    zIndex: 60,
  },
  autoLightNoteText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  signalBody: {
    flexDirection: "row",
    gap: 3,
    backgroundColor: "#222c38",
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  signalLamp: { width: 9, height: 9, borderRadius: 5 },
  mikiwameStamp: {
    marginTop: 8,
    borderWidth: 2.5,
    borderColor: "#1a5fb4",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 14,
    alignItems: "center",
    transform: [{ rotate: "-6deg" }],
    // 派手な背景の上でも読めるよう、白い紙に押した印にする
    backgroundColor: "#ffffffee",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  mikiwameText: { color: "#1a5fb4", fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  mikiwameGood: { color: "#1a5fb4", fontSize: 20, fontWeight: "900", letterSpacing: 4 },
  fuelWrap: { gap: 1 },
  fuelGauge: { flexDirection: "row", alignItems: "center", gap: 2 },
  fuelSeg: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: "#00000022",
  },
  fuelLabel: { fontSize: 8, fontWeight: "900", color: colors.textMuted },
  kenteiBoard: {
    alignSelf: "stretch",
    backgroundColor: "#fffdf4",
    borderWidth: 1.5,
    borderColor: "#c9b98a",
    borderRadius: 10,
    padding: 8,
    gap: 4,
  },
  kenteiBoardTitle: { fontSize: 10, fontWeight: "800", color: "#8a7a30", letterSpacing: 1 },
  kenteiBoardRow: { flexDirection: "row", justifyContent: "space-around" },
  kenteiBoardItem: { alignItems: "center", minHeight: 34 },
  kenteiBoardLabel: { fontSize: 11, fontWeight: "700", color: "#5a4a10" },
  kenteiBoardGrade: { fontSize: 14, fontWeight: "900", color: "#2f9e44" },
  kouhyouBox: {
    alignSelf: "stretch",
    backgroundColor: "#f6f2e8",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8cba8",
    padding: 10,
    gap: 3,
  },
  kouhyouLabel: { fontSize: 11, fontWeight: "800", color: "#8a7a30" },
  kouhyouText: { fontSize: 12, lineHeight: 19, color: "#4a3d10" },
  hankoWrap: { alignItems: "center", marginTop: 2, marginBottom: -2 },
  hanko: {
    borderWidth: 3,
    borderColor: "#d02020",
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: "#d0202008",
  },
  hankoRetry: { borderColor: "#b04030", backgroundColor: "#b0403008" },
  hankoText: { color: "#d02020", fontSize: 26, fontWeight: "900", letterSpacing: 6 },
  hankoTextRetry: { color: "#b04030", letterSpacing: 2 },
  hankoSub: { color: "#d02020aa", fontSize: 8, fontWeight: "700", marginTop: 1 },
  queueBadge: {
    position: "absolute",
    top: 4,
    left: 8,
    zIndex: 5,
    backgroundColor: "#4a148c",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  queueBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  rematchOfferText: { fontSize: 14, fontWeight: "900", color: "#c9971b", textAlign: "center" },
  rematchWaitText: { fontSize: 13, fontWeight: "800", color: colors.textMuted, textAlign: "center" },
  stampRow: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    gap: 6,
    zIndex: 8,
  },
  stampButton: {
    backgroundColor: "#ffffffdd",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  stampButtonEmoji: { fontSize: 17 },
  stampBubble: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 7,
    paddingHorizontal: 14,
    zIndex: 9,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  stampBubbleOpp: { top: 4, left: 10, borderColor: colors.danger },
  stampBubbleMine: { bottom: 46, right: 10, borderColor: colors.success },
  stampBubbleText: { fontSize: 15, fontWeight: "900", color: colors.text },
  titleBadge: {
    backgroundColor: "#c9971b",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  titleBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  replayBar: {
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    zIndex: 70,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  replayBadge: {
    backgroundColor: "#c9971b",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  replayBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  replayButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  replayButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  targetArrow: {
    position: "absolute",
    top: -20,
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "900",
    zIndex: 5,
    textShadowColor: "#000",
    textShadowRadius: 4,
  },
  battleResultScore: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "900",
    textShadowColor: "#000",
    textShadowRadius: 10,
  },
  battleResultVs: { fontSize: 20, color: "#ffffffaa" },
  recycleCard: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
  },
  reachLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8, 10, 30, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
  },
  reachBox: { alignItems: "center", gap: 10, paddingHorizontal: 24 },
  reachTitle: {
    fontSize: 44,
    fontWeight: "900",
    textShadowColor: "#000",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 2 },
  },
  // 「🏁 ラストバトル！！」は文字数が多いので、改行されないよう少し小さく
  reachTitleLong: { fontSize: 31 },
  reachSub: { color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center" },
  streakBanner: {
    backgroundColor: "#e2604a",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignSelf: "center",
  },
  streakBannerGold: { backgroundColor: "#c9971b" },
  streakBannerText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  matchFoundLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0b1024dd",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  matchFoundBox: { alignItems: "center", gap: 8, padding: 24 },
  matchFoundEmoji: { fontSize: 56 },
  matchFoundTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: colors.primary,
    textShadowRadius: 14,
  },
  matchFoundSub: { color: "#ffffffdd", fontSize: 15, fontWeight: "800" },
  autoButton: {
    position: "absolute",
    top: 4,
    right: 88,
    zIndex: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  autoButtonOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  autoTextOn: { color: "#fff" },
  settingsButton: {
    position: "absolute",
    top: 4,
    right: 8,
    zIndex: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  actionButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  actionButtonSmall: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#fff", fontWeight: "700" },
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000066",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  overlayBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    // 小さい画面でもボタンが画面外に出ないよう、箱自体は画面内に収める
    maxHeight: "100%",
    gap: 14,
    alignItems: "center",
    overflow: "hidden",
  },
  overlayBgLight: { backgroundColor: "#00000026" },
  overlayBoxTranslucent: { backgroundColor: colors.surface + "80", overflow: "hidden" },
  overlayScroll: { alignSelf: "stretch", flexShrink: 1 },
  overlayScrollInner: { gap: 14, alignItems: "center", paddingBottom: 4 },
  overlayTitle: { fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "center" },
  menuCardRow: { flexDirection: "row", gap: 10, alignSelf: "stretch", alignItems: "flex-start" },
  menuEffectText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    alignSelf: "stretch",
  },
  menuEffectFlex: { flex: 1, gap: 8 },
  menuStatsRow: { flexDirection: "row", gap: 6 },
  menuStatBadge: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    overflow: "hidden",
  },
  overlayCards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  overlayButtons: { gap: 10, alignSelf: "stretch" },
  jankenRow: { flexDirection: "row", gap: 12 },
  jankenButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 4,
  },
  jankenEmoji: { fontSize: 30 },
  jankenLabel: { color: "#fff", fontWeight: "700" },
  recordRow: { alignItems: "center", gap: 2 },
  recordSession: { fontSize: 18, fontWeight: "900", color: colors.text },
  recordText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  recordWin: { color: colors.success, fontSize: 20, fontWeight: "900" },
  recordLose: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  recordStreak: { fontSize: 14, fontWeight: "900", color: colors.accentDark },
  resultText: { textAlign: "center", color: colors.text, lineHeight: 22 },
});

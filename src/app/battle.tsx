import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DimensionValue,
  Dimensions,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  BounceIn,
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
import { pauseBgm, playBgm, playSe, stopBgm } from "@/audio/sound";
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
import { useSettingsStore } from "@/store/settingsStore";
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
  kind: "text" | "turn" | "battle" | "lesson" | "power" | "battleResult" | "recycle";
  text: string;
  cardId?: string;
  emph?: boolean;
  owner?: Owner;
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

  for (const e of events) {
    switch (e.type) {
      case "turnStarted":
        out.push({
          key: ++annSeq,
          kind: "turn",
          text: e.player === ME ? "あなたのターン" : `${oppLabel}のターン`,
          mine: e.player === ME,
        });
        break;
      // 誰の行動かはバッジで示すので、文章では繰り返さない
      case "instructorPlayed":
        if (e.player === OPP)
          add(`「${getCard(e.cardId).name}」を場に出した！`, e.cardId, false, "cpu");
        break;
      case "cardDrawn":
        // 自分のドローだけ公開（CPUの手札は非公開情報）
        if (e.player === ME && e.cardId)
          add(`「${getCard(e.cardId).name}」を引いた`, e.cardId, false, "self");
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
          add(`サポート「${getCard(e.cardId).name}」を使った！`, e.cardId, false, "cpu");
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
      case "trackAdvanced":
        // 進んだときも戻されたときも、全画面で大きく知らせる
        if (e.amount !== 0) {
          out.push({
            key: ++annSeq,
            kind: "lesson",
            text: "",
            mine: e.player === ME,
            track: e.track,
            amount: e.amount,
            newValue: e.newValue,
            goal: e.track === "academic" ? ACADEMIC_GOAL : SKILL_GOAL,
          });
        }
        break;
      case "jankenPlayed": {
        const humanWon = (e.owner === ME) === e.won;
        add(humanWon ? "じゃんけんに勝った！" : "じゃんけんに負けた…", undefined, true);
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
  return out;
}

export default function BattleScreen() {
  const router = useRouter();
  const view = useGameStore((s) => s.view);
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
  const jankenActive = useGameStore((s) => s.jankenActive);
  const replaySpeed = useGameStore((s) => s.replaySpeed);
  const setReplaySpeed = useGameStore((s) => s.setReplaySpeed);
  const isOnline = matchMode === "online";
  oppLabel = isOnline ? (opponentName ?? "相手") : "CPU";
  const difficulty = useSettingsStore((s) => s.difficulty);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const deckState = useDeckStore();
  const record = useRecordStore();

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [targetingUid, setTargetingUid] = useState<string | null>(null);
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
  const [currentAnn, setCurrentAnn] = useState<Announcement | null>(null);
  const bgmEnabled = useSettingsStore((s) => s.bgmEnabled);
  const seEnabled = useSettingsStore((s) => s.seEnabled);

  // 画面シェイク（退場・バトル解決時）＋ヒットストップの押し込み
  const shakeX = useSharedValue(0);
  const punch = useSharedValue(1);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { scale: punch.value }],
  }));

  // リーチ演出（学科技能の残りが合計2時限以下になった瞬間）
  const [reachFx, setReachFx] = useState<{ mine: boolean } | null>(null);
  const [reachOn, setReachOn] = useState(false);
  // 実況の表示時間の計算から参照する（effectの再実行を増やさないためref越し）
  const reachOnRef = useRef(false);
  reachOnRef.current = reachOn;

  // CPUの口上セリフ（CPU対戦のみ。リプレイ観戦では出さない）
  const [cpuSpeech, setCpuSpeech] = useState<string | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (lines: readonly string[]) => {
    if (isOnline || replayActive) return;
    setCpuSpeech(pickLine(lines));
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
    const t = setTimeout(() => say(CPU_LINES.start), 1600);
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
  const [pendingReach, setPendingReach] = useState<{ mine: boolean } | null>(null);
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
    // 決着したら、たまっていた実況・演出をすべて捨てて勝敗の演出だけを見せる
    if (lastEvents.some((e) => e.type === "gameEnded")) {
      setAnnQueue([]);
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
    if (meReach && !reachShown.current.me) {
      reachShown.current.me = true;
      setPendingReach({ mine: true });
      say(CPU_LINES.playerReach);
    } else if (oppReach && !reachShown.current.opp) {
      reachShown.current.opp = true;
      setPendingReach({ mine: false });
      say(CPU_LINES.cpuReach);
    }
    if (!meReach) reachShown.current.me = false;
    if (!oppReach) reachShown.current.opp = false;
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
    const t = setTimeout(() => setReachFx(null), 2000);
    return () => clearTimeout(t);
  }, [reachFx]);

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
  const dismissAnn = useCallback(() => {
    if (annTimer.current) {
      clearTimeout(annTimer.current);
      annTimer.current = null;
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
    // カード付きの実況はタップするまで表示したままにする（読み逃し防止）。
    // ただし自動プレイ中とオンライン対戦では、少し見せてから自動で進める
    // （オンラインで止めると相手を待たせてしまうため）
    if (!next.cardId || autoPlay || isOnline) {
      annTimer.current = setTimeout(
        () => {
          annTimer.current = null;
          setCurrentAnn(null);
        },
        next.kind === "turn"
          ? 900
          : next.kind === "battleResult" && reachOnRef.current
            ? 3700 // ラストバトルはカウントアップの分だけ長く見せる
            : next.kind === "battle" || next.kind === "battleResult"
            ? 2400
            : next.kind === "lesson" || next.kind === "power" || next.kind === "recycle"
              ? 2000
              : next.cardId
                ? 1600
                : next.emph
                  ? 1300
                  : 850
      );
    }
  }, [currentAnn, annQueue, autoPlay, isOnline]);

  useEffect(
    () => () => {
      if (annTimer.current) clearTimeout(annTimer.current);
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
    if (outs.length > 0) setPendingOuts((q) => [...q, ...outs]);
  }, [lastEvents]);
  useEffect(() => {
    if (pendingOuts.length === 0 || busy || outFx) return;
    setOutFx({ key: Date.now(), cards: pendingOuts });
    setPendingOuts([]);
  }, [pendingOuts, busy, outFx]);

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
    if (!pendingDraw || busy || drawFx) return;
    setDrawFx({ key: Date.now(), cardId: pendingDraw });
    setPendingDraw(null);
    // 引いたカードは右端に加わる。隠れないよう手札を送る
    setTimeout(() => handScroll.current?.scrollToEnd({ animated: true }), 120);
  }, [pendingDraw, busy, drawFx]);

  // BGM: ふだんは bgm_main、バトルの流れ（いざ勝負！〜サポート）の間は bgm_battle、
  // リーチ中は bgm_reach、対戦が終わったら勝敗に応じたリザルト曲。
  // 勝敗のカットイン中はBGMを止めて勝敗の効果音だけを響かせる
  const battleResultCutinShowing = currentAnn?.kind === "battleResult";
  const battleBgmOn =
    !battleResultCutinShowing &&
    (view?.phase.type === "battleSupport" ||
      currentAnn?.kind === "battle" ||
      annQueue.some((a) => a.kind === "battle" || a.kind === "battleResult"));
  const finishedOutcome =
    view?.phase.type === "finished" && !replayActive
      ? view.phase.winner === ME
        ? "win"
        : "lose"
      : null;
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
      // 対戦が終わった瞬間にリーチ曲などを止めて勝敗の効果音を響かせ、
      // 鳴り終わるのを待ってからリザルト曲を流す
      pauseBgm();
      const t = setTimeout(() => {
        if (!playBgm(finishedOutcome === "win" ? "bgm_result_win" : "bgm_result_lose")) pauseBgm();
      }, 1200);
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
      // リーチBGMも効果音設定に連動
      if (!playBgm("bgm_reach") && !playBgm("bgm_main")) pauseBgm();
      return;
    }
    // 演出の切り替わりの一瞬の隙間でメイン曲に戻らないよう、少し待ってから戻す
    const t = setTimeout(() => {
      // BGM設定がオフならメイン曲は流さず、鳴りっぱなしの戦闘系BGMだけ止める
      if (!playBgm("bgm_main")) pauseBgm();
    }, 350);
    return () => clearTimeout(t);
  }, [bgmEnabled, seEnabled, battleBgmOn, battleResultCutinShowing, finishedOutcome, reachOn, jankenActive]);
  useEffect(() => () => stopBgm(), []);

  // 決着時のCPUのひとこと（勝てば称賛、負ければ励まし）
  useEffect(() => {
    if (!finishedOutcome) return;
    say(finishedOutcome === "win" ? CPU_LINES.cpuLose : CPU_LINES.cpuWin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedOutcome]);

  const legal = useMemo(
    () => (view ? getLegalActionsFromView(ctx, view) : []),
    [view]
  );

  // 開幕（と引き直し）に、山札から手札を配る演出
  const [dealing, setDealing] = useState<{ key: number; cards: string[] } | null>(null);
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

  const me = view.self;
  const cpu = view.opponent;
  const isMyMain = view.phase.type === "main" && view.turnPlayer === ME;
  const actor = playerToActFromView(view);

  const can = (pred: (a: GameAction) => boolean) => legal.some(pred);
  const doAction = (action: GameAction) => {
    setSelectedUid(null);
    setTargetingUid(null);
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
            {isOnline ? (opponentName ?? "相手") : `CPU ${aiThinking ? "🤔" : ""}`}
          </Text>
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
          view={view}
          player={OPP}
          field={cpu.field}
          highlightUids={targetingUid ? battleTargets(targetingUid) : new Set()}
          highlightColor={colors.target}
          onPress={(uid) => {
            if (targetingUid && battleTargets(targetingUid).has(uid)) {
              doAction({
                type: "declareBattle",
                player: ME,
                attackerUid: targetingUid,
                defenderUid: uid,
              });
            } else if (!targetingUid) {
              const inst = cpu.field.find((f) => f.uid === uid);
              if (inst) setDetailCardId(inst.cardId, "cpu");
            }
          }}
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
        {/* オンライン: 定型スタンプの送信ボタンと吹き出し */}
        {isOnline && (
          <View style={styles.stampRow}>
            {STAMPS.map((s) => (
              <Pressable
                key={s.id}
                style={styles.stampButton}
                onPress={() => {
                  haptic("light");
                  sendStamp(s.id);
                }}
              >
                <Text style={styles.stampButtonEmoji}>{s.emoji}</Text>
              </Pressable>
            ))}
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
            <Text style={styles.battleText}>バトルする相手（休憩中）を選んでください</Text>
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
            <View
              style={[
                styles.statusDot,
                { backgroundColor: status.mine ? colors.success : colors.danger },
              ]}
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
          view={view}
          player={ME}
          field={me.field}
          highlightUids={
            new Set(me.field.filter((f) => instActions(f.uid).length > 0).map((f) => f.uid))
          }
          highlightColor={colors.highlight}
          selectedUid={selectedUid}
          onPress={(uid) => {
            if (instActions(uid).length > 0) {
              setSelectedUid(uid);
              setTargetingUid(null);
            } else {
              const inst = me.field.find((f) => f.uid === uid);
              if (inst) setDetailCardId(inst.cardId, "self");
            }
          }}
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
            {/* 担当カードはタップすると拡大表示。そこから力を使う */}
            <CardFace
              cardId={me.tantou}
              size="sm"
              onPress={() => setDetailCardId(me.tantou, "self")}
            />
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
        <ScrollView
          ref={handScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hand}
        >
          {me.hand.map((cardId, i) => {
            const playable = handActionFor(i) !== null;
            return (
              <Animated.View key={`${cardId}-${i}`} entering={FadeInDown.duration(250)}>
                {/* 出せるカードはゆっくり浮き沈みして、目で追えるようにする */}
                <FloatIdle active={playable} offset={i}>
                  <View style={playable ? styles.playableCard : undefined}>
                    <CardFace
                      cardId={cardId}
                      size="md"
                      dimmed={!playable && (isMyMain || view.phase.type === "battleSupport")}
                      onPress={() => setPreviewHandIndex(i)}
                    />
                    {(() => {
                      const tag = handTagFor(i);
                      if (!tag) return null;
                      return (
                        <View style={styles.handTag} pointerEvents="none">
                          <Text style={styles.handTagText} numberOfLines={1}>
                            {tag}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </FloatIdle>
              </Animated.View>
            );
          })}
          {me.hand.length === 0 && <Text style={styles.infoText}>手札がありません</Text>}
        </ScrollView>
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
          onDone={() => setDealing(null)}
        />
      )}

      {/* ===== 実況表示: カード付きは大きく詳細表示（タップで次へ） ===== */}
      {currentAnn && view.phase.type !== "finished" && (
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
              <Text style={styles.turnFxText}>{currentAnn.text}</Text>
            </Animated.View>
          ) : currentAnn.cardId ? (
            <Animated.View
              key={currentAnn.key}
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(200)}
              style={styles.annCardBox}
            >
              {currentAnn.owner && <OwnerBadge owner={currentAnn.owner} />}
              <Text style={styles.annCardTitle}>{currentAnn.text}</Text>
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
              <Text style={styles.annBigText}>{currentAnn.text}</Text>
            </Animated.View>
          ) : (
            <Animated.View
              key={currentAnn.key}
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(200)}
              style={styles.annBox}
            >
              <Text style={styles.annText}>{currentAnn.text}</Text>
            </Animated.View>
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
            <Text style={styles.replayBadgeText}>▶ リプレイ再生中</Text>
          </View>
          <Pressable
            style={styles.replayButton}
            onPress={() => setReplaySpeed(replaySpeed === 1 ? 2 : 1)}
          >
            <Text style={styles.replayButtonText}>{replaySpeed === 1 ? "×1" : "×2"} 速さ</Text>
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
      {reachFx && <ReachCutIn mine={reachFx.mine} oppName={oppLabel} />}
      {/* リーチ中は画面のフチが赤く脈動する */}
      {reachOn && view.phase.type !== "finished" && <ReachVignette />}
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

      {view.phase.type === "mulligan" && !me.mulliganDecided && !dealing && !autoPlay && (
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
              onPress={() => doAction({ type: "mulligan", player: ME, redraw: true })}
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

      {/* 実況・ドロー演出が残っている間は出さない（カード記載の順どおりに見せる） */}
      {humanChoice && !busy && !drawFx && !autoPlay && (
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

      {revealedHand && !busy && !drawFx && (
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

      {view.phase.type === "finished" && view.phase.winner === ME && (
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
        </>
      )}

      {/* 敗北: 画面が暗く沈み、雨が降り、カードが力なく落ちていく */}
      {view.phase.type === "finished" && view.phase.winner === OPP && (
        <LossScene cardIds={[...me.hand, ...me.field.map((f) => f.cardId), me.tantou]} />
      )}

      {view.phase.type === "finished" && (
        <Overlay
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
          {/* 連勝の勢いを見せる（3連勝で炎、5連勝で金） */}
          {view.phase.winner === ME && record.streak >= 3 && (
            <View
              style={[
                styles.streakBanner,
                record.streak >= 5 && styles.streakBannerGold,
              ]}
            >
              <Text style={styles.streakBannerText}>
                {record.streak >= 5 ? "👑" : "🔥"} {record.streak}連勝中！
                {record.streak >= 5 ? " 無敵の勢い！" : " ノリにノってる！"}
              </Text>
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
            {!isOnline && !replayActive && (
              <ActionButton label="もう一度遊ぶ" color={colors.primary} onPress={rematch} />
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

function FieldRow({
  view,
  player,
  field,
  highlightUids,
  highlightColor,
  selectedUid,
  onPress,
}: {
  view: PlayerView;
  player: 0 | 1;
  field: InstructorOnField[];
  highlightUids: Set<string>;
  highlightColor: string;
  selectedUid?: string | null;
  onPress: (uid: string) => void;
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
                {/* 元気なカードはゆっくり呼吸するように揺れる */}
                <Breathe active={!inst.rested}>
                  <CardFace cardId={inst.cardId} size="sm" dimmed={inst.actedThisTurn && !inst.rested} />
                </Breathe>
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
}

/** CPUの思考中を示す、ゆっくり明滅する点 */
/**
 * バトル勝敗の全画面カットイン。
 * 勝ち: 祝福背景に「バトル勝利！」／負け: 沈む闇に「バトル敗北…」／相打ちは激突背景
 */
function BattleResultCutIn({
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
  const [reveal, setReveal] = useState(!deciding);
  const [shown, setShown] = useState<{ atk: number; def: number }>(
    deciding ? { atk: 0, def: 0 } : { atk, def }
  );
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 140 });
    const revealFx = () => {
      playSe(tie ? "battle_tie" : mine ? "battle_win" : "battle_lose");
      haptic(tie ? "heavy" : mine ? "success" : "warning");
      scale.value = withSequence(
        withTiming(1.15, { duration: 200, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 150 })
      );
    };
    if (!deciding) {
      revealFx();
      return;
    }
    // ラストバトル: ドラムロールとともに両者の戦闘力がカウントアップし、出そろってから決着
    playSe("battle");
    haptic("heavy");
    scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    const steps = 9;
    let i = 0;
    const tick = setInterval(() => {
      i++;
      setShown({
        atk: Math.min(atk, Math.round((atk * i) / steps)),
        def: Math.min(def, Math.round((def * i) / steps)),
      });
      playSe("tap");
      haptic("light");
    }, 110);
    const done = setTimeout(() => {
      clearInterval(tick);
      setShown({ atk, def });
      setReveal(true);
      revealFx();
    }, 110 * steps + 260);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const bg = !reveal
    ? require("../../assets/images/fx/fx_battle.webp")
    : tie
      ? require("../../assets/images/fx/fx_battle.webp")
      : mine
        ? require("../../assets/images/fx/fx_victory.webp")
        : require("../../assets/images/fx/fx_down.webp");
  const title = !reveal
    ? "🏁 ラストバトル！！"
    : tie
      ? "⚡ 相打ち！"
      : mine
        ? "🔥 バトル勝利！"
        : "💥 バトル敗北…";
  const color = !reveal ? "#ffd54d" : tie ? "#8fd3ee" : mine ? "#ffd54d" : "#90a4c8";
  return (
    <View style={styles.reachLayer} pointerEvents="none">
      <Image source={bg} style={[StyleSheet.absoluteFill, { opacity: 0.85 }]} contentFit="cover" />
      <Animated.View style={[styles.reachBox, box]}>
        <Text style={[styles.reachTitle, { color }]} allowFontScaling={false}>
          {title}
        </Text>
        <Text style={styles.battleResultScore} allowFontScaling={false}>
          {shown.atk} <Text style={styles.battleResultVs}>vs</Text> {shown.def}
        </Text>
        <Text style={styles.reachSub}>
          {!reveal
            ? "勝敗の行方は…！？"
            : tie
              ? "両者のインストラクターが場外へ！"
              : mine
                ? "相手のインストラクターを場外に追いやった！"
                : "インストラクターが場外へ送られた…"}
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
    scale.value = withSequence(
      withTiming(1.15, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 150 })
    );
    opacity.value = withTiming(1, { duration: 150 });
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 350 }), withTiming(0.4, { duration: 350 })),
      -1
    );
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
      <Animated.View style={[styles.reachBox, box]}>
        <Animated.Text style={[styles.reachTitle, { color }, glowStyle]} allowFontScaling={false}>
          {mine ? "⚡ リーチ！" : "⚠️ 相手がリーチ！"}
        </Animated.Text>
        <Text style={styles.reachSub}>
          {mine
            ? "あと少しで卒業！このまま勝ち切ろう！"
            : `${oppName}が卒業目前！追い上げよう！`}
        </Text>
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
  const blink = useSharedValue(1);
  useEffect(() => {
    if (low) {
      blink.value = withRepeat(
        withSequence(withTiming(0.35, { duration: 450 }), withTiming(1, { duration: 450 })),
        -1
      );
    } else {
      blink.value = 1;
    }
  }, [low, blink]);
  const style = useAnimatedStyle(() => ({ opacity: blink.value }));
  return (
    <Animated.Text style={[baseStyle, style, low && { color: colors.danger, fontWeight: "900" }]}>
      {low ? "⚠️ " : ""}山札 {count}
      {suffix}
    </Animated.Text>
  );
}

function ThinkingDots() {
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
function BattleCutIn({
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
  const slashA = useSharedValue(0);
  const slashB = useSharedValue(0);
  const cardL = useSharedValue(0);
  const cardR = useSharedValue(0);
  const pop = useSharedValue(0);
  const clash = useSharedValue(0);

  useEffect(() => {
    playSe("battle");
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
    ],
  }));
  const cardRStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cardR.value * 2),
    transform: [
      { translateX: (1 - cardR.value) * 320 - clash.value * 8 },
      { rotate: `${8 + (1 - cardR.value) * 14}deg` },
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
}: {
  mine: boolean;
  track: Track;
  amount: number;
  newValue: number;
  goal: number;
}) {
  const gained = amount > 0;
  const pop = useSharedValue(0);
  const run = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    playSe(gained ? "advance" : "hit");
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
    transform: [{ scale: 0.4 + pop.value * 0.6 }, { translateX: shake.value }],
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
          {gained
            ? `${TRACK_LABEL[track]}教習が ${newValue}/${goal} まで進んだ！`
            : `${TRACK_LABEL[track]}教習が ${newValue}/${goal} に戻された…`}
        </Text>
      </Animated.View>
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
  const p = useSharedValue(0);

  // 画面中央からの差分で着地点を決める
  const win = Dimensions.get("window");
  const dx = target ? target.x - win.width / 2 : -130;
  const dy = target ? target.y - win.height / 2 : mine ? 210 : -260;

  useEffect(() => {
    playSe("hit");
    p.value = withDelay(
      index * 220,
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.cubic) })
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

  return (
    <View style={styles.outFxCenter} pointerEvents="none">
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
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {cardIds.map((id, i) => (
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
function ReachVignette() {
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
      <LinearGradient
        colors={["#d83030aa", "transparent"]}
        style={styles.vignetteTop}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <LinearGradient
        colors={["transparent", "#d83030aa"]}
        style={styles.vignetteBottom}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <LinearGradient
        colors={["#d8303077", "transparent"]}
        style={styles.vignetteLeft}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
      />
      <LinearGradient
        colors={["transparent", "#d8303077"]}
        style={styles.vignetteRight}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
      />
    </Animated.View>
  );
}

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
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  entering?: "bounce" | "zoom";
}) {
  return (
    <Animated.View style={styles.overlayBg} entering={FadeIn.duration(150)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        style={styles.overlayBox}
        entering={entering === "bounce" ? BounceIn.duration(500) : ZoomIn.duration(200)}
      >
        <Text style={styles.overlayTitle}>{title}</Text>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  turnFxText: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 2,
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
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
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
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
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
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
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
    gap: 14,
    alignItems: "center",
  },
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

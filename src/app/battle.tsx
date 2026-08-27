import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DimensionValue,
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
import { playBgm, playSe, stopBgm } from "@/audio/sound";
import { haptic } from "@/audio/haptics";
import { CardDetail } from "@/components/CardDetail";
import { cardRegistry, getCard } from "@/data/cards";
import { GameEvent, Track } from "@/engine/types";
import { effectiveCombat, effectiveLesson } from "@/engine/effects";
import { getLegalActions } from "@/engine/legalActions";
import {
  ACADEMIC_GOAL,
  GameAction,
  GameState,
  InstructorOnField,
  SKILL_GOAL,
} from "@/engine/types";
import { playerToAct } from "@/engine/reducer";
import { CardFace } from "@/components/CardFace";
import { TrackBar } from "@/components/TrackBar";
import { eventText } from "@/components/eventText";
import { hintFor } from "@/tutorial/hints";
import { viewFor } from "@/engine/view";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { CPU, HUMAN, useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";

const ctx = { defs: cardRegistry };

const TRACK_LABEL: Record<Track, string> = { academic: "学科", skill: "技能" };

/** カードの持ち主（拡大表示のバッジに使う） */
type Owner = "self" | "cpu";

/**
 * 中央に出す演出は種類が違っても必ずこのキューを通す。
 * 別々のタイマーで動かすと、ターン帯・実況・教習が同時に出て読めなくなるため。
 */
interface Announcement {
  key: number;
  /** "turn" は画面を横切る帯、"text" は実況（カード付きはタップ待ち） */
  kind: "text" | "turn";
  text: string;
  cardId?: string;
  emph?: boolean;
  owner?: Owner;
  /** kind === "turn" のとき、自分の番かどうか */
  mine?: boolean;
}

let annSeq = 0;

const ownerOf = (player: number): Owner => (player === HUMAN ? "self" : "cpu");

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

/** イベント列から実況表示を組み立てる */
function announcementsFor(events: GameEvent[]): Announcement[] {
  const out: Announcement[] = [];
  const add = (text: string, cardId?: string, emph?: boolean, owner?: Owner) =>
    out.push({ key: ++annSeq, kind: "text", text, cardId, emph, owner });

  for (const e of events) {
    switch (e.type) {
      case "turnStarted":
        out.push({
          key: ++annSeq,
          kind: "turn",
          text: e.player === HUMAN ? "あなたのターン" : "CPUのターン",
          mine: e.player === HUMAN,
        });
        break;
      // 誰の行動かはバッジで示すので、文章では繰り返さない
      case "instructorPlayed":
        if (e.player === CPU)
          add(`「${getCard(e.cardId).name}」を場に出した！`, e.cardId, false, "cpu");
        break;
      case "cardDrawn":
        // 自分のドローだけ公開（CPUの手札は非公開情報）
        if (e.player === HUMAN && e.cardId)
          add(`「${getCard(e.cardId).name}」を引いた`, e.cardId, false, "self");
        break;
      case "instructorActed":
        if (e.player === CPU) {
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
        if (e.player === CPU)
          add(`サポート「${getCard(e.cardId).name}」を使った！`, e.cardId, false, "cpu");
        break;
      case "abilityActivated":
        if (e.player === CPU)
          add(`「${getCard(e.cardId).name}」の力を使った！`, e.cardId, false, "cpu");
        break;
      case "battleDeclared":
        add(e.attackerPlayer === CPU ? "CPUがバトルを仕掛けた！" : "バトル開始！", undefined, true);
        break;
      case "trackAdvanced":
        if (e.player === HUMAN && e.amount < 0) {
          add(`あなたの${TRACK_LABEL[e.track]}が ${-e.amount}時限 戻された！`, undefined, true);
        }
        break;
      case "jankenPlayed": {
        const humanWon = (e.owner === HUMAN) === e.won;
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
        if (e.player === CPU)
          add(`場外から「${getCard(e.cardId).name}」を回収した`, e.cardId, false, "cpu");
        break;
      case "battleResolved":
        add(`バトル解決！ ${e.attackerTotal} vs ${e.defenderTotal}`, undefined, true);
        break;
      case "supportsRecycled":
        if (e.player === CPU) add(`CPUがサポート${e.count}枚を山札に戻した`);
        break;
    }
  }
  return out;
}

export default function BattleScreen() {
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const quitGame = useGameStore((s) => s.quitGame);
  const eventLog = useGameStore((s) => s.eventLog);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const startGame = useGameStore((s) => s.startGame);
  const setPresentationBusy = useGameStore((s) => s.setPresentationBusy);
  const tutorial = useGameStore((s) => s.tutorial);
  const difficulty = useSettingsStore((s) => s.difficulty);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const deckState = useDeckStore();

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

  // 画面シェイク（退場・バトル解決時）
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  // バトル解決・退場のときに画面全体を一瞬光らせる
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  // イベント → 実況キュー＋シェイク
  useEffect(() => {
    const anns = announcementsFor(lastEvents);
    if (anns.length > 0) setAnnQueue((q) => [...q, ...anns]);
    // 出来事に応じて振動で手応えを返す
    for (const e of lastEvents) {
      if (e.type === "gameEnded") haptic(e.winner === HUMAN ? "success" : "error");
      else if (e.type === "instructorRemoved") haptic("heavy");
      else if (e.type === "battleDeclared") haptic("heavy");
      else if (e.type === "instructorPlayed") haptic("medium");
      else if (e.type === "jankenPlayed") haptic((e.owner === HUMAN) === e.won ? "success" : "warning");
      else if (e.type === "trackAdvanced" && e.player === HUMAN && e.amount < 0) haptic("warning");
    }
    if (lastEvents.some((e) => e.type === "instructorRemoved" || e.type === "battleResolved")) {
      shakeX.value = withSequence(
        withTiming(-9, { duration: 55 }),
        withTiming(8, { duration: 55 }),
        withTiming(-6, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 45 })
      );
      // 衝撃の白フラッシュ
      flash.value = withSequence(
        withTiming(0.55, { duration: 60 }),
        withTiming(0, { duration: 320 })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);

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
    // カード付きの実況はタップするまで表示したままにする（読み逃し防止）
    if (!next.cardId) {
      annTimer.current = setTimeout(
        () => {
          annTimer.current = null;
          setCurrentAnn(null);
        },
        next.kind === "turn" ? 750 : 850
      );
    }
  }, [currentAnn, annQueue]);

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

  // 山札から1枚引いたときの演出。実況とぶつからないよう、実況が捌けてから出す
  // 読み終えたヒント。盤面が変わって別の内容になれば、また出す
  const [readHint, setReadHint] = useState<string | null>(null);
  const [pendingDraw, setPendingDraw] = useState<string | null>(null);
  const [drawFx, setDrawFx] = useState<{ key: number; cardId: string } | null>(null);
  const handScroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (!state || state.phase.type === "mulligan") return;
    const drawn = lastEvents.find(
      (e) => e.type === "cardDrawn" && e.player === HUMAN && e.cardId
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

  // 対戦中BGM（bgm_battle が無ければ bgm_main）
  useEffect(() => {
    if (bgmEnabled) {
      // bgm_battle が無ければ bgm_main にフォールバック
      if (!playBgm("bgm_battle")) playBgm("bgm_main");
    } else {
      stopBgm();
    }
    return () => stopBgm();
  }, [bgmEnabled]);

  const legal = useMemo(
    () => (state ? getLegalActions(ctx, state, HUMAN) : []),
    [state]
  );

  // 開幕（と引き直し）に、山札から手札を配る演出
  const [dealing, setDealing] = useState<{ key: number; cards: string[] } | null>(null);
  const dealtRef = useRef("");
  useEffect(() => {
    if (!state || state.phase.type !== "mulligan") return;
    const me = state.players[HUMAN];
    if (me.mulliganDecided) return;
    const sig = me.hand.join(",");
    if (dealtRef.current === sig) return;
    dealtRef.current = sig;
    setDealing({ key: Date.now(), cards: [...me.hand] });
  }, [state]);

  // 練習対戦のヒント（盤面から判断して出すので、台本に依存せず壊れにくい）
  const hint = useMemo(() => {
    if (!tutorial || !state) return null;
    const view = viewFor(state, HUMAN);
    const myTurnCount = Math.ceil(state.turnNumber / 2);
    return hintFor(cardRegistry, view, legal, { myTurnCount });
  }, [tutorial, state, legal]);


  // 瀧本などで相手の手札が公開されたらオーバーレイ表示
  useEffect(() => {
    for (const e of lastEvents) {
      if (e.type === "handRevealed" && e.player === CPU) {
        setRevealedHand(e.cardIds);
      }
    }
  }, [lastEvents]);

  if (!state) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.bannerText}>対局がありません</Text>
          <ActionButton label="ホームへ" color={colors.primary} onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  const me = state.players[HUMAN];
  const cpu = state.players[CPU];
  const isMyMain = state.phase.type === "main" && state.turnPlayer === HUMAN;
  const actor = playerToAct(state);

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

    if (state.phase.type === "battleSupport") {
      if (def.type === "instructor") return "バトル後";
      if (def.timing === "main") return "自分の番用";
      return null;
    }
    if (state.turnPlayer !== HUMAN) return null;
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

    if (state.phase.type === "mulligan") return "対戦の準備中です。手札を決めてから使えます。";
    if (state.phase.type === "finished") return "対戦は終わりました。";
    if (state.phase.type === "choice") return "先に、表示されている選択を済ませてください。";

    if (state.phase.type === "battleSupport") {
      if (def.type === "instructor") {
        return "バトル中はインストラクターを場に出せません。バトルが終わってから出せます。";
      }
      if (def.timing === "main") return "このサポートカードは、自分の番にだけ使えます（バトル中は使えません）。";
      if (!battleInfo?.myPriority) return "いまは相手がサポートカードを使う番です。少し待ってください。";
      return "このバトルではサポートカードを使えません（相手の効果で封じられています）。";
    }

    // メインフェイズ
    if (state.turnPlayer !== HUMAN) return "いまは相手の番です。自分の番になるまで待ちましょう。";
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
    if (state.phase.type !== "battleSupport") return null;
    const b = state.phase.battle;
    const atkInst = state.players[b.attackerPlayer].field.find((f) => f.uid === b.attackerUid);
    const defInst = state.players[1 - b.attackerPlayer].field.find((f) => f.uid === b.defenderUid);
    if (!atkInst || !defInst) return null;
    const buff = (p: number) =>
      b.buffs.filter((x) => x.player === p).reduce((a, x) => a + x.amount, 0);
    return {
      attackerName: getCard(atkInst.cardId).name,
      defenderName: getCard(defInst.cardId).name,
      attackerCardId: atkInst.cardId,
      defenderCardId: defInst.cardId,
      attackerIsCpu: b.attackerPlayer === CPU,
      attackerTotal:
        effectiveCombat(ctx, state, b.attackerPlayer, atkInst) + buff(b.attackerPlayer),
      defenderTotal:
        effectiveCombat(ctx, state, (1 - b.attackerPlayer) as 0 | 1, defInst) +
        buff(1 - b.attackerPlayer),
      myPriority: b.priority === HUMAN,
    };
  })();

  const allLogLines = eventLog
    .map((e) => eventText(e, HUMAN))
    .filter((t): t is string => t !== null);
  // 中央エリアは高さが限られるので、直近3件だけ出す（全文は「すべてのログを見る」）
  const logLines = allLogLines.slice(-3);

  const humanChoice =
    state.phase.type === "choice" && state.phase.pending.player === HUMAN
      ? state.phase.pending
      : null;

  /** 誰の番か・何をすべきかを、色つきの帯で示す */
  const status = (() => {
    if (state.phase.type === "finished") {
      return { who: "対戦終了", detail: "", mine: false, waiting: false };
    }
    if (actor === CPU || aiThinking) {
      return { who: "CPUの番", detail: "考えています…", mine: false, waiting: true };
    }
    if (state.phase.type === "mulligan") {
      return { who: "あなたの番", detail: "手札を確認してください", mine: true, waiting: false };
    }
    if (state.phase.type === "battleSupport") {
      return battleInfo?.myPriority
        ? {
            who: "あなたの番",
            detail: "サポートカードや担当の力を使えます",
            mine: true,
            waiting: false,
          }
        : { who: "CPUの番", detail: "相手の応答を待っています", mine: false, waiting: true };
    }
    if (state.phase.type === "choice") {
      return { who: "あなたの番", detail: "カードを選んでください", mine: true, waiting: false };
    }
    if (isMyMain) {
      return { who: "あなたの番", detail: "行動を選びましょう", mine: true, waiting: false };
    }
    return null;
  })();

  const rematch = () => {
    const deck = resolveActiveDeck(deckState);
    startGame({
      playerDeck: deck.list,
      cpuDeck: cpuDeckFor(deck, deckState.builtinOverrides).list,
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
          <Text style={styles.playerLabel}>CPU {aiThinking ? "🤔" : ""}</Text>
          <Text style={styles.infoText}>手札 {cpu.hand.length}</Text>
          <Text style={styles.infoText}>山札 {cpu.deck.length}</Text>
          <Pressable onPress={() => setPileView("cpuOutOfPlay")} hitSlop={6}>
            <Text style={styles.infoLink}>場外 {cpu.outOfPlay.length} ▸</Text>
          </Pressable>
          <CardFace cardId={cpu.tantou} size="sm" onPress={() => setDetailCardId(cpu.tantou, "cpu")} />
        </View>
        <TrackBar label="学科" kind="academic" value={cpu.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" kind="skill" value={cpu.skill} goal={SKILL_GOAL} color={colors.success} />
        <FieldRow
          state={state}
          player={CPU}
          field={cpu.field}
          highlightUids={targetingUid ? battleTargets(targetingUid) : new Set()}
          highlightColor={colors.target}
          onPress={(uid) => {
            if (targetingUid && battleTargets(targetingUid).has(uid)) {
              doAction({
                type: "declareBattle",
                player: HUMAN,
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
        {/* 設定画面へ（対戦をやめる操作もそこから行う）。手札に重ならないよう中央エリアの右上に置く */}
        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={8}
          style={styles.settingsButton}
        >
          <Text style={styles.settingsText}>⚙️ 設定</Text>
        </Pressable>
        {battleInfo && (
          <Animated.View entering={ZoomIn.duration(250)} style={styles.battleBanner}>
            <View style={styles.battleRow}>
              <Animated.View entering={SlideInLeft.duration(320)} style={styles.battleSide}>
                <CardFace cardId={battleInfo.attackerCardId} size="md" />
                <Text style={styles.battleSideLabel}>
                  {battleInfo.attackerIsCpu ? "CPU" : "あなた"}・アタック
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
                  {battleInfo.attackerIsCpu ? "あなた" : "CPU"}・ディフェンス
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
          {logLines.slice(0, -1).map((line, i) => (
            <Text key={`${i}-${line}`} style={styles.logLine} numberOfLines={1}>
              {line}
            </Text>
          ))}
          {logLines.length > 0 && (
            <LatestLogLine key={allLogLines.length} text={logLines[logLines.length - 1]} />
          )}
        </View>
      </View>

      {/* ===== 自分エリア ===== */}
      <View style={[styles.zone, { backgroundColor: colors.boardSelf, borderTopColor: colors.boardSelfEdge }]}>
        <FieldRow
          state={state}
          player={HUMAN}
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
        <TrackBar label="学科" kind="academic" value={me.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" kind="skill" value={me.skill} goal={SKILL_GOAL} color={colors.success} />
        <View style={styles.infoRow}>
          <Text style={styles.playerLabel}>あなた</Text>
          {/* 山札・場外はタップで中身を確認できる */}
          <Pressable onPress={() => setPileView("deck")} hitSlop={6}>
            <Text style={styles.infoLink}>山札 {me.deck.length} ▸</Text>
          </Pressable>
          <Pressable onPress={() => setPileView("outOfPlay")} hitSlop={6}>
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
              onPress={() => doAction({ type: "passSupport", player: HUMAN })}
            />
          )}
          <ActionButton
            label="ターン終了"
            color={can((a) => a.type === "endTurn") ? colors.accent : colors.border}
            onPress={() =>
              can((a) => a.type === "endTurn") && doAction({ type: "endTurn", player: HUMAN })
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
                      dimmed={!playable && (isMyMain || state.phase.type === "battleSupport")}
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
      {currentAnn && (
        <Pressable
          style={[
            styles.annLayer,
            currentAnn.kind === "turn" && styles.annLayerBand,
            currentAnn.cardId && styles.annLayerDim,
          ]}
          onPress={dismissAnn}
        >
          {currentAnn.kind === "turn" ? (
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
          ) : (
            <Animated.View
              key={currentAnn.key}
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(200)}
              style={[styles.annBox, currentAnn.emph && styles.annBoxEmph]}
            >
              <Text style={[styles.annText, currentAnn.emph && styles.annTextEmph]}>
                {currentAnn.text}
              </Text>
            </Animated.View>
          )}
        </Pressable>
      )}

      {/*
       * 練習対戦のヒント。
       * 実況やターン帯より手前に、手札のすぐ上へ固定して出す
       * （中央に置くと演出に隠れて読めなくなるため）。
       */}
      {hint && hint.title !== readHint && !dealing && state.phase.type !== "finished" && (
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

      {state.phase.type === "mulligan" && !me.mulliganDecided && !dealing && (
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
              onPress={() => doAction({ type: "mulligan", player: HUMAN, redraw: false })}
            />
            <ActionButton
              label="引き直す（1回だけ）"
              color={colors.accent}
              onPress={() => doAction({ type: "mulligan", player: HUMAN, redraw: true })}
            />
          </View>
        </Overlay>
      )}

      {selectedUid && (
        <Overlay
          title={`「${nameOf(state, HUMAN, selectedUid)}」の行動`}
          onClose={() => setSelectedUid(null)}
        >
          <View style={styles.menuCardRow}>
            <CardFace cardId={cardIdOf(state, selectedUid)} size="md" />
            {!!effectTextOf(state, selectedUid) && (
              <Text style={[styles.menuEffectText, styles.menuEffectFlex]}>
                {effectTextOf(state, selectedUid)}
              </Text>
            )}
          </View>
          <View style={styles.overlayButtons}>
            {instActions(selectedUid).some(
              (a) => a.type === "instructorAction" && a.action === "skill"
            ) && (
              <ActionButton
                label={`技能を進める（+${lessonOf(state, selectedUid)}）`}
                color={colors.success}
                onPress={() =>
                  doAction({ type: "instructorAction", player: HUMAN, uid: selectedUid, action: "skill" })
                }
              />
            )}
            {instActions(selectedUid).some(
              (a) => a.type === "instructorAction" && a.action === "academic"
            ) && (
              <ActionButton
                label={`学科を進める（+${lessonOf(state, selectedUid)}）`}
                color={colors.primary}
                onPress={() =>
                  doAction({ type: "instructorAction", player: HUMAN, uid: selectedUid, action: "academic" })
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
                label={`特技: ${abilityLabelOf(state, selectedUid)}`}
                color={colors.tantou}
                onPress={() =>
                  doAction({ type: "activateAbility", player: HUMAN, uid: selectedUid })
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
                  doAction({ type: "instructorAction", player: HUMAN, uid: selectedUid, action: "doNothing" })
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

      {previewHandIndex !== null && me.hand[previewHandIndex] !== undefined && (
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

      {/* 実況が残っている間は出さない（カードを引いた実況と重なるため） */}
      {humanChoice && !busy && (
        <Overlay title={humanChoice.prompt}>
          {humanChoice.purpose === "janken" ? (
            <View style={styles.jankenRow}>
              {humanChoice.options.map((o, i) => (
                <Pressable
                  key={i}
                  style={styles.jankenButton}
                  onPress={() => doAction({ type: "resolveChoice", player: HUMAN, optionIndex: i })}
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
                    onPress={() => doAction({ type: "resolveChoice", player: HUMAN, optionIndex: i })}
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
              doAction({ type: "resolveChoice", player: HUMAN, optionIndex: choicePreview })
            }
          />
          <ActionButton
            label="戻る"
            color={colors.cancel}
            onPress={() => setChoicePreview(null)}
          />
        </Overlay>
      )}

      {revealedHand && !busy && (
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
          pileView === "deck" ? me.deck : isCpu ? cpu.outOfPlay : me.outOfPlay
        );
        const title =
          pileView === "deck"
            ? `山札の中身（${cards.length}枚）`
            : `${isCpu ? "CPUの" : "あなたの"}場外（${cards.length}枚）`;
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
                doAction({ type: "activateAbility", player: HUMAN });
              }}
            />
          )}
          <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setDetailCardId(null)} />
        </Overlay>
      )}

      {state.phase.type === "finished" && state.phase.winner === HUMAN && <Confetti />}

      {state.phase.type === "finished" && (
        <Overlay
          title={state.phase.winner === HUMAN ? "🎉 勝利！" : "😢 敗北…"}
          entering="bounce"
        >
          <Text style={styles.resultText}>
            {state.phase.reason === "deckOut"
              ? state.phase.winner === HUMAN
                ? "CPUの山札が切れました"
                : "山札が切れてしまいました"
              : state.phase.winner === HUMAN
                ? "学科10時限・技能19時限を達成！卒業おめでとう！"
                : "CPUが先に教習を修了しました"}
          </Text>
          <View style={styles.overlayButtons}>
            <ActionButton label="もう一度遊ぶ" color={colors.primary} onPress={rematch} />
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

function nameOf(state: GameState, player: 0 | 1, uid: string): string {
  const inst = state.players[player].field.find((f) => f.uid === uid);
  return inst ? getCard(inst.cardId).name : "";
}

function lessonOf(state: GameState, uid: string): number {
  const inst = state.players[HUMAN].field.find((f) => f.uid === uid);
  if (!inst) return 0;
  const base = getCard(inst.cardId).lesson ?? 0;
  const mods = state.lessonMods
    .filter((m) => m.player === HUMAN && (m.uid === null || m.uid === uid))
    .reduce((a, m) => a + m.amount, 0);
  return Math.max(0, base + mods);
}

function abilityLabelOf(state: GameState, uid: string): string {
  const inst = state.players[HUMAN].field.find((f) => f.uid === uid);
  return inst ? (getCard(inst.cardId).ability?.label ?? "") : "";
}

function effectTextOf(state: GameState, uid: string): string {
  const inst = state.players[HUMAN].field.find((f) => f.uid === uid);
  return inst ? (getCard(inst.cardId).effectText ?? "") : "";
}

function cardIdOf(state: GameState, uid: string): string {
  const inst = state.players[HUMAN].field.find((f) => f.uid === uid);
  return inst ? inst.cardId : "";
}

function FieldRow({
  state,
  player,
  field,
  highlightUids,
  highlightColor,
  selectedUid,
  onPress,
}: {
  state: GameState;
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
        const combat = effectiveCombat(ctx, state, player, inst);
        const base = getCard(inst.cardId).combat ?? 0;
        // 効果で教習力が変わっているときは、差分を「教+1」のように示す
        const lesson = effectiveLesson(ctx, state, player, inst);
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
              <RestRotator rested={inst.rested}>
                <CardFace cardId={inst.cardId} size="sm" dimmed={inst.actedThisTurn && !inst.rested} />
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
      <Text style={styles.ownerBadgeText}>{isSelf ? "あなた" : "CPU"}</Text>
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
  // ターンの帯は画面の端から端まで流すので余白を消す
  annLayerBand: { padding: 0, alignItems: "stretch" },
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
  turnFxBand: {
    paddingVertical: 12,
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
    fontSize: 26,
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
  annBoxEmph: { borderColor: colors.accent, backgroundColor: "#fffdf2f5" },
  annText: { fontSize: 15, fontWeight: "700", color: colors.text, textAlign: "center" },
  annTextEmph: { fontSize: 19, fontWeight: "900", color: colors.primaryDark },
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
  fieldCaption: { fontSize: 9, color: colors.textMuted, marginTop: 2, minHeight: 11 },
  captionUp: { color: colors.success, fontWeight: "800" },
  captionDown: { color: colors.danger, fontWeight: "800" },
  emptyField: { color: colors.textMuted, fontSize: 12, paddingVertical: 24 },
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
  menuEffectFlex: { flex: 1 },
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
  resultText: { textAlign: "center", color: colors.text, lineHeight: 22 },
});

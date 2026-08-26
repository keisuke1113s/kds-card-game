import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  BounceIn,
  FadeIn,
  FadeInDown,
  FadeOut,
  FlipInEasyY,
  SlideInLeft,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { playBgm, stopBgm } from "@/audio/sound";
import { CardDetail } from "@/components/CardDetail";
import { cardRegistry, cpuDeck, getCard } from "@/data/cards";
import { GameEvent, Track } from "@/engine/types";
import { effectiveCombat } from "@/engine/effects";
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
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { CPU, HUMAN, useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";

const ctx = { defs: cardRegistry };

const TRACK_LABEL: Record<Track, string> = { academic: "学科", skill: "技能" };

interface Announcement {
  key: number;
  text: string;
  cardId?: string;
  emph?: boolean;
}

let annSeq = 0;

/** イベント列から実況表示を組み立てる */
function announcementsFor(events: GameEvent[]): Announcement[] {
  const out: Announcement[] = [];
  const add = (text: string, cardId?: string, emph?: boolean) =>
    out.push({ key: ++annSeq, text, cardId, emph });

  for (const e of events) {
    switch (e.type) {
      case "turnStarted":
        add(e.player === HUMAN ? "あなたのターン" : "CPUのターン", undefined, true);
        break;
      case "instructorPlayed":
        if (e.player === CPU) add(`CPUが「${getCard(e.cardId).name}」を場に出した！`, e.cardId);
        break;
      case "cardDrawn":
        // 自分のドローだけ公開（CPUの手札は非公開情報）
        if (e.player === HUMAN && e.cardId) add(`「${getCard(e.cardId).name}」を引いた`, e.cardId);
        break;
      case "instructorActed":
        if (e.player === CPU) {
          if (e.action === "doNothing") {
            add(`「${getCard(e.cardId).name}」は様子を見ている…`, e.cardId);
          } else {
            add(
              `「${getCard(e.cardId).name}」が${e.action === "skill" ? "技能" : "学科"}教習！`,
              e.cardId
            );
          }
        }
        break;
      case "supportPlayed":
        if (e.player === CPU) add(`CPUのサポート「${getCard(e.cardId).name}」！`, e.cardId);
        break;
      case "abilityActivated":
        if (e.player === CPU) add(`CPUが「${getCard(e.cardId).name}」の力を使った！`, e.cardId);
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
        add(`「${getCard(e.cardId).name}」が場外へ！`, e.cardId, true);
        break;
      case "instructorBounced":
        add(`「${getCard(e.cardId).name}」が手札に戻された`, e.cardId);
        break;
      case "cardDiscarded":
        add(
          e.player === HUMAN
            ? `あなたの「${getCard(e.cardId).name}」が場外に置かれた！`
            : `CPUの「${getCard(e.cardId).name}」が場外に置かれた`,
          e.cardId
        );
        break;
      case "cardSalvaged":
        if (e.player === CPU) add(`CPUが場外から「${getCard(e.cardId).name}」を回収`, e.cardId);
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
  const difficulty = useSettingsStore((s) => s.difficulty);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const deckState = useDeckStore();

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [targetingUid, setTargetingUid] = useState<string | null>(null);
  const [previewHandIndex, setPreviewHandIndex] = useState<number | null>(null);
  const [revealedHand, setRevealedHand] = useState<string[] | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [annQueue, setAnnQueue] = useState<Announcement[]>([]);
  const [currentAnn, setCurrentAnn] = useState<Announcement | null>(null);
  const bgmEnabled = useSettingsStore((s) => s.bgmEnabled);

  // 画面シェイク（退場・バトル解決時）
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  // イベント → 実況キュー＋シェイク
  useEffect(() => {
    const anns = announcementsFor(lastEvents);
    if (anns.length > 0) setAnnQueue((q) => [...q, ...anns]);
    if (lastEvents.some((e) => e.type === "instructorRemoved" || e.type === "battleResolved")) {
      shakeX.value = withSequence(
        withTiming(-9, { duration: 55 }),
        withTiming(8, { duration: 55 }),
        withTiming(-6, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 45 })
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
      annTimer.current = setTimeout(() => {
        annTimer.current = null;
        setCurrentAnn(null);
      }, 850);
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
    dispatch(action);
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
  const logLines = allLogLines.slice(-5);

  const humanChoice =
    state.phase.type === "choice" && state.phase.pending.player === HUMAN
      ? state.phase.pending
      : null;

  const statusText = (() => {
    if (state.phase.type === "finished") return "対戦終了";
    if (actor === CPU || aiThinking) return "CPUが考えています…";
    if (state.phase.type === "mulligan") return "手札を確認してください";
    if (state.phase.type === "battleSupport")
      return battleInfo?.myPriority ? "サポートカードや担当の力を使えます" : "";
    if (state.phase.type === "choice") return "選択してください";
    if (isMyMain) return "あなたのターン";
    return "";
  })();

  const quit = () => {
    Alert.alert("対戦をやめますか？", "この対局は失われます。", [
      { text: "つづける", style: "cancel" },
      {
        text: "やめる",
        style: "destructive",
        onPress: () => {
          quitGame();
          router.replace("/");
        },
      },
    ]);
  };

  const rematch = () => {
    const deck = resolveActiveDeck(deckState);
    startGame({ playerDeck: deck.list, cpuDeck, difficulty, aiSpeedMs });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <Animated.View style={[styles.shakeWrap, shakeStyle]}>
      {/* ===== 相手エリア ===== */}
      <View style={[styles.zone, { backgroundColor: colors.boardTop }]}>
        <View style={styles.infoRow}>
          <Text style={styles.playerLabel}>CPU {aiThinking ? "🤔" : ""}</Text>
          <Text style={styles.infoText}>手札 {cpu.hand.length}枚</Text>
          <Text style={styles.infoText}>山札 {cpu.deck.length}枚</Text>
          <Text style={styles.infoText}>場外 {cpu.outOfPlay.length}枚</Text>
          <CardFace cardId={cpu.tantou} size="sm" />
        </View>
        <TrackBar label="学科" value={cpu.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" value={cpu.skill} goal={SKILL_GOAL} color={colors.success} />
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
              if (inst) setDetailCardId(inst.cardId);
            }
          }}
        />
      </View>

      {/* ===== 中央: 状況とログ ===== */}
      <View style={styles.middle}>
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
        {!!statusText && <Text style={styles.statusText}>{statusText}</Text>}
        <View style={styles.log}>
          {logLines.slice(0, -1).map((line, i) => (
            <Text key={`${i}-${line}`} style={styles.logLine} numberOfLines={1}>
              {line}
            </Text>
          ))}
          {logLines.length > 0 && (
            <LatestLogLine key={allLogLines.length} text={logLines[logLines.length - 1]} />
          )}
          <Pressable onPress={() => setShowLog(true)} hitSlop={6}>
            <Text style={styles.logButton}>すべてのログを見る ▸</Text>
          </Pressable>
        </View>
      </View>

      {/* ===== 自分エリア ===== */}
      <View style={[styles.zone, { backgroundColor: colors.boardBottom }]}>
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
              if (inst) setDetailCardId(inst.cardId);
            }
          }}
        />
        <TrackBar label="学科" value={me.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" value={me.skill} goal={SKILL_GOAL} color={colors.success} />
        <View style={styles.infoRow}>
          <Text style={styles.playerLabel}>あなた</Text>
          <Text style={styles.infoText}>山札 {me.deck.length}枚</Text>
          <Text style={styles.infoText}>場外 {me.outOfPlay.length}枚</Text>
          <View style={tantouUsable ? styles.tantouUsable : undefined}>
            {/* 担当カードはタップすると拡大表示。そこから力を使う */}
            <CardFace cardId={me.tantou} size="sm" onPress={() => setDetailCardId(me.tantou)} />
          </View>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand}>
          {me.hand.map((cardId, i) => {
            const playable = handActionFor(i) !== null;
            return (
              <Animated.View
                key={`${cardId}-${i}`}
                entering={FadeInDown.duration(250)}
                style={playable ? styles.playableCard : undefined}
              >
                <CardFace
                  cardId={cardId}
                  size="md"
                  dimmed={!playable && (isMyMain || state.phase.type === "battleSupport")}
                  onPress={() => setPreviewHandIndex(i)}
                />
              </Animated.View>
            );
          })}
          {me.hand.length === 0 && <Text style={styles.infoText}>手札がありません</Text>}
        </ScrollView>
        <Pressable onPress={quit} style={styles.quitButton}>
          <Text style={styles.quitText}>やめる</Text>
        </Pressable>
      </View>

      </Animated.View>

      {/* ===== 実況表示: カード付きは大きく詳細表示（タップで次へ） ===== */}
      {currentAnn && (
        <Pressable
          style={[styles.annLayer, currentAnn.cardId && styles.annLayerDim]}
          onPress={dismissAnn}
        >
          {currentAnn.cardId ? (
            <Animated.View
              key={currentAnn.key}
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(200)}
              style={styles.annCardBox}
            >
              <Text style={styles.annCardTitle}>{currentAnn.text}</Text>
              {annQueue.length > 0 && (
                <Text style={styles.annHint}>あと{annQueue.length}件</Text>
              )}
              <CardDetail cardId={currentAnn.cardId} scroll={false} />
              <ActionButton label="つぎへ ▶" color={colors.primary} onPress={dismissAnn} />
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

      {state.phase.type === "mulligan" && !me.mulliganDecided && (
        <Overlay title="この手札で始めますか？">
          <View style={styles.overlayCards}>
            {me.hand.map((id, i) => (
              <CardFace key={i} cardId={id} size="md" />
            ))}
          </View>
          <View style={styles.overlayButtons}>
            <ActionButton
              label="このままでOK"
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
              if (!action) return null;
              return (
                <ActionButton
                  label={action.type === "playInstructor" ? "場に出す" : "使う"}
                  color={colors.primary}
                  onPress={() => doAction(action)}
                />
              );
            })()}
            <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setPreviewHandIndex(null)} />
          </View>
        </Overlay>
      )}

      {humanChoice && (
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
            <View style={styles.overlayCards}>
              {humanChoice.options.map((o, i) =>
                o.cardId ? (
                  <CardFace
                    key={i}
                    cardId={o.cardId}
                    size="md"
                    onPress={() => doAction({ type: "resolveChoice", player: HUMAN, optionIndex: i })}
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
          )}
        </Overlay>
      )}

      {detailCardId && (
        <Overlay title={getCard(detailCardId).name} onClose={() => setDetailCardId(null)}>
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

      {revealedHand && (
        <Overlay title="相手の手札" onClose={() => setRevealedHand(null)}>
          <View style={styles.overlayCards}>
            {revealedHand.map((id, i) => (
              <CardFace key={i} cardId={id} size="md" />
            ))}
          </View>
          <ActionButton label="閉じる" color={colors.textMuted} onPress={() => setRevealedHand(null)} />
        </Overlay>
      )}

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
            <ActionButton label="もう一度あそぶ" color={colors.primary} onPress={rematch} />
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
        return (
          <Animated.View
            key={inst.uid}
            entering={FlipInEasyY.duration(400)}
            exiting={ZoomOut.duration(350)}
          >
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
                {combat !== base ? `戦${combat}` : ""}
              </Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

/** 最新ログ: 大きく飛び出してから元のサイズに収まり、ハイライトが消える */
function LatestLogLine({ text }: { text: string }) {
  const scale = useSharedValue(1.35);
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
  },
  battleRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  battleSide: { alignItems: "center", gap: 3 },
  battleSideLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "700" },
  battleTotal: { fontSize: 26, fontWeight: "900" },
  vsText: { fontSize: 20, fontWeight: "900", color: colors.accent },
  logButton: { fontSize: 11, color: colors.primary, fontWeight: "700", marginTop: 2 },
  logScroll: { alignSelf: "stretch", maxHeight: 380 },
  logFullLine: { fontSize: 13, color: colors.text, lineHeight: 19 },
  zone: { paddingHorizontal: 10, paddingVertical: 6, gap: 5 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  playerLabel: { fontWeight: "800", color: colors.text, fontSize: 14 },
  infoText: { color: colors.textMuted, fontSize: 12 },
  fieldRow: { gap: 8, paddingVertical: 4, alignItems: "center", minHeight: 92 },
  fieldSlot: { alignItems: "center", padding: 2 },
  restedCard: { transform: [{ rotate: "90deg" }] },
  fieldCaption: { fontSize: 9, color: colors.textMuted, marginTop: 2, minHeight: 11 },
  emptyField: { color: colors.textMuted, fontSize: 12, paddingVertical: 24 },
  middle: { flex: 1, paddingHorizontal: 12, paddingVertical: 4, justifyContent: "center", gap: 4 },
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
  statusText: { textAlign: "center", color: colors.primaryDark, fontWeight: "700" },
  bannerText: { fontSize: 16, fontWeight: "700", color: colors.text },
  log: { gap: 1 },
  logLine: { fontSize: 11, color: colors.textMuted },
  handArea: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hand: { gap: 6, alignItems: "center", paddingRight: 8 },
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
  quitButton: { padding: 8 },
  quitText: { color: colors.textMuted, fontSize: 12 },
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

import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cardRegistry, getCard } from "@/data/cards";
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
import { builtinDeck, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { CPU, HUMAN, useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";

const ctx = { defs: cardRegistry };

export default function BattleScreen() {
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const quitGame = useGameStore((s) => s.quitGame);
  const eventLog = useGameStore((s) => s.eventLog);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const startGame = useGameStore((s) => s.startGame);
  const difficulty = useSettingsStore((s) => s.difficulty);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const deckState = useDeckStore();

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [targetingUid, setTargetingUid] = useState<string | null>(null);
  const [previewHandIndex, setPreviewHandIndex] = useState<number | null>(null);

  const legal = useMemo(
    () => (state ? getLegalActions(ctx, state, HUMAN) : []),
    [state]
  );

  if (!state) {
    // 対局が無い（直接開かれた等）→ ホームへ
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
  const isMyMain =
    state.phase.type === "main" && state.turnPlayer === HUMAN;
  const actor = playerToAct(state);

  const can = (pred: (a: GameAction) => boolean) => legal.some(pred);
  const doAction = (action: GameAction) => {
    setSelectedUid(null);
    setTargetingUid(null);
    setPreviewHandIndex(null);
    dispatch(action);
  };

  // ---- 手札タップ時に可能なアクション
  const handActionFor = (index: number): GameAction | null => {
    const found = legal.find(
      (a) =>
        (a.type === "playInstructor" || a.type === "playSupport") &&
        a.handIndex === index
    );
    return found ?? null;
  };

  // ---- バトル対象
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
        (a.type === "declareBattle" && a.attackerUid === uid)
    );

  // ---- バトル中の戦闘力表示
  const battleInfo = (() => {
    if (state.phase.type !== "battleSupport") return null;
    const b = state.phase.battle;
    const atkState = state.players[b.attackerPlayer];
    const defState = state.players[1 - b.attackerPlayer];
    const atk = atkState.field.find((f) => f.uid === b.attackerUid);
    const def = defState.field.find((f) => f.uid === b.defenderUid);
    if (!atk || !def) return null;
    const buff = (p: number) =>
      b.buffs.filter((x) => x.player === p).reduce((a, x) => a + x.amount, 0);
    return {
      attackerName: getCard(atk.cardId).name,
      defenderName: getCard(def.cardId).name,
      attackerTotal: (getCard(atk.cardId).combat ?? 0) + buff(b.attackerPlayer),
      defenderTotal: (getCard(def.cardId).combat ?? 0) + buff(1 - b.attackerPlayer),
      iAmAttacker: b.attackerPlayer === HUMAN,
      myPriority: b.priority === HUMAN,
    };
  })();

  const logLines = eventLog
    .map((e) => eventText(e, HUMAN))
    .filter((t): t is string => t !== null)
    .slice(-4);

  const statusText = (() => {
    if (state.phase.type === "finished") return "対戦終了";
    if (actor === CPU || aiThinking) return "CPUが考えています…";
    if (state.phase.type === "mulligan") return "手札を確認してください";
    if (state.phase.type === "battleSupport")
      return battleInfo?.myPriority ? "サポートカードを使えます" : "";
    if (state.phase.type === "choice") return "カードを選んでください";
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
    startGame({
      playerDeck: deck.list,
      cpuDeck: builtinDeck.list,
      difficulty,
      aiSpeedMs,
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* ===== 相手エリア ===== */}
      <View style={[styles.zone, { backgroundColor: colors.boardTop }]}>
        <View style={styles.infoRow}>
          <Text style={styles.playerLabel}>CPU {aiThinking ? "🤔" : ""}</Text>
          <Text style={styles.infoText}>手札 {cpu.hand.length}枚</Text>
          <Text style={styles.infoText}>山札 {cpu.deck.length}枚</Text>
          <CardFace cardId={cpu.tantou} size="sm" />
        </View>
        <TrackBar label="学科" value={cpu.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" value={cpu.skill} goal={SKILL_GOAL} color={colors.success} />
        <FieldRow
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
            }
          }}
        />
      </View>

      {/* ===== 中央: 状況とログ ===== */}
      <View style={styles.middle}>
        {battleInfo && (
          <View style={styles.battleBanner}>
            <Text style={styles.battleText}>
              ⚔️ {battleInfo.attackerName} {battleInfo.attackerTotal} vs{" "}
              {battleInfo.defenderTotal} {battleInfo.defenderName}
            </Text>
          </View>
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
          {logLines.map((line, i) => (
            <Text key={i} style={styles.logLine} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      {/* ===== 自分エリア ===== */}
      <View style={[styles.zone, { backgroundColor: colors.boardBottom }]}>
        <FieldRow
          field={me.field}
          highlightUids={
            new Set(
              me.field
                .filter((f) => instActions(f.uid).length > 0)
                .map((f) => f.uid)
            )
          }
          highlightColor={colors.highlight}
          selectedUid={selectedUid}
          onPress={(uid) => {
            if (instActions(uid).length > 0) {
              setSelectedUid(uid);
              setTargetingUid(null);
            }
          }}
        />
        <TrackBar label="学科" value={me.academic} goal={ACADEMIC_GOAL} color={colors.primary} />
        <TrackBar label="技能" value={me.skill} goal={SKILL_GOAL} color={colors.success} />
        <View style={styles.infoRow}>
          <Text style={styles.playerLabel}>あなた</Text>
          <Text style={styles.infoText}>山札 {me.deck.length}枚</Text>
          <CardFace cardId={me.tantou} size="sm" />
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
              can((a) => a.type === "endTurn") &&
              doAction({ type: "endTurn", player: HUMAN })
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
              <View key={`${cardId}-${i}`} style={playable ? styles.playableCard : undefined}>
                <CardFace
                  cardId={cardId}
                  size="md"
                  dimmed={!playable && (isMyMain || state.phase.type === "battleSupport")}
                  onPress={() => setPreviewHandIndex(i)}
                />
              </View>
            );
          })}
          {me.hand.length === 0 && <Text style={styles.infoText}>手札がありません</Text>}
        </ScrollView>
        <Pressable onPress={quit} style={styles.quitButton}>
          <Text style={styles.quitText}>やめる</Text>
        </Pressable>
      </View>

      {/* ===== オーバーレイ ===== */}
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
        <Overlay title={`「${nameOf(state, HUMAN, selectedUid)}」の行動`} onClose={() => setSelectedUid(null)}>
          <View style={styles.overlayButtons}>
            {instActions(selectedUid).some(
              (a) => a.type === "instructorAction" && a.action === "skill"
            ) && (
              <ActionButton
                label={`技能を進める（+${lessonOf(state, HUMAN, selectedUid)}）`}
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
                label={`学科を進める（+${lessonOf(state, HUMAN, selectedUid)}）`}
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
        <Overlay title={getCard(me.hand[previewHandIndex]).name} onClose={() => setPreviewHandIndex(null)}>
          <CardFace cardId={me.hand[previewHandIndex]} size="lg" />
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

      {state.phase.type === "choice" && state.phase.pending.player === HUMAN && (
        <Overlay title="手札に加えるカードを選んでください">
          <View style={styles.overlayCards}>
            {state.phase.pending.revealed.map((id, i) => {
              const selectable = (state.phase.type === "choice"
                ? state.phase.pending.selectable
                : []
              ).includes(i);
              return (
                <View key={i} style={selectable ? styles.playableCard : undefined}>
                  <CardFace
                    cardId={id}
                    size="md"
                    dimmed={!selectable}
                    onPress={() =>
                      selectable &&
                      doAction({ type: "resolveChoice", player: HUMAN, optionIndex: i })
                    }
                  />
                </View>
              );
            })}
          </View>
        </Overlay>
      )}

      {state.phase.type === "finished" && (
        <Overlay
          title={state.phase.winner === HUMAN ? "🎉 勝利！" : "😢 敗北…"}
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

function lessonOf(state: GameState, player: 0 | 1, uid: string): number {
  const inst = state.players[player].field.find((f) => f.uid === uid);
  return inst ? (getCard(inst.cardId).lesson ?? 0) : 0;
}

function FieldRow({
  field,
  highlightUids,
  highlightColor,
  selectedUid,
  onPress,
}: {
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
      {field.map((inst) => (
        <Pressable
          key={inst.uid}
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
          <View style={inst.rested ? styles.restedCard : undefined}>
            <CardFace cardId={inst.cardId} size="sm" dimmed={inst.actedThisTurn && !inst.rested} />
          </View>
          {inst.rested && <Text style={styles.restedLabel}>休憩</Text>}
        </Pressable>
      ))}
    </ScrollView>
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
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <Pressable style={styles.overlayBg} onPress={onClose}>
      <Pressable style={styles.overlayBox} onPress={() => {}}>
        <Text style={styles.overlayTitle}>{title}</Text>
        {children}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  zone: { paddingHorizontal: 10, paddingVertical: 6, gap: 5 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  playerLabel: { fontWeight: "800", color: colors.text, fontSize: 14 },
  infoText: { color: colors.textMuted, fontSize: 12 },
  fieldRow: {
    gap: 8,
    paddingVertical: 4,
    alignItems: "center",
    minHeight: 86,
  },
  fieldSlot: { alignItems: "center", padding: 2 },
  restedCard: { transform: [{ rotate: "90deg" }] },
  restedLabel: { fontSize: 9, color: colors.textMuted, marginTop: 2 },
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
  overlayCards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  overlayButtons: { gap: 10, alignSelf: "stretch" },
  resultText: { textAlign: "center", color: colors.text, lineHeight: 22 },
});

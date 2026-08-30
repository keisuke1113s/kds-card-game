import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { CardFace } from "@/components/CardFace";
import { ScreenEnter } from "@/components/ScreenEnter";
import { getCard } from "@/data/cards";
import {
  Axis,
  POLE_TRAITS,
  SAFETY_ADVICE,
  SAFETY_AXES,
  SAFETY_QUESTIONS,
  SHINDAN_QUESTIONS,
  SafetyAxis,
  axisBreakdown,
  computeShindanType,
  dominantPoles,
  partnerTypeOf,
  scoreSafety,
  shindanTypeOf,
} from "@/data/shindan";
import Svg, { Line, Polygon, Text as SvgText } from "react-native-svg";
import { useVisionStore } from "@/store/visionStore";
import { useKytStore } from "@/store/kytStore";
import { useQuizStore } from "@/store/quizStore";
import { useRecordStore } from "@/store/recordStore";
import { KYT_SCENES } from "@/data/kytScenes";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";
import { useRankStore } from "@/store/rankStore";
import { colors, radius, spacing } from "@/theme";

/** 運転適性診断（教習所の適性検査のパロディ・16問16タイプ） */
export default function ShindanScreen() {
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;

  const router = useRouter();
  const savedKey = useRankStore((s) => s.shindanType);
  const savedAnswers = useRankStore((s) => s.shindanAnswers);
  const setShindanType = useRankStore((s) => s.setShindanType);
  const setShindanAnswers = useRankStore((s) => s.setShindanAnswers);
  const saved = shindanTypeOf(savedKey);

  const savedSafety = useRankStore((s) => s.shindanSafety);
  const setShindanSafety = useRankStore((s) => s.setShindanSafety);

  const [phase, setPhase] = useState<"start" | "play" | "safety" | "liar" | "result">("start");
  const [index, setIndex] = useState(0);
  const [axes, setAxes] = useState<Axis[]>([]);
  const [result, setResult] = useState<ReturnType<typeof computeShindanType> | null>(null);
  const [resultAxes, setResultAxes] = useState<Axis[]>([]);
  const [safetyIndex, setSafetyIndex] = useState(0);
  const [safetyAnswers, setSafetyAnswers] = useState<number[]>([]);
  const [safetyScores, setSafetyScores] = useState<Record<SafetyAxis, number> | null>(null);

  const q = SHINDAN_QUESTIONS[index];
  const sq = SAFETY_QUESTIONS[safetyIndex];

  const start = () => {
    setIndex(0);
    setAxes([]);
    setSafetyIndex(0);
    setSafetyAnswers([]);
    setPhase("play");
  };

  const choose = (axis: Axis) => {
    haptic("light");
    playSe("tap");
    const nextAxes = [...axes, axis];
    if (index + 1 >= SHINDAN_QUESTIONS.length) {
      setAxes(nextAxes);
      const t = computeShindanType(nextAxes);
      setShindanType(t.key);
      setShindanAnswers(nextAxes.join(""));
      setResult(t);
      setResultAxes(nextAxes);
      // 続けてセーフティチェックへ
      setSafetyIndex(0);
      setSafetyAnswers([]);
      setPhase("safety");
      return;
    }
    setAxes(nextAxes);
    setIndex((i) => i + 1);
  };

  /** セーフティチェックの回答（0=そう思わない〜3=そう思う） */
  const chooseSafety = (v: number) => {
    haptic("light");
    playSe("tap");
    const next = [...safetyAnswers, v];
    if (safetyIndex + 1 >= SAFETY_QUESTIONS.length) {
      setSafetyAnswers(next);
      const { scores, lie } = scoreSafety(next);
      setSafetyScores(scores);
      setShindanSafety(scores);
      if (lie >= 5) {
        // 正直度チェックに引っかかった（全部「完璧な人」の回答）
        setPhase("liar");
        return;
      }
      playSe("achievement");
      setPhase("result");
      return;
    }
    setSafetyAnswers(next);
    setSafetyIndex((i) => i + 1);
  };

  const showSaved = () => {
    if (!saved) return;
    setResult(saved);
    setResultAxes((savedAnswers ?? "").split("") as Axis[]);
    setSafetyScores((savedSafety as Record<SafetyAxis, number> | null) ?? null);
    setPhase("result");
  };

  const buddy = result ? partnerTypeOf(result.key) : null;
  const hasMeters = resultAxes.length >= SHINDAN_QUESTIONS.length;
  const poles = hasMeters ? dominantPoles(resultAxes) : [];

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "start" && (
          <View style={styles.card}>
            <Text style={styles.title}>🧠 運転適性診断</Text>
            <Text style={styles.note}>
              教習所の適性検査になぞらえた、あなたの「運転タイプ」診断！{"\n"}
              4つの軸で分析して、全16タイプから判定します。{"\n"}
              {SHINDAN_QUESTIONS.length}問の質問に直感で答えてね。結果は免許証にも記載されます。
            </Text>
            {saved && (
              <Text style={styles.record}>
                前回の診断: {saved.emoji} {saved.name}
              </Text>
            )}
            <AppButton label="診断をはじめる" custom={{ bg: "#e2604a" }} fullWidth onPress={start} />
            {saved && (
              <AppButton
                label={`${saved.emoji} 前回の結果をもう一度見る`}
                custom={{ bg: "#ffffff", fg: "#c4432e", border: "#e2604a" }}
                fullWidth
                onPress={showSaved}
              />
            )}
            <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.back()} />
          </View>
        )}

        {phase === "play" && q && (
          <Animated.View key={index} entering={FadeIn.duration(220)} style={styles.card}>
            <Text style={styles.progress}>
              Q{index + 1} / {SHINDAN_QUESTIONS.length}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${(index / SHINDAN_QUESTIONS.length) * 100}%` }]}
              />
            </View>
            <Text style={styles.question}>{q.q}</Text>
            <Pressable style={styles.choice} onPress={() => choose(q.a.axis)}>
              <Text style={styles.choiceText}>A. {q.a.label}</Text>
            </Pressable>
            <Pressable style={styles.choice} onPress={() => choose(q.b.axis)}>
              <Text style={styles.choiceText}>B. {q.b.label}</Text>
            </Pressable>
          </Animated.View>
        )}

        {phase === "safety" && sq && (
          <Animated.View key={`s${safetyIndex}`} entering={FadeIn.duration(220)} style={styles.card}>
            <Text style={styles.progress}>
              セーフティチェック {safetyIndex + 1} / {SAFETY_QUESTIONS.length}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(safetyIndex / SAFETY_QUESTIONS.length) * 100}%`, backgroundColor: "#1a5fb4" },
                ]}
              />
            </View>
            <Text style={styles.safetyIntro}>ふだんの自分に、どのくらい当てはまりますか？</Text>
            <Text style={styles.question}>{sq.text}</Text>
            {[
              { v: 3, label: "そう思う" },
              { v: 2, label: "ややそう思う" },
              { v: 1, label: "あまり思わない" },
              { v: 0, label: "そう思わない" },
            ].map((o) => (
              <Pressable
                key={o.v}
                style={[styles.choice, styles.safetyChoice]}
                onPress={() => chooseSafety(o.v)}
              >
                <Text style={[styles.choiceText, styles.safetyChoiceText]}>{o.label}</Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {phase === "liar" && (
          <Animated.View entering={ZoomIn.springify().damping(13)} style={styles.card}>
            <Text style={styles.resultEmoji}>😉</Text>
            <Text style={styles.resultName}>ちょっと待って！</Text>
            <Text style={styles.note}>
              回答が「今まで一度もうそをついたことがない」など、完璧すぎる人になっています。
              本物の適性検査にもある「正直度チェック」に引っかかりました。
              正直に答え直すと、もっと当たる結果になりますよ。
            </Text>
            <AppButton
              label="正直モードでやり直す"
              custom={{ bg: "#1a5fb4" }}
              fullWidth
              onPress={() => {
                setSafetyIndex(0);
                setSafetyAnswers([]);
                setPhase("safety");
              }}
            />
            <AppButton
              label="このまま結果を見る"
              tone="ghost"
              fullWidth
              onPress={() => {
                playSe("achievement");
                setPhase("result");
              }}
            />
          </Animated.View>
        )}

        {phase === "result" && result && (
          <Animated.View entering={ZoomIn.springify().damping(13)} style={styles.card}>
            <Text style={styles.resultLabel}>あなたの運転タイプは…</Text>
            <Text style={styles.resultEmoji}>{result.emoji}</Text>
            <Text style={styles.resultName}>{result.name}</Text>
            <Text style={styles.resultCatch}>“{result.catch}”</Text>
            <Text style={styles.note}>{result.desc}</Text>

            {/* 4軸のメーター */}
            {hasMeters ? (
              <View style={styles.meterBox}>
                <Text style={styles.sectionLabel}>📊 あなたの傾向メーター</Text>
                {axisBreakdown(resultAxes).map((ax) => {
                  const total = ax.left.count + ax.right.count;
                  const leftPct = total > 0 ? (ax.left.count / total) * 100 : 50;
                  const leftWin = ax.left.count >= ax.right.count;
                  return (
                    <View key={ax.left.letter} style={styles.meterRow}>
                      <Text style={[styles.meterLabel, leftWin && styles.meterLabelWin]}>
                        {ax.left.label}
                      </Text>
                      <View style={styles.meterTrack}>
                        <View style={[styles.meterLeft, { width: `${leftPct}%` }]} />
                      </View>
                      <Text style={[styles.meterLabel, styles.meterLabelRight, !leftWin && styles.meterLabelWin]}>
                        {ax.right.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.record}>（メーター表示はもう一度診断すると出ます）</Text>
            )}

            {/* 安全運転の6観点（セーフティチェックの結果） */}
            {safetyScores && (
              <View style={styles.meterBox}>
                <Text style={styles.sectionLabel}>🛞 安全運転セーフティチェック</Text>
                <SafetyRadar scores={safetyScores} />
                {SAFETY_AXES.map((a) => (
                  <View key={a.key} style={styles.meterRow}>
                    <Text style={[styles.meterLabel, { width: 96 }]}>
                      {a.emoji} {a.label}
                    </Text>
                    <View style={styles.meterTrack}>
                      <View
                        style={[
                          styles.meterLeft,
                          {
                            width: `${safetyScores[a.key]}%`,
                            backgroundColor: safetyScores[a.key] >= 60 ? "#2f9e44" : "#e8890c",
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.safetyPct}>{safetyScores[a.key]}</Text>
                  </View>
                ))}
                {(() => {
                  const low = [...SAFETY_AXES].sort(
                    (x, y) => safetyScores[x.key] - safetyScores[y.key]
                  )[0];
                  return (
                    <View style={[styles.adviceBox, { borderLeftColor: "#e8890c" }]}>
                      <Text style={styles.sectionLabel}>
                        📚 教習ワンポイント（{low.emoji} {low.label}）
                      </Text>
                      <Text style={styles.adviceText}>{SAFETY_ADVICE[low.key]}</Text>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* ゲーム内の実測データとの照合 */}
            {safetyScores && <RealDataPanel scores={safetyScores} />}

            {/* 強みと注意（傾きの強い2軸から） */}
            {poles.length > 0 && (
              <>
                <View style={[styles.adviceBox, { borderLeftColor: "#2f9e44" }]}>
                  <Text style={styles.sectionLabel}>💪 あなたの強み</Text>
                  {poles.slice(0, 2).map((p) => (
                    <Text key={`s${p}`} style={styles.adviceText}>
                      ・{POLE_TRAITS[p].strength}
                    </Text>
                  ))}
                </View>
                <View style={[styles.adviceBox, { borderLeftColor: "#d83030" }]}>
                  <Text style={styles.sectionLabel}>⚠️ 運転で気をつけたい場面</Text>
                  {poles.slice(0, 2).map((p) => (
                    <Text key={`c${p}`} style={styles.adviceText}>
                      ・{POLE_TRAITS[p].caution}
                    </Text>
                  ))}
                </View>
              </>
            )}

            {/* 運転傾向のアドバイス */}
            <View style={[styles.adviceBox, { borderLeftColor: "#1a5fb4" }]}>
              <Text style={styles.sectionLabel}>🚗 運転傾向とアドバイス</Text>
              <Text style={styles.adviceText}>{result.drive}</Text>
            </View>

            {/* ゲームのおすすめ */}
            <View style={[styles.adviceBox, { borderLeftColor: "#e8590c" }]}>
              <Text style={styles.sectionLabel}>🎮 おすすめの戦い方</Text>
              <Text style={styles.adviceText}>{result.advice}</Text>
              <Text style={styles.adviceText}>🃏 おすすめデッキ: {result.deck}</Text>
            </View>

            {/* 相性インストラクター */}
            <View style={styles.partnerRow}>
              <CardFace cardId={result.partner} size="md" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sectionLabel}>🤝 相性の良いインストラクター</Text>
                <Text style={styles.partnerName}>
                  {getCard(result.partner).name}インストラクター
                </Text>
                <Text style={styles.adviceText}>「インストラクターに挑戦」で対戦してみよう！</Text>
              </View>
            </View>

            {/* 補い合える相棒タイプ */}
            {buddy && (
              <View style={[styles.adviceBox, { borderLeftColor: "#8a5bb8" }]}>
                <Text style={styles.sectionLabel}>🧩 補い合える相棒タイプ</Text>
                <Text style={styles.adviceText}>
                  {buddy.emoji} {buddy.name} — あなたと全部の軸が反対のタイプ。
                  一緒に走ると弱点を補い合えます。友だちと診断して探してみよう！
                </Text>
              </View>
            )}

            <Text style={styles.disclaimer}>
              ※ これは学習用の簡易診断です。本格的な運転適性検査（OD式など）は、
              KDS釧路自動車学校に入校すると受けられます。
            </Text>
            <AppButton label="もう一度診断する" tone="ghost" fullWidth onPress={start} />
            <AppButton
              label="診断トップへ戻る"
              tone="ghost"
              fullWidth
              onPress={() => setPhase("start")}
            />
            <AppButton
              label="🪪 免許証で確認する"
              tone="primary"
              fullWidth
              onPress={() => router.replace("/license")}
            />
          </Animated.View>
        )}
      </ScrollView>
    </ScreenEnter>
  );
}

/** 6観点のレーダーチャート（六角形） */
function SafetyRadar({ scores }: { scores: Record<SafetyAxis, number> }) {
  const SIZE = 300;
  const C = SIZE / 2;
  const R = 92;
  const pt = (i: number, ratio: number) => {
    const ang = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    return `${C + Math.cos(ang) * R * ratio},${C + Math.sin(ang) * R * ratio}`;
  };
  const ring = (ratio: number) =>
    [0, 1, 2, 3, 4, 5].map((i) => pt(i, ratio)).join(" ");
  const data = SAFETY_AXES.map((a, i) => pt(i, Math.max(0.08, scores[a.key] / 100))).join(" ");
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={SIZE} height={SIZE}>
        {[0.33, 0.66, 1].map((r) => (
          <Polygon key={r} points={ring(r)} fill="none" stroke="#9aa7b855" strokeWidth={1} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const [x, y] = pt(i, 1).split(",").map(Number);
          return <Line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#9aa7b855" strokeWidth={1} />;
        })}
        <Polygon points={data} fill="#1a5fb44d" stroke="#1a5fb4" strokeWidth={2} />
        {SAFETY_AXES.map((a, i) => {
          const [x, y] = pt(i, 1.28).split(",").map(Number);
          return (
            <SvgText
              key={a.key}
              x={x}
              y={y + 4}
              fontSize={11}
              fontWeight="bold"
              fill={colors.text}
              textAnchor="middle"
            >
              {a.emoji} {a.label.replace("・正確さ", "")}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

/** ゲーム内の実測データと自己評価の照合パネル */
function RealDataPanel({ scores }: { scores: Record<SafetyAxis, number> }) {
  const visionBest = useVisionStore((s) => s.best);
  const bestReaction = useVisionStore((s) => s.bestReaction);
  const kytMastered = useKytStore((s) => s.masteredIds.length);
  const quizPlays = useQuizStore((s) => s.plays);
  const quizPerfects = useQuizStore((s) => s.perfects);
  const kenteiPassed = useQuizStore((s) => s.kenteiPassed);
  const history = useRecordStore((s) => s.history);

  const rows: { emoji: string; label: string; value: string; comment: string }[] = [];

  // 認知（動体視力）
  const visionLv = visionBest >= 15 ? 2 : visionBest >= 8 ? 1 : 0;
  rows.push({
    emoji: "👁",
    label: "動体視力チェック",
    value:
      visionBest > 0
        ? `最高 ${visionBest}点${bestReaction !== null ? `・反応 平均${bestReaction.toFixed(2)}秒` : ""}`
        : bestReaction !== null
          ? `反応 平均${bestReaction.toFixed(2)}秒`
          : "未計測",
    comment:
      visionBest === 0
        ? "「動体視力」で実測してみよう"
        : visionLv === 2
          ? "実測でも認知力はトップクラス！"
          : scores.attention >= 60 && visionLv === 0
            ? "自己評価より実測が控えめ。動体視力チェックで鍛えよう"
            : "続けるほど伸びます",
  });
  // 予測（KYT）
  const kytLv = kytMastered >= 30 ? 2 : kytMastered >= 10 ? 1 : 0;
  rows.push({
    emoji: "⚠️",
    label: "危険予測（KYT）",
    value: kytMastered > 0 ? `${kytMastered}/${KYT_SCENES.length}場面クリア` : "未挑戦",
    comment:
      kytLv === 2
        ? "実測でも危険予測力は折り紙つき！"
        : scores.attention >= 60 && kytLv === 0
          ? "注意力の自己評価は高め。KYTで実力も証明しよう"
          : "KYTで予測力はどんどん伸びます",
  });
  // 知識（学科）
  rows.push({
    emoji: "📝",
    label: "学科の知識",
    value:
      kenteiPassed > 0
        ? `効果測定 合格${kenteiPassed}回`
        : quizPerfects > 0
          ? `クイズ全問正解${quizPerfects}回`
          : quizPlays > 0
            ? `クイズ挑戦${quizPlays}回`
            : "未挑戦",
    comment:
      kenteiPassed > 0
        ? "知識は本試験レベル。自信を持ってOK！"
        : "学科クイズと効果測定で積み上げよう",
  });
  // 対戦スタイル（判断の傾向）
  const turns = history.filter((h) => h.turns > 0).map((h) => h.turns);
  const avgTurns = turns.length >= 3 ? turns.reduce((a, b) => a + b, 0) / turns.length : null;
  rows.push({
    emoji: "🎮",
    label: "対戦スタイル",
    value:
      avgTurns === null
        ? "データ不足（3戦以上で判定）"
        : avgTurns <= 8
          ? `速攻型（平均${avgTurns.toFixed(1)}ターン）`
          : avgTurns >= 13
            ? `じっくり型（平均${avgTurns.toFixed(1)}ターン)`
            : `バランス型（平均${avgTurns.toFixed(1)}ターン）`,
    comment:
      avgTurns === null
        ? ""
        : avgTurns <= 8 && scores.judgment < 60
          ? "決断が早い勝負師タイプ。運転では「1テンポ待つ」を意識すると鬼に金棒"
          : avgTurns >= 13 && scores.judgment >= 60
            ? "熟考型の判断は運転向き。自信を持って"
            : "判断の傾向は安定しています",
  });

  return (
    <View style={styles.meterBox}>
      <Text style={styles.sectionLabel}>🔬 ゲーム内の実測データと照合</Text>
      <Text style={styles.adviceText}>
        アンケート（自己評価）と、アプリで実際に遊んだ記録を突き合わせました。
      </Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.realRow}>
          <Text style={styles.realLabel}>
            {r.emoji} {r.label}: <Text style={styles.realValue}>{r.value}</Text>
          </Text>
          {!!r.comment && <Text style={styles.realComment}>{r.comment}</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 12,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 22, fontWeight: "900", color: "#c4432e", textAlign: "center" },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  progress: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: "#e2604a", borderRadius: 3 },
  question: { fontSize: 18, lineHeight: 27, fontWeight: "800", color: colors.text },
  choice: {
    borderWidth: 2,
    borderColor: "#e2604a",
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  choiceText: { fontSize: 15, fontWeight: "700", color: "#c4432e" },
  resultLabel: { fontSize: 14, fontWeight: "800", color: colors.textMuted, textAlign: "center" },
  resultEmoji: { fontSize: 56, textAlign: "center" },
  resultName: { fontSize: 24, fontWeight: "900", color: "#c4432e", textAlign: "center" },
  resultCatch: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textAlign: "center" },
  sectionLabel: { fontSize: 13, fontWeight: "900", color: colors.text },
  meterBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
  },
  meterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meterLabel: { width: 72, fontSize: 11, fontWeight: "700", color: colors.textMuted },
  meterLabelRight: { textAlign: "right" },
  meterLabelWin: { color: "#c4432e", fontWeight: "900" },
  meterTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1a5fb433",
    overflow: "hidden",
  },
  meterLeft: { height: 12, backgroundColor: "#e2604a" },
  adviceBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: 12,
    gap: 6,
  },
  adviceText: { fontSize: 13, lineHeight: 21, color: colors.text },
  safetyIntro: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  safetyChoice: { borderColor: "#1a5fb4", paddingVertical: 12 },
  safetyChoiceText: { color: "#1a5fb4", textAlign: "center" },
  safetyPct: { width: 30, fontSize: 11, fontWeight: "800", color: colors.textMuted, textAlign: "right" },
  disclaimer: { fontSize: 11, lineHeight: 17, color: colors.textMuted },
  realRow: { gap: 2 },
  realLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  realValue: { fontWeight: "900", color: "#1a5fb4" },
  realComment: { fontSize: 12, color: colors.textMuted, paddingLeft: 18 },
  partnerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  partnerName: { fontSize: 16, fontWeight: "900", color: colors.text },
});

/** LINE連携が必要な機能のロック画面 */
function LineGate() {
  const router = useRouter();
  return (
    <View style={lineGateStyles.root}>
      <View style={lineGateStyles.card}>
        <Text style={lineGateStyles.lockIcon}>🔒</Text>
        <Text style={lineGateStyles.title}>この機能はLINE連携で解放されます</Text>
        <Text style={lineGateStyles.note}>
          KDS釧路自動車学校の公式LINEと連携（無料）すると使えるようになります。
        </Text>
        <Pressable style={lineGateStyles.button} onPress={() => router.replace("/line")}>
          <Text style={lineGateStyles.buttonText}>💚 LINE連携する</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={lineGateStyles.back}>戻る</Text>
        </Pressable>
      </View>
    </View>
  );
}

const lineGateStyles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
    maxWidth: 420,
    width: "100%",
  },
  lockIcon: { fontSize: 44 },
  title: { fontSize: 17, fontWeight: "900", color: colors.text, textAlign: "center" },
  note: { fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: "center" },
  button: {
    backgroundColor: "#06C755",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  back: { fontSize: 13, color: colors.textMuted, padding: 4 },
});

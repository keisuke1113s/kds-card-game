import { readPersisted, writePersisted } from "@/store/persistDirect";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, TextInput } from "react-native";
import { Platform } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { PackOpeningFX } from "@/app/scan";
import { evaluateAchievements } from "@/store/achievementStore";
import { playSe } from "@/audio/sound";
import { CardDetail } from "@/components/CardDetail";
import { CardFace } from "@/components/CardFace";
import { LockedCard } from "@/components/LockedCard";
import { allCards, getCard } from "@/data/cards";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { colors } from "@/theme";
import { useDevDemo } from "@/data/hydration";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";
import { ScreenEnter } from "@/components/ScreenEnter";

const sections: { label: string; type: string }[] = [
  { label: "インストラクター", type: "instructor" },
  { label: "サポート", type: "support" },
  { label: "担当", type: "tantou" },
];

/** 図鑑の表示絞り込み */
type LibraryFilter = "all" | "unlocked" | "locked";

/** 開発版だけの機能を出す条件（本番・ストア版では出ない） */
const IS_DEV_BUILD = typeof __DEV__ !== "undefined" && __DEV__;

const FILTERS: { key: LibraryFilter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "unlocked", label: "あつめた" },
  { key: "locked", label: "未開放" },
];

export default function LibraryScreen() {
  // 開発版デモ（/dev/）判定はマウント後に確定させる（静的HTMLとの不一致を防ぐ）
  const devBuild = IS_DEV_BUILD || useDevDemo();
  const lineLinkedLib = useLineStore((s) => s.linked);
  const lineLock = LINE_GATE_ENABLED && !lineLinkedLib;

  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [lockedTapped, setLockedTapped] = useState<string | null>(null);
  // 開発版のテスト開放でパック開封演出を見せる
  const [devRevealed, setDevRevealed] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sortKey, setSortKey] = useState<"default" | "name" | "combat" | "lesson">("default");
  const [query, setQuery] = useState("");
  const unlockState = useUnlockStore();
  const unlocked = unlockedSet(unlockState);
  // 図鑑コンプリートの祝祭（正式仕様＝通常配布モードで全カード開放した最初の1回だけ）。
  // 既読フラグは端末の保存からも直接確認する（読み込み遅延で毎回出るのを防ぐ）
  const [completeFx, setCompleteFx] = useState(false);
  const [storedCelebrated, setStoredCelebrated] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void readPersisted("kds-unlocks", "celebratedComplete", false).then((v) => {
      if (alive) setStoredCelebrated(Boolean(v));
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (storedCelebrated === null) return;
    if (
      !unlockState.allOpenMode &&
      unlocked.size >= allCards.length &&
      !unlockState.celebratedComplete &&
      !storedCelebrated
    ) {
      setCompleteFx(true);
      setStoredCelebrated(true);
      playSe("win");
      unlockState.setCelebratedComplete();
      void writePersisted("kds-unlocks", "celebratedComplete", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked.size, storedCelebrated]);

  // 3日以内にQRで開放したカードにはNEWバッジ＋輝きを出す
  const isNew = (id: string) => {
    const at = unlockState.scannedLog[id];
    return !!at && Date.now() - new Date(at).getTime() < 3 * 86400000;
  };
  const total = allCards.length;
  const collected = Math.min(unlocked.size, total);

  const matchesFilter = (id: string) =>
    filter === "all" ? true : filter === "unlocked" ? unlocked.has(id) : !unlocked.has(id);

  return (
    <ScreenEnter style={styles.root}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.type}
        ListHeaderComponent={
          <View style={styles.headerBox}>
            {/* コンプ率の見える化: 円リング＋タイプ別バー */}
            <View style={styles.compRow}>
              <CompletionRing collected={collected} total={total} />
              <View style={styles.compBars}>
                {sections.map((s) => {
                  const cards = allCards.filter((c) => c.type === s.type);
                  const got = cards.filter((c) => unlocked.has(c.id)).length;
                  return (
                    <View key={s.type} style={styles.compBarRow}>
                      <Text style={styles.compBarLabel}>{s.label}</Text>
                      <View style={styles.compBarTrack}>
                        <View
                          style={[
                            styles.compBarFill,
                            { width: `${(got / Math.max(1, cards.length)) * 100}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.compBarCount}>
                        {got}/{cards.length}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <Pressable style={styles.scanButton} onPress={() => router.push("/scan")}>
              <Text style={styles.scanButtonText}>📷 QRコードでカードを登録</Text>
              {/* 白い帯の上に赤字で説明（青いボタン上でも読めるように） */}
              <View style={styles.scanCaption}>
                <Text style={styles.scanCaptionText}>
                  実物のKDSトレーディングカードのQRコードを読み込むと、そのカードが使えるようになるよ！
                </Text>
              </View>
            </Pressable>
            {/* 実カード配布の案内（ホームと同じトーンで目立たせる） */}
            {!lineLock && (
            <View style={styles.promoBadge}>
              <Text style={styles.promoText}>
                🎁 KDSに入校すると教習毎にトレーディングカードを1枚もらえるよ！
              </Text>
            </View>
            )}
            {/* 絞り込み */}
            <View style={styles.filterRow}>
              {FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text
                    style={[styles.filterText, filter === f.key && styles.filterTextActive]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* 並び替えと名前検索 */}
            <View style={styles.filterRow}>
              {(
                [
                  { key: "default", label: "標準" },
                  { key: "name", label: "名前順" },
                  { key: "combat", label: "戦闘力順" },
                  { key: "lesson", label: "教習力順" },
                ] as const
              ).map((f) => (
                <Pressable
                  key={f.key}
                  style={[styles.filterChip, sortKey === f.key && styles.filterChipActive]}
                  onPress={() => setSortKey(f.key)}
                >
                  <Text style={[styles.filterText, sortKey === f.key && styles.filterTextActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="🔍 名前で検索"
              autoCorrect={false}
            />
          </View>
        }
        renderItem={({ item: section }) => {
          const cards = allCards
            .filter((c) => c.type === section.type && matchesFilter(c.id))
            .filter((c) => (query.trim() ? c.name.includes(query.trim()) : true))
            .sort((a, b) => {
              if (sortKey === "name") return a.name.localeCompare(b.name, "ja");
              if (sortKey === "combat")
                return (b.type === "instructor" ? (b.combat ?? -1) : -1) - (a.type === "instructor" ? (a.combat ?? -1) : -1);
              if (sortKey === "lesson")
                return (b.type === "instructor" ? (b.lesson ?? -1) : -1) - (a.type === "instructor" ? (a.lesson ?? -1) : -1);
              return 0;
            });
          if (cards.length === 0) return null;
          return (
            <View>
              <Text style={styles.sectionTitle}>{section.label}</Text>
              <View style={styles.grid}>
                {cards.map((c) =>
                  unlocked.has(c.id) ? (
                    <View key={c.id}>
                      <CardFace cardId={c.id} size="md" onPress={() => setSelected(c.id)} />
                      {isNew(c.id) && (
                        <View style={styles.newBadge} pointerEvents="none">
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <LockedCard key={c.id} size="md" onPress={() => setLockedTapped(c.id)} />
                  )
                )}
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
      />
      {selected && (
        <Pressable style={styles.overlayBg} onPress={() => setSelected(null)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.overlayTitle}>{getCard(selected).name}</Text>
            <FlipIn key={selected}>
              <CardDetail cardId={selected} />
            </FlipIn>
            <Pressable style={styles.closeButton} onPress={() => setSelected(null)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
      {completeFx && (
        <Pressable style={styles.completeLayer} onPress={() => setCompleteFx(false)}>
          {Array.from({ length: 40 }, (_, i) => (
            <CompletePiece key={i} index={i} />
          ))}
          <View style={styles.completeBox}>
            <Text style={styles.completeTitle}>🌈 コンプリート！！ 🌈</Text>
            <Text style={styles.completeSub}>
              全{allCards.length}枚のカードがそろいました！{"\n"}あなたは真のカードマスターです！
            </Text>
            <Text style={styles.completeClose}>タップで閉じる</Text>
          </View>
        </Pressable>
      )}
      {lockedTapped && (
        <Pressable style={styles.overlayBg} onPress={() => setLockedTapped(null)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.lockedEmoji}>🔒</Text>
            <Text style={styles.overlayTitle}>まだ開放されていないカードです</Text>
            <Text style={styles.lockedText}>
              実物のKDSカードにあるQRコードを読み込むと、カードが登録されて使えるようになります。
            </Text>
            <Pressable
              style={[styles.closeButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setLockedTapped(null);
                router.push("/scan");
              }}
            >
              <Text style={styles.closeText}>📷 QRコードを読み込む</Text>
            </Pressable>
            {devBuild && (
              <Pressable
                style={[styles.closeButton, { backgroundColor: colors.danger }]}
                onPress={() => {
                  const id = lockedTapped;
                  setLockedTapped(null);
                  unlockState.unlock(id);
                  evaluateAchievements();
                  setDevRevealed(id);
                }}
              >
                <Text style={styles.closeText}>🔧 テスト開放（QRの代わり）</Text>
              </Pressable>
            )}
            <Pressable style={styles.closeButton} onPress={() => setLockedTapped(null)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
      {devRevealed && (
        <PackOpeningFX cardId={devRevealed} onClose={() => setDevRevealed(null)} />
      )}
    </ScreenEnter>
  );
}

/** コンプ率の円リング（svgでぐるっと囲む） */
function CompletionRing({ collected, total }: { collected: number; total: number }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? collected / total : 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ratio >= 1 ? "#c9971b" : colors.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * ratio} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={styles.ringCount}>
            {collected}
            <Text style={styles.ringTotal}>/{total}</Text>
          </Text>
          <Text style={styles.ringLabel}>{ratio >= 1 ? "コンプ！" : `${Math.floor(ratio * 100)}%`}</Text>
        </View>
      </View>
    </View>
  );
}

/** コンプ祝祭の虹色紙吹雪（1粒） */
const COMPLETE_COLORS = ["#ff5252", "#ff9800", "#ffd600", "#8bc34a", "#00bcd4", "#3f51b5", "#9c27b0"];
function CompletePiece({ index }: { index: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 2400 + (index % 7) * 300, easing: Easing.in(Easing.quad) });
  }, [t, index]);
  const left = (index * 61) % 100;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -30 + t.value * 900 },
      { rotate: `${t.value * (360 + (index % 4) * 180)}deg` },
    ],
    opacity: t.value > 0.85 ? (1 - t.value) * 6 : 1,
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: `${left}%`,
          top: 0,
          width: 10,
          height: 14,
          borderRadius: 2,
          backgroundColor: COMPLETE_COLORS[index % COMPLETE_COLORS.length],
        },
        style,
      ]}
      pointerEvents="none"
    />
  );
}

/** 拡大表示のカードが裏からクルッとめくれて現れる */
function FlipIn({ children }: { children: React.ReactNode }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${(1 - t.value) * 90}deg` }],
    opacity: t.value < 0.4 ? t.value * 2.5 : 1,
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 40 },
  headerBox: { gap: 8, alignItems: "center", marginBottom: 4 },
  progress: { fontSize: 14, fontWeight: "900", color: colors.text },
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  compBars: { flex: 1, gap: 8 },
  compBarRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  compBarLabel: { width: 86, fontSize: 11, fontWeight: "800", color: colors.textMuted },
  compBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  compBarFill: { height: "100%", borderRadius: 4, backgroundColor: colors.success },
  compBarCount: { width: 38, fontSize: 11, fontWeight: "800", color: colors.text, textAlign: "right" },
  ringCount: { fontSize: 19, fontWeight: "900", color: colors.text },
  ringTotal: { fontSize: 11, color: colors.textMuted },
  ringLabel: { fontSize: 10, fontWeight: "800", color: colors.primary },
  searchInput: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    marginTop: 6,
  },
  filterRow: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  filterChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 7,
    alignItems: "center",
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: "800", color: colors.text },
  filterTextActive: { color: "#fff" },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: "stretch",
    alignItems: "center",
  },
  scanButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  scanCaption: {
    marginTop: 8,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: "stretch",
  },
  scanCaptionText: {
    color: "#d83030",
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  scanHint: {
    fontSize: 13,
    color: "#d83030",
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 20,
  },
  promoBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginTop: 2,
    alignSelf: "stretch",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  promoText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000aa",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  overlayBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    gap: 12,
    alignItems: "center",
  },
  overlayTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  completeLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0b1226dd",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  completeBox: { alignItems: "center", gap: 12, padding: 24 },
  completeTitle: { fontSize: 30, fontWeight: "900", color: "#ffd54d", textAlign: "center" },
  completeSub: { fontSize: 15, lineHeight: 24, color: "#fff", textAlign: "center", fontWeight: "700" },
  completeClose: { fontSize: 12, color: "#ffffff99" },
  newBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#e4318a",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 3,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  newBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  lockedEmoji: { fontSize: 36 },
  lockedText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 21 },
  closeButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeText: { color: "#fff", fontWeight: "700" },
});

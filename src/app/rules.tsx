import * as WebBrowser from "expo-web-browser";
import React, { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CardDetail } from "@/components/CardDetail";
import { CardFace } from "@/components/CardFace";
import { getCard } from "@/data/cards";
import { RuleBlock, ruleSections } from "@/tutorial/ruleSections";
import { colors, radius, shadow, spacing } from "@/theme";

export default function RulesScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const jumpTo = (id: string) => {
    // Web はブラウザの機能で確実にスクロールさせる
    if (Platform.OS === "web") {
      const el = globalThis.document?.getElementById(`rule-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    const y = offsets.current[id];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true });
  };

  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {/* 目次 */}
        <View style={styles.tocCard}>
          <Text style={styles.tocTitle}>目次</Text>
          {ruleSections.map((s, i) => (
            <Pressable key={s.id} style={styles.tocRow} onPress={() => jumpTo(s.id)}>
              <Text style={styles.tocNum}>{i + 1}</Text>
              <View style={styles.tocTextWrap}>
                <Text style={styles.tocLabel}>{s.title}</Text>
                <Text style={styles.tocSummary}>{s.summary}</Text>
              </View>
              <Text style={styles.tocArrow}>▸</Text>
            </Pressable>
          ))}
        </View>

        {ruleSections.map((section, i) => (
          <View
            key={section.id}
            nativeID={`rule-${section.id}`}
            style={styles.section}
            onLayout={(e) => {
              offsets.current[section.id] = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNum}>
                <Text style={styles.sectionNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            {section.blocks.map((block, bi) => (
              <Block key={bi} block={block} onCardPress={setDetailCardId} />
            ))}
          </View>
        ))}

        <Pressable
          style={styles.link}
          onPress={() => WebBrowser.openBrowserAsync("https://card.kds946.com")}
        >
          <Text style={styles.linkText}>公式説明書サイトを開く（card.kds946.com）</Text>
        </Pressable>
      </ScrollView>

      {detailCardId && (
        <Pressable style={styles.overlayBg} onPress={() => setDetailCardId(null)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.overlayTitle}>{getCard(detailCardId).name}</Text>
            <CardDetail cardId={detailCardId} />
            <Pressable style={styles.closeButton} onPress={() => setDetailCardId(null)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

function Block({
  block,
  onCardPress,
}: {
  block: RuleBlock;
  onCardPress: (id: string) => void;
}) {
  return (
    <View style={styles.block}>
      {!!block.heading && <Text style={styles.heading}>{block.heading}</Text>}

      {block.cards && (
        <View style={styles.cardRow}>
          {block.cards.map((c) => (
            <View key={c.id} style={styles.cardItem}>
              <CardFace cardId={c.id} size="md" onPress={() => onCardPress(c.id)} />
              <Text style={styles.cardLabel} numberOfLines={2}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {block.paragraphs?.map((p, i) => (
        <Text key={i} style={styles.body}>
          {p}
        </Text>
      ))}

      {block.steps && (
        <View style={styles.steps}>
          {block.steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {!!block.note && (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>ここに注意</Text>
          <Text style={styles.noteText}>{block.note}</Text>
        </View>
      )}

      {!!block.appTip && (
        <View style={styles.appBox}>
          <Text style={styles.appLabel}>アプリでの操作</Text>
          <Text style={styles.appText}>{block.appTip}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },

  tocCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
    ...shadow.card,
  },
  tocTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tocNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 22,
  },
  tocTextWrap: { flex: 1 },
  tocLabel: { fontSize: 14, fontWeight: "800", color: colors.text },
  tocSummary: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  tocArrow: { color: colors.primary, fontWeight: "800" },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionNumText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: colors.primaryDark },

  block: { gap: spacing.sm },
  heading: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.sm,
  },
  body: { fontSize: 15, lineHeight: 24, color: colors.text },

  cardRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  cardItem: { alignItems: "center", gap: 3, width: 92 },
  cardLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    lineHeight: 15,
  },

  steps: { gap: spacing.sm },
  stepRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepNumText: { color: colors.primary, fontWeight: "900", fontSize: 11 },
  stepText: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.text },

  noteBox: {
    backgroundColor: "#fff8e1",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: 3,
  },
  noteLabel: { fontSize: 11, fontWeight: "800", color: colors.accentDark },
  noteText: { fontSize: 14, lineHeight: 21, color: colors.text },

  appBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 3,
  },
  appLabel: { fontSize: 11, fontWeight: "800", color: colors.primary },
  appText: { fontSize: 14, lineHeight: 21, color: colors.text },

  link: { padding: spacing.md, alignItems: "center" },
  linkText: { color: colors.primary, fontWeight: "800" },

  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000088",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  overlayBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 420,
    gap: spacing.md,
    alignItems: "center",
  },
  overlayTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  closeButton: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeText: { color: "#fff", fontWeight: "700" },
});

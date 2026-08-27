import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { CardFace } from "@/components/CardFace";
import { ScreenEnter } from "@/components/ScreenEnter";
import { allCards } from "@/data/cards";
import { DEFAULT_OPEN_CARDS, qrPayloadFor } from "@/data/unlock";
import { useUnlockStore } from "@/store/unlockStore";
import { haptic } from "@/audio/haptics";
import { colors, radius, spacing } from "@/theme";

/**
 * カード管理画面（管理者用）。
 * - 配布時に開示するカードの設定（この端末での上書き＋書き出し）
 * - 全カードのQRコード一覧（実物カードの印刷用）
 * - 動作確認用のリセット
 */

const ADMIN_ID = "kds-admin";
const ADMIN_PASSWORD = "946946";

export default function AdminScreen() {
  const [authed, setAuthed] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<"open" | "qr">("open");

  // 管理画面はブラウザ専用（アプリにはメニューも無く、この画面自体も開けない）
  if (Platform.OS !== "web") {
    return (
      <ScreenEnter style={styles.root}>
        <View style={styles.gateBox}>
          <Text style={styles.gateTitle}>カード管理</Text>
          <Text style={styles.gateSub}>この画面は管理者がブラウザから利用します</Text>
        </View>
      </ScreenEnter>
    );
  }

  if (!authed) {
    const tryLogin = () => {
      if (adminId.trim() === ADMIN_ID && password === ADMIN_PASSWORD) {
        haptic("medium");
        setAuthed(true);
      } else {
        haptic("light");
        setFailed(true);
        setPassword("");
      }
    };
    return (
      <ScreenEnter style={styles.root}>
        <View style={styles.gateBox}>
          <Text style={styles.gateTitle}>カード管理</Text>
          <Text style={styles.gateSub}>管理者IDとパスワードを入力してください</Text>
          <TextInput
            style={[styles.gateInput, { letterSpacing: 0, fontSize: 15 }]}
            value={adminId}
            onChangeText={setAdminId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="管理者ID"
          />
          <TextInput
            style={styles.gateInput}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="パスワード"
            onSubmitEditing={tryLogin}
          />
          {failed && <Text style={styles.gateError}>IDまたはパスワードが違います</Text>}
          <Pressable
            style={[
              styles.gateButton,
              (adminId.length === 0 || password.length === 0) && { opacity: 0.4 },
            ]}
            onPress={tryLogin}
          >
            <Text style={styles.gateButtonText}>ログイン</Text>
          </Pressable>
        </View>
      </ScreenEnter>
    );
  }

  return (
    <ScreenEnter style={styles.root}>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, tab === "open" && styles.tabButtonActive]}
          onPress={() => setTab("open")}
        >
          <Text style={[styles.tabText, tab === "open" && styles.tabTextActive]}>
            配布時の開示設定
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === "qr" && styles.tabButtonActive]}
          onPress={() => setTab("qr")}
        >
          <Text style={[styles.tabText, tab === "qr" && styles.tabTextActive]}>QRコード一覧</Text>
        </Pressable>
      </View>
      {tab === "open" ? <OpenSettings /> : <QrList />}
    </ScreenEnter>
  );
}

/** 配布時に開示するカードの設定 */
function OpenSettings() {
  const { openOverride, setOpenOverride, resetScanned, scannedIds } = useUnlockStore();
  const effective = new Set(openOverride ?? DEFAULT_OPEN_CARDS);
  const [showExport, setShowExport] = useState(false);

  const toggle = (id: string) => {
    haptic("light");
    const next = new Set(effective);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenOverride([...next]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.note}>
        緑のカードが「配布時から使える」カードです。タップで切り替えられます。{"\n"}
        この設定はこの端末にすぐ反映されます。全ユーザーへの反映は、下の「設定を書き出す」の
        内容を開発者に伝えてアプリ更新として配信してください。
      </Text>
      <View style={styles.rowButtons}>
        <Pressable style={styles.smallButton} onPress={() => setOpenOverride(null)}>
          <Text style={styles.smallButtonText}>標準セットに戻す</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={() => setShowExport((v) => !v)}>
          <Text style={styles.smallButtonText}>設定を書き出す</Text>
        </Pressable>
      </View>
      {showExport && (
        <View style={styles.exportBox}>
          <Text selectable style={styles.exportText}>
            {JSON.stringify([...effective])}
          </Text>
        </View>
      )}
      <View style={styles.grid}>
        {allCards.map((c) => {
          const open = effective.has(c.id);
          return (
            <Pressable key={c.id} style={styles.gridItem} onPress={() => toggle(c.id)}>
              <View style={[styles.cardWrap, open ? styles.cardOpen : styles.cardClosed]}>
                <CardFace cardId={c.id} size="sm" />
              </View>
              <Text style={[styles.gridLabel, { color: open ? colors.success : colors.textMuted }]}>
                {open ? "開示" : "非開示"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>動作確認</Text>
      <Text style={styles.note}>
        QRコードで開放したカード（現在 {scannedIds.length} 枚）を未開放に戻します。
      </Text>
      <Pressable
        style={[styles.smallButton, { backgroundColor: colors.danger, alignSelf: "flex-start" }]}
        onPress={() => {
          haptic("medium");
          resetScanned();
        }}
      >
        <Text style={styles.smallButtonText}>QR開放をすべてリセット</Text>
      </Pressable>
    </ScrollView>
  );
}

/** 実物カードに印刷するQRコードの一覧 */
function QrList() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.note}>
        実物カードの裏面などに印刷するQRコードです。同じ種類のカードはすべて同じコードです。{"\n"}
        小さく印刷できるよう短いコード（25×25〜29×29マス）にしています。印刷サイズは
        12mm角以上（推奨15mm角）を目安に、周囲に白い余白を残してください。{"\n"}
        パソコンのブラウザで開いてこのページを印刷するか、スクリーンショットで書き出してください。
      </Text>
      <View style={styles.qrGrid}>
        {allCards.map((c) => (
          <View key={c.id} style={styles.qrItem}>
            <QRCode value={qrPayloadFor(c.id)} size={120} ecl="L" quietZone={6} />
            <Text style={styles.qrName}>{c.name}</Text>
            <Text style={styles.qrId}>{c.id}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  gateBox: {
    margin: spacing.xl,
    marginTop: 60,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "stretch",
    gap: spacing.sm,
  },
  gateTitle: { fontSize: 20, fontWeight: "900", color: colors.text, textAlign: "center" },
  gateSub: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  gateInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: "center",
    color: colors.text,
  },
  gateButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  gateButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  gateError: { color: colors.danger, fontSize: 13, fontWeight: "800", textAlign: "center" },
  tabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  tabButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontWeight: "800", color: colors.text, fontSize: 13 },
  tabTextActive: { color: "#fff" },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  rowButtons: { flexDirection: "row", gap: spacing.sm },
  smallButton: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  smallButtonText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  exportBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  exportText: { fontSize: 11, color: colors.text, fontFamily: "monospace" as never },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  gridItem: { alignItems: "center", gap: 2 },
  cardWrap: { borderRadius: 8, borderWidth: 3 },
  cardOpen: { borderColor: colors.success },
  cardClosed: { borderColor: "#3a4152", opacity: 0.45 },
  gridLabel: { fontSize: 10, fontWeight: "800" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 14 },
  qrGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18, justifyContent: "center" },
  qrItem: {
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: 12,
  },
  qrName: { fontSize: 13, fontWeight: "800", color: "#111" },
  qrId: { fontSize: 10, color: "#666" },
});

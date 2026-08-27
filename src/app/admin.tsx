import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ScreenEnter } from "@/components/ScreenEnter";
import { allCards } from "@/data/cards";
import { qrPayloadFor } from "@/data/unlock";
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
  const [tab, setTab] = useState<"qr" | "issue">("qr");

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
          style={[styles.tabButton, tab === "qr" && styles.tabButtonActive]}
          onPress={() => setTab("qr")}
        >
          <Text style={[styles.tabText, tab === "qr" && styles.tabTextActive]}>QRコード一覧</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === "issue" && styles.tabButtonActive]}
          onPress={() => setTab("issue")}
        >
          <Text style={[styles.tabText, tab === "issue" && styles.tabTextActive]}>
            新規カードのQR発行
          </Text>
        </Pressable>
      </View>
      {tab === "qr" ? <QrList /> : <IssueNewCard />}
    </ScreenEnter>
  );
}

/**
 * 新規カードのQR発行。
 * QRはカードIDから数学的に一意に決まるため、同じIDからは何度発行しても
 * 永遠に同じQRになる（保存が消えても割り当ては崩れない）。
 * 崩れる唯一の原因は「IDの変更・使い回し」なので、それを禁止する。
 */
const CARD_TYPES = [
  { key: "instructor", prefix: "i_", label: "インストラクター" },
  { key: "support", prefix: "s_", label: "サポート" },
  { key: "tantou", prefix: "t_", label: "担当" },
] as const;

/** IDの先頭記号からカードの種類名を返す */
function typeLabelOf(id: string): string {
  return CARD_TYPES.find((t) => id.startsWith(t.prefix))?.label ?? "不明";
}

function IssueNewCard() {
  const { issued, addIssued } = useUnlockStore();
  const [cardType, setCardType] = useState<(typeof CARD_TYPES)[number]>(CARD_TYPES[0]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issuedNow, setIssuedNow] = useState<{ id: string; name: string } | null>(null);

  // 種類の記号（i_/s_/t_）はアプリが自動で付ける。管理者は名前部分だけ入力する
  const fullId = `${cardType.prefix}${newId.trim()}`;

  const issue = () => {
    const name = newName.trim();
    setError(null);
    if (!/^[a-z0-9][a-z0-9_]{0,29}$/.test(newId.trim())) {
      setError(
        "IDは半角小文字英数字と_のみで入力してください（先頭は英数字）。例: yamada"
      );
      return;
    }
    if (allCards.some((c) => c.id === fullId)) {
      setError("このIDはすでにアプリ内のカードで使われています。別のIDにしてください。");
      return;
    }
    const dup = issued.find((e) => e.id === fullId);
    if (dup) {
      setError(`このIDは ${dup.at} に「${dup.name}」として発行済みです（下の記録にQRがあります）。`);
      return;
    }
    if (!name) {
      setError("カード名（メモ用）を入力してください。");
      return;
    }
    haptic("medium");
    addIssued({ id: fullId, name, at: new Date().toISOString().slice(0, 10) });
    setIssuedNow({ id: fullId, name });
    setNewId("");
    setNewName("");
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.note}>
        新しい実物カードを作るとき、印刷用のQRコードを先に発行できます。{"\n"}
        QRはカードIDから一意に決まるため、同じIDなら何度発行しても必ず同じQRになります。
        アプリへのカードの実装（画像・効果）は、同じIDでアプリ更新として追加します。
      </Text>
      <View style={styles.warnBox}>
        <Text style={styles.warnText}>
          ⚠️ 一度発行したIDの変更・使い回しは絶対にしないでください。
          印刷済みQRとカードの対応が崩れる唯一の原因になります。
        </Text>
      </View>

      <Text style={styles.sectionTitle}>発行する</Text>
      <Text style={styles.note}>カードの種類（IDの記号はアプリが自動で付けます）</Text>
      <View style={styles.typeRow}>
        {CARD_TYPES.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.typeButton, cardType.key === t.key && styles.typeButtonActive]}
            onPress={() => {
              haptic("light");
              setCardType(t);
            }}
          >
            <Text
              style={[styles.typeText, cardType.key === t.key && styles.typeTextActive]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.issueInput}
        value={newId}
        onChangeText={(v) => setNewId(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="ID（例: yamada）※半角小文字英数字"
      />
      {newId.trim() !== "" && (
        <Text style={styles.idPreview}>
          発行されるカードID: <Text style={{ fontWeight: "900" }}>{fullId}</Text>（{cardType.label}）
        </Text>
      )}
      <TextInput
        style={styles.issueInput}
        value={newName}
        onChangeText={setNewName}
        placeholder="カード名（例: 山田）※記録用のメモ"
      />
      {error && <Text style={styles.issueError}>{error}</Text>}
      <Pressable
        style={[styles.gateButton, (!newId.trim() || !newName.trim()) && { opacity: 0.4 }]}
        onPress={issue}
      >
        <Text style={styles.gateButtonText}>QRコードを発行する</Text>
      </Pressable>

      {issuedNow && (
        <View style={styles.qrItem}>
          <QRCode value={qrPayloadFor(issuedNow.id)} size={140} ecl="L" quietZone={6} />
          <Text style={styles.qrName}>{issuedNow.name}</Text>
          <Text style={styles.qrId}>
            {issuedNow.id}（{typeLabelOf(issuedNow.id)}）
          </Text>
          <Text style={styles.qrId} selectable>
            {qrPayloadFor(issuedNow.id)}
          </Text>
        </View>
      )}

      {issued.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>発行の記録（このブラウザに保存）</Text>
          <Text style={styles.note}>
            記録が消えても、同じIDで再発行すれば必ず同じQRが出ます。
          </Text>
          <View style={styles.qrGrid}>
            {issued.map((e) => (
              <View key={e.id} style={styles.qrItem}>
                <QRCode value={qrPayloadFor(e.id)} size={120} ecl="L" quietZone={6} />
                <Text style={styles.qrName}>{e.name}</Text>
                <Text style={styles.qrId}>
                  {e.id}（{typeLabelOf(e.id)}・{e.at}）
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** 実物カードに印刷するQRコードの一覧 */
function QrList() {
  const { resetScanned, scannedIds } = useUnlockStore();
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

      <Text style={styles.sectionTitle}>動作確認</Text>
      <Text style={styles.note}>
        このブラウザでQRから開放したカード（現在 {scannedIds.length} 枚）を未開放に戻します。
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
  warnBox: {
    backgroundColor: "#fdecec",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md,
  },
  warnText: { fontSize: 13, color: colors.danger, fontWeight: "800", lineHeight: 20 },
  issueInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
  },
  issueError: { fontSize: 12, color: colors.danger, fontWeight: "800", lineHeight: 18 },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: "center",
  },
  typeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { fontWeight: "800", color: colors.text, fontSize: 13 },
  typeTextActive: { color: "#fff" },
  idPreview: { fontSize: 13, color: colors.text, fontWeight: "700" },
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

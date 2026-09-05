import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { AppButton } from "@/components/AppButton";
import { CardFace } from "@/components/CardFace";
import { ScreenEnter } from "@/components/ScreenEnter";
import { RANKS, rankIndexFor, totalDistanceKm, winsToNextRank } from "@/data/rank";
import { shareLicenseImage } from "@/data/shareImage";
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useRankStore } from "@/store/rankStore";
import { shindanTypeOf } from "@/data/shindan";
import { ACHIEVEMENTS } from "@/data/achievements";
import { useAchievementStore } from "@/store/achievementStore";
import { allCards } from "@/data/cards";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { useOnlinePrefs } from "./online";
import { useRecordStore } from "@/store/recordStore";
import { colors, radius, spacing } from "@/theme";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";

/**
 * 教習生免許証（プロフィール）。
 * 運転免許証風のカードに、名前・段階・戦績・走行距離を表示する。
 */
export default function LicenseScreen() {
  // LINEゲートの殻。連携状態でフックの数が変わって落ちないよう（React #310）、
  // 本体は別コンポーネントに分けて連携済みのときだけマウントする
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;
  return <LicenseScreenBody />;
}

function LicenseScreenBody() {

  const router = useRouter();
  const record = useRecordStore();
  const rankStore = useRankStore();
  const deckState = useDeckStore();
  const activeDeck = resolveActiveDeck(deckState);

  const rankIdx = rankIndexFor(record.wins);
  const rank = RANKS[rankIdx];
  const nextRank = winsToNextRank(record.wins);
  const km = totalDistanceKm(record.wins + record.losses);
  const gold = rankIdx >= RANKS.length - 1;

  const shindan = shindanTypeOf(rankStore.shindanType);
  // 獲得済みの称号（実績のtitle付きのうち達成済みのもの）
  const earned = useAchievementStore((s) => s.earned);
  const earnedTitles = ACHIEVEMENTS.filter((a) => a.title && earned[a.id]).map((a) => a.title!);
  const [titlePicker, setTitlePicker] = useState(false);
  // 顔写真のカード選択
  const unlock = useUnlockStore();
  const owned = allCards.filter((c) => unlockedSet(unlock).has(c.id)).map((c) => c.id);
  const [photoPicker, setPhotoPicker] = useState(false);
  const photoCard = rankStore.favoriteCard || activeDeck.list.tantou;
  const [editing, setEditing] = useState(false);
  // ネイティブの画像共有は免許証カードの見た目をそのまま撮って共有する
  const licenseRef = React.useRef<View>(null);
  const shareNative = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { captureRef } = require("react-native-view-shot") as {
        captureRef: (ref: unknown, opts: object) => Promise<string>;
      };
      const Sharing = await import("expo-sharing");
      const uri = await captureRef(licenseRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "教習生免許証" });
      }
    } catch {
      // キャンセルや未対応環境では何もしない
    }
  };
  const [draft, setDraft] = useState(rankStore.playerName);

  const name = rankStore.playerName || "教習生";

  /** 自分の写真を選ぶ（ネイティブ: 写真ライブラリ）。中央3:4に切り抜き縮小して保存 */
  const pickOwnPhotoNative = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 1,
      });
      const asset = res.assets?.[0];
      if (!asset) return;
      // 中央を3:4に切り抜いて縮小し、dataURLで保存（Webと同じ形式）
      const Manipulator = await import("expo-image-manipulator");
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      const targetRatio = 3 / 4;
      let cropW = w;
      let cropH = Math.round(w / targetRatio);
      if (cropH > h) {
        cropH = h;
        cropW = Math.round(h * targetRatio);
      }
      const out = await Manipulator.manipulateAsync(
        asset.uri,
        [
          { crop: { originX: Math.round((w - cropW) / 2), originY: Math.round((h - cropH) / 2), width: cropW, height: cropH } },
          { resize: { width: 360, height: 480 } },
        ],
        { compress: 0.85, format: Manipulator.SaveFormat.JPEG, base64: true }
      );
      if (out.base64) {
        rankStore.setPlayerPhoto(`data:image/jpeg;base64,${out.base64}`);
        setPhotoPicker(false);
        haptic("light");
      }
    } catch {
      // 権限拒否や選択キャンセル時は何もしない
    }
  };

  /** 自分の写真をアップロード（Web）。中央を3:4に切り抜き縮小して保存する */
  const pickOwnPhoto = () => {
    if (Platform.OS !== "web") {
      void pickOwnPhotoNative();
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const el = new window.Image();
        el.onload = () => {
          const bw = 360;
          const bh = 480;
          const canvas = document.createElement("canvas");
          canvas.width = bw;
          canvas.height = bh;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const sc = Math.max(bw / el.width, bh / el.height);
          ctx.drawImage(
            el,
            (bw - el.width * sc) / 2,
            (bh - el.height * sc) / 2,
            el.width * sc,
            el.height * sc
          );
          rankStore.setPlayerPhoto(canvas.toDataURL("image/jpeg", 0.85));
          setPhotoPicker(false);
          haptic("light");
        };
        el.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🪪 教習生免許証</Text>

        {/* 免許証カード */}
        <View style={styles.license} ref={licenseRef} collapsable={false}>
          <View style={[styles.licenseBand, gold && styles.licenseBandGold]}>
            <Text style={styles.licenseBandText}>KDSカードゲーム 教習生免許証</Text>
          </View>
          <View style={styles.licenseBody}>
            <View style={styles.licenseLeft}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>氏名</Text>
                {editing ? (
                  <TextInput
                    style={styles.nameInput}
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={10}
                    autoFocus
                    placeholder="なまえ（10文字まで）"
                    onSubmitEditing={() => {
                      rankStore.setPlayerName(draft.trim());
                      useOnlinePrefs.getState().setName(draft.trim().slice(0, 10));
                      setEditing(false);
                    }}
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      haptic("light");
                      setDraft(rankStore.playerName);
                      setEditing(true);
                    }}
                  >
                    <Text style={styles.fieldName}>
                      {name} <Text style={styles.editHint}>✏️</Text>
                    </Text>
                  </Pressable>
                )}
              </View>
              {editing && (
                <Pressable
                  style={styles.saveButton}
                  onPress={() => {
                    rankStore.setPlayerName(draft.trim());
                    useOnlinePrefs.getState().setName(draft.trim().slice(0, 10));
                    setEditing(false);
                  }}
                >
                  <Text style={styles.saveButtonText}>保存</Text>
                </Pressable>
              )}
              {!!rankStore.selectedTitle && (
                <Text style={styles.titleBadge}>🎖 {rankStore.selectedTitle}</Text>
              )}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>段階</Text>
                <Text style={styles.fieldValue}>
                  {rank.emoji} {rank.name}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>交付日</Text>
                <Text style={styles.fieldValue}>{rankStore.since}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>成績</Text>
                <Text style={styles.fieldValue}>
                  {record.wins}勝 {record.losses}敗
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>走行距離</Text>
                <Text style={styles.fieldValue}>{km.toLocaleString()}km</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>称号</Text>
                {earnedTitles.length > 0 ? (
                  <Pressable onPress={() => setTitlePicker(true)}>
                    <Text style={styles.fieldValue}>
                      {rankStore.selectedTitle || "未設定"}
                      <Text style={styles.editHint}> ▾</Text>
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.fieldValue, { color: "#5a6b50" }]}>実績を達成すると選べます</Text>
                )}
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>適性</Text>
                {shindan ? (
                  <Text style={styles.fieldValue}>
                    {shindan.emoji} {shindan.name}
                  </Text>
                ) : (
                  <Pressable onPress={() => router.push("/shindan")}>
                    <Text style={[styles.fieldValue, { color: "#1a5fb4" }]}>未診断（タップで診断）▸</Text>
                  </Pressable>
                )}
              </View>
            </View>
            {/* 顔写真の枠。タップでお気に入りカードに変更できる */}
            <Pressable style={styles.photoBox} onPress={() => setPhotoPicker(true)}>
              {rankStore.playerPhoto ? (
                <Image source={{ uri: rankStore.playerPhoto }} style={styles.photoImg} />
              ) : (
                <CardFace cardId={photoCard} size="md" />
              )}
              <Text style={styles.photoLabel}>写真（タップで変更）</Text>
            </Pressable>
          </View>
          <View style={styles.licenseFooter}>
            <Text style={styles.footerNote}>
              {nextRank
                ? `あと${nextRank.remain}勝で「${nextRank.next.name}」に進級`
                : "全課程修了！おめでとうございます！"}
            </Text>
            <View style={styles.hankoBox}>
              <Text style={styles.hankoBoxText}>KDS</Text>
            </View>
          </View>
        </View>

        <AppButton
          label="📤 免許証を画像で共有"
          custom={{ bg: "#e2604a" }}
          fullWidth
          onPress={() => {
            if (Platform.OS !== "web") {
              haptic("light");
              void shareNative();
              return;
            }
            void shareLicenseImage({
              name,
              typeName: shindan ? `${shindan.emoji} ${shindan.name}` : "",
              title: rankStore.selectedTitle,
              rankName: rank.name,
              rankEmoji: rank.emoji,
              since: rankStore.since,
              wins: record.wins,
              losses: record.losses,
              km,
              gold,
              photo: rankStore.playerPhoto || undefined,
            });
          }}
        />
        <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.back()} />

        {/* 称号えらび */}
        {titlePicker && (
          <Pressable style={styles.pickerLayer} onPress={() => setTitlePicker(false)}>
            <Pressable style={styles.pickerBox} onPress={() => {}}>
              <Text style={styles.pickerTitle}>🎖 称号をえらぶ</Text>
              <ScrollView style={styles.pickerScroll}>
                <Pressable
                  style={styles.pickerRow}
                  onPress={() => {
                    rankStore.setSelectedTitle("");
                    setTitlePicker(false);
                  }}
                >
                  <Text style={styles.pickerRowText}>（表示しない）</Text>
                </Pressable>
                {earnedTitles.map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.pickerRow, rankStore.selectedTitle === t && styles.pickerRowActive]}
                    onPress={() => {
                      haptic("light");
                      rankStore.setSelectedTitle(t);
                      setTitlePicker(false);
                    }}
                  >
                    <Text style={styles.pickerRowText}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        )}

        {/* 顔写真のカードえらび */}
        {photoPicker && (
          <Pressable style={styles.pickerLayer} onPress={() => setPhotoPicker(false)}>
            <Pressable style={styles.pickerBox} onPress={() => {}}>
              <Text style={styles.pickerTitle}>📷 写真をえらぶ</Text>
              <Pressable style={styles.uploadButton} onPress={pickOwnPhoto}>
                <Text style={styles.uploadButtonText}>📸 自分の写真をアップロード</Text>
              </Pressable>
              {!!rankStore.playerPhoto && (
                <Pressable
                  style={styles.uploadReset}
                  onPress={() => {
                    haptic("light");
                    rankStore.setPlayerPhoto("");
                    setPhotoPicker(false);
                  }}
                >
                  <Text style={styles.uploadResetText}>写真を消してカードにもどす</Text>
                </Pressable>
              )}
              <Text style={styles.pickerSub}>またはカードをえらぶ</Text>
              <ScrollView style={styles.pickerScroll}>
                <View style={styles.photoGrid}>
                  {owned.map((id) => (
                    <Pressable
                      key={id}
                      onPress={() => {
                        haptic("light");
                        rankStore.setFavoriteCard(id);
                        rankStore.setPlayerPhoto("");
                        setPhotoPicker(false);
                      }}
                    >
                      <CardFace cardId={id} size="sm" />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        )}

        <Text style={styles.note}>
          名前をタップすると変更できます。段階は通算勝利数で上がっていきます
          （{RANKS.map((r) => r.name).join(" → ")}）。
        </Text>
      </ScrollView>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" },
  title: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  license: {
    backgroundColor: "#f2f7ec",
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: "#9db48a",
    overflow: "hidden",
  },
  licenseBand: { backgroundColor: "#3f7d3a", paddingVertical: 8, alignItems: "center" },
  licenseBandGold: { backgroundColor: "#c9a227" },
  licenseBandText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  licenseBody: { flexDirection: "row", padding: 14, gap: 12 },
  licenseLeft: { flex: 1, gap: 8 },
  fieldRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  fieldLabel: { width: 62, fontSize: 11, fontWeight: "800", color: "#5a6b50" },
  fieldName: { fontSize: 20, fontWeight: "900", color: "#1c2a1a" },
  editHint: { fontSize: 13 },
  titleBadge: { fontSize: 13, fontWeight: "800", color: "#7a5a00" },
  fieldValue: { fontSize: 14, fontWeight: "700", color: "#1c2a1a" },
  nameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#9db48a",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#1c2a1a",
    backgroundColor: "#fff",
  },
  saveButton: {
    alignSelf: "flex-end",
    backgroundColor: "#3f7d3a",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  saveButtonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  photoBox: { alignItems: "center", gap: 4 },
  photoLabel: { fontSize: 10, fontWeight: "700", color: "#5a6b50" },
  licenseFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  footerNote: { fontSize: 11, fontWeight: "700", color: "#5a6b50", flex: 1 },
  hankoBox: {
    borderWidth: 2,
    borderColor: "#d02020",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    transform: [{ rotate: "-6deg" }],
  },
  hankoBoxText: { color: "#d02020", fontSize: 13, fontWeight: "900" },
  note: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  pickerLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000a0",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50,
  },
  pickerBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
  },
  pickerTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "center" },
  pickerScroll: { flexGrow: 0 },
  pickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowActive: { backgroundColor: colors.surfaceAlt, borderRadius: 8 },
  pickerRowText: { fontSize: 15, fontWeight: "700", color: colors.text },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  photoImg: {
    width: 96,
    height: 128,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#9db48a",
    backgroundColor: "#fff",
  },
  uploadButton: {
    backgroundColor: "#1a5fb4",
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  uploadButtonText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  uploadReset: { alignItems: "center", paddingVertical: 6 },
  uploadResetText: { color: "#c62828", fontWeight: "800", fontSize: 12 },
  pickerSub: { fontSize: 12, fontWeight: "800", color: colors.textMuted, textAlign: "center" },
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

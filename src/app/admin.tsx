import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
  // null はメニュー（入り口）。各機能はメニューのボタンから移動する
  const [tab, setTab] = useState<"qr" | "issue" | "stats" | null>(null);

  // 管理画面はブラウザ専用（アプリにはメニューも無く、この画面自体も開けない）
  if (Platform.OS !== "web") {
    return (
      <ScreenEnter style={styles.root}>
        <View style={styles.gateBox}>
          <Text style={styles.gateTitle}>管理画面</Text>
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
          <Text style={styles.gateTitle}>管理画面</Text>
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

  // メニュー（入り口）: 各機能へのボタンを並べる
  if (tab === null) {
    return (
      <ScreenEnter style={styles.root}>
        <View style={styles.menuBox}>
          <Text style={styles.menuTitle}>管理画面</Text>
          <Text style={styles.gateSub}>利用する機能を選んでください</Text>
          <Pressable style={styles.menuButton} onPress={() => setTab("qr")}>
            <Text style={styles.menuButtonText}>🗂 QRコード一覧</Text>
            <Text style={styles.menuButtonSub}>全カードのQRの表示・画像保存</Text>
          </Pressable>
          <Pressable style={styles.menuButton} onPress={() => setTab("issue")}>
            <Text style={styles.menuButtonText}>🆕 新規カードのQR発行</Text>
            <Text style={styles.menuButtonSub}>カード実装前にQRを先行発行</Text>
          </Pressable>
          <Pressable style={styles.menuButton} onPress={() => setTab("stats")}>
            <Text style={styles.menuButtonText}>📈 分析</Text>
            <Text style={styles.menuButtonSub}>利用者数・対戦数・QR登録などの集計</Text>
          </Pressable>
        </View>
      </ScreenEnter>
    );
  }

  const tabTitle =
    tab === "qr" ? "QRコード一覧" : tab === "issue" ? "新規カードのQR発行" : "📈 分析";
  return (
    <ScreenEnter style={styles.root}>
      <View style={styles.tabRow}>
        <Pressable style={styles.tabButton} onPress={() => setTab(null)}>
          <Text style={styles.tabText}>← 管理画面トップへ</Text>
        </Pressable>
        <Text style={styles.tabTitle}>{tabTitle}</Text>
      </View>
      {tab === "qr" ? <QrList /> : tab === "issue" ? <IssueNewCard /> : <StatsPanel />}
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
    addIssued({ id: fullId, name, at: jstToday() });
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
          <QrDownloadButton cardId={issuedNow.id} name={issuedNow.name} />
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
                <QrDownloadButton cardId={e.id} name={e.name} />
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

/**
 * QRコードをPNG画像としてダウンロードする（管理画面はブラウザ専用）。
 * 512pxで書き出すので、縮小して印刷しても輪郭がにじまない
 */
async function downloadQrPng(cardId: string, name: string): Promise<void> {
  // 型定義のないライブラリ（react-native-qrcode-svg が同梱している qrcode）を使う
  const QRCodeLib = (await import("qrcode" as string)).default as {
    toDataURL: (text: string, opts?: object) => Promise<string>;
  };
  const url = await QRCodeLib.toDataURL(qrPayloadFor(cardId), {
    errorCorrectionLevel: "L",
    margin: 4,
    width: 512,
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = `qr_${cardId}_${name}.png`;
  a.click();
}

/** QR1つぶんの操作ボタン（画像の保存・単独表示・コードのコピー） */
function QrDownloadButton({ cardId, name }: { cardId: string; name: string }) {
  const [solo, setSolo] = useState(false);
  const [copied, setCopied] = useState(false);
  const payload = qrPayloadFor(cardId);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピーできない環境でも、下のコード表示を選択して手でコピーできる
    }
  };
  return (
    <>
      {/* スキャン画面の「コードを直接入力」に使う文字列 */}
      <Text style={styles.qrCode} selectable>
        {payload}
      </Text>
      <Pressable
        style={[styles.qrDownloadButton, { backgroundColor: "#2f855a" }]}
        onPress={() => void copy()}
      >
        <Text style={styles.qrDownloadText}>{copied ? "✅ コピーしました" : "📋 コードをコピー"}</Text>
      </Pressable>
      <Pressable
        style={styles.qrDownloadButton}
        onPress={() => void downloadQrPng(cardId, name)}
      >
        <Text style={styles.qrDownloadText}>⬇ 画像を保存</Text>
      </Pressable>
      <Pressable
        style={[styles.qrDownloadButton, { backgroundColor: "#4a5568" }]}
        onPress={() => setSolo(true)}
      >
        <Text style={styles.qrDownloadText}>🔍 単独で表示</Text>
      </Pressable>
      {/* 1つのQRだけを大きく表示する（画面からそのまま読み取るとき、隣のQRが映り込まない） */}
      <Modal visible={solo} transparent animationType="fade" onRequestClose={() => setSolo(false)}>
        <Pressable style={styles.soloBackdrop} onPress={() => setSolo(false)}>
          <View style={styles.soloBox}>
            <QRCode value={qrPayloadFor(cardId)} size={280} ecl="L" quietZone={10} />
            <Text style={styles.soloName}>{name}</Text>
            <Text style={styles.qrId}>{cardId}</Text>
            <Pressable style={styles.soloClose} onPress={() => setSolo(false)}>
              <Text style={styles.qrDownloadText}>閉じる</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
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
            <QrDownloadButton cardId={c.id} name={c.name} />
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

/** 時間帯別の対戦数の棒グラフ（0〜23時、CPU=青・オンライン=赤） */
function HourlyChart({ cpu, online }: { cpu: number[]; online: number[] }) {
  const max = Math.max(1, ...cpu, ...online);
  const total = cpu.reduce((a, b) => a + b, 0) + online.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <Text style={styles.note}>まだデータがありません（対戦が集まると表示されます）</Text>;
  }
  return (
    <View style={{ gap: 3 }}>
      {Array.from({ length: 24 }, (_, h) => {
        const c = cpu[h] ?? 0;
        const o = online[h] ?? 0;
        if (c === 0 && o === 0) return null;
        return (
          <View key={h} style={hourlyStyles.row}>
            <Text style={hourlyStyles.hour}>{String(h).padStart(2, "0")}時</Text>
            <View style={hourlyStyles.bars}>
              <View style={[hourlyStyles.bar, hourlyStyles.barCpu, { width: `${(c / max) * 100}%` }]} />
              <View style={[hourlyStyles.bar, hourlyStyles.barOnline, { width: `${(o / max) * 100}%` }]} />
            </View>
            <Text style={hourlyStyles.count}>
              {c > 0 ? `CPU ${c}` : ""}
              {c > 0 && o > 0 ? " / " : ""}
              {o > 0 ? `オンライン ${o}` : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const hourlyStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  hour: { width: 36, fontSize: 12, fontWeight: "800", color: colors.textMuted },
  bars: { flex: 1, gap: 2 },
  bar: { height: 7, borderRadius: 3, minWidth: 2 },
  barCpu: { backgroundColor: "#3d8fd0" },
  barOnline: { backgroundColor: "#d83030" },
  count: { fontSize: 11, color: colors.textMuted, minWidth: 90, textAlign: "right" },
});

/** ISO形式(UTC)の時刻を日本時間の「YYYY-MM-DD HH:mm」にして返す */
function formatJst(iso: string, withDate = true): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const hm = `${p(j.getUTCHours())}:${p(j.getUTCMinutes())}`;
  return withDate
    ? `${j.getUTCFullYear()}-${p(j.getUTCMonth() + 1)}-${p(j.getUTCDate())} ${hm}`
    : `${p(j.getUTCMonth() + 1)}-${p(j.getUTCDate())} ${hm}`;
}

/** 日本時間の今日の日付（YYYY-MM-DD） */
function jstToday(): string {
  return formatJst(new Date().toISOString()).slice(0, 10);
}

/** 利用状況の分析。対戦サーバーの集計とエラー報告を表示する */
function StatsPanel() {
  interface Stats {
    generatedAt: string;
    devices: { total: number; today: number; last7: number; last30: number };
    appOpens: { total: number; today: number };
    matches: {
      total: number;
      today: number;
      cpu: number;
      online: number;
      cpuWinRate: number | null;
      avgTurns: number | null;
      avgDurationSec: number | null;
      firstWinRate: number | null;
      byDifficulty: Record<string, { matches: number; wins: number }>;
    };
    scans: { total: number; topCards: { cardId: string; count: number }[] };
    hourly?: { cpu: number[]; online: number[] };
    line?: {
      linkedDevices: number;
      knownStateDevices: number;
      totalDevices: number;
      rate: number | null;
      active7: { linked: number; known: number };
      rate7: number | null;
      active30: { linked: number; known: number };
      rate30: number | null;
      linkActionsTotal: number;
      linkActionsToday: number;
      daily: { date: string; links: number }[];
    };
    cardUsage?: { cardId: string; matches: number; wins: number }[];
    bestPairs?: { pair: string[]; matches: number; wins: number }[];
    env: Record<string, { opens: number; matches: number }>;
    daily: {
      date: string;
      opens: number;
      matches: number;
      onlineMatches: number;
      scans: number;
      devices: number;
    }[];
  }
  const [stats, setStats] = useState<Stats | null>(null);
  const [errors, setErrors] = useState<{ at: string; msg: string; url?: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const base = "https://kds-taisen.fly.dev";
      // ブラウザのHTTPキャッシュに乗らないよう、時刻つきURL＋no-storeで取得する
      const bust = `&t=${Date.now()}`;
      const s = (await fetch(`${base}/stats?key=946946${bust}`, { cache: "no-store" }).then((r) =>
        r.json()
      )) as Stats;
      setStats(s);
      // エラーログは取れなくても集計表示は続ける
      try {
        const e = (await fetch(`${base}/errlog?key=946946${bust}`, { cache: "no-store" }).then((r) => r.json())) as {
          at: string;
          msg: string;
          url?: string;
        }[];
        setErrors(e.slice(0, 10));
      } catch {
        setErrors([]);
      }
    } catch {
      setLoadError("サーバーから集計を取得できませんでした。通信環境を確認してください。");
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const dur = (v: number | null) =>
    v === null ? "—" : `${Math.floor(v / 60)}分${Math.round(v % 60)}秒`;
  const maxDaily = Math.max(1, ...(stats?.daily.map((d) => Math.max(d.opens, d.matches)) ?? [1]));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.rowButtons}>
        <Pressable style={styles.smallButton} onPress={() => void load()}>
          <Text style={styles.smallButtonText}>🔄 最新に更新</Text>
        </Pressable>
        {stats && (
          <Text style={styles.note}>集計時刻: {formatJst(stats.generatedAt)}（日本時間）</Text>
        )}
      </View>
      {loadError && <Text style={styles.issueError}>{loadError}</Text>}
      {!stats && !loadError && <Text style={styles.note}>読み込み中…</Text>}
      {stats && (
        <>
          <Text style={styles.sectionTitle}>利用ユーザー（匿名の端末数）</Text>
          <View style={styles.statGrid}>
            <StatCard label="累計" value={`${stats.devices.total}`} />
            <StatCard label="今日" value={`${stats.devices.today}`} />
            <StatCard label="直近7日" value={`${stats.devices.last7}`} />
            <StatCard label="直近30日" value={`${stats.devices.last30}`} />
          </View>

          <Text style={styles.sectionTitle}>起動と対戦</Text>
          <View style={styles.statGrid}>
            <StatCard label="起動回数（累計）" value={`${stats.appOpens.total}`} />
            <StatCard label="起動（今日）" value={`${stats.appOpens.today}`} />
            <StatCard label="対戦数（累計）" value={`${stats.matches.total}`} />
            <StatCard label="対戦（今日）" value={`${stats.matches.today}`} />
            <StatCard label="CPU対戦" value={`${stats.matches.cpu}`} />
            <StatCard label="オンライン対戦" value={`${stats.matches.online}`} />
            <StatCard label="CPU戦の勝率" value={pct(stats.matches.cpuWinRate)} />
            <StatCard label="先攻の勝率" value={pct(stats.matches.firstWinRate)} />
            <StatCard label="平均ターン数" value={stats.matches.avgTurns === null ? "—" : stats.matches.avgTurns.toFixed(1)} />
            <StatCard label="平均対戦時間" value={dur(stats.matches.avgDurationSec)} />
            <StatCard label="QR登録数" value={`${stats.scans.total}`} />
          </View>

          <Text style={styles.sectionTitle}>日別の推移（直近14日）</Text>
          <View style={styles.dailyChart}>
            {stats.daily.map((d) => (
              <View key={d.date} style={styles.dailyCol}>
                <View style={styles.dailyBars}>
                  <View
                    style={[
                      styles.dailyBar,
                      { height: (d.opens / maxDaily) * 70, backgroundColor: colors.primary },
                    ]}
                  />
                  <View
                    style={[
                      styles.dailyBar,
                      { height: (d.matches / maxDaily) * 70, backgroundColor: colors.success },
                    ]}
                  />
                </View>
                <Text style={styles.dailyLabel}>{d.date.slice(5).replace("-", "/")}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>青=起動回数 ／ 緑=対戦数</Text>

          <Text style={styles.sectionTitle}>CPUの強さ別（対戦数と勝率）</Text>
          {Object.entries(stats.matches.byDifficulty).map(([k, v]) => (
            <Text key={k} style={styles.statLine}>
              ・{k === "easy" ? "よわい" : k === "hard" ? "つよい" : "ふつう"}: {v.matches}戦（勝率{" "}
              {v.matches > 0 ? Math.round((v.wins / v.matches) * 100) : 0}%）
            </Text>
          ))}

          <Text style={styles.sectionTitle}>QR登録の多いカード（トップ10）</Text>
          {stats.scans.topCards.length === 0 && <Text style={styles.note}>まだ登録がありません</Text>}
          {stats.scans.topCards.map((c, i) => (
            <Text key={c.cardId} style={styles.statLine}>
              {i + 1}. {allCards.find((x) => x.id === c.cardId)?.name ?? c.cardId}（{c.count}回）
            </Text>
          ))}

          <Text style={styles.sectionTitle}>💚 LINE連携の分析</Text>
          {stats.line ? (
            <>
              <Text style={styles.statLine}>
                連携済み端末: {stats.line.linkedDevices} / 状態が分かる端末 {stats.line.knownStateDevices}
                {stats.line.rate !== null ? `（連携率 ${Math.round(stats.line.rate * 100)}%）` : ""}
              </Text>
              <Text style={styles.statLine}>
                未連携端末: {Math.max(0, stats.line.knownStateDevices - stats.line.linkedDevices)}
                ／ 状態不明（古い版のまま）: {Math.max(0, stats.line.totalDevices - stats.line.knownStateDevices)}
              </Text>
              <Text style={styles.statLine}>
                直近7日のアクティブ: 連携 {stats.line.active7.linked} / {stats.line.active7.known}
                {stats.line.rate7 !== null ? `（${Math.round(stats.line.rate7 * 100)}%）` : ""}
              </Text>
              <Text style={styles.statLine}>
                直近30日のアクティブ: 連携 {stats.line.active30.linked} / {stats.line.active30.known}
                {stats.line.rate30 !== null ? `（${Math.round(stats.line.rate30 * 100)}%）` : ""}
              </Text>
              <Text style={styles.statLine}>
                連携アクション（コード入力等の実行数）: 累計 {stats.line.linkActionsTotal} ／ 今日 {stats.line.linkActionsToday}
              </Text>
              {stats.line.daily.some((d) => d.links > 0) && (
                <>
                  <Text style={styles.note}>日別の新規連携（直近14日）</Text>
                  {stats.line.daily
                    .filter((d) => d.links > 0)
                    .map((d) => (
                      <Text key={d.date} style={styles.statLine}>
                        {d.date.slice(5)}: {d.links}件
                      </Text>
                    ))}
                </>
              )}
              <Text style={styles.note}>
                連携率は「連携状態を送ってきた端末」のうち連携済みの割合です。
                現在は全員が既定で連携済みのため、ロック運用を始めると実際の連携率になります。
              </Text>
            </>
          ) : (
            <Text style={styles.note}>まだデータがありません（アプリの起動が集まると表示されます）</Text>
          )}

          <Text style={styles.sectionTitle}>⏰ 時間帯別の対戦数（日本時間）</Text>
          <Text style={styles.note}>
            どの時間帯に遊ばれているかの集計です（青=CPU対戦 / 赤=オンライン対戦）。
          </Text>
          <HourlyChart cpu={stats.hourly?.cpu ?? []} online={stats.hourly?.online ?? []} />

          <Text style={styles.sectionTitle}>カード別のメタ分析（使用数と勝率）</Text>
          <Text style={styles.note}>
            そのカードが入ったデッキの対戦数と勝率です。勝率が極端に高い/低いカードは
            実カードの調整（第2弾）の参考になります。5戦以上のカードのみ勝率を表示します。
          </Text>
          {(stats.cardUsage ?? []).length === 0 && (
            <Text style={styles.note}>まだデータがありません（対戦が集まると表示されます）</Text>
          )}
          {(stats.cardUsage ?? []).slice(0, 20).map((c, i) => (
            <Text key={c.cardId} style={styles.statLine}>
              {i + 1}. {allCards.find((x) => x.id === c.cardId)?.name ?? c.cardId}: {c.matches}戦
              {c.matches >= 5 ? `（勝率 ${Math.round((c.wins / c.matches) * 100)}%）` : ""}
            </Text>
          ))}

          <Text style={styles.sectionTitle}>相性の良い組み合わせ（5戦以上・勝率順）</Text>
          {(stats.bestPairs ?? []).length === 0 && (
            <Text style={styles.note}>まだデータがありません（対戦が集まると表示されます）</Text>
          )}
          {(stats.bestPairs ?? []).map((p, i) => (
            <Text key={p.pair.join("|")} style={styles.statLine}>
              {i + 1}. {p.pair.map((id) => allCards.find((x) => x.id === id)?.name ?? id).join(" ＋ ")}:{" "}
              {p.matches}戦（勝率 {Math.round((p.wins / p.matches) * 100)}%）
            </Text>
          ))}

          <Text style={styles.sectionTitle}>環境別</Text>
          {Object.entries(stats.env).map(([k, v]) => (
            <Text key={k} style={styles.statLine}>
              ・{k === "prod" ? "本番" : k === "dev" ? "開発版" : k}: 起動{v.opens}回／対戦{v.matches}回
            </Text>
          ))}

          <Text style={styles.sectionTitle}>最近のエラー報告（最新10件）</Text>
          {errors.length === 0 && <Text style={styles.note}>報告はありません 🎉</Text>}
          {errors.map((e, i) => (
            <Text key={i} style={styles.errLine} numberOfLines={2}>
              {formatJst(e.at, false)}｜{e.msg}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
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
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  statCardValue: { fontSize: 20, fontWeight: "900", color: colors.text },
  statCardLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  statLine: { fontSize: 13, color: colors.text, fontWeight: "700", lineHeight: 20 },
  errLine: { fontSize: 11, color: colors.danger, lineHeight: 16 },
  dailyChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    minHeight: 110,
  },
  dailyCol: { flex: 1, alignItems: "center", gap: 3 },
  dailyBars: { flexDirection: "row", alignItems: "flex-end", gap: 1, height: 72 },
  dailyBar: { width: 5, borderRadius: 2, minHeight: 1 },
  dailyLabel: { fontSize: 8, color: colors.textMuted, fontWeight: "700" },
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
  menuBox: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 12,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  menuTitle: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  menuButton: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    gap: 2,
  },
  menuButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  menuButtonSub: { color: "#ffffffcc", fontSize: 12 },
  tabTitle: { fontSize: 16, fontWeight: "900", color: colors.text, alignSelf: "center" },
  qrDownloadButton: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#2b6cb0",
  },
  qrDownloadText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  qrCode: { fontSize: 10, color: "#444", fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  soloBackdrop: {
    flex: 1,
    // 完全な不透明にする。透かしで背景のQRが見えると、カメラが
    // そちらを読み取ってしまうことがあるため
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  soloBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  soloName: { fontSize: 18, fontWeight: "800", color: "#222" },
  soloClose: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#4a5568",
  },
});

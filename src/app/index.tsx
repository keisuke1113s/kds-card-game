import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeInDown,
  ZoomIn,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";
import { stopBgm, warmVoices } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { CardFace } from "@/components/CardFace";
import { Image } from "expo-image";
import { cardSmalls } from "@/data/images";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { useRecordStore } from "@/store/recordStore";
import { colors, DARK_MODE, radius, shadow, spacing } from "@/theme";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ScreenEnter } from "@/components/ScreenEnter";
import { allCards } from "@/data/cards";
import { tipOfToday } from "@/data/tips";
import { todayMissions, useMissionStore } from "@/store/missionStore";
import { RANKS, lastMilestone, nextMilestone, rankIndexFor, totalDistanceKm, winsToNextRank } from "@/data/rank";
import { useRankStore } from "@/store/rankStore";
import { readPersisted, writePersisted } from "@/store/persistDirect";
import { QUIZ_QUESTIONS } from "@/data/quizQuestions";
import { useQuizStore } from "@/store/quizStore";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";
import { DEFAULT_SERVER_URL } from "@/app/online";
import { useTourneyStore } from "@/store/tourneyStore";
import { currentWeather } from "@/data/weather";
import { playSe } from "@/audio/sound";
import { haptic } from "@/audio/haptics";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";

/** 開発版デモ（GitHub Pages の /dev/ 配下）で開いているか */
const IS_DEV_DEMO =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.location.pathname.includes("/dev/");

/** 枠内ボタンの下地。ライト=白 / ダーク=カード面の濃紺（白だと眩しいため） */
const PALE_BG = DARK_MODE ? "#1a2536" : "#ffffff";

/** カード実物のロゴから採色した色 */
const brand = {
  red: "#d83030", // K・「!」・キャッチコピー
  yellow: "#e49c18", // D・G
  green: "#78b424", // S
  coral: "#e2604a", // a
  blue: "#3d8fd0", // 1つ目の O
  lime: "#c9d63a", // 2つ目の G
  skyblue: "#8fd3ee", // 2つ目の O
  amber: "#eeb121", // 最後の「!」
} as const;

/**
 * 文字の輪郭に沿って白い縁取りを付ける（Web）。
 * 同じ文字を2枚重ね、下の層にだけ太い白ストロークを付けて
 * 上の層の塗りで内側を覆う（縁取りが文字を侵食しない定番の手法）
 */
function OutlinedText({
  style,
  stroke = 4,
  children,
}: {
  style?: object | object[];
  stroke?: number;
  children: React.ReactNode;
}) {
  if (Platform.OS !== "web") {
    return <Text style={style}>{children}</Text>;
  }
  return (
    <View>
      <Text
        style={[
          style,
          { position: "absolute", top: 0, left: 0, WebkitTextStroke: `${stroke}px #ffffff` } as never,
        ]}
        aria-hidden
      >
        {children}
      </Text>
      <Text style={style}>{children}</Text>
    </View>
  );
}

/**
 * 時間帯に合わせたホームの空の色（ライトモードのみ）。
 * 朝焼け→昼→夕焼け→夜で、背景のグラデーションがさりげなく変わる
 */
function skyColors(): [string, string] {
  if (DARK_MODE) return [colors.background, colors.backgroundDeep];
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return ["#fdf3e7", "#e8e9f5"]; // 朝焼け
  if (h >= 16 && h < 19) return ["#fdeede", "#e3e2f2"]; // 夕焼け
  if (h >= 19 || h < 5) return ["#dfe5f2", "#c9d2e8"]; // 夜
  return [colors.background, colors.backgroundDeep]; // 昼
}

/** 季節イベントの装飾（日付で自動） */
function seasonalEvent(): string | null {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (m === 1 && d <= 7) return "🎍 あけましておめでとうございます！今年も安全運転で！";
  if (m === 10 && d >= 25) return "🎃 ハッピーハロウィン！";
  if (m === 12 && d >= 20 && d <= 25) return "🎄 メリークリスマス！";
  return null;
}

/** 今日のデイリーミッションのカード。全部達成すると金色になってお祝い */
function MissionCard() {
  // counters の変化で再描画されるように購読する
  useMissionStore((s) => s.counters);
  const celebrated = useMissionStore((s) => s.celebrated);
  const setCelebrated = useMissionStore((s) => s.setCelebrated);
  const missions = todayMissions();
  const allDone = missions.every((m) => m.done);
  useEffect(() => {
    if (allDone && !celebrated) {
      playSe("achievement");
      haptic("success");
      setCelebrated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);
  return (
    <View style={[styles.missionCard, allDone && styles.missionCardDone]}>
      <Text style={styles.missionTitle}>
        {allDone ? "📔 教習手帳　🎉 本日ぶん 全達成！" : "📔 教習手帳（今日のミッション）"}
      </Text>
      {missions.map((m) => (
        <View key={m.def.id} style={styles.missionRow}>
          {/* 教習原簿の確認印。達成するとハンコがドンと押される */}
          <View style={styles.hankoSlot}>
            {m.done && (
              <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.hankoMini}>
                <Text style={styles.hankoMiniText} allowFontScaling={false}>済</Text>
              </Animated.View>
            )}
          </View>
          <Text style={[styles.missionLabel, m.done && styles.missionLabelDone]}>
            {m.def.label}
          </Text>
          <Text style={styles.missionProgress}>
            {m.progress[0]}/{m.progress[1]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 夕方〜夜（17時〜翌6時）かどうか。ホームの校舎イラストを夜版に切り替える */
function isNightTime(): boolean {
  const h = new Date().getHours();
  return h >= 17 || h < 6;
}

/** 季節の環境演出。月で自動的に切り替わる（対象外の月は何も出さない） */
function seasonEmoji(): string | null {
  const m = new Date().getMonth() + 1;
  if (m === 3 || m === 4) return "🌸"; // 春: 桜
  if (m === 12 || m === 1 || m === 2) return "❄️"; // 冬: 雪
  if (m === 10 || m === 11) return "🍂"; // 秋: 紅葉
  if (m === 7 || m === 8) return "✨"; // 夏: きらめき
  return null;
}

/** 季節の粒子の画像（fal.ai生成。クロマキーで切り抜いた透過PNG） */
const PARTICLE_IMG: Record<string, number> = {
  "🌸": require("../../assets/images/particles/particle_sakura.png"),
  "❄️": require("../../assets/images/particles/particle_snow.png"),
  "🍂": require("../../assets/images/particles/particle_leaf.png"),
  "✨": require("../../assets/images/particles/particle_sparkle.png"),
};

/** 画面の上からゆっくり舞い落ちる粒（1つぶん） */
function FallingPiece({ emoji, index }: { emoji: string; index: number }) {
  const screenH = 900;
  const size = 15 + (index % 3) * 6;
  // Webではブラウザ合成のCSSアニメーションで落とす（JSが混んでいても滑らか）。
  // 落下と横揺れは同時にtransformできないので、外側=落下・内側=揺れの2層にする
  if (Platform.OS === "web") {
    const fallAnim = {
      animationDuration: `${7000 + ((index * 977) % 5000)}ms`,
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      animationDelay: `${(index * 823) % 6000}ms`,
    } as unknown as ViewStyle;
    const swayAnim = {
      animationDuration: `${(1600 + (index % 4) * 300) * 2}ms`,
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "infinite",
    } as unknown as ViewStyle;
    return (
      <View
        {...({ dataSet: { kdsanim: "fall" } } as object)}
        style={[{ position: "absolute", left: `${(index * 83) % 100}%`, top: 0, opacity: 0 }, fallAnim]}
        pointerEvents="none"
      >
        <View {...({ dataSet: { kdsanim: "sway" } } as object)} style={swayAnim}>
          <Image
            source={PARTICLE_IMG[emoji]}
            style={{ width: size, height: size }}
            contentFit="contain"
          />
        </View>
      </View>
    );
  }
  const fall = useSharedValue(0);
  const sway = useSharedValue(0);
  useEffect(() => {
    const duration = 7000 + ((index * 977) % 5000);
    fall.value = withDelay(
      (index * 823) % 6000,
      withRepeat(withTiming(1, { duration }), -1)
    );
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600 + (index % 4) * 300 }),
        withTiming(-1, { duration: 1600 + (index % 4) * 300 })
      ),
      -1
    );
  }, [fall, sway, index]);
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateY: -40 + fall.value * (screenH + 80) },
      { translateX: sway.value * 14 },
      { rotate: `${sway.value * 20}deg` },
    ],
    opacity: fall.value < 0.05 ? fall.value * 14 : fall.value > 0.9 ? (1 - fall.value) * 7 : 0.7,
  }));
  return (
    <Animated.View
      style={[{ position: "absolute", left: `${(index * 83) % 100}%`, top: 0 }, st]}
      pointerEvents="none"
    >
      <Image
        source={PARTICLE_IMG[emoji]}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
    </Animated.View>
  );
}

function SeasonalParticles() {
  const emoji = seasonEmoji();
  if (!emoji) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 12 }, (_, i) => (
        <FallingPiece key={i} emoji={emoji} index={i} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const inProgress = useGameStore((s) => s.state !== null && s.state.phase.type !== "finished");
  const queueCancelledNotice = useGameStore((s) => s.queueCancelledNotice);
  const clearQueueCancelledNotice = useGameStore((s) => s.clearQueueCancelledNotice);
  const deckState = useDeckStore();

  // カードファンをタップすると1枚めくれる遊び
  const [peek, setPeek] = useState<{ cardId: string; key: number } | null>(null);


  // スクロールに合わせて背景イラストをわずかに視差で動かす（奥行き感）
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((ev) => {
    scrollY.value = ev.contentOffset.y;
  });
  const bgParallax = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value * 0.25 }],
  }));

  // BGMは対戦中のみ。ホームに戻ったら止める。
  // トーナメントの人数待ち（CPU対戦しながら）もホームに戻ったら取りやめる。
  // 天気もここで先に取得しておく（対戦開始のあいさつ実況に間に合わせる）
  useFocusEffect(
    useCallback(() => {
      stopBgm();
      useTourneyStore.getState().stopLobbyWatch({ leave: true });
      void currentWeather();
    }, [])
  );

  // オンライン対戦で相手を待っている人・トーナメントのエントリー人数
  // （ボタン内のお知らせ表示用）。ホームを見ている間、WebSocketで購読して
  // 人数が変わった瞬間に受け取る。つながらないときは5秒ポーリングに切り替える
  const [lobbyWaiting, setLobbyWaiting] = useState({ waiting: 0, tourney: 0 });
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      let ws: WebSocket | null = null;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      const httpUrl = DEFAULT_SERVER_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      const check = async () => {
        try {
          const res = await fetch(`${httpUrl}/lobby`);
          const d = (await res.json()) as { waiting?: number; tourney?: number };
          if (alive) setLobbyWaiting({ waiting: d.waiting ?? 0, tourney: d.tourney ?? 0 });
        } catch {
          if (alive) setLobbyWaiting({ waiting: 0, tourney: 0 });
        }
      };
      const startPolling = () => {
        if (pollTimer || !alive) return;
        void check();
        pollTimer = setInterval(() => void check(), 5000);
      };
      try {
        ws = new WebSocket(DEFAULT_SERVER_URL);
        ws.onopen = () => ws?.send(JSON.stringify({ type: "watchLobby" }));
        ws.onmessage = (ev) => {
          try {
            const d = JSON.parse(String(ev.data)) as {
              type?: string;
              waiting?: number;
              tourney?: number;
            };
            if (d.type === "lobbyUpdate" && alive) {
              setLobbyWaiting({ waiting: d.waiting ?? 0, tourney: d.tourney ?? 0 });
            } else if (d.type === "error") {
              // 旧サーバーが watchLobby を知らない場合はポーリングで代用
              startPolling();
            }
          } catch {
            // 読めないメッセージは無視
          }
        };
        ws.onerror = () => startPolling();
        ws.onclose = () => startPolling();
      } catch {
        startPolling();
      }
      return () => {
        alive = false;
        if (pollTimer) clearInterval(pollTimer);
        try {
          ws?.close();
        } catch {
          // 既に閉じていれば何もしない
        }
      };
    }, [])
  );
  // ボタン内に添えるお知らせ（両方あるときはランダムマッチ待ちを優先しつつ併記）
  const lobbyNote =
    lobbyWaiting.waiting > 0 && lobbyWaiting.tourney > 0
      ? `🟢 対戦相手を待っている人がいます！ 🏆 大会${lobbyWaiting.tourney}/4人`
      : lobbyWaiting.waiting > 0
        ? "🟢 いま対戦相手を待っている人がいます！"
        : lobbyWaiting.tourney > 0
          ? `🏆 トーナメント参加待ち ${lobbyWaiting.tourney}/4人！`
          : undefined;

  // ランダムマッチの相手待ちを解除して戻ってきたときのお知らせ。数秒で自動的に消す
  useEffect(() => {
    if (!queueCancelledNotice) return;
    const timer = setTimeout(clearQueueCancelledNotice, 3200);
    return () => clearTimeout(timer);
  }, [queueCancelledNotice, clearQueueCancelledNotice]);

  const activeDeck = resolveActiveDeck(deckState);
  const record = useRecordStore();
  // LINE連携（任意）。未連携だと一部機能がロックされる
  const lineLinked = useLineStore((s) => s.linked);
  const lineLock = LINE_GATE_ENABLED && !lineLinked;

  // CPU系のボタンを押したとき、オンラインで誰かが待っていたら参加を誘う。
  // go は「このままCPUと遊ぶ」を選んだときに進む元の行き先
  const [onlineInvite, setOnlineInvite] = useState<{ go: () => void } | null>(null);
  const maybeInviteOnline = (go: () => void) => {
    if (!lineLock && (lobbyWaiting.waiting > 0 || lobbyWaiting.tourney > 0)) {
      haptic("light");
      setOnlineInvite({ go });
    } else {
      go();
    }
  };

  // 入校式（初回起動ガイド）。すでに遊んでいる人には出さない。
  // 保存値（既読フラグ・勝敗数）は端末から直接読んで確認する
  // （読み込みが遅い端末で毎回表示されるのを防ぐ二重化）
  const entranceDone = useRankStore((s) => s.entranceDone);
  const setEntranceDone = useRankStore((s) => s.setEntranceDone);
  const [entranceOpen, setEntranceOpen] = useState(false);
  const [storedOnce, setStoredOnce] = useState<{ seen: number; entrance: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      readPersisted("kds-rank", "seenRankIndex", 0),
      readPersisted("kds-rank", "entranceDone", false),
    ]).then(([seen, entrance]) => {
      if (alive) setStoredOnce({ seen: Number(seen) || 0, entrance: Boolean(entrance) });
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!storedOnce) return;
    if (storedOnce.entrance || entranceDone) return;
    if (record.wins + record.losses > 0) {
      setEntranceDone();
      void writePersisted("kds-rank", "entranceDone", true);
      return;
    }
    const t = setTimeout(() => setEntranceOpen(true), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedOnce, entranceDone, record.wins, record.losses]);

  // 進級システム（通算勝利数で段階が上がる）
  const rankIdx = rankIndexFor(record.wins);
  const rank = RANKS[rankIdx];
  const nextRank = winsToNextRank(record.wins);
  const seenRankIndex = useRankStore((s) => s.seenRankIndex);
  const setSeenRankIndex = useRankStore((s) => s.setSeenRankIndex);
  const [rankUpShow, setRankUpShow] = useState(false);
  // 「どの段階まで見せたか」の保存値が端末から読み込み終わるのを待つ。
  // 読み込み前に判定すると、進級済みでも毎回お祝いが出てしまう
  const [rankHydrated, setRankHydrated] = useState(
    useRankStore.persist?.hasHydrated?.() ?? true
  );
  useEffect(() => {
    const unsub = useRankStore.persist?.onFinishHydration?.(() => setRankHydrated(true));
    if (useRankStore.persist?.hasHydrated?.()) setRankHydrated(true);
    return () => unsub?.();
  }, []);
  useEffect(() => {
    if (!rankHydrated || !storedOnce) return;
    // zustandの読み込み結果と、端末の保存の直接読みの両方で「見せた段階」を確認
    if (rankIdx > Math.max(seenRankIndex, storedOnce.seen)) {
      const t = setTimeout(() => {
        playSe("achievement");
        haptic("success");
        setRankUpShow(true);
      }, 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankHydrated, rankIdx, seenRankIndex, storedOnce]);

  /** 進級お祝いを閉じる（既読は保存へ直接も書き込んで確実に残す） */
  const closeRankUp = () => {
    setSeenRankIndex(rankIdx);
    setStoredOnce((cur) => (cur ? { ...cur, seen: rankIdx } : { seen: rankIdx, entrance: false }));
    void writePersisted("kds-rank", "seenRankIndex", rankIdx);
    setRankUpShow(false);
  };

  // 総走行距離（対戦数から換算）とご当地マイルストーン
  const km = totalDistanceKm(record.wins + record.losses);
  const nextDest = nextMilestone(km);
  const lastDest = lastMilestone(km);

  // 今日の1問（豆知識の下から挑戦できるミニクイズ）
  const dayIndex = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const dailyQ = QUIZ_QUESTIONS[dayIndex % QUIZ_QUESTIONS.length];
  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyDate = useQuizStore((s) => s.dailyDate);
  const dailyCorrect = useQuizStore((s) => s.dailyCorrect);
  const setDaily = useQuizStore((s) => s.setDaily);
  const dailyDone = dailyDate === todayStr;
  const [dailyQOpen, setDailyQOpen] = useState(false);
  const [dailyQAnswer, setDailyQAnswer] = useState<boolean | null>(null);
  const opponentDeck = cpuDeckFor(activeDeck, deckState.builtinOverrides);

  // 実況ボイスはホーム表示の少し後に裏読みしておく（対戦中の読み込みカクつき防止）
  useEffect(() => {
    const t = setTimeout(() => warmVoices(), 2500);
    return () => clearTimeout(t);
  }, []);

  // コレクション達成ランク（22/44/64枚の節目で記章がグレードアップ）
  const unlockState = useUnlockStore();
  const unlockedCount = unlockedSet(unlockState).size;
  const collectionRank =
    unlockedCount >= allCards.length
      ? { label: "🌈 コレクションコンプリート！", bg: "#fff7e0", border: "#e4a018", fg: "#8a5a00" }
      : unlockedCount >= 44
        ? { label: "🥈 熟練コレクター", bg: "#f2f5f8", border: "#8fa4b8", fg: "#44586c" }
        : unlockedCount >= 22
          ? { label: "🥉 かけだしコレクター", bg: "#f8f0ea", border: "#b88a62", fg: "#6c4a2e" }
          : null;

  return (
    <LinearGradient colors={skyColors()} style={styles.root}>
      {/* KDS校舎のイラストをタイトルの後ろにうっすら敷く。
          夕方〜夜（17時〜6時）は窓に明かりの灯った夜バージョンになり、
          スクロールでわずかに視差で動く */}
      <Animated.View style={[styles.homeBgArt, bgParallax]} pointerEvents="none">
        <Image
          source={
            isNightTime()
              ? require("../../assets/images/fx/bg_home_night.webp")
              : require("../../assets/images/fx/bg_home.webp")
          }
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      </Animated.View>
      <SafeAreaView style={styles.safe}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        {/* 社外に出さないための注意書き（最上部に固定で目立たせる） */}
        <View style={styles.warning}>
          <Text style={styles.warningText}>開発中のため社外厳禁！！</Text>
        </View>
        {seasonalEvent() && (
          <View style={styles.seasonEventBadge}>
            <Text style={styles.seasonEventText}>{seasonalEvent()}</Text>
          </View>
        )}


        {/* 開発版デモ（/dev/）のときだけ目印を出す。本番デモとネイティブでは出さない */}
        {IS_DEV_DEMO && (
          <View style={styles.devBadge}>
            <Text style={styles.devBadgeText}>🔧 開発版（動作確認用）</Text>
          </View>
        )}

        {/* タイトル：カード裏面を扇状に並べた上にロゴを置く */}
        <View style={styles.hero}>
          <Pressable
            style={styles.fanRow}
            onPress={() => {
              const pool = [...unlockedSet(unlockState)];
              if (pool.length === 0) return;
              setPeek({
                cardId: pool[Math.floor(Math.random() * pool.length)],
                key: Date.now(),
              });
            }}
          >
            <FannedCard angle={-14} offsetX={-58} offsetY={10} />
            <FannedCard angle={-6} offsetX={-28} offsetY={2} />
            <FannedCard angle={0} offsetX={0} offsetY={-2} float />
            <FannedCard angle={6} offsetX={28} offsetY={2} />
            <FannedCard angle={14} offsetX={58} offsetY={10} />
            {/* タップで1枚めくれてランダムなカードの絵が見える */}
            {peek && <PeekCard key={peek.key} cardId={peek.cardId} onDone={() => setPeek(null)} />}
            {/* 図鑑コンプリートの証: カードファンがときどきキラッと光る */}
            {unlockedCount >= allCards.length &&
              [0, 1, 2].map((i) => (
                <Text
                  key={i}
                  {...({ dataSet: { kdsanim: "glowpulse" } } as object)}
                  style={[
                    styles.fanSparkle,
                    { left: 30 + i * 56, top: i === 1 ? -4 : 16 + i * 5 },
                    {
                      animationDuration: "2600ms",
                      animationDelay: `${i * 700}ms`,
                      animationIterationCount: "infinite",
                    } as unknown as TextStyle,
                  ]}
                >
                  ✨
                </Text>
              ))}
          </Pressable>

          <View style={styles.titleBlock}>
            {/* カード実物のロゴと同じ配色にする */}
            <View style={styles.logoRow}>
              <OutlinedText stroke={5} style={[styles.logo, { color: brand.red }]}>K</OutlinedText>
              <OutlinedText stroke={5} style={[styles.logo, { color: brand.yellow }]}>D</OutlinedText>
              <OutlinedText stroke={5} style={[styles.logo, { color: brand.green }]}>S</OutlinedText>
              <View style={styles.goRow}>
                <OutlinedText stroke={3} style={[styles.go, { color: brand.coral }]}>a</OutlinedText>
                <OutlinedText stroke={3} style={[styles.go, { color: brand.yellow }]}> G</OutlinedText>
                <OutlinedText stroke={3} style={[styles.go, { color: brand.blue }]}>O</OutlinedText>
                <OutlinedText stroke={3} style={[styles.go, { color: brand.red }]}>!</OutlinedText>
                <OutlinedText stroke={3} style={[styles.go, { color: brand.lime }]}> G</OutlinedText>
                <OutlinedText stroke={3} style={[styles.go, { color: brand.skyblue }]}>O</OutlinedText>
                <OutlinedText stroke={3} style={[styles.go, { color: brand.amber }]}>!</OutlinedText>
              </View>
            </View>
            {/* 「運転」「楽しく」だけ赤、つなぎの言葉は黒 */}
            <OutlinedText stroke={3} style={styles.catch}>
              <Text style={styles.catchRed}>運転</Text>
              <Text style={styles.catchDark}>が</Text>
              <Text style={styles.catchRed}>楽しく</Text>
              <Text style={styles.catchDark}>なる!!</Text>
            </OutlinedText>
            <OutlinedText stroke={4} style={styles.title}>トレーディングカードゲーム</OutlinedText>
            {/* 実カード配布の案内（LINE連携後に表示） */}
            {!lineLock && (
              <View style={styles.realCardNote}>
                <Text style={styles.realCardNoteText}>
                  KDSに入校したら、本物のカードをもらえるよ♪
                </Text>
              </View>
            )}
            {/* LINE連携の状態（未連携なら解放の案内、連携済みなら小さく表示） */}
            {LINE_GATE_ENABLED && (
              <Pressable
                style={[styles.lineBanner, lineLinked && styles.lineBannerDone]}
                onPress={() => router.push("/line")}
              >
                <Text style={[styles.lineBannerText, lineLinked && styles.lineBannerTextDone]}>
                  {lineLinked
                    ? "💚 LINE連携済み（すべての機能が使えます）"
                    : "💚 LINE連携（無料）で\n対戦・自動車学校メニューなど全てを解放！"}
                </Text>
              </Pressable>
            )}
            <View style={styles.goalRow}>
              <GoalChip label="学科" value="10時限" color={colors.primary} />
              <GoalChip label="技能" value="19時限" color={colors.success} />
            </View>
          </View>
        </View>

        {/* メニュー */}
        <ScreenEnter style={styles.menu} delay={80} keepVisible>
          {inProgress && (
            <AppButton
              label="対戦に戻る"
              icon="▶"
              tone="accent"
              size="lg"
              fullWidth
              onPress={() => router.push("/battle")}
            />
          )}

          {/* 通算成績（1戦でもしたら出す） */}
          {record.wins + record.losses > 0 && (
            <View style={styles.recordBlock}>
              <Text style={styles.recordLine}>
                通算 <Text style={styles.recordWin}>{record.wins}勝</Text>{" "}
                <Text style={styles.recordLose}>{record.losses}敗</Text>
                {record.streak >= 2 ? `　🔥${record.streak}連勝中` : ""}
              </Text>
              {/* 教習の進級段階と総走行距離 */}
              <View style={styles.rankRow}>
                <View style={styles.rankChip}>
                  <Text style={styles.rankChipText}>
                    {rank.emoji} {rank.name}
                  </Text>
                </View>
                {nextRank && (
                  <Text style={styles.rankNext}>
                    あと{nextRank.remain}勝で「{nextRank.next.name}」
                  </Text>
                )}
              </View>
              <Text style={styles.odoText}>
                🚗 総走行距離 {km.toLocaleString()}km
                {nextDest
                  ? `（${nextDest.label}まであと${(nextDest.km - km).toLocaleString()}km）`
                  : "（日本縦断 達成！）"}
                {lastDest && nextDest ? `　✅ ${lastDest.label}` : ""}
              </Text>
            </View>
          )}
          {/* コレクション達成の記章（22/44/64枚の節目でランクアップ） */}
          {collectionRank && (
            <Pressable
              style={[styles.collectionRibbon, { backgroundColor: collectionRank.bg, borderColor: collectionRank.border }]}
              onPress={() => router.push("/library")}
            >
              <Text style={[styles.collectionRibbonText, { color: collectionRank.fg }]}>
                {collectionRank.label}（{unlockedCount}/{allCards.length}枚）
              </Text>
            </Pressable>
          )}
          {/* 今日のデイリーミッション（教習手帳）。LINE連携後に表示 */}
          {!lineLock && <MissionCard />}
          {/* 今日の安全運転豆知識（日替わり）。LINE連携後に表示 */}
          {!lineLock && (
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>💡 今日の安全運転豆知識</Text>
            <Text style={styles.tipText}>{tipOfToday()}</Text>
            <Pressable
              style={[styles.dailyQButton, dailyDone && styles.dailyQButtonDone]}
              onPress={() => {
                haptic("light");
                // 挑戦済みなら答えと解説をそのまま見られる
                setDailyQAnswer(dailyDone ? (dailyCorrect ? dailyQ.answer : !dailyQ.answer) : null);
                setDailyQOpen(true);
              }}
            >
              <Text style={[styles.dailyQButtonText, dailyDone && styles.dailyQButtonTextDone]}>
                {dailyDone
                  ? dailyCorrect
                    ? "✅ 今日の1問 正解ずみ！"
                    : "☑️ 今日の1問 挑戦ずみ"
                  : "📝 今日の1問に挑戦"}
              </Text>
            </Pressable>
          </View>
          )}
          <AppButton
            label="はじめての方へ（遊び方）"
            icon="📖"
            custom={{ bg: brand.amber }}
            fullWidth
            onPress={() => router.push("/tutorial")}
          />
          {/* CPU対戦のくくり（ひとりで遊べるモードをひとつの枠にまとめる） */}
          <View style={styles.cpuGroup}>
            <View style={styles.cpuGroupHeader}>
              <Text style={styles.cpuGroupTitle}>🤖 CPU対戦モード</Text>
              <Text style={styles.cpuGroupNote}>ひとりで遊べる</Text>
            </View>
            <AppButton
              label="CPU対戦"
              iconNode={<CrossedCards />}
              custom={{ bg: brand.blue }}
              size="lg"
              feel="medium"
              fullWidth
              onPress={() => maybeInviteOnline(() => router.push("/prematch"))}
            />
            <View style={styles.matchupCard}>
              <Text style={styles.matchupSide} numberOfLines={1}>
                {activeDeck.name}
              </Text>
              <Text style={styles.matchupVs}>VS</Text>
              <Text style={styles.matchupSide} numberOfLines={1}>
                {opponentDeck.name}
              </Text>
            </View>
            <AppButton
              label={lineLock ? "🔒 インストラクターに挑戦" : "👨‍🏫 インストラクターに挑戦"}
              custom={{ bg: PALE_BG, fg: brand.blue, border: brand.blue }}
              fullWidth
              onPress={() =>
                lineLock
                  ? router.push("/line")
                  : maybeInviteOnline(() => router.push("/kyokan"))
              }
            />
            <AppButton
              label={lineLock ? "🔒 トーナメント（4連戦）" : "🏆 トーナメント（4連戦）"}
              custom={{ bg: PALE_BG, fg: brand.blue, border: brand.blue }}
              fullWidth
              onPress={() =>
                lineLock
                  ? router.push("/line")
                  : maybeInviteOnline(() => router.push("/tournament"))
              }
            />
          </View>
          <AppButton
            label={lineLock ? "🔒 オンライン対戦" : "オンライン対戦"}
            icon="🌐"
            custom={{ bg: brand.red }}
            size="lg"
            feel="medium"
            fullWidth
            subLabel={lineLock ? undefined : lobbyNote}
            onPress={() => router.push(lineLock ? "/line" : "/online")}
          />
          <AppButton
            label={lineLock ? "🔒 週間ランキング" : "🏆 週間ランキング"}
            custom={{ bg: PALE_BG, fg: "#8a5a00", border: "#c9971b" }}
            fullWidth
            onPress={() => router.push(lineLock ? "/line" : "/ranking")}
          />
          {/* 自動車学校メニュー（学び系をひとつの枠にまとめる） */}
          <View style={styles.schoolGroup}>
            <View style={styles.cpuGroupHeader}>
              <Text style={styles.schoolGroupTitle}>🏫 自動車学校メニュー</Text>
              <Text style={styles.cpuGroupNote}>学んで身につく</Text>
            </View>
            <View style={styles.row}>
              <AppButton
                label={lineLock ? "🔒 学科クイズ" : "📝 学科クイズ"}
                custom={{ bg: PALE_BG, fg: brand.green, border: brand.green }}
                style={styles.halfTall}
                onPress={() => router.push(lineLock ? "/line" : "/quiz")}
              />
              <AppButton
                label={lineLock ? "🔒 危険予測" : "⚠️ 危険予測"}
                custom={{ bg: PALE_BG, fg: "#e8590c", border: "#e8590c" }}
                style={styles.halfTall}
                onPress={() => router.push(lineLock ? "/line" : "/kyt")}
              />
            </View>
            <View style={styles.row}>
              <AppButton
                label={lineLock ? "🔒 適性診断" : "🧠 適性診断"}
                custom={{ bg: PALE_BG, fg: brand.coral, border: brand.coral }}
                style={styles.halfTall}
                onPress={() => router.push(lineLock ? "/line" : "/shindan")}
              />
              <AppButton
                label={lineLock ? "🔒 動体視力" : "👁 動体視力"}
                custom={{ bg: PALE_BG, fg: brand.blue, border: brand.blue }}
                style={styles.halfTall}
                onPress={() => router.push(lineLock ? "/line" : "/eyecheck")}
              />
            </View>
          </View>
          {!lineLock && (
            <AppButton
              label="🪪 教習生免許証（プロフィール）"
              custom={{ bg: brand.coral }}
              fullWidth
              onPress={() => router.push("/license")}
            />
          )}
          <View style={styles.row}>
            <AppButton
              label="📜 対戦記録"
              custom={{ bg: brand.skyblue, fg: "#16283c" }}
              style={styles.flex}
              onPress={() => router.push("/records")}
            />
            <AppButton
              label="🏅 実績と称号"
              custom={{ bg: brand.red }}
              style={styles.flex}
              onPress={() => router.push("/achievements")}
            />
          </View>

          <View style={styles.row}>
            <AppButton
              label="デッキ構築"
              iconNode={
                <Image
                  source={cardSmalls["cardback"]}
                  style={styles.buttonCardIcon}
                  contentFit="cover"
                />
              }
              custom={{ bg: brand.green }}
              style={styles.flex}
              onPress={() => router.push("/deck")}
            />
            <AppButton
              label="カード図鑑"
              iconNode={
                <Image
                  source={cardSmalls["i_shibuya_hana"]}
                  style={styles.buttonCardIcon}
                  contentFit="cover"
                />
              }
              custom={{ bg: brand.blue }}
              style={styles.flex}
              onPress={() => router.push("/library")}
            />
          </View>
          <AppButton
            label="ルール"
            icon="📋"
            custom={{ bg: brand.amber }}
            fullWidth
            onPress={() => router.push("/rules")}
          />
          <AppButton
            label="設定"
            icon="⚙️"
            custom={{ bg: brand.lime, fg: "#33420a" }}
            fullWidth
            onPress={() => router.push("/settings")}
          />

          {/* ホーム画面に追加できる環境でだけ出る案内 */}
          <InstallPrompt />
        </ScreenEnter>

        <View style={styles.footerBox}>
          <Text style={styles.footerMain}>KDS釧路自動車学校</Text>
          <Text style={styles.footer}>© 2026 KUSHIRO DRIVING SCHOOL. All Rights Reserved.</Text>
          <Text style={styles.footer}>Designed & Developed by KDS</Text>
        </View>
        </Animated.ScrollView>

        {/* ランダムマッチの相手待ちをやめて戻ってきたときの全画面のお知らせ */}
        {queueCancelledNotice && (
          <QueueCancelledOverlay onClose={clearQueueCancelledNotice} />
        )}

        {/* 卒業式（最終段階「免許取得」への進級時だけの特別演出） */}
        {rankUpShow && rankIdx >= RANKS.length - 1 && (
          <Pressable
            style={styles.rankUpLayer}
            onPress={closeRankUp}
          >
            {/* 紙吹雪（CSSアニメで降らせる） */}
            {Array.from({ length: 14 }, (_, i) => (
              <View
                key={i}
                {...({ dataSet: { kdsanim: "fall" } } as object)}
                style={[
                  { position: "absolute", left: `${(i * 71) % 100}%`, top: 0, opacity: 0 },
                  {
                    animationDuration: `${2600 + ((i * 977) % 2400)}ms`,
                    animationTimingFunction: "linear",
                    animationIterationCount: "infinite",
                    animationDelay: `${(i * 431) % 2000}ms`,
                  } as never,
                ]}
                pointerEvents="none"
              >
                <Text style={{ fontSize: 20 }}>{["🎉", "🎊", "🌸", "✨"][i % 4]}</Text>
              </View>
            ))}
            <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.rankUpCard, { borderColor: "#c9a227" }]}>
              <Text style={styles.rankUpSmall}>KDS釧路自動車学校</Text>
              <Text style={styles.rankUpTitle}>🎓 卒業証書 🎓</Text>
              <Text style={styles.gradName}>{useRankStore.getState().playerName || "教習生"} 殿</Text>
              <Text style={styles.rankUpMessage}>
                X
              </Text>
              <View style={styles.gradCards}>
                {["i_kuji", "i_okumura", "i_tomino", "i_iida", "i_shigaya"].map((id) => (
                  <View key={id} style={styles.gradCardThumb}>
                    <CardFace cardId={id} size="sm" />
                  </View>
                ))}
              </View>
              <Text style={styles.rankUpMessage}>インストラクター一同、心よりお祝い申し上げます</Text>
              <View style={styles.rankUpHanko}>
                <Text style={styles.rankUpHankoText}>KDS</Text>
              </View>
              <Text style={styles.rankUpClose}>タップで閉じる（免許証が金色になりました）</Text>
            </Animated.View>
          </Pressable>
        )}

        {/* 進級おめでとう（仮免交付などの認定書風） */}
        {rankUpShow && rankIdx < RANKS.length - 1 && (
          <Pressable
            style={styles.rankUpLayer}
            onPress={closeRankUp}
          >
            <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.rankUpCard}>
              <Text style={styles.rankUpSmall}>KDS釧路自動車学校</Text>
              <Text style={styles.rankUpTitle}>進級おめでとう！</Text>
              <Text style={styles.rankUpRank}>
                {rank.emoji} {rank.name}
              </Text>
              <Text style={styles.rankUpMessage}>{rank.message}</Text>
              <View style={styles.rankUpHanko}>
                <Text style={styles.rankUpHankoText}>認定</Text>
              </View>
              <Text style={styles.rankUpClose}>タップで閉じる</Text>
            </Animated.View>
          </Pressable>
        )}

        {/* オンラインで誰かが待っているときの参加のお誘い */}
        {onlineInvite && (
          <Pressable style={styles.rankUpLayer} onPress={() => setOnlineInvite(null)}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.rankUpCard}>
              <Text style={styles.rankUpTitle}>🌐 待っている人がいます！</Text>
              <Text style={styles.rankUpMessage}>
                {lobbyWaiting.waiting > 0 && lobbyWaiting.tourney > 0
                  ? "オンライン対戦とトーナメントの両方で、いま参加者を待っています。あなたも参加しませんか？"
                  : lobbyWaiting.waiting > 0
                    ? "いまオンライン対戦で対戦相手を募集中の人がいます。あなたも参加しませんか？"
                    : `オンライントーナメントが参加待ち ${lobbyWaiting.tourney}/4人 で開催を待っています。あなたも参加しませんか？`}
              </Text>
              <View style={styles.inviteButtons}>
                {lobbyWaiting.waiting > 0 && (
                  <AppButton
                    label="🌐 オンライン対戦に参加する"
                    custom={{ bg: brand.red }}
                    fullWidth
                    onPress={() => {
                      setOnlineInvite(null);
                      router.push("/online");
                    }}
                  />
                )}
                {lobbyWaiting.tourney > 0 && (
                  <AppButton
                    label="🏆 トーナメントに参加する"
                    custom={{ bg: "#7a5a00" }}
                    fullWidth
                    onPress={() => {
                      setOnlineInvite(null);
                      router.push("/tourney");
                    }}
                  />
                )}
                <AppButton
                  label="このままCPUと遊ぶ"
                  custom={{ bg: PALE_BG, fg: colors.textMuted, border: colors.border }}
                  fullWidth
                  onPress={() => {
                    const go = onlineInvite.go;
                    setOnlineInvite(null);
                    go();
                  }}
                />
              </View>
            </Animated.View>
          </Pressable>
        )}

        {/* 入校式（初回だけのごあいさつ） */}
        {entranceOpen && (
          <Pressable style={styles.rankUpLayer} onPress={() => {}}>
            <Animated.View entering={ZoomIn.springify().damping(13)} style={styles.rankUpCard}>
              <Text style={styles.rankUpSmall}>KDS釧路自動車学校</Text>
              <Text style={styles.rankUpTitle}>🌸 入校式 🌸</Text>
              <Text style={styles.rankUpMessage}>
                KDSトレーディングカードゲームへようこそ！{"\n"}
                あなたも今日から教習生。カード対戦で{"\n"}
                学科と技能を進めて、卒業を目指しましょう！
              </Text>
              <AppButton
                label="🧠 まずは運転適性診断を受ける"
                tone="primary"
                fullWidth
                onPress={() => {
                  setEntranceDone();
                  void writePersisted("kds-rank", "entranceDone", true);
                  setEntranceOpen(false);
                  router.push("/shindan");
                }}
              />
              <AppButton
                label="📖 遊び方を見る"
                tone="accent"
                fullWidth
                onPress={() => {
                  setEntranceDone();
                  void writePersisted("kds-rank", "entranceDone", true);
                  setEntranceOpen(false);
                  router.push("/tutorial");
                }}
              />
              <Pressable
                onPress={() => {
                  setEntranceDone();
                  void writePersisted("kds-rank", "entranceDone", true);
                  setEntranceOpen(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.rankUpClose}>あとで（そのまま遊ぶ）</Text>
              </Pressable>
            </Animated.View>
          </Pressable>
        )}

        {/* 今日の1問（豆知識から） */}
        {dailyQOpen && (
          <Pressable style={styles.rankUpLayer} onPress={() => setDailyQOpen(false)}>
            <Pressable style={styles.dailyQCard} onPress={() => {}}>
              <Text style={styles.dailyQTitle}>📝 今日の1問</Text>
              <Text style={styles.dailyQCat}>{dailyQ.cat}</Text>
              <Text style={styles.dailyQText}>{dailyQ.q}</Text>
              {dailyQAnswer === null ? (
                <View style={styles.dailyQRow}>
                  <Pressable
                    style={[styles.dailyQChoice, { borderColor: brand.blue }]}
                    onPress={() => {
                      haptic("light");
                      playSe(dailyQ.answer === true ? "battle_win" : "battle_lose");
                      setDaily(todayStr, dailyQ.answer === true);
                      setDailyQAnswer(true);
                    }}
                  >
                    <Text style={[styles.dailyQChoiceText, { color: brand.blue }]}>⭕ 正しい</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.dailyQChoice, { borderColor: brand.red }]}
                    onPress={() => {
                      haptic("light");
                      playSe(dailyQ.answer === false ? "battle_win" : "battle_lose");
                      setDaily(todayStr, dailyQ.answer === false);
                      setDailyQAnswer(false);
                    }}
                  >
                    <Text style={[styles.dailyQChoiceText, { color: brand.red }]}>❌ 誤り</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.dailyQResult}>
                    {dailyQAnswer === dailyQ.answer ? "🎉 正解！" : "😢 残念…"}
                    （答え: {dailyQ.answer ? "⭕ 正しい" : "❌ 誤り"}）
                  </Text>
                  <Text style={styles.dailyQNote}>{dailyQ.note}</Text>
                  <AppButton
                    label="もっと解く（学科クイズへ）"
                    tone="ghost"
                    fullWidth
                    onPress={() => {
                      setDailyQOpen(false);
                      router.push("/quiz");
                    }}
                  />
                </>
              )}
              <Pressable onPress={() => setDailyQOpen(false)} hitSlop={8}>
                <Text style={styles.dailyQClose}>閉じる</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        )}
        {/* 季節の環境演出（桜・雪・紅葉・きらめき） */}
        <SeasonalParticles />
      </SafeAreaView>
    </LinearGradient>
  );
}

/** 対戦ボタン用：自分のカードと相手のカードを交差させたアイコン */
function CrossedCards() {
  return (
    <View style={styles.crossWrap}>
      <Image
        source={cardSmalls["i_konno"]}
        style={[styles.crossCard, styles.crossLeft]}
        contentFit="cover"
      />
      <Image
        source={cardSmalls["cardback"]}
        style={[styles.crossCard, styles.crossRight]}
        contentFit="cover"
      />
    </View>
  );
}

/** 扇状に並べたカード裏面。中央の1枚だけゆっくり上下に揺れる */
/** ファンの中央で1枚がクルッとめくれてカードの絵が見え、少ししたら戻る */
function PeekCard({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }),
      withDelay(1500, withTiming(0, { duration: 320 }))
    );
    const timer = setTimeout(onDone, 2400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 3),
    transform: [
      { perspective: 700 },
      { translateY: -t.value * 26 },
      { rotateY: `${(1 - t.value) * 180}deg` },
      { scale: 0.9 + t.value * 0.25 },
    ],
  }));
  return (
    <Animated.View style={[styles.peekCard, style]} pointerEvents="none">
      <CardFace cardId={cardId} size="sm" />
    </Animated.View>
  );
}

function FannedCard({
  angle,
  offsetX,
  offsetY,
  float,
}: {
  angle: number;
  offsetX: number;
  offsetY: number;
  float?: boolean;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (!float) return;
    y.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600 }),
        withTiming(0, { duration: 1600 })
      ),
      -1,
      false
    );
  }, [float, y]);

  // transform は1つにまとめる（別々に書くと後の指定で上書きされてしまう）
  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX },
      { translateY: offsetY + y.value },
      { rotate: `${angle}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.fanCard, anim]}>
      <CardFace cardId="cardback" size="sm" faceDown />
    </Animated.View>
  );
}

function GoalChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.goalChip, { borderColor: color }]}>
      <Text style={[styles.goalLabel, { color }]}>{label}</Text>
      <Text style={styles.goalValue}>{value}</Text>
    </View>
  );
}

/** 相手待ち解除の全画面お知らせ。ポンと出て、タップか数秒で消える */
function QueueCancelledOverlay({ onClose }: { onClose: () => void }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.06, { duration: 200 }),
      withTiming(1, { duration: 120 })
    );
    opacity.value = withTiming(1, { duration: 180 });
  }, [scale, opacity]);
  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Pressable style={styles.queueOverlayBg} onPress={onClose}>
      <Animated.View style={[styles.queueOverlayBox, boxStyle]}>
        <Text style={styles.queueOverlayEmoji}>🌐</Text>
        <Text style={styles.queueOverlayTitle}>相手待ちを解除しました</Text>
        <Text style={styles.queueOverlaySub}>
          オンライン対戦のランダムマッチ待機を終了しました。{"\n"}
          また遊ぶときは「オンライン対戦」からどうぞ。
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  // 中身をひとかたまりにして、画面の上下中央にそろえる
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  fanRow: {
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fanSparkle: { position: "absolute", fontSize: 18, zIndex: 3 },
  fanCard: {
    position: "absolute",
    ...shadow.card,
  },
  titleBlock: { alignItems: "center", marginTop: spacing.sm },
  logoRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  logo: {
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#ffffff",
    textShadowRadius: 9,
    textShadowOffset: { width: 0, height: 0 },
  },
  goRow: { flexDirection: "row", alignItems: "baseline", marginLeft: 6, marginBottom: 6 },
  go: {
    fontSize: 20,
    fontWeight: "900",
    textShadowColor: "#ffffff",
    textShadowRadius: 7,
    textShadowOffset: { width: 0, height: 0 },
  },
  catchRed: { color: brand.red },
  // 白い縁取り付きの文字なので、ダークモードでも濃い色のまま固定する
  catchDark: { color: "#16283c" },
  catch: {
    fontSize: 14,
    fontWeight: "900",
    color: brand.red,
    letterSpacing: 1,
    marginTop: 2,
    textShadowColor: "#ffffff",
    textShadowRadius: 7,
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    color: colors.primaryDark,
    marginTop: 2,
    letterSpacing: 0.5,
    textShadowColor: "#ffffff",
    textShadowRadius: 6,
  },
  goalRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  goalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    ...shadow.card,
  },
  goalLabel: { fontSize: 12, fontWeight: "800" },
  goalValue: { fontSize: 13, fontWeight: "800", color: colors.text },
  recordLink: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2,
  },
  homeBgArt: {
    position: "absolute",
    top: 24,
    left: 0,
    right: 0,
    height: 280,
    opacity: 0.38,
  },
  // 2つ並べたボタンの高さを揃える（折り返しの有無に関係なく同じ固定高さにする）
  halfTall: { flex: 1, height: 74, justifyContent: "center", paddingVertical: 0 },
  recordBlock: { alignItems: "center", gap: 4 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  rankChip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: brand.blue,
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  rankChipText: { fontSize: 12, fontWeight: "800", color: brand.blue },
  rankNext: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  odoText: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textAlign: "center" },
  rankUpLayer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: "#000000a8",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 24,
  },
  rankUpCard: {
    backgroundColor: "#fffdf4",
    borderWidth: 3,
    borderColor: "#c9a227",
    borderRadius: 12,
    paddingVertical: 22,
    paddingHorizontal: 26,
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 340,
  },
  rankUpSmall: { fontSize: 11, fontWeight: "700", color: "#8a7a30", letterSpacing: 2 },
  rankUpTitle: { fontSize: 20, fontWeight: "900", color: "#5a4a10" },
  rankUpRank: { fontSize: 30, fontWeight: "900", color: "#1c3a5e", marginVertical: 4 },
  rankUpMessage: { fontSize: 13, color: "#5a4a10", textAlign: "center", lineHeight: 20 },
  rankUpHanko: {
    borderWidth: 2.5,
    borderColor: "#d02020",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    transform: [{ rotate: "-8deg" }],
    marginTop: 4,
  },
  rankUpHankoText: { color: "#d02020", fontSize: 16, fontWeight: "900", letterSpacing: 4 },
  rankUpClose: { fontSize: 11, color: "#8a7a30", marginTop: 6 },
  inviteButtons: { alignSelf: "stretch", gap: 8, marginTop: 10 },
  gradName: { fontSize: 22, fontWeight: "900", color: "#1c3a5e" },
  gradCards: { flexDirection: "row", gap: 4, marginVertical: 4 },
  gradCardThumb: { transform: [{ scale: 0.8 }] },
  dailyQCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 10,
    width: "100%",
    maxWidth: 360,
    borderWidth: 2,
    borderColor: colors.border,
  },
  dailyQTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "center" },
  dailyQCat: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textAlign: "center" },
  dailyQText: { fontSize: 14, lineHeight: 22, color: colors.text },
  dailyQRow: { flexDirection: "row", gap: 10 },
  dailyQChoice: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  dailyQChoiceText: { fontSize: 15, fontWeight: "900" },
  dailyQResult: { fontSize: 15, fontWeight: "900", color: colors.text, textAlign: "center" },
  dailyQNote: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  dailyQClose: { fontSize: 12, color: colors.textMuted, textAlign: "center", padding: 4 },
  hankoSlot: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  hankoMini: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d02020",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-12deg" }],
  },
  hankoMiniText: { color: "#d02020", fontSize: 11, fontWeight: "900" },
  dailyQButton: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#c9a227",
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  dailyQButtonText: { fontSize: 12, fontWeight: "800", color: "#8a6d00" },
  dailyQButtonDone: { backgroundColor: "#e9f5e2", borderColor: "#78b424" },
  dailyQButtonTextDone: { color: "#4e7d16" },
  lineBanner: {
    marginTop: 10,
    backgroundColor: "#06C755",
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  lineBannerDone: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#06C755",
    paddingVertical: 6,
  },
  lineBannerText: { color: "#fff", fontSize: 13, fontWeight: "800", textAlign: "center" },
  lineBannerTextDone: { color: "#04833a" },
  missionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    gap: 6,
  },
  missionCardDone: { backgroundColor: "#fff7e0", borderColor: "#e4a018" },
  missionTitle: { fontSize: 13, fontWeight: "900", color: colors.text },
  missionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  missionCheck: { fontSize: 14 },
  missionLabel: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "700" },
  missionLabelDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  missionProgress: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  tipCard: {
    backgroundColor: "#fffbe8",
    borderWidth: 1.5,
    borderColor: "#e4c96a",
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  tipTitle: { fontSize: 13, fontWeight: "900", color: "#8a6d00" },
  // カードの背景がライト固定色なので、文字色もダークモードに影響されない固定色にする
  tipText: { fontSize: 13, lineHeight: 20, color: "#4a3d10" },
  peekCard: {
    position: "absolute",
    alignSelf: "center",
    top: -6,
    zIndex: 5,
  },
  seasonEventBadge: {
    alignSelf: "center",
    backgroundColor: "#fff3f3",
    borderWidth: 1.5,
    borderColor: "#e4a0a0",
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  seasonEventText: { fontSize: 13, fontWeight: "800", color: "#a03030" },
  collectionRibbon: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  collectionRibbonText: { fontSize: 13, fontWeight: "800" },
  recordLine: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    marginTop: -6,
  },
  recordWin: { color: colors.success, fontWeight: "900" },
  recordLose: { color: colors.danger, fontWeight: "900" },
  realCardNote: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  realCardNoteText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  devBadge: {
    alignSelf: "center",
    backgroundColor: "#4a148c",
    borderRadius: radius.md,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: spacing.sm,
  },
  devBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  queueOverlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(12, 18, 46, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    zIndex: 50,
  },
  queueOverlayBox: {
    alignSelf: "stretch",
    backgroundColor: "#4a3f9f",
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 8,
  },
  queueOverlayEmoji: { fontSize: 44 },
  queueOverlayTitle: { color: "#fff", fontSize: 21, fontWeight: "900" },
  queueOverlaySub: {
    color: "#ffffffcc",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
  },
  warning: {
    alignSelf: "center",
    backgroundColor: "#ffe5e5",
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: spacing.md,
  },
  warningText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  menu: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  buttonCardIcon: {
    width: 20,
    height: 28,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#ffffff88",
  },
  crossWrap: { width: 40, height: 30, alignItems: "center", justifyContent: "center" },
  crossCard: {
    position: "absolute",
    width: 21,
    height: 29,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#ffffffaa",
  },
  crossLeft: { transform: [{ translateX: -8 }, { rotate: "-18deg" }] },
  crossRight: { transform: [{ translateX: 8 }, { rotate: "18deg" }] },
  cpuGroup: {
    borderWidth: 1.5,
    borderColor: brand.blue,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  cpuGroupHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  cpuGroupTitle: { fontSize: 13, fontWeight: "800", color: brand.blue },
  schoolGroup: {
    borderWidth: 1.5,
    borderColor: brand.green,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  schoolGroupTitle: { fontSize: 13, fontWeight: "800", color: brand.green },
  cpuGroupNote: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  matchupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: -spacing.xs,
  },
  matchupSide: { fontSize: 12, fontWeight: "600", color: colors.textMuted, flexShrink: 1 },
  matchupVs: { fontSize: 11, fontWeight: "900", color: colors.accent },
  footer: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  footerBox: { alignItems: "center", gap: 2, marginTop: spacing.lg, paddingBottom: 8 },
  footerMain: { fontSize: 12, fontWeight: "800", color: colors.textMuted, textAlign: "center" },
});

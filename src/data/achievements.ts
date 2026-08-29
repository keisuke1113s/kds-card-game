import { MatchRecord } from "@/store/recordStore";

/**
 * 実績（アチーブメント）の定義。
 * 対戦記録・カード開放数などから達成を判定する。
 * title を持つ実績は、達成すると「称号」としてオンライン対戦で名乗れる。
 */

export interface AchievementInput {
  wins: number;
  losses: number;
  streak: number;
  history: MatchRecord[];
  /** QRで開放したカードの枚数 */
  scannedCount: number;
  /** 開放済みカードの合計 / 全カード数 */
  unlockedCount: number;
  totalCards: number;
  /** 学科クイズの成績 */
  quizPlays: number;
  quizPerfects: number;
  kenteiPassed: number;
  kytCleared: boolean;
  kytMastered: number;
  kytTotal: number;
  visionBest: number;
  courseBoth: boolean;
  /** 「インストラクターに挑戦」の対象人数 */
  totalInstructors: number;
  /** デイリーミッションを全達成したことがあるか */
  dailyAllDone: boolean;
  /** トーナメント優勝回数 */
  tournamentWins: number;
}

export interface AchievementDef {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  /** 達成すると名乗れる称号（オンライン対戦の名前の横に表示） */
  title?: string;
  /** 達成するまで内容が「？？？」で隠されるシークレット実績 */
  secret?: boolean;
  check: (s: AchievementInput) => boolean;
}

const winsOf = (h: MatchRecord[]) => h.filter((r) => r.result === "win");
/** 「インストラクターに挑戦」で撃破した人数（重複なし） */
const kyokanBeaten = (h: MatchRecord[]) =>
  new Set(winsOf(h).map((r) => r.kyokan).filter(Boolean)).size;

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---- 勝利数 ----
  { id: "win1", emoji: "🏆", name: "初勝利", desc: "はじめて対戦に勝つ", title: "新人ドライバー", check: (s) => s.wins >= 1 },
  { id: "win5", emoji: "🎖️", name: "5勝", desc: "通算5勝する", check: (s) => s.wins >= 5 },
  { id: "win10", emoji: "🥉", name: "10勝", desc: "通算10勝する", title: "頼れる教習生", check: (s) => s.wins >= 10 },
  { id: "win30", emoji: "🥈", name: "30勝", desc: "通算30勝する", check: (s) => s.wins >= 30 },
  { id: "win50", emoji: "🥇", name: "50勝", desc: "通算50勝する", title: "ベテランドライバー", check: (s) => s.wins >= 50 },
  { id: "win100", emoji: "👑", name: "100勝", desc: "通算100勝する", title: "伝説の教習生", check: (s) => s.wins >= 100 },
  // ---- 連勝 ----
  { id: "streak3", emoji: "🔥", name: "3連勝", desc: "3連勝する", check: (s) => s.streak >= 3 },
  { id: "streak5", emoji: "🚀", name: "5連勝", desc: "5連勝する", title: "連勝街道", check: (s) => s.streak >= 5 },
  { id: "streak10", emoji: "⚡", name: "10連勝", desc: "10連勝する", title: "無敗神話", check: (s) => s.streak >= 10 },
  // ---- オンライン ----
  { id: "online1", emoji: "🌐", name: "オンラインデビュー", desc: "オンライン対戦を1回遊ぶ", check: (s) => s.history.some((r) => r.mode === "online") },
  { id: "onlineWin1", emoji: "🤝", name: "オンライン初勝利", desc: "オンライン対戦で勝つ", title: "ネット対戦デビュー", check: (s) => winsOf(s.history).some((r) => r.mode === "online") },
  { id: "onlineWin10", emoji: "🛜", name: "オンライン10勝", desc: "オンライン対戦で10勝する", title: "オンラインの強者", check: (s) => winsOf(s.history).filter((r) => r.mode === "online").length >= 10 },
  // ---- 勝ち方 ----
  { id: "deckoutWin", emoji: "⏳", name: "我慢くらべ", desc: "相手の山札切れで勝つ", title: "我慢の勝利", check: (s) => winsOf(s.history).some((r) => r.reason === "deckOut") },
  { id: "perfectWin", emoji: "💪", name: "完全勝利", desc: "相手を大きく引き離して勝つ", title: "圧倒的", check: (s) => winsOf(s.history).some((r) => r.oppAcademic + r.oppSkill <= 14) },
  { id: "closeWin", emoji: "😤", name: "接戦を制す", desc: "相手がリーチの状態から勝ち切る", check: (s) => winsOf(s.history).some((r) => 10 - r.oppAcademic + 19 - r.oppSkill <= 4) },
  { id: "fastWin", emoji: "🏎️", name: "スピード卒業", desc: "5ターン以内に勝つ", title: "スピード卒業", check: (s) => winsOf(s.history).some((r) => r.turns > 0 && r.turns <= 5) },
  { id: "longMatch", emoji: "🐢", name: "長期戦", desc: "12ターン以上の対戦をする", check: (s) => s.history.some((r) => r.turns >= 12) },
  { id: "firstWin", emoji: "🌱", name: "先攻の勝利", desc: "先攻で勝つ", check: (s) => winsOf(s.history).some((r) => r.first) },
  { id: "secondWin", emoji: "🌿", name: "後攻の勝利", desc: "後攻で勝つ", check: (s) => winsOf(s.history).some((r) => !r.first) },
  { id: "bothSides", emoji: "⚖️", name: "先攻も後攻も", desc: "先攻でも後攻でも勝つ", check: (s) => winsOf(s.history).some((r) => r.first) && winsOf(s.history).some((r) => !r.first) },
  { id: "cpuHardWin", emoji: "😈", name: "つよいCPUを倒す", desc: "CPU（つよい）に勝つ", title: "鬼インストラクター超え", check: (s) => winsOf(s.history).some((r) => r.mode === "cpu" && r.difficulty === "hard") },
  // ---- コレクション ----
  { id: "scan1", emoji: "📷", name: "はじめてのQR登録", desc: "QRコードでカードを1枚登録する", check: (s) => s.scannedCount >= 1 },
  { id: "scan10", emoji: "🗂️", name: "コレクター", desc: "QRコードでカードを10枚登録する", title: "コレクター", check: (s) => s.scannedCount >= 10 },
  { id: "scan30", emoji: "💼", name: "大コレクター", desc: "QRコードでカードを30枚登録する", check: (s) => s.scannedCount >= 30 },
  { id: "collect22", emoji: "📗", name: "コレクション22", desc: "カードを22枚そろえる", title: "かけだしコレクター", check: (s) => s.unlockedCount >= 22 },
  { id: "collect44", emoji: "📘", name: "コレクション44", desc: "カードを44枚そろえる", title: "熟練コレクター", check: (s) => s.unlockedCount >= 44 },
  { id: "complete", emoji: "🌈", name: "カードマスター", desc: "全カードをそろえる", title: "カードマスター", check: (s) => s.unlockedCount >= s.totalCards },
  // ---- 学科クイズ ----
  { id: "quiz1", emoji: "📝", name: "学科クイズに挑戦", desc: "学科クイズを1回プレイする", check: (s) => s.quizPlays >= 1 },
  { id: "quizPerfect", emoji: "💯", name: "学科マスター", desc: "学科クイズで全問正解する", title: "学科マスター", check: (s) => s.quizPerfects >= 1 },
  { id: "quiz10", emoji: "📚", name: "勉強熱心", desc: "学科クイズを10回プレイする", title: "勉強熱心", check: (s) => s.quizPlays >= 10 },
  { id: "kenteiPass", emoji: "🖊", name: "効果測定 合格", desc: "効果測定（50問）で90点以上をとる", title: "本試験いける！", check: (s) => s.kenteiPassed >= 1 },
  { id: "kytClear", emoji: "⚠️", name: "危険予測マスター", desc: "危険予測トレーニングで5問全問正解する", title: "先読みドライバー", check: (s) => s.kytCleared },
  { id: "kytComplete", emoji: "🦺", name: "全場面制覇", desc: "危険予測トレーニングの全場面に正解する", title: "危険予測の達人", check: (s) => s.kytTotal > 0 && s.kytMastered >= s.kytTotal },
  { id: "eye15", emoji: "👁", name: "動体視力バツグン", desc: "動体視力チェックで15問以上正解する", title: "ハヤブサの目", check: (s) => s.visionBest >= 15 },
  { id: "courseBoth", emoji: "🚗", name: "所内コース制覇", desc: "S字とクランクを両方クリアする", title: "所内コースマスター", check: (s) => s.courseBoth },
  // ---- インストラクターに挑戦 ----
  { id: "kyokanOkumura", emoji: "🥋", name: "奥村を倒す", desc: "「インストラクターに挑戦」で奥村に勝つ", title: "鉄壁くずし", check: (s) => winsOf(s.history).some((r) => r.kyokan === "i_okumura") },
  { id: "kyokanShigaya", emoji: "🛡️", name: "志萱を倒す", desc: "「インストラクターに挑戦」で志萱に勝つ", title: "サポート知らず", check: (s) => winsOf(s.history).some((r) => r.kyokan === "i_shigaya") },
  { id: "kyokanIida", emoji: "⚔️", name: "飯田を倒す", desc: "「インストラクターに挑戦」で飯田に勝つ", title: "猛攻くぐり", check: (s) => winsOf(s.history).some((r) => r.kyokan === "i_iida") },
  { id: "kyokan5", emoji: "🎖️", name: "5人撃破", desc: "「インストラクターに挑戦」で5人に勝つ", title: "道場破り", check: (s) => kyokanBeaten(s.history) >= 5 },
  { id: "kyokan15", emoji: "🏵️", name: "15人撃破", desc: "「インストラクターに挑戦」で15人に勝つ", title: "常勝の教習生", check: (s) => kyokanBeaten(s.history) >= 15 },
  { id: "kyokanAll", emoji: "🏆", name: "全インストラクター制覇", desc: "「インストラクターに挑戦」で全員に勝つ", title: "頂点の教習生", check: (s) => kyokanBeaten(s.history) >= s.totalInstructors },
  { id: "champion", emoji: "🏆", name: "グランドチャンピオン", desc: "トーナメントで優勝する", title: "グランドチャンピオン", check: (s) => s.tournamentWins >= 1 },
  { id: "dailyAll", emoji: "🎯", name: "今日の優等生", desc: "デイリーミッションを全て達成する", title: "今日の優等生", check: (s) => s.dailyAllDone },
  // ---- シークレット（達成するまで内容が隠される） ----
  { id: "sMidnight", emoji: "🌌", name: "真夜中の教習", desc: "深夜0時〜3時に対戦する", title: "真夜中の教習生", secret: true, check: (s) => s.history.some((r) => { const h = new Date(r.at).getHours(); return h >= 0 && h < 3; }) },
  { id: "sEarly", emoji: "🌅", name: "早朝教習", desc: "朝5時〜7時に対戦する", secret: true, check: (s) => s.history.some((r) => { const h = new Date(r.at).getHours(); return h >= 5 && h < 7; }) },
  { id: "sComeback", emoji: "🔄", name: "どんでん返し", desc: "相手がリーチの状態から大逆転勝利する", title: "どんでん返し", secret: true, check: (s) => winsOf(s.history).some((r) => 10 - r.oppAcademic + 19 - r.oppSkill <= 2) },
  { id: "sMarathon", emoji: "🏃", name: "教習漬け", desc: "1日に10回対戦する", title: "教習漬け", secret: true, check: (s) => { const byDay = new Map<string, number>(); for (const r of s.history) { const d = r.at.slice(0, 10); byDay.set(d, (byDay.get(d) ?? 0) + 1); } return [...byDay.values()].some((n) => n >= 10); } },
  { id: "sQuizOni", emoji: "👹", name: "学科の鬼", desc: "学科クイズで全問正解を3回達成する", title: "学科の鬼", secret: true, check: (s) => s.quizPerfects >= 3 },
  // ---- 対戦数・その他 ----
  { id: "play10", emoji: "🎮", name: "対戦10回", desc: "10回対戦する", check: (s) => s.history.length >= 10 },
  { id: "play50", emoji: "🕹️", name: "対戦50回", desc: "50回対戦する", check: (s) => s.history.length >= 50 },
  { id: "play100", emoji: "🎯", name: "対戦100回", desc: "100回対戦する", title: "対戦中毒", check: (s) => s.history.length >= 100 },
  { id: "decks3", emoji: "🃏", name: "デッキ使い", desc: "3種類以上のデッキで勝つ", title: "デッキ使い", check: (s) => new Set(winsOf(s.history).map((r) => r.myDeckName)).size >= 3 },
  { id: "nightOwl", emoji: "🌙", name: "夜の教習", desc: "22時以降に対戦する", title: "夜の教習生", check: (s) => s.history.some((r) => { const h = new Date(r.at).getHours(); return h >= 22 || h < 4; }) },
  { id: "earlyBird", emoji: "🌅", name: "朝の教習", desc: "朝7時前に対戦する", check: (s) => s.history.some((r) => { const h = new Date(r.at).getHours(); return h >= 4 && h < 7; }) },
  { id: "neverGiveUp", emoji: "🔁", name: "不屈の心", desc: "10敗しても遊び続ける", title: "不屈の心", check: (s) => s.losses >= 10 },
];

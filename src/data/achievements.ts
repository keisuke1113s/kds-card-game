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
}

export interface AchievementDef {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  /** 達成すると名乗れる称号（オンライン対戦の名前の横に表示） */
  title?: string;
  check: (s: AchievementInput) => boolean;
}

const winsOf = (h: MatchRecord[]) => h.filter((r) => r.result === "win");

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
  { id: "cpuHardWin", emoji: "😈", name: "つよいCPUを倒す", desc: "CPU（つよい）に勝つ", title: "鬼教官超え", check: (s) => winsOf(s.history).some((r) => r.mode === "cpu" && r.difficulty === "hard") },
  // ---- コレクション ----
  { id: "scan1", emoji: "📷", name: "はじめてのQR登録", desc: "QRコードでカードを1枚登録する", check: (s) => s.scannedCount >= 1 },
  { id: "scan10", emoji: "🗂️", name: "コレクター", desc: "QRコードでカードを10枚登録する", title: "コレクター", check: (s) => s.scannedCount >= 10 },
  { id: "scan30", emoji: "💼", name: "大コレクター", desc: "QRコードでカードを30枚登録する", check: (s) => s.scannedCount >= 30 },
  { id: "complete", emoji: "🌈", name: "カードマスター", desc: "全カードをそろえる", title: "カードマスター", check: (s) => s.unlockedCount >= s.totalCards },
  // ---- 対戦数・その他 ----
  { id: "play10", emoji: "🎮", name: "対戦10回", desc: "10回対戦する", check: (s) => s.history.length >= 10 },
  { id: "play50", emoji: "🕹️", name: "対戦50回", desc: "50回対戦する", check: (s) => s.history.length >= 50 },
  { id: "play100", emoji: "🎯", name: "対戦100回", desc: "100回対戦する", title: "対戦中毒", check: (s) => s.history.length >= 100 },
  { id: "decks3", emoji: "🃏", name: "デッキ使い", desc: "3種類以上のデッキで勝つ", title: "デッキ使い", check: (s) => new Set(winsOf(s.history).map((r) => r.myDeckName)).size >= 3 },
  { id: "nightOwl", emoji: "🌙", name: "夜の教習", desc: "22時以降に対戦する", title: "夜の教習生", check: (s) => s.history.some((r) => { const h = new Date(r.at).getHours(); return h >= 22 || h < 4; }) },
  { id: "earlyBird", emoji: "🌅", name: "朝の教習", desc: "朝7時前に対戦する", check: (s) => s.history.some((r) => { const h = new Date(r.at).getHours(); return h >= 4 && h < 7; }) },
  { id: "neverGiveUp", emoji: "🔁", name: "不屈の心", desc: "10敗しても遊び続ける", title: "不屈の心", check: (s) => s.losses >= 10 },
];

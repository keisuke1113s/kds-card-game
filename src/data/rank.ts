/**
 * プレイヤーの進級システム。
 * 教習所の実際の流れ（入校→第一段階→…→免許取得）に合わせて、
 * 通算勝利数で段階が上がる。
 */

export interface RankDef {
  /** この段階に必要な通算勝利数 */
  wins: number;
  name: string;
  emoji: string;
  /** 進級演出で見せるひとこと */
  message: string;
}

export const RANKS: RankDef[] = [
  { wins: 0, name: "入校", emoji: "🔰", message: "KDSへようこそ！ここから教習スタート！" },
  { wins: 3, name: "第一段階", emoji: "📖", message: "基本操作はばっちり。所内コースを走ろう！" },
  { wins: 6, name: "修了検定", emoji: "📝", message: "第一段階のまとめ。落ち着いていこう！" },
  { wins: 10, name: "仮免許", emoji: "🚗", message: "仮免許交付！いよいよ路上教習へ！" },
  { wins: 15, name: "第二段階", emoji: "🛣️", message: "路上の流れに乗って、実践力を磨こう！" },
  { wins: 20, name: "みきわめ", emoji: "👀", message: "総仕上げ。今までの成果を見せるとき！" },
  { wins: 27, name: "卒業検定", emoji: "🎓", message: "最後の検定。安全確認を忘れずに！" },
  { wins: 35, name: "免許取得", emoji: "🏆", message: "免許取得おめでとう！これからも安全運転で！" },
];

/** 通算勝利数から現在の段階（RANKSのインデックス）を返す */
export function rankIndexFor(totalWins: number): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (totalWins >= RANKS[i].wins) idx = i;
  }
  return idx;
}

/** 次の段階までの残り勝利数（最終段階なら null） */
export function winsToNextRank(totalWins: number): { next: RankDef; remain: number } | null {
  const idx = rankIndexFor(totalWins);
  if (idx >= RANKS.length - 1) return null;
  const next = RANKS[idx + 1];
  return { next, remain: next.wins - totalWins };
}

/**
 * 総走行距離。教習が進んだ回数や対戦数から「それっぽい距離」を作る。
 * 1対戦 ≒ 教習1時限の走行距離（およそ8km）とみなす。
 */
export function totalDistanceKm(totalMatches: number): number {
  return totalMatches * 8;
}

/** 釧路発の距離マイルストーン（実際の道路距離の目安） */
export const DISTANCE_MILESTONES: { km: number; label: string }[] = [
  { km: 40, label: "釧路湿原 一周" },
  { km: 120, label: "帯広 到着" },
  { km: 190, label: "阿寒湖・知床方面 制覇" },
  { km: 320, label: "札幌 到着" },
  { km: 460, label: "函館 到着" },
  { km: 700, label: "青森 上陸" },
  { km: 1100, label: "東京 到着" },
  { km: 1600, label: "大阪 到着" },
  { km: 2200, label: "福岡 到着" },
  { km: 3000, label: "日本縦断 達成！" },
];

/** いま向かっている目的地（全部到達済みなら null） */
export function nextMilestone(km: number): { km: number; label: string } | null {
  for (const m of DISTANCE_MILESTONES) {
    if (km < m.km) return m;
  }
  return null;
}

/** 到達済みの最後の目的地 */
export function lastMilestone(km: number): { km: number; label: string } | null {
  let last: { km: number; label: string } | null = null;
  for (const m of DISTANCE_MILESTONES) {
    if (km >= m.km) last = m;
  }
  return last;
}

/**
 * オンライン対戦で送り合える定型スタンプ（サーバーの STAMP_IDS と対応）。
 * unlock が付いているものは、その実績を達成すると使えるようになる
 */
export const STAMPS = [
  { id: "yoroshiku", emoji: "🤝", label: "よろしく！" },
  { id: "nice", emoji: "👍", label: "ナイス！" },
  { id: "yaruna", emoji: "😮", label: "やるね！" },
  { id: "arigatou", emoji: "🙏", label: "ありがとう！" },
  { id: "gg", emoji: "🎉", label: "いい勝負！", unlock: "win10" },
  { id: "tsuyoi", emoji: "😱", label: "つよい…！", unlock: "onlineWin1" },
  { id: "makenai", emoji: "💪", label: "負けないぞ！", unlock: "streak5" },
  { id: "yarune", emoji: "😎", label: "おぬしやるな", unlock: "kyokan5" },
  { id: "benkyou", emoji: "📚", label: "勉強になる！", unlock: "quizPerfect" },
  { id: "safety", emoji: "🚗", label: "安全運転で！", unlock: "collect22" },
  { id: "mouikkai", emoji: "🔁", label: "もう一回！", unlock: "play50" },
  { id: "gaman", emoji: "⏳", label: "我慢くらべだ", unlock: "deckoutWin" },
] as const;

export type StampId = (typeof STAMPS)[number]["id"];

export function stampOf(id: string) {
  return STAMPS.find((s) => s.id === id) ?? null;
}

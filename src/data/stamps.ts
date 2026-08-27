/** オンライン対戦で送り合える定型スタンプ（サーバーの STAMP_IDS と対応） */
export const STAMPS = [
  { id: "yoroshiku", emoji: "🤝", label: "よろしく！" },
  { id: "nice", emoji: "👍", label: "ナイス！" },
  { id: "yaruna", emoji: "😮", label: "やるね！" },
  { id: "arigatou", emoji: "🙏", label: "ありがとう！" },
] as const;

export type StampId = (typeof STAMPS)[number]["id"];

export function stampOf(id: string) {
  return STAMPS.find((s) => s.id === id) ?? null;
}

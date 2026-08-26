// アプリ全体の配色・寸法。card.kds946.com の水色基調に合わせる。

export const colors = {
  background: "#f0f7fc",
  surface: "#ffffff",
  primary: "#208AEF",
  primaryDark: "#1668b8",
  accent: "#ff9800",
  danger: "#e53935",
  success: "#2e9e5b",
  text: "#1a2a3a",
  textMuted: "#5b7183",
  border: "#c9dded",
  // カード種別
  instructor: "#3d9be9",
  support: "#2e9e5b",
  tantou: "#c99a2e",
  // 対戦画面
  boardTop: "#e8eef5",
  boardBottom: "#eaf4ea",
  rested: "#9aa8b5",
  highlight: "#ffd54f",
  target: "#ef5350",
} as const;

export const cardSize = {
  sm: { width: 52, height: 73 },
  md: { width: 72, height: 101 },
  lg: { width: 150, height: 210 },
  xl: { width: 240, height: 335 },
} as const;

export type CardSizeKey = keyof typeof cardSize;

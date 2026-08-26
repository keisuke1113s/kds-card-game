// アプリ全体のデザイン定義。
// 深い紺（信頼感）を基調に、KDSブランドの水色をアクセントに使う。
// 影・角丸・余白・文字サイズを体系化して、画面ごとの見た目のばらつきを無くす。

export const colors = {
  // 背景（上から下へわずかに濃くなるグラデーションで使う）
  background: "#eef4fa",
  backgroundDeep: "#dce8f4",
  surface: "#ffffff",
  surfaceAlt: "#f6fafd",

  // ブランド
  primary: "#1565c0",
  primaryDark: "#0d3f7a",
  primaryLight: "#4a90d9",
  accent: "#f5a623",
  accentDark: "#c97f0a",

  // 状態
  danger: "#d64545",
  success: "#2e9e5b",
  text: "#16283c",
  textMuted: "#5f7488",
  cancel: "#8d9aa8",
  border: "#cfe0ee",
  borderStrong: "#a9c6de",

  // カード種別
  instructor: "#2f80c9",
  support: "#2e9e5b",
  tantou: "#c99a2e",

  // 対戦盤面（プレイマット風）
  boardOpponent: "#dfe7f0",
  boardOpponentEdge: "#c3d2e2",
  boardSelf: "#e2eee4",
  boardSelfEdge: "#c2ddc8",
  boardCenter: "#f3f8fc",
  rested: "#9aa8b5",
  highlight: "#ffc93c",
  target: "#ef5350",
} as const;

/** 角丸。用途ごとに固定して統一感を出す */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** 余白の刻み（4の倍数） */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 文字スタイル。画面ごとに数値を散らさない */
export const typography = {
  display: { fontSize: 32, fontWeight: "900" },
  title: { fontSize: 22, fontWeight: "800" },
  heading: { fontSize: 16, fontWeight: "800" },
  body: { fontSize: 15, fontWeight: "400" },
  bodyStrong: { fontSize: 15, fontWeight: "700" },
  caption: { fontSize: 12, fontWeight: "600" },
  micro: { fontSize: 10, fontWeight: "700" },
} as const;

/** 影。浮き上がりの段階を3つに絞る */
export const shadow = {
  /** カード・パネル */
  card: {
    shadowColor: "#0d2b45",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  /** 押せるボタン */
  button: {
    shadowColor: "#0d2b45",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  /** 前面のダイアログ */
  overlay: {
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
} as const;

export const cardSize = {
  sm: { width: 52, height: 73 },
  md: { width: 72, height: 101 },
  lg: { width: 150, height: 210 },
  xl: { width: 240, height: 335 },
} as const;

export type CardSizeKey = keyof typeof cardSize;

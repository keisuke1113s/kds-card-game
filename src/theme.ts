// アプリ全体のデザイン定義。
// 深い紺（信頼感）を基調に、KDSブランドの水色をアクセントに使う。
// 影・角丸・余白・文字サイズを体系化して、画面ごとの見た目のばらつきを無くす。

const lightColors = {
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
};

/** ダークモードの配色（夜でもまぶしくない深い紺基調） */
const darkColors: typeof lightColors = {
  background: "#101826",
  backgroundDeep: "#0a1220",
  surface: "#1a2536",
  surfaceAlt: "#16202f",

  primary: "#3d8fd0",
  primaryDark: "#0d3f7a",
  primaryLight: "#63a8e0",
  accent: "#e5a52e",
  accentDark: "#c97f0a",

  danger: "#e05c5c",
  success: "#3cb56d",
  text: "#e8eef6",
  textMuted: "#93a5b8",
  cancel: "#5c6b7a",
  border: "#2c3c52",
  borderStrong: "#3d5470",

  instructor: "#3d8fd0",
  support: "#3cb56d",
  tantou: "#d0a63e",

  boardOpponent: "#1d2939",
  boardOpponentEdge: "#2c3c52",
  boardSelf: "#1c2e24",
  boardSelfEdge: "#2c4a38",
  boardCenter: "#131c2b",
  rested: "#5c6b7a",
  highlight: "#ffc93c",
  target: "#ef5350",
};

/**
 * ダークモードの設定は起動時に一度だけ読む（画面の色は起動時に固定されるため、
 * 切り替えの反映は再読み込み／再起動で行う）。
 * Web は localStorage を同期的に読めるのでそれを使う。
 */
// ネイティブ用の同期ストレージ（テーマは起動時に同期で読む必要がある）。
// Webでは使わない（localStorage互換の遅延読み込み）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Platform } = require("react-native") as { Platform: { OS: string } };

let nativeStore: { getBoolean: (k: string) => boolean | undefined; set: (k: string, v: boolean) => void } | null = null;
function getNativeStore() {
  if (nativeStore) return nativeStore;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require("react-native-mmkv") as { MMKV: new () => typeof nativeStore };
    nativeStore = new MMKV();
  } catch {
    nativeStore = null;
  }
  return nativeStore;
}

function isDarkPreferred(): boolean {
  try {
    // ネイティブ: MMKVから同期で読む（localStorage の有無での判定は
    // ポリフィルの影響を受けるため、プラットフォームで確実に分岐する）
    if (Platform.OS !== "web") {
      return getNativeStore()?.getBoolean("kds-dark-mode") === true;
    }
    // 切り替え直後の再読み込みでは、URLの ?dark=0/1 を最優先で使う。
    // （iPhoneでは保存直後の再読み込みで localStorage の書き込みが
    //   間に合わないことがあり、URLで運ぶのが確実）
    const g = globalThis as {
      localStorage?: Storage;
      location?: { search?: string };
      history?: { replaceState: (a: unknown, b: string, c: string) => void };
    };
    let m = /[?&]dark=([01])/.exec(g.location?.search ?? "");
    if (!m) {
      // URLに無ければCookieを見る（保存が間に合わなかったときの保険）
      try {
        const c = /(?:^|; )kdsDark=([01])/.exec(
          (globalThis as { document?: { cookie?: string } }).document?.cookie ?? ""
        );
        if (c && g.localStorage?.getItem("kds-dark-mode") !== (c[1] === "1" ? "1" : null)) {
          m = c;
        }
      } catch {
        // Cookieが読めなければ通常の判定へ
      }
    }
    if (m) {
      const dark = m[1] === "1";
      try {
        if (dark) g.localStorage?.setItem("kds-dark-mode", "1");
        else g.localStorage?.removeItem("kds-dark-mode");
        // 使い終わった ?dark= はURLから消しておく
        const url = new URL((globalThis as { location: { href: string } }).location.href);
        url.searchParams.delete("dark");
        g.history?.replaceState(null, "", url.toString());
      } catch {
        // 片づけに失敗しても表示は正しくできる
      }
      return dark;
    }
    return g.localStorage?.getItem("kds-dark-mode") === "1";
  } catch {
    return false;
  }
}

export const DARK_MODE = isDarkPreferred();

export const colors = (DARK_MODE ? darkColors : lightColors) as typeof lightColors;

/** ダークモード設定を保存する（反映は再読み込み後） */
export function setDarkModePreference(dark: boolean): void {
  try {
    if (Platform.OS !== "web") {
      // ネイティブ: MMKVに保存（次回起動時に反映）
      const store = getNativeStore();
      if (!store) throw new Error("MMKV未初期化");
      store.set("kds-dark-mode", dark);
      return;
    }
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (dark) ls?.setItem("kds-dark-mode", "1");
    else ls?.removeItem("kds-dark-mode");
  } catch (e) {
    // 保存できない環境ではライトのまま。原因調査のため報告だけ送る
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { reportAudioIssue } = require("@/data/errlog") as {
        reportAudioIssue: (m: string) => void;
      };
      reportAudioIssue(`テーマ保存失敗: ${String(e)}`);
    } catch {
      // 報告できなくても動作は続行
    }
  }
}

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

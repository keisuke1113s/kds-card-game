import { Platform } from "react-native";
import { create } from "zustand";
import { voicesWarming } from "@/audio/sound";

/**
 * 演出の自動軽量化。
 * 対戦中のフレーム間隔を監視し、カクつき（20fps未満のフレーム）が
 * 5秒間に8回以上起きたら autoLight を立てる。battle 側はこれを見て
 * その対戦の間だけ演出を「ひかえめ」相当に落とす。
 */

interface PerfState {
  /** カクつき検知で演出を軽くしている最中か（対戦ごとにリセット） */
  autoLight: boolean;
  setAutoLight: (v: boolean) => void;
}

export const usePerfStore = create<PerfState>((set) => ({
  autoLight: false,
  setAutoLight: (autoLight) => set({ autoLight }),
}));

let session = 0;
let raf = 0;
let longCount = 0;

// 動作確認用（ブラウザのコンソールから状態を見られるようにしておく）
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kdsPerf = {
    store: usePerfStore,
    info: () => ({ session, longCount }),
  };
}

/**
 * フレーム監視を開始する（対戦画面のマウント時に呼ぶ）。
 * 戻り値は停止関数。検知したら自動で止まる（その対戦の間は autoLight のまま）。
 * 画面遷移で古いマウントの停止処理が後から走っても、新しい監視は
 * 巻き添えにならないよう、呼び出しごとの番号（session）で管理する
 */
export function startFrameWatch(): () => void {
  usePerfStore.getState().setAutoLight(false);
  if (
    Platform.OS !== "web" ||
    typeof requestAnimationFrame !== "function" ||
    typeof performance === "undefined"
  ) {
    return () => {};
  }
  const my = ++session;
  cancelAnimationFrame(raf);
  let last = 0;
  let longFrames: number[] = [];
  const startedAt = performance.now();
  const tick = (t: number) => {
    if (my !== session) return;
    if (last > 0) {
      const dt = t - last;
      // 50ms超 = 20fps未満のフレーム。1秒超はタブ非表示や休止なので数えない。
      // 開始直後2秒と、実況ボイスの先読み中は読み込みで乱れるため対象外
      if (dt > 50 && dt < 1000 && t - startedAt > 2000 && !voicesWarming()) {
        longCount++;
        longFrames.push(t);
        longFrames = longFrames.filter((x) => t - x < 5000);
        if (longFrames.length >= 8) {
          usePerfStore.getState().setAutoLight(true);
          session++;
          return;
        }
      }
    }
    last = t;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    // 自分が最新の監視のときだけ止める（新しい監視を巻き添えにしない）
    if (my === session) {
      session++;
      cancelAnimationFrame(raf);
    }
  };
}

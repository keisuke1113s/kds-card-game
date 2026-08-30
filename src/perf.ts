import { Platform } from "react-native";
import { create } from "zustand";
import { voicesWarming } from "@/audio/sound";
import { reportPerf } from "@/data/errlog";

/**
 * 演出の自動軽量化。
 * 対戦中のフレーム間隔を監視し、はっきりしたカクつき（70ms超のフレーム）が
 * 5秒間に10回以上起きたら autoLight を立てる。battle 側はこれを見て
 * その対戦の間だけ演出を「ひかえめ」相当に落とす。
 * 対戦開始直後は開幕演出（配り・VS・検定開始）の読み込みで必ず乱れるため、
 * 最初の8秒は数えない。
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
  let longDts: number[] = [];
  const startedAt = performance.now();
  const tick = (t: number) => {
    if (my !== session) return;
    if (last > 0) {
      const dt = t - last;
      // 70ms超 = はっきり分かるカクつきだけを数える。1秒超はタブ非表示や休止。
      // 開始直後8秒（開幕演出の読み込み）と、実況ボイスの先読み中は対象外
      if (dt > 70 && dt < 1000 && t - startedAt > 8000 && !voicesWarming()) {
        longCount++;
        longFrames.push(t);
        longDts.push(Math.round(dt));
        longFrames = longFrames.filter((x) => t - x < 5000);
        longDts = longDts.slice(-10);
        if (longFrames.length >= 10) {
          usePerfStore.getState().setAutoLight(true);
          // どんな重さだったかを調査用に報告する（何秒地点で・各フレーム何ms）
          reportPerf(
            `自動軽量化が発動: 開始${Math.round((t - startedAt) / 1000)}秒地点 ` +
              `直近の重いフレーム(ms)=[${longDts.join(",")}]`
          );
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

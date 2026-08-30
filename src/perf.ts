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

/** いま画面で何の演出が出ているか（対戦画面が更新する。ログのラベルに使う） */
let scene = "idle";
export function setPerfScene(label: string): void {
  scene = label;
}

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
  let triggered = false;
  /** この対戦で起きた重いフレームの全記録（シーン付き・最大80件） */
  const collected: { dt: number; sec: number; scene: string }[] = [];
  const startedAt = performance.now();
  const tick = (t: number) => {
    if (my !== session) return;
    if (last > 0) {
      const dt = t - last;
      if (dt > 70 && dt < 1000) {
        // 全件をシーン付きで記録する（対戦終了時にまとめて報告）
        if (collected.length < 80) {
          collected.push({
            dt: Math.round(dt),
            sec: Math.round((t - startedAt) / 1000),
            scene: voicesWarming() ? `${scene}+読込` : scene,
          });
        }
        // 自動軽量化の判定は従来どおり（開始8秒と先読み中は対象外）
        if (!triggered && t - startedAt > 8000 && !voicesWarming()) {
          longCount++;
          longFrames.push(t);
          longFrames = longFrames.filter((x) => t - x < 5000);
          if (longFrames.length >= 10) {
            triggered = true;
            usePerfStore.getState().setAutoLight(true);
          }
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
      // 対戦を離れるとき、重いフレームの内訳をまとめて報告する
      if (collected.length >= 3) {
        const bySc: Record<string, { n: number; max: number }> = {};
        for (const f of collected) {
          const b = (bySc[f.scene] ??= { n: 0, max: 0 });
          b.n++;
          b.max = Math.max(b.max, f.dt);
        }
        const parts = Object.entries(bySc)
          .sort((a, b) => b[1].n - a[1].n)
          .slice(0, 6)
          .map(([k, v]) => `${k}×${v.n}(最大${v.max}ms)`)
          .join(" ");
        const worst = [...collected]
          .sort((a, b) => b.dt - a.dt)
          .slice(0, 5)
          .map((f) => `${f.dt}ms@${f.scene}@${f.sec}秒`)
          .join(", ");
        reportPerf(
          `対戦ログ: ${Math.round((performance.now() - startedAt) / 1000)}秒間に重いフレーム${collected.length}件` +
            `${triggered ? "（自動軽量化 発動）" : ""} 内訳: ${parts} 最悪: ${worst}`
        );
      }
    }
  };
}

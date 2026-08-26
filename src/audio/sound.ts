import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { bgmAssets, seAssets } from "@/data/audio";
import { useSettingsStore } from "@/store/settingsStore";

// 効果音とBGMの一元管理。
// 効果音は assets/audio/*.wav（自動生成マップ seAssets）、
// BGMは assets/audio/bgm_*.mp3 等（bgmAssets）。
//
// 重要: iOS Safari 等はユーザー操作前の音声再生を拒否する（NotAllowedError）。
// そのため Web では最初のタップまで再生を保留し、解禁後に開始する。

let audioModeSet = false;
async function ensureAudioMode() {
  if (audioModeSet) return;
  audioModeSet = true;
  try {
    // iOSのサイレントスイッチONでも鳴らす（ゲームなので）
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    // web 等では未対応でもよい
  }
}

// ---- 自動再生ブロック対策（Web のみ） ----
let unlocked = Platform.OS !== "web";
let pendingBgmKey: string | null = null;

if (Platform.OS === "web" && typeof document !== "undefined") {
  const unlock = () => {
    unlocked = true;
    if (pendingBgmKey) {
      const key = pendingBgmKey;
      pendingBgmKey = null;
      playBgm(key);
    }
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("touchend", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}

/** play() が Promise を返す環境（Web）では拒否を握りつぶす */
function safePlay(player: AudioPlayer) {
  try {
    const result = player.play() as unknown;
    if (
      result &&
      typeof (result as Promise<void>).catch === "function"
    ) {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    // 自動再生ブロック等は無視（次のユーザー操作で再開される）
  }
}

const sePlayers: Record<string, AudioPlayer> = {};
let bgmPlayer: AudioPlayer | null = null;
let currentBgmKey: string | null = null;

export type SeKey =
  | "draw"
  | "play"
  | "battle"
  | "hit"
  | "advance"
  | "support"
  | "janken"
  | "janken_win"
  | "janken_lose"
  | "win"
  | "lose"
  | "tap";

export function playSe(key: SeKey): void {
  if (!unlocked) return;
  if (!useSettingsStore.getState().seEnabled) return;
  const asset = seAssets[key];
  if (asset === undefined) return;
  try {
    void ensureAudioMode();
    let p = sePlayers[key];
    if (!p) {
      p = createAudioPlayer(asset);
      sePlayers[key] = p;
    }
    p.seekTo(0);
    safePlay(p);
  } catch (e) {
    console.warn("効果音を再生できませんでした:", e);
  }
}

/**
 * BGMをループ再生する。key は "bgm_main" など bgmAssets のキー。
 * 同じ曲が再生中なら何もしない。アセットが無ければ静かに何もしない。
 * Web で音声がまだ解禁されていない場合は、最初のタップ後に自動で開始する。
 */
export function playBgm(key: string): boolean {
  if (!useSettingsStore.getState().bgmEnabled) return false;
  const asset = bgmAssets[key];
  if (asset === undefined) return false;
  if (!unlocked) {
    pendingBgmKey = key; // 解禁後に再生
    return true;
  }
  if (currentBgmKey === key && bgmPlayer) return true;
  try {
    void ensureAudioMode();
    stopBgm();
    bgmPlayer = createAudioPlayer(asset);
    bgmPlayer.loop = true;
    bgmPlayer.volume = 0.4;
    safePlay(bgmPlayer);
    currentBgmKey = key;
    return true;
  } catch (e) {
    console.warn("BGMを再生できませんでした:", e);
    return false;
  }
}

export function stopBgm(): void {
  pendingBgmKey = null;
  if (bgmPlayer) {
    try {
      bgmPlayer.pause();
      bgmPlayer.remove();
    } catch {
      // 破棄済みなら無視
    }
    bgmPlayer = null;
    currentBgmKey = null;
  }
}

/** 利用可能なBGMキー（設定画面等の表示用） */
export function availableBgm(): string[] {
  return Object.keys(bgmAssets);
}

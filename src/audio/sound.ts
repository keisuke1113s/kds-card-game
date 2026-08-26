import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { bgmAssets, seAssets } from "@/data/audio";
import { useSettingsStore } from "@/store/settingsStore";

// 効果音とBGMの一元管理。
// 効果音は assets/audio/*.wav（自動生成マップ seAssets）、
// BGMは assets/audio/bgm_*.mp3 等（bgmAssets）。

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
    p.play();
  } catch (e) {
    console.warn("効果音を再生できませんでした:", e);
  }
}

/**
 * BGMをループ再生する。key は "bgm_main" など bgmAssets のキー。
 * 同じ曲が再生中なら何もしない。アセットが無ければ静かに何もしない。
 */
export function playBgm(key: string): boolean {
  if (!useSettingsStore.getState().bgmEnabled) return false;
  if (currentBgmKey === key && bgmPlayer) return true;
  const asset = bgmAssets[key];
  if (asset === undefined) return false;
  try {
    void ensureAudioMode();
    stopBgm();
    bgmPlayer = createAudioPlayer(asset);
    bgmPlayer.loop = true;
    bgmPlayer.volume = 0.4;
    bgmPlayer.play();
    currentBgmKey = key;
    return true;
  } catch (e) {
    console.warn("BGMを再生できませんでした:", e);
    return false;
  }
}

export function stopBgm(): void {
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

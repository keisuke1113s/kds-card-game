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
    // iOS Safari は「ユーザー操作の中で一度再生した音」しか後から鳴らせない。
    // このタップの中で全ての効果音プレイヤーを作って無音で慣らしておくことで、
    // 以降のタイマー起点の再生（演出中の効果音）も拒否されなくなる。
    try {
      for (const key of Object.keys(seAssets)) {
        if (!sePlayers[key]) sePlayers[key] = createAudioPlayer(seAssets[key]);
        const pl = sePlayers[key];
        pl.volume = 0;
        safePlay(pl);
        try {
          pl.pause();
        } catch {
          // 再生前の pause は環境により失敗するが問題ない
        }
        pl.volume = 1;
      }
    } catch {
      // 慣らしに失敗しても、通常の再生時にもう一度試みる
    }
    if (pendingBgmKey) {
      const key = pendingBgmKey;
      pendingBgmKey = null;
      playBgm(key);
    }
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("touchend", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });

  // それでも拒否された場合（NotAllowedError）は、音を諦めるだけで
  // アプリを止めない。この文言のエラーだけを握りつぶす
  window.addEventListener("unhandledrejection", (ev) => {
    const msg = String(ev.reason?.message ?? ev.reason ?? "");
    if (msg.includes("not allowed by the user agent")) ev.preventDefault();
  });
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

/** seekTo も環境により Promise を返すため、拒否を握りつぶす */
function safeSeek(player: AudioPlayer, seconds: number) {
  try {
    const result = player.seekTo(seconds) as unknown;
    if (
      result &&
      typeof (result as Promise<void>).catch === "function"
    ) {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    // 頭出しに失敗しても再生自体は続行できる
  }
}

const sePlayers: Record<string, AudioPlayer> = {};
/** BGMは曲ごとにプレイヤーを使い回す（切り替え時も再生位置を保ち、続きから再開できる） */
const bgmPlayers: Record<string, AudioPlayer> = {};
let currentBgmKey: string | null = null;

export type SeKey =
  | "draw"
  | "play"
  | "battle"
  | "battle_win"
  | "battle_lose"
  | "battle_tie"
  | "hit"
  | "advance"
  | "support"
  | "janken"
  | "janken_win"
  | "janken_lose"
  | "win"
  | "lose"
  | "pack_open"
  | "achievement"
  | "comeback"
  | "cymbal"
  | "chime"
  | "engine_start"
  | "winker"
  | "tap";

/**
 * 効果音を1つ鳴らす。
 * rate を渡すと音程（再生速度）を変えられる。教習が連続で進んだときに
 * 半音ずつ上がっていくコンボの快感などに使う
 */
export function playSe(key: SeKey, rate = 1): void {
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
    try {
      p.setPlaybackRate(rate);
    } catch {
      // 速度変更に対応しない環境では通常の音程で鳴らす
    }
    safeSeek(p, 0);
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
/** 「効果音」設定に連動する戦闘系BGM。それ以外の曲は「BGM」設定に連動する */
const SE_LINKED_BGM = new Set(["bgm_battle", "bgm_reach"]);

function bgmAllowed(key: string): boolean {
  const settings = useSettingsStore.getState();
  return SE_LINKED_BGM.has(key) ? settings.seEnabled : settings.bgmEnabled;
}

export function playBgm(key: string): boolean {
  if (!bgmAllowed(key)) return false;
  const asset = bgmAssets[key];
  if (asset === undefined) return false;
  if (!unlocked) {
    pendingBgmKey = key; // 解禁後に再生
    return true;
  }
  if (currentBgmKey === key && bgmPlayers[key]) {
    // 同じ曲でも pauseBgm で止まっていることがあるので、再生を指示し直す
    // （再生中に play を呼んでも害はない）
    safePlay(bgmPlayers[key]);
    return true;
  }
  try {
    void ensureAudioMode();
    // いま流れている曲は位置を保ったまま一時停止（次に戻ったら続きから）
    if (currentBgmKey && bgmPlayers[currentBgmKey]) {
      try {
        bgmPlayers[currentBgmKey].pause();
      } catch {
        // 一時停止に失敗しても切り替えは続行
      }
    }
    let p = bgmPlayers[key];
    if (!p) {
      p = createAudioPlayer(asset);
      p.loop = true;
      bgmPlayers[key] = p;
    }
    p.volume = 0.4 * (useSettingsStore.getState().bgmVolume ?? 1);
    safePlay(p);
    currentBgmKey = key;
    return true;
  } catch (e) {
    console.warn("BGMを再生できませんでした:", e);
    return false;
  }
}

/**
 * 終盤（リーチ）でBGMのテンポを少し上げて緊迫感を出す。
 * 専用の曲が無くても効果が出るよう、再生速度で表現する
 */
/** 設定画面から呼ぶ: BGM音量の変更を再生中の曲にも反映する */
export function applyBgmVolume(): void {
  const v = 0.4 * (useSettingsStore.getState().bgmVolume ?? 1);
  for (const key of Object.keys(bgmPlayers)) {
    try {
      bgmPlayers[key].volume = v;
    } catch {
      // 反映できない環境では次の再生から効く
    }
  }
}

export function setBgmTense(tense: boolean): void {
  const player = currentBgmKey ? bgmPlayers[currentBgmKey] : null;
  if (!player) return;
  try {
    const p = player as AudioPlayer & {
      playbackRate?: number;
      shouldCorrectPitch?: boolean;
    };
    p.shouldCorrectPitch = true;
    p.playbackRate = tense ? 1.12 : 1.0;
  } catch {
    // 速度変更に未対応の環境では通常速度のまま
  }
}

// 設定の切り替えを今流れている曲へ即時反映する（オフにした側の曲だけ止める）
useSettingsStore.subscribe(() => {
  if (currentBgmKey && !bgmAllowed(currentBgmKey)) pauseBgm();
});

/** BGMを再生位置を保ったまま一時停止する（勝敗カットイン中に効果音だけを響かせる用） */
export function pauseBgm(): void {
  pendingBgmKey = null;
  for (const p of Object.values(bgmPlayers)) {
    try {
      p.pause();
    } catch {
      // 破棄済みなら無視
    }
  }
}

export function stopBgm(): void {
  pendingBgmKey = null;
  // 全曲を止め、次の対戦では頭から始まるよう先頭に戻しておく
  for (const p of Object.values(bgmPlayers)) {
    try {
      p.pause();
      safeSeek(p, 0);
    } catch {
      // 破棄済みなら無視
    }
  }
  currentBgmKey = null;
}

/** 利用可能なBGMキー（設定画面等の表示用） */
export function availableBgm(): string[] {
  return Object.keys(bgmAssets);
}

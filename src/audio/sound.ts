import { Asset } from "expo-asset";
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { bgmAssets, seAssets } from "@/data/audio";
import { VOICE_DURATIONS } from "@/data/voiceDurations";
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

// ---- Web Audio（Web専用の効果音・ボイス再生） ----
// iPhone の Safari では expo-audio（HTMLAudio）の頭出し・再生開始に1回あたり数十ms
// かかり、1手ごとに複数回鳴る効果音が対戦カクつきの主因だった
// （実測: 効果音OFFで盤面更新の平均158ms→25ms）。
// Web Audio API は事前デコード済みのバッファを即時に再生でき、このコストをほぼ0にできる。
let webCtx: AudioContext | null = null;
function getWebCtx(): AudioContext | null {
  if (Platform.OS !== "web") return null;
  if (!webCtx) {
    try {
      const Ctor =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      webCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (webCtx.state !== "running") {
    try {
      void webCtx.resume();
    } catch {
      // 次のユーザー操作で再開される
    }
  }
  return webCtx;
}

/** デコード済みバッファ。null はデコード失敗（以後は従来方式で鳴らす） */
const webBuffers: Record<string, AudioBuffer | null> = {};
const webLoading: Record<string, Promise<AudioBuffer | null> | undefined> = {};

function loadWebBuffer(key: string): Promise<AudioBuffer | null> {
  const done = webBuffers[key];
  if (done !== undefined) return Promise.resolve(done);
  const inFlight = webLoading[key];
  if (inFlight) return inFlight;
  const p = (async () => {
    try {
      const ctx = getWebCtx();
      if (!ctx) return null;
      const uri = Asset.fromModule(seAssets[key]).uri;
      const res = await fetch(uri);
      const raw = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(raw);
      webBuffers[key] = buf;
      return buf;
    } catch {
      webBuffers[key] = null;
      return null;
    } finally {
      delete webLoading[key];
    }
  })();
  webLoading[key] = p;
  return p;
}

function startWebBuffer(ctx: AudioContext, buf: AudioBuffer, rate: number) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  try {
    src.playbackRate.value = rate;
  } catch {
    // 速度変更に対応しない環境では通常の音程で鳴らす
  }
  src.connect(ctx.destination);
  src.start();
}

/**
 * Web Audio で1音鳴らす。true=引き受けた（未デコードなら読み込み後すぐ鳴らす）、
 * false=Web Audio が使えない/デコード失敗済み → 従来方式で鳴らす
 */
function playWeb(key: string, rate: number): boolean {
  const ctx = getWebCtx();
  if (!ctx) return false;
  const buf = webBuffers[key];
  if (buf) {
    startWebBuffer(ctx, buf, rate);
    return true;
  }
  if (buf === null) return false;
  // 初回はデコードが済み次第すぐ鳴らす（wavのデコードは数ms〜数十ms）
  void loadWebBuffer(key).then((b) => {
    if (b) startWebBuffer(ctx, b, rate);
  });
  return true;
}

// ---- 自動再生ブロック対策（Web のみ） ----
let unlocked = Platform.OS !== "web";
let pendingBgmKey: string | null = null;

if (Platform.OS === "web" && typeof document !== "undefined") {
  const unlock = () => {
    unlocked = true;
    // iOS Safari はユーザー操作の中で起こした音声だけを以後も許可する。
    // Web Audio ではこのタップの中で無音バッファを1つ鳴らせば、
    // 以降のタイマー起点の再生（演出中の効果音）もすべて許可される。
    const ctx = getWebCtx();
    if (ctx) {
      try {
        const silent = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = silent;
        src.connect(ctx.destination);
        src.start();
      } catch {
        // 解禁に失敗しても、通常の再生時にもう一度試みる
      }
      // 効果音（ボイス以外）は小さいので、少しずつ先にデコードしておく
      Object.keys(seAssets)
        .filter((k) => !k.startsWith("voice_"))
        .forEach((key, i) => {
          setTimeout(() => void loadWebBuffer(key), 120 * i);
        });
      // 対戦で使うBGMはこのタップの中で一度無音再生しておく。
      // iOS Safariは要素ごとに「ユーザー操作内での再生」を求めるため、
      // タイマー起点で初めて作ったBGMが黙って拒否されることがある
      for (const key of ["bgm_janken", "bgm_battle", "bgm_main"]) {
        try {
          if (bgmAssets[key] === undefined) continue;
          if (!bgmPlayers[key]) {
            bgmPlayers[key] = createAudioPlayer(bgmAssets[key]);
            bgmPlayers[key].loop = true;
          }
          const pl = bgmPlayers[key];
          pl.volume = 0;
          safePlay(pl);
          try {
            pl.pause();
          } catch {
            // 再生前のpauseが失敗する環境でも問題ない
          }
        } catch {
          // 慣らしに失敗しても通常再生時に改めて試す
        }
      }
    } else {
      // Web Audio が使えない環境の従来手順:
      // このタップの中で全ての効果音プレイヤーを作って無音で慣らしておくことで、
      // 以降のタイマー起点の再生も拒否されなくなる。
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

  // iOSはバックグラウンドや画面ロックでAudioContextを止め、そのままだと
  // 以後の効果音・ボイスがすべて無音になる。復帰のたびに起こし直す
  const resumeCtx = () => {
    if (webCtx && webCtx.state !== "running") {
      try {
        void webCtx.resume();
      } catch {
        // 次のユーザー操作で再開される
      }
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resumeCtx();
  });
  window.addEventListener("pageshow", resumeCtx);
  document.addEventListener("pointerdown", resumeCtx);

  // それでも拒否された場合（NotAllowedError）は、音を諦めるだけで
  // アプリを止めない。この文言のエラーだけを握りつぶす
  window.addEventListener("unhandledrejection", (ev) => {
    const msg = String(ev.reason?.message ?? ev.reason ?? "");
    if (msg.includes("not allowed by the user agent")) ev.preventDefault();
    // BGM慣らし（無音play→即pause）で必ず出る中断通知も握りつぶす
    if (msg.includes("interrupted by a call to pause")) ev.preventDefault();
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
  | "cheer"
  | "horn"
  | "heartbeat"
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
  // Web は軽量な Web Audio で鳴らす（対戦カクつき対策の本命）
  if (Platform.OS === "web" && playWeb(key, rate)) return;
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

/** 実況ボイスの種類（assets/audio/voice_*.wav） */
export type VoiceKey =
  | "voice_reach"
  | "voice_reach_opp"
  | "voice_double"
  | "voice_lastbattle"
  | "voice_kessyaku"
  | "voice_comeback"
  | "voice_fullline"
  | "voice_start"
  | "voice_battle"
  | "voice_battlewin"
  | "voice_tie"
  | "voice_close"
  | "voice_flip"
  | "voice_result_win"
  | "voice_result_lose"
  | "voice_kentei"
  | "voice_perfect"
  | "voice_setback"
  | "voice_lasthand"
  | "voice_decklow"
  | "voice_out"
  | "voice_streak"
  | "voice_heat_s"
  | "voice_revenge"
  | "voice_janken"
  | "voice_janken_win"
  | "voice_janken_lose"
  | "voice_aiko"
  | "voice_mulligan"
  | "voice_support"
  | "voice_ability"
  | "voice_chain"
  | "voice_bigstep"
  | "voice_openfield"
  | "voice_wipedout"
  | "voice_longgame"
  | "voice_mikiwame"
  | "voice_counter"
  | "voice_holdout"
  | "voice_battlestreak"
  | "voice_ace"
  | "voice_reinforce"
  | "voice_gakka"
  | "voice_ginou"
  | "voice_bigsupport"
  | "voice_momentum"
  | "voice_pitstop"
  | "voice_giantkill"
  | "voice_mirror"
  | "voice_topdeck"
  | "voice_purebattle"
  | "voice_sabotage"
  | "voice_chance"
  | "voice_deathmatch"
  | "voice_pursuit"
  | "voice_solo"
  | "voice_tripledraw"
  | "voice_overwhelm"
  | "voice_supportwar"
  | "voice_rush"
  | "voice_defense"
  | "voice_straight"
  | "voice_firstblood"
  | "voice_fullhouse"
  | "voice_graveyard"
  | "voice_lucky"
  | "voice_unlucky"
  | "voice_encore"
  | "voice_peek"
  | "voice_recycle"
  | "voice_breakaway"
  | "voice_wall"
  | "voice_perfectrun"
  | "voice_opening"
  | "voice_lastcard"
  | "voice_doublekill"
  | "voice_teacher"
  | "voice_slowstart"
  | "voice_revengewin"
  | "voice_crowd"
  | "voice_cheerup"
  | "voice_greet_morning"
  | "voice_greet_day"
  | "voice_greet_evening"
  | "voice_greet_night"
  | "voice_rainy"
  | "voice_snowy";

/**
 * 実況ボイスを裏で少しずつ読み込んでおく（初回再生時のカクつき防止）。
 * 対戦の準備画面や対戦画面のマウント時に呼ぶ。2回目以降は何もしない
 */
let voicesWarmed = false;
let voicesWarmingUntil = 0;

/** ボイスの先読みが進行中か（この間は自動軽量化のカクつき計測から除外する） */
export function voicesWarming(): boolean {
  return voicesWarmingUntil !== 0 && Date.now() < voicesWarmingUntil;
}

export function warmVoices(): void {
  if (voicesWarmed) return;
  // 実況ボイスがOFFなら読み込み自体を行わない（あとでONにしたら次の機会に読む）
  const st = useSettingsStore.getState();
  if (!st.seEnabled || !st.voiceEnabled) return;
  voicesWarmed = true;
  const keys = Object.keys(seAssets).filter((k) => k.startsWith("voice_"));
  // カード個別実況も含めて本数が多いので、間隔は短めに刻む。
  // 読み込み中はカクつき計測から外すため、終わる見込み時刻を控えておく
  voicesWarmingUntil = Date.now() + keys.length * 120 + 2000;
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  keys.forEach((key, i) => {
    // 一気に読むとそれ自体がカクつくので、250msずつずらし、
    // ブラウザが暇なタイミング（requestIdleCallback）があればそこで読む
    setTimeout(() => {
      const load = () => {
        try {
          if (Platform.OS === "web") {
            // Web は Web Audio 用のバッファを先にデコードしておく
            void loadWebBuffer(key);
            return;
          }
          if (!sePlayers[key]) sePlayers[key] = createAudioPlayer(seAssets[key]);
        } catch {
          // 読み込めなくても、再生時にあらためて試される
        }
      };
      if (ric) ric(load);
      else load();
    }, 120 * i);
  });
}

/**
 * 対戦開始で必ず使う音の先読み。
 * ボイス全体の順次読み込み（warmVoices）は全部で十数秒かかるため、
 * 開始直後に鳴るじゃんけん・開始ボイスだけは対戦準備の時点で即読み込む
 */
const BATTLE_START_VOICES = [
  "voice_janken", "voice_aiko", "voice_janken_win", "voice_janken_lose",
  "voice_start", "voice_revenge", "voice_greet_morning", "voice_greet_day",
  "voice_greet_evening", "voice_greet_night", "voice_rainy", "voice_snowy",
];

export function warmBattleStart(): void {
  if (Platform.OS === "web") {
    for (const key of BATTLE_START_VOICES) {
      if (seAssets[key] !== undefined) void loadWebBuffer(key);
    }
  }
  // BGMプレイヤーも先に作って読み込みを始めておく（初回の鳴り遅れ対策）
  for (const key of ["bgm_janken", "bgm_battle"]) {
    try {
      if (bgmAssets[key] !== undefined && !bgmPlayers[key]) {
        bgmPlayers[key] = createAudioPlayer(bgmAssets[key]);
        bgmPlayers[key].loop = true;
      }
    } catch {
      // 読み込めなくても再生時に改めて試す
    }
  }
}

/**
 * 大事な実況（対戦開始など）用: 別のボイスが再生中なら、
 * 終わるのを待ってから鳴らす（普通の playVoice は重なったらスキップする）
 */
export function playVoiceSoon(key: VoiceKey): void {
  const wait = voiceBusyUntil - Date.now();
  if (wait > 0) {
    setTimeout(() => playVoice(key), wait + 80);
  } else {
    playVoice(key);
  }
}

/** カード個別実況（voice_c_<カードID>.wav）が用意されているか */
export function hasCardVoice(cardId: string): boolean {
  return seAssets[`voice_c_${cardId}`] !== undefined;
}

/**
 * カード個別実況を鳴らす。音声が用意されているカードだけ true を返す
 * （鳴らすかどうかの判定と、汎用ボイスを譲るかの判定に使う）
 */
export function playCardVoice(cardId: string): boolean {
  if (!hasCardVoice(cardId)) return false;
  playVoice(`voice_c_${cardId}` as VoiceKey);
  return true;
}

/** 実況が重ならないための1チャンネル制。再生が終わる見込み時刻まで次を断る */
let voiceBusyUntil = 0;

/**
 * 実況ボイスを1つ鳴らす。効果音設定と実況ボイス設定の両方がONのときだけ。
 * 別の実況がまだ鳴っている間は重ねずにスキップする
 */
export function playVoice(key: VoiceKey): void {
  // 発動調査用のスイッチ（コンソールで __kdsVoiceDebug = true にすると経過が見える）
  const dbg = (globalThis as { __kdsVoiceDebug?: boolean }).__kdsVoiceDebug;
  if (!unlocked) {
    if (dbg) console.log("[voice]", key, "→ 未解禁でスキップ");
    return;
  }
  const s = useSettingsStore.getState();
  if (!s.seEnabled || !s.voiceEnabled) {
    if (dbg) console.log("[voice]", key, "→ 設定OFFでスキップ");
    return;
  }
  const asset = seAssets[key];
  if (asset === undefined) return;
  const now = Date.now();
  if (now < voiceBusyUntil) {
    if (dbg) console.log("[voice]", key, `→ 別ボイス再生中でスキップ（あと${voiceBusyUntil - now}ms）`);
    return;
  }
  if (dbg) console.log("[voice]", key, "→ 再生");
  // Web は軽量な Web Audio で鳴らす。長さはデコード済みなら正確に、未デコードなら2.2秒と見込む
  if (Platform.OS === "web" && webBuffers[key] !== null) {
    const buf = webBuffers[key];
    if (playWeb(key, 1)) {
      const dur = buf ? buf.duration : (VOICE_DURATIONS[key] ?? 2.2);
      voiceBusyUntil = now + Math.round((dur + 0.25) * 1000);
      return;
    }
  }
  try {
    void ensureAudioMode();
    let p = sePlayers[key];
    if (!p) {
      p = createAudioPlayer(asset);
      sePlayers[key] = p;
    }
    // ネイティブは再生前にプレイヤーから長さが取れないため、
    // ビルドに焼き込んだ実長の表を最優先で使う（無ければプレイヤー→2.2秒）。
    // 表より短い見込みだと長いボイス（夜のあいさつ4.8秒等）に次の実況が重なる
    const durSec = (p as { duration?: number }).duration;
    const dur =
      VOICE_DURATIONS[key] ??
      (durSec && isFinite(durSec) && durSec > 0.2 ? durSec : 2.2);
    voiceBusyUntil = now + Math.round((dur + 0.25) * 1000);
    safeSeek(p, 0);
    safePlay(p);
  } catch (e) {
    console.warn("実況ボイスを再生できませんでした:", e);
  }
}

/**
 * BGMをループ再生する。key は "bgm_main" など bgmAssets のキー。
 * 同じ曲が再生中なら何もしない。アセットが無ければ静かに何もしない。
 * Web で音声がまだ解禁されていない場合は、最初のタップ後に自動で開始する。
 */
/** 「効果音」設定に連動する戦闘系BGM。それ以外の曲は「BGM」設定に連動する */
const SE_LINKED_BGM = new Set(["bgm_battle", "bgm_reach", "bgm_reach2"]);

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

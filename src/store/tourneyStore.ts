import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { playSe } from "@/audio/sound";

/** オンライントーナメントの記録と、参加中かどうかの目印 */
interface TourneyState {
  /** オンライントーナメントの優勝回数（実績「オンライン王者」の判定に使う） */
  wins: number;
  addWin: () => void;
  /** いまトーナメントの一環として対戦しているか（結果画面の戻るボタン用。保存しない） */
  active: boolean;
  setActive: (active: boolean) => void;
  /** 待機中CPU対戦の裏でロビーを見張っているか */
  watching: boolean;
  /** トーナメントが始まり、自分の試合が入室待ちになっている */
  matchReady: boolean;
  startLobbyWatch: (device: string, name: string) => void;
  /** 見張りを止める。leave=true でサーバーのロビーからも退出する */
  stopLobbyWatch: (opts?: { leave?: boolean }) => void;
}

const HTTP_URL = "https://tcg.kds946.com";
/** 見張りの上限（置き忘れ対策。これを過ぎたら自動でロビーからも退出する） */
const WATCH_MAX_MS = 15 * 60 * 1000;

let watchTimer: ReturnType<typeof setInterval> | null = null;
let watchDevice: string | null = null;

export const useTourneyStore = create<TourneyState>()(
  persist(
    (set, get) => ({
      wins: 0,
      addWin: () => set({ wins: get().wins + 1 }),
      active: false,
      setActive: (active) => set({ active }),
      watching: false,
      matchReady: false,
      startLobbyWatch: (device, name) => {
        get().stopLobbyWatch();
        watchDevice = device;
        const startedAt = Date.now();
        set({ watching: true, matchReady: false });
        const tick = async () => {
          if (Date.now() - startedAt > WATCH_MAX_MS) {
            get().stopLobbyWatch({ leave: true });
            return;
          }
          try {
            const res = await fetch(`${HTTP_URL}/tourney?device=${encodeURIComponent(device)}`);
            const d = (await res.json()) as {
              inLobby?: boolean;
              inTournament?: boolean;
              yourMatchCode?: string | null;
            };
            // ロビーから外れていたら入り直す（トーナメント本戦に入ったら不要）
            if (!d.inLobby && !d.inTournament) {
              await fetch(`${HTTP_URL}/tourney/join`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ device, name }),
              });
            }
            const ready = !!d.yourMatchCode;
            if (ready && !get().matchReady) {
              // トーナメント開始の合図（対戦中でも気付けるように音を鳴らす）
              playSe("horn");
            }
            set({ matchReady: ready });
          } catch {
            // 通信の一時失敗は次の周期で拾う
          }
        };
        void tick();
        watchTimer = setInterval(() => void tick(), 4000);
      },
      stopLobbyWatch: (opts) => {
        if (watchTimer) {
          clearInterval(watchTimer);
          watchTimer = null;
        }
        if (opts?.leave && watchDevice) {
          void fetch(`${HTTP_URL}/tourney/leave`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ device: watchDevice }),
          }).catch(() => {});
        }
        watchDevice = null;
        if (get().watching || get().matchReady) set({ watching: false, matchReady: false });
      },
    }),
    {
      name: "kds-tourney",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ wins: s.wins }),
    }
  )
);

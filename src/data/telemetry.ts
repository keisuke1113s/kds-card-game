import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * 利用状況の匿名送信。
 * 管理画面の「分析」タブのために、起動・対戦・QR登録の件数を
 * 対戦サーバーに送る。名前などの個人情報は一切送らない。
 * - 送るのは公開ページ（github.io）とネイティブアプリのみ。
 *   localhost での開発中は送らない（分析を汚さないため）
 * - 端末IDは匿名のランダムな文字列（この端末を数えるためだけに使う）
 */

const ENDPOINT = "https://kds-taisen.fly.dev/track";

let deviceIdCache: string | null = null;

async function deviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  try {
    const saved = await AsyncStorage.getItem("kds-device-id");
    if (saved) {
      deviceIdCache = saved;
      return saved;
    }
  } catch {
    // 読めなければ新しく作る
  }
  const bytes = new Uint8Array(16);
  try {
    (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto?.getRandomValues?.(
      bytes
    );
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  deviceIdCache = id;
  try {
    await AsyncStorage.setItem("kds-device-id", id);
  } catch {
    // 保存できなくてもこのセッション中は同じIDを使う
  }
  return id;
}

/** どの環境からの利用か（分析で本番/開発を分けるため） */
function envName(): string | null {
  if (Platform.OS !== "web") return "app";
  const loc = (globalThis as { location?: { hostname: string; pathname: string } }).location;
  if (!loc) return null;
  if (!loc.hostname.endsWith("github.io")) return null; // 開発中は送らない
  return loc.pathname.includes("/dev/") ? "dev" : "prod";
}

/** イベントを1件送る（失敗してもアプリの動作には影響させない） */
export function trackEvent(
  type: "appOpen" | "match" | "scan" | "lineLink",
  payload: Record<string, unknown> = {}
): void {
  const env = envName();
  if (!env) return;
  void (async () => {
    try {
      const id = await deviceId();
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, deviceId: id, env, platform: Platform.OS, ...payload }),
        keepalive: true,
      });
    } catch {
      // 圏外などで送れなければ黙って捨てる
    }
  })();
}

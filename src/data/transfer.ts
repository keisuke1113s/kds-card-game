import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 端末データの引き継ぎコード。
 * アプリの保存データ（kds-* のキー全部）をまとめて文字列化し、
 * 別の端末で貼り付けると同じ状態を復元できる。
 * 形式: KDT1.<base64(JSON)>.<チェックサム4桁>
 */

const PREFIX = "KDT1";

function checksum(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 4).padStart(4, "0");
}

function toBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function fromBase64(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

/** いまの端末データから引き継ぎコードを作る */
export async function exportTransferCode(): Promise<string> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("kds-"));
  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, string> = {};
  for (const [k, v] of pairs) {
    if (v !== null) data[k] = v;
  }
  const body = toBase64(JSON.stringify(data));
  return `${PREFIX}.${body}.${checksum(body)}`;
}

/** 引き継ぎコードを読み込んで端末データを上書きする。成功したら true */
export async function importTransferCode(code: string): Promise<boolean> {
  const parts = code.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  if (checksum(parts[1]) !== parts[2]) return false;
  let data: Record<string, string>;
  try {
    data = JSON.parse(fromBase64(parts[1]));
  } catch {
    return false;
  }
  if (!data || typeof data !== "object") return false;
  const entries = Object.entries(data).filter(([k]) => k.startsWith("kds-"));
  if (entries.length === 0) return false;
  await AsyncStorage.multiSet(entries);
  return true;
}

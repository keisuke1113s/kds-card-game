import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 一度きり通知（進級おめでとう・入校式・図鑑コンプ祝祭など）の既読フラグを
 * 端末の保存から「直接」読み書きするための道具。
 *
 * zustand persist の読み込み完了を待つだけでは、端末によって
 * 読み込みが遅れた・失敗したときに既読が0扱いになり、
 * 同じお祝いが毎回表示されてしまう。表示判定の前に必ずここで
 * 保存値そのものを確認し、既読にするときは直接も書き込んで二重化する。
 */

/** 保存ストア（例 "kds-rank"）の state から1項目を直接読む */
export async function readPersisted<T>(storeName: string, key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(storeName);
    if (!raw) return fallback;
    const v = (JSON.parse(raw) as { state?: Record<string, unknown> }).state?.[key];
    return v === undefined ? fallback : (v as T);
  } catch {
    return fallback;
  }
}

/** 保存ストアの state へ1項目を直接書き込む（zustand側の保存とは別に確実に残す） */
export async function writePersisted(storeName: string, key: string, value: unknown): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(storeName);
    const data = raw
      ? (JSON.parse(raw) as { state?: Record<string, unknown>; version?: number })
      : { state: {}, version: 0 };
    data.state = { ...(data.state ?? {}), [key]: value };
    await AsyncStorage.setItem(storeName, JSON.stringify(data));
  } catch {
    // 書けないときは zustand 側の保存に任せる
  }
}

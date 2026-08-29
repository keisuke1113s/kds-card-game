import { ReplayData } from "@/store/recordStore";

/**
 * リプレイ共有コード。
 * リプレイの記録（種・両デッキ・先攻・全アクション）をJSONにして
 * Base64で包んだもの。決定的エンジンなので、これだけで対戦を完全再現できる。
 * 形式: KR1.<base64>
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

function fromBase64(s: string): string | null {
  try {
    const clean = s.replace(/=+$/, "");
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const ch of clean) {
      const v = B64.indexOf(ch);
      if (v < 0) return null;
      buffer = (buffer << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

export function encodeReplay(replay: ReplayData): string {
  return `KR1.${toBase64(JSON.stringify(replay))}`;
}

/** 読み取れなければ null（サイズ上限つき） */
export function decodeReplay(code: string): ReplayData | null {
  const t = code.trim();
  if (!t.startsWith("KR1.") || t.length > 60000) return null;
  const json = fromBase64(t.slice(4));
  if (!json) return null;
  try {
    const r = JSON.parse(json) as ReplayData;
    if (
      typeof r.seed !== "number" ||
      !r.playerDeck?.main ||
      !r.cpuDeck?.main ||
      !Array.isArray(r.actions)
    ) {
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

import { allCards } from "@/data/cards";
import { DeckList } from "@/engine/deckRules";

/**
 * デッキ共有コード。
 * 形式: KD1.<デッキ名(URLエンコード)>.<カード列>.<チェック>
 * カード列は「全カードをID順に並べた表の番号」を2桁の36進数でつないだもの
 * （メイン21枚＋末尾に担当1枚）。表の並びはIDの辞書順なので、
 * カードを追加しても既存カードの番号は変わらない（末尾に増えるだけ…に
 * ならないケースもあるため、将来カード追加時は KD2 に上げる）。
 */

const IDS = allCards.map((c) => c.id).sort();

function toB36(n: number): string {
  return n.toString(36).padStart(2, "0");
}

function checksum(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1296;
  return toB36(h);
}

export function encodeDeck(name: string, deck: DeckList): string {
  const seq = [...deck.main, deck.tantou]
    .map((id) => {
      const idx = IDS.indexOf(id);
      return idx >= 0 ? toB36(idx) : "";
    })
    .join("");
  const body = `${encodeURIComponent(name.slice(0, 20))}.${seq}`;
  return `KD1.${body}.${checksum(body)}`;
}

export function decodeDeck(code: string): { name: string; deck: DeckList } | null {
  const m = /^KD1\.(.+)\.([0-9a-z]{2,})\.([0-9a-z]{2})$/.exec(code.trim());
  if (!m) return null;
  const body = `${m[1]}.${m[2]}`;
  if (checksum(body) !== m[3]) return null;
  const seq = m[2];
  if (seq.length % 2 !== 0 || seq.length < 4) return null;
  const ids: string[] = [];
  for (let i = 0; i < seq.length; i += 2) {
    const idx = parseInt(seq.slice(i, i + 2), 36);
    const id = IDS[idx];
    if (!id) return null;
    ids.push(id);
  }
  const tantou = ids.pop()!;
  let name = "取り込んだデッキ";
  try {
    name = decodeURIComponent(m[1]).slice(0, 20) || name;
  } catch {
    // 名前が壊れていてもデッキ自体は取り込む
  }
  return { name, deck: { main: ids, tantou } };
}

import {
  CardRegistry,
  DECK_MIN,
  SUPPORT_MAX_DEFAULT,
} from "./types";

import { shuffle } from "./rng";

export interface DeckList {
  /** 担当カードを除くメインデッキのカードID */
  main: string[];
  /** 担当カードID */
  tantou: string;
}

export interface RandomDeckOptions {
  /** メインデッキの枚数（既定 21） */
  size?: number;
  /** サポートカードの枚数（既定 5。担当カードの上限を超える場合は上限に丸める） */
  supports?: number;
  /** 担当カードを固定したいとき */
  tantou?: string;
}

/**
 * ルールを満たすデッキをランダムに組む。
 * 同名カード（例: インストラクターの「佐藤」とサポートの「佐藤」）は
 * 同時に入れられないため、名前が重ならないように選ぶ。
 */
export function randomDeckList(
  defs: CardRegistry,
  seed: number,
  options: RandomDeckOptions = {}
): { deck: DeckList; rngState: number } {
  const size = options.size ?? 21;
  let rngState = seed | 0;
  const all = Object.values(defs);

  // 担当カード
  let tantou = options.tantou;
  if (!tantou) {
    const tantouCards = all.filter((c) => c.type === "tantou");
    const s = shuffle(rngState, tantouCards);
    rngState = s.rngState;
    tantou = s.value[0].id;
  }

  const supportMax = defs[tantou].supportLimit ?? SUPPORT_MAX_DEFAULT;
  const wantSupports = Math.min(options.supports ?? 5, supportMax);

  const usedNames = new Set<string>();
  const pick = (type: "instructor" | "support", count: number): string[] => {
    const pool = all.filter((c) => c.type === type);
    const s = shuffle(rngState, pool);
    rngState = s.rngState;
    const out: string[] = [];
    for (const card of s.value) {
      if (out.length >= count) break;
      if (usedNames.has(card.name)) continue; // 同名カードは1枚まで
      usedNames.add(card.name);
      out.push(card.id);
    }
    return out;
  };

  const supports = pick("support", wantSupports);
  const instructors = pick("instructor", size - supports.length);

  // サポートを先に選んだぶんインストラクターが足りない場合はサポートで補う
  const main = [...instructors, ...supports];

  return { deck: { main, tantou }, rngState };
}

/** デッキ構築ルールの検証。違反メッセージの配列を返す（空 = 合法） */
export function validateDeck(defs: CardRegistry, deck: DeckList): string[] {
  const errors: string[] = [];

  const unknown = [...deck.main, deck.tantou].filter((id) => !defs[id]);
  if (unknown.length > 0) {
    errors.push(`不明なカードID: ${unknown.join(", ")}`);
    return errors;
  }

  if (deck.main.length < DECK_MIN) {
    errors.push(`デッキは${DECK_MIN}枚以上必要です（現在 ${deck.main.length}枚）`);
  }

  const names = new Set<string>();
  for (const id of deck.main) {
    const name = defs[id].name;
    if (names.has(name)) {
      errors.push(`同名カード「${name}」はデッキに入れられません`);
    }
    names.add(name);
  }

  // 担当カードによってサポート上限が変わる（佐々木系: 7枚）
  const supportMax = defs[deck.tantou]?.supportLimit ?? SUPPORT_MAX_DEFAULT;
  const supportCount = deck.main.filter((id) => defs[id].type === "support").length;
  if (supportCount > supportMax) {
    errors.push(`サポートカードは${supportMax}枚以下です（現在 ${supportCount}枚）`);
  }

  const tantouInMain = deck.main.filter((id) => defs[id].type === "tantou");
  if (tantouInMain.length > 0) {
    errors.push("担当カードはメインデッキに入れられません");
  }

  if (defs[deck.tantou].type !== "tantou") {
    errors.push("担当カードには担当タイプのカードを指定してください");
  }

  return errors;
}

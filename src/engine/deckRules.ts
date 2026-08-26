import {
  CardRegistry,
  DECK_MIN,
  SUPPORT_MAX,
} from "./types";

export interface DeckList {
  /** 担当カードを除くメインデッキのカードID */
  main: string[];
  /** 担当カードID */
  tantou: string;
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

  const supportCount = deck.main.filter((id) => defs[id].type === "support").length;
  if (supportCount > SUPPORT_MAX) {
    errors.push(`サポートカードは${SUPPORT_MAX}枚以下です（現在 ${supportCount}枚）`);
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

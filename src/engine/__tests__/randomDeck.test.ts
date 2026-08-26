import { describe, expect, it } from "vitest";
import { cardRegistry } from "@/data/cards";
import { randomDeckList, validateDeck } from "../deckRules";

describe("ランダムデッキ生成", () => {
  it("常にルールを満たすデッキになる（100通り）", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { deck } = randomDeckList(cardRegistry, seed);
      expect(validateDeck(cardRegistry, deck)).toEqual([]);
      expect(deck.main.length).toBe(21);
    }
  });

  it("シードが違えば中身も変わる", () => {
    const decks = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { deck } = randomDeckList(cardRegistry, seed);
      decks.add([...deck.main].sort().join(",") + "|" + deck.tantou);
    }
    expect(decks.size).toBe(20);
  });

  it("担当カードを指定でき、サポート上限が反映される", () => {
    // 佐々木（担当）はサポート7枚まで
    const { deck } = randomDeckList(cardRegistry, 5, { tantou: "t_sasaki", supports: 7 });
    expect(deck.tantou).toBe("t_sasaki");
    const supports = deck.main.filter((id) => cardRegistry[id].type === "support");
    expect(supports.length).toBe(7);
    expect(validateDeck(cardRegistry, deck)).toEqual([]);

    // 上限5枚の担当では5枚に丸められる
    const r2 = randomDeckList(cardRegistry, 5, { tantou: "t_kuji", supports: 7 });
    const s2 = r2.deck.main.filter((id) => cardRegistry[id].type === "support");
    expect(s2.length).toBe(5);
    expect(validateDeck(cardRegistry, r2.deck)).toEqual([]);
  });

  it("同名カードが重複しない（インストラクターとサポートに同名がいる）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { deck } = randomDeckList(cardRegistry, seed);
      const names = deck.main.map((id) => cardRegistry[id].name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

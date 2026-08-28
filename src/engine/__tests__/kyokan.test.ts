import { describe, expect, it } from "vitest";
import { cardRegistry } from "@/data/cards";
import { buildKyokanDeck, KYOKAN_LIST } from "@/data/kyokan";
import { validateDeck } from "../deckRules";

describe("教官に挑戦のキャラデッキ", () => {
  it("全教官のデッキがルールを満たし、本人のカードが入っている", () => {
    for (const k of KYOKAN_LIST) {
      const deck = buildKyokanDeck(k);
      expect(validateDeck(cardRegistry, deck)).toEqual([]);
      expect(deck.main).toContain(k.cardId);
    }
  });

  it("同じ教官のデッキは毎回同じ（固定シードで決定的）", () => {
    for (const k of KYOKAN_LIST) {
      expect(buildKyokanDeck(k)).toEqual(buildKyokanDeck(k));
    }
  });
});

import { describe, expect, it } from "vitest";
import { cardRegistry, defaultDeck } from "@/data/cards";
import { decodeDeck, encodeDeck } from "@/data/deckCode";
import { validateDeck } from "../deckRules";

describe("デッキ共有コード", () => {
  it("エンコード→デコードで同じデッキに戻る", () => {
    const code = encodeDeck("テスト デッキ", defaultDeck);
    const parsed = decodeDeck(code);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("テスト デッキ");
    expect(parsed!.deck).toEqual(defaultDeck);
    expect(validateDeck(cardRegistry, parsed!.deck)).toEqual([]);
  });

  it("壊れたコードは null を返す", () => {
    expect(decodeDeck("KD1.broken")).toBeNull();
    expect(decodeDeck("hello")).toBeNull();
    const code = encodeDeck("x", defaultDeck);
    expect(decodeDeck(code.slice(0, -1) + (code.endsWith("a") ? "b" : "a"))).toBeNull();
  });
});

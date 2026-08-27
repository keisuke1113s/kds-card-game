import { describe, expect, it } from "vitest";
import { allCards, cardRegistry } from "@/data/cards";
import {
  DEFAULT_OPEN_CARDS,
  legacyQrPayloadFor,
  qrPayloadFor,
  registryForUnlocked,
  verifyQrPayload,
} from "../unlock";

describe("カード開放のQRコード", () => {
  it("全カードのQRコードが生成でき、検証で同じカードIDに戻る", () => {
    for (const c of allCards) {
      const payload = qrPayloadFor(c.id);
      expect(payload.startsWith("KC1:")).toBe(true);
      expect(verifyQrPayload(payload)).toBe(c.id);
      // 前後の空白が混ざっても読める
      expect(verifyQrPayload(`  ${payload}\n`)).toBe(c.id);
      // 旧形式のQRも読める
      expect(verifyQrPayload(legacyQrPayloadFor(c.id))).toBe(c.id);
    }
  });

  it("署名をいじったコードや、でたらめなコードは受け付けない", () => {
    const good = qrPayloadFor(allCards[0].id);
    expect(verifyQrPayload(good.slice(0, -1) + "0")).toBeNull();
    expect(verifyQrPayload("KC1:i_notexist:01234567")).toBeNull();
    expect(verifyQrPayload("KDSCARD:v1:i_notexist:0123456789abcdef")).toBeNull();
    expect(verifyQrPayload("https://example.com/evil")).toBeNull();
    expect(verifyQrPayload("")).toBeNull();
    // 別カードの署名を流用してもだめ
    const sigOfOther = qrPayloadFor(allCards[1].id).split(":").pop()!;
    expect(verifyQrPayload(`KC1:${allCards[0].id}:${sigOfOther}`)).toBeNull();
  });

  it("配布時開示セットは実在カードだけで、内蔵デッキが遊べる分を含む", () => {
    expect(DEFAULT_OPEN_CARDS.length).toBeGreaterThan(0);
    for (const id of DEFAULT_OPEN_CARDS) {
      expect(cardRegistry[id], `${id} が実在しない`).toBeDefined();
    }
  });

  it("開放数が少なすぎるときは全カード表にフォールバックする", () => {
    const tiny = registryForUnlocked(new Set([allCards[0].id]));
    expect(Object.keys(tiny).length).toBe(allCards.length);
    const enough = registryForUnlocked(new Set(allCards.map((c) => c.id)));
    expect(Object.keys(enough).length).toBe(allCards.length);
  });
});

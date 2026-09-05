import { describe, expect, it } from "vitest";
import { allCards, cardRegistry } from "@/data/cards";
import {
  checkQrPayload,
  DEFAULT_OPEN_CARDS,
  legacyQrPayloadFor,
  qrPayloadFor,
  registryForUnlocked,
  specialCodeOf,
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

  it("署名は本物だが未実装のカードは「アプリ更新が必要」と判定される", () => {
    // 新規カードのQRを先に発行して、アプリ実装前に読み込んだ場合
    const future = qrPayloadFor("i_mirai_no_card");
    const check = checkQrPayload(future);
    expect(check.status).toBe("unknownCard");
    // 署名が違えば unknownCard ではなく invalid
    expect(checkQrPayload("KC1:i_mirai_no_card:00000000").status).toBe("invalid");
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

describe("スペシャルコードの形式", () => {
  it("KCX: で始まる入力からコード部分を取り出す（前後の空白は無視）", () => {
    expect(specialCodeOf("KCX:ABC-123")).toBe("ABC-123");
    expect(specialCodeOf("  KCX:ABC-123  ")).toBe("ABC-123");
    // コピペで頭が小文字になっても通す
    expect(specialCodeOf("kcx:ABC-123")).toBe("ABC-123");
  });

  it("形式外・空・長すぎる入力は対象外", () => {
    expect(specialCodeOf("KC1:i_kuji:deadbeef")).toBeNull();
    expect(specialCodeOf("https://example.com")).toBeNull();
    expect(specialCodeOf("KCX:")).toBeNull();
    expect(specialCodeOf(`KCX:${"a".repeat(65)}`)).toBeNull();
  });
});

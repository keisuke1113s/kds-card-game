import { describe, expect, it } from "vitest";
import { checkUnlockCode, unlockActionFor } from "../gateway/ws";

describe("スペシャルコードの照合", () => {
  it("登録済みコードと完全一致すれば通る（前後の空白は無視）", () => {
    expect(checkUnlockCode("SOTSUGYO-2026", "SOTSUGYO-2026")).toBe(true);
    expect(checkUnlockCode("SOTSUGYO-2026", "  SOTSUGYO-2026  ")).toBe(true);
    expect(checkUnlockCode(" A , B ", "B")).toBe(true);
  });

  it("違うコード・部分一致・大文字小文字違いは通らない", () => {
    expect(checkUnlockCode("SOTSUGYO-2026", "SOTSUGYO-2025")).toBe(false);
    expect(checkUnlockCode("SOTSUGYO-2026", "SOTSUGYO")).toBe(false);
    expect(checkUnlockCode("SOTSUGYO-2026", "sotsugyo-2026")).toBe(false);
  });

  it("環境変数が未設定・空のときは何を入力しても通らない", () => {
    expect(checkUnlockCode(undefined, "SOTSUGYO-2026")).toBe(false);
    expect(checkUnlockCode("", "SOTSUGYO-2026")).toBe(false);
    expect(checkUnlockCode(",,", "")).toBe(false);
    expect(checkUnlockCode("A", "")).toBe(false);
  });

  it("コードの種類ごとに操作を区別する（どれにも無ければ null）", () => {
    const codes = { unlock: "KAIHO", release: "KAIJO", lineLink: "L-ON", lineUnlink: "L-OFF" };
    expect(unlockActionFor(codes, "KAIHO")).toBe("unlock");
    expect(unlockActionFor(codes, "KAIJO")).toBe("release");
    expect(unlockActionFor(codes, "L-ON")).toBe("lineLink");
    expect(unlockActionFor(codes, "L-OFF")).toBe("lineUnlink");
    expect(unlockActionFor(codes, "BETSU")).toBeNull();
    expect(unlockActionFor({ unlock: "KAIHO" }, "KAIJO")).toBeNull();
  });
});

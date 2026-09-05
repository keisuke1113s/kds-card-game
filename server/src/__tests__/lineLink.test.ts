import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LineLinks } from "../core/lineLink";

const tmpDirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kds-line-"));
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("LINEログイン連携の状態管理", () => {
  it("stateは1回だけ使えて、対応する端末IDが返る", () => {
    const links = new LineLinks(tmpDir());
    const state = links.newState("device-a");
    expect(links.consumeState(state)).toBe("device-a");
    expect(links.consumeState(state)).toBeNull();
    expect(links.consumeState("deたらめ")).toBeNull();
  });

  it("stateは10分で失効する", () => {
    let now = 1_000_000;
    const links = new LineLinks(tmpDir(), () => now);
    const state = links.newState("device-a");
    now += 11 * 60 * 1000;
    expect(links.consumeState(state)).toBeNull();
  });

  it("連携記録は保存され、作り直しても読み戻せる", () => {
    const dir = tmpDir();
    const links = new LineLinks(dir);
    expect(links.get("device-a")).toBeNull();
    links.link("device-a", { userId: "U123", name: "たろう", friend: true, at: "2026-09-05" });
    const reloaded = new LineLinks(dir);
    expect(reloaded.get("device-a")?.userId).toBe("U123");
    expect(reloaded.get("device-a")?.friend).toBe(true);
    expect(reloaded.get("device-b")).toBeNull();
  });
});

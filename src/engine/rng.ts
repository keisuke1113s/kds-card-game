// シード付き決定的PRNG（mulberry32）
// GameState.rngState を進めながら使う。同一シード＋同一アクション列で完全再現。

export function nextRandom(rngState: number): { value: number; rngState: number } {
  let a = (rngState + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rngState: a };
}

/** 0 <= n < max の整数 */
export function nextInt(
  rngState: number,
  max: number
): { value: number; rngState: number } {
  const r = nextRandom(rngState);
  return { value: Math.floor(r.value * max), rngState: r.rngState };
}

/** Fisher–Yates シャッフル（非破壊） */
export function shuffle<T>(
  rngState: number,
  arr: readonly T[]
): { value: T[]; rngState: number } {
  const out = arr.slice();
  let rs = rngState;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(rs, i + 1);
    rs = r.rngState;
    const j = r.value;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { value: out, rngState: rs };
}

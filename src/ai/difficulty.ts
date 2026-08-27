import { AIParams, Difficulty } from "./types";

export const DIFFICULTY_PARAMS: Record<Difficulty, AIParams> = {
  easy: { noise: 6, aggression: 0.5, estimateOpponentSupport: false },
  normal: { noise: 1.5, aggression: 1.0, estimateOpponentSupport: true },
  hard: { noise: 0, aggression: 1.1, estimateOpponentSupport: true },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "よわい",
  normal: "ふつう",
  hard: "つよい",
};

/**
 * CPUの個性。強さ（読みの精度）とは別に、戦い方の好みを変える。
 * - aggressive: バトルを積極的に仕掛ける
 * - defensive: バトルを避けて教習を淡々と進める
 */
export type CpuPersona = "balanced" | "aggressive" | "defensive";

export const PERSONA_LABELS: Record<CpuPersona, string> = {
  balanced: "バランス",
  aggressive: "こうげき型",
  defensive: "まもり型",
};

export const PERSONA_EMOJI: Record<CpuPersona, string> = {
  balanced: "🤖",
  aggressive: "⚔️",
  defensive: "🛡️",
};

/** 個性を強さパラメータに反映する */
export function applyPersona(params: AIParams, persona: CpuPersona): AIParams {
  if (persona === "aggressive") return { ...params, aggression: params.aggression * 1.6 };
  if (persona === "defensive") return { ...params, aggression: params.aggression * 0.45 };
  return params;
}

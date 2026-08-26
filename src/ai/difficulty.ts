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

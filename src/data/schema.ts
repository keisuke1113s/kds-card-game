import { z } from "zod";

// カードデータ（JSON）を取り込む際の検証スキーマ。
// src/engine/types.ts の CardDef と同形。

export const trackSchema = z.enum(["academic", "skill"]);
export const cardTypeSchema = z.enum(["instructor", "support", "tantou"]);

// janken が自身の EffectOp 配列を持つため遅延定義
export const effectOpSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({
      op: z.literal("modifyTrack"),
      target: z.enum(["self", "opponent"]),
      track: trackSchema,
      amount: z.number().int(),
    }),
    z.object({ op: z.literal("modifyTrackChoice"), amount: z.number().int() }),
    z.object({ op: z.literal("draw"), count: z.number().int().positive() }),
    z.object({
      op: z.literal("searchTop"),
      count: z.number().int().positive(),
      filterType: cardTypeSchema,
      take: z.number().int().positive(),
    }),
    z.object({
      op: z.literal("buffCombat"),
      target: z.literal("ownBattler"),
      amount: z.number().int(),
      duration: z.literal("battle"),
    }),
    z.object({
      op: z.literal("combatMod"),
      target: z.enum(["source", "chooseOwn", "chooseOpponent", "battleAttacker"]),
      amount: z.number().int(),
      until: z.enum(["turnEnd", "battleEnd"]),
    }),
    z.object({
      op: z.literal("lessonMod"),
      target: z.enum(["source", "chooseOwn", "allOwn"]),
      amount: z.number().int(),
    }),
    z.object({ op: z.literal("removeTarget"), target: z.literal("opponent") }),
    z.object({ op: z.literal("removeSource") }),
    z.object({ op: z.literal("removeAllExceptSource") }),
    z.object({ op: z.literal("removeBothBattlers") }),
    z.object({ op: z.literal("bounceTarget"), target: z.literal("opponentRested") }),
    z.object({ op: z.literal("salvage"), cardType: z.enum(["instructor", "support"]) }),
    z.object({ op: z.literal("discardOpponentChoice"), count: z.number().int().positive() }),
    z.object({ op: z.literal("discardOwnChoice"), count: z.number().int().positive() }),
    z.object({ op: z.literal("bottomOwnChoice"), count: z.number().int().positive() }),
    z.object({ op: z.literal("summonNamed"), name: z.string().min(1) }),
    z.object({ op: z.literal("summonChoice") }),
    z.object({ op: z.literal("restSelf") }),
    z.object({ op: z.literal("untapChoice") }),
    z.object({ op: z.literal("untapSelf") }),
    z.object({ op: z.literal("untapAtTurnEndCharge") }),
    z.object({ op: z.literal("revealOpponentHand") }),
    z.object({ op: z.literal("recycleSupports") }),
    z.object({
      op: z.literal("janken"),
      win: z.array(effectOpSchema),
      lose: z.array(effectOpSchema),
    }),
    z.object({ op: z.literal("advanceSourceTrack") }),
    z.object({ op: z.literal("endTurnFinalize") }),
  ])
);

export const effectDefSchema = z.object({
  trigger: z.enum([
    "onPlay",
    "onAttack",
    "onDefendAttacked",
    "onTurnEnd",
    "onBattle",
    "onSupport",
    "onRemoved",
    "onLesson",
  ]),
  ops: z.array(effectOpSchema),
});

export const abilityDefSchema = z.object({
  window: z.enum(["main", "battle"]),
  oncePerTurn: z.boolean(),
  costRestSelf: z.boolean().optional(),
  ops: z.array(effectOpSchema),
  label: z.string().min(1),
});

export const cardDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: cardTypeSchema,
    combat: z.number().int().min(0).optional(),
    lesson: z.number().int().min(0).optional(),
    timing: z.enum(["battle", "main", "any"]).optional(),
    effects: z.array(effectDefSchema).optional(),
    keywords: z
      .array(z.enum(["immuneToOpponentEffects", "noSupportInOwnBattle", "cantAttackOnEntry"]))
      .optional(),
    ability: abilityDefSchema.optional(),
    supportLimit: z.number().int().positive().optional(),
    effectText: z.string().optional(),
    flavor: z.string().optional(),
    image: z.string().optional(),
  })
  .refine((c) => c.type !== "instructor" || (c.combat !== undefined && c.lesson !== undefined), {
    message: "インストラクターには combat と lesson が必要です",
  })
  .refine((c) => c.type !== "support" || c.timing !== undefined, {
    message: "サポートカードには timing が必要です",
  });

export const cardSetSchema = z.array(cardDefSchema);

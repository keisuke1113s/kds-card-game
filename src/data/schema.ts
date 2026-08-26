import { z } from "zod";

// 実カードデータ（JSON）を取り込む際の検証スキーマ。
// src/engine/types.ts の CardDef と同形。

export const trackSchema = z.enum(["academic", "skill"]);

export const effectOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("modifyTrack"),
    target: z.enum(["self", "opponent"]),
    track: trackSchema,
    amount: z.number().int(),
  }),
  z.object({
    op: z.literal("buffCombat"),
    target: z.literal("ownBattler"),
    amount: z.number().int(),
    duration: z.literal("battle"),
  }),
  z.object({
    op: z.literal("draw"),
    count: z.number().int().positive(),
  }),
  z.object({
    op: z.literal("searchTop"),
    count: z.number().int().positive(),
    filterType: z.enum(["instructor", "support", "tantou"]),
    take: z.number().int().positive(),
  }),
]);

export const effectDefSchema = z.object({
  trigger: z.enum([
    "onPlay",
    "onAttack",
    "onDefendAttacked",
    "onTurnEnd",
    "onBattle",
    "onSupport",
  ]),
  ops: z.array(effectOpSchema),
});

export const cardDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["instructor", "support", "tantou"]),
    combat: z.number().int().min(0).optional(),
    lesson: z.number().int().min(0).optional(),
    timing: z.enum(["battle", "main", "any"]).optional(),
    effects: z.array(effectDefSchema).optional(),
    effectText: z.string().optional(),
    image: z.string().optional(),
  })
  .refine((c) => c.type !== "instructor" || (c.combat !== undefined && c.lesson !== undefined), {
    message: "インストラクターには combat と lesson が必要です",
  })
  .refine((c) => c.type !== "support" || c.timing !== undefined, {
    message: "サポートカードには timing が必要です",
  });

export const cardSetSchema = z.array(cardDefSchema);

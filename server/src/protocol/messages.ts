import { z } from "zod";

/**
 * クライアント→サーバーのメッセージ（zod で入口検証）。
 *
 * action の中身はここでは unknown のまま受ける。
 * GameAction の妥当性は RoomCore が「合法手の一覧に構造一致するか」で
 * 照合するため、スキーマより厳しい検証が既に効いている。
 */

const deckListSchema = z.object({
  main: z.array(z.string().max(64)).max(60),
  tantou: z.string().max(64),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("createRoom"),
    name: z.string().max(24),
    title: z.string().max(24).optional(),
    device: z.string().max(64).optional(),
    deck: deckListSchema,
  }),
  z.object({
    type: z.literal("joinRoom"),
    code: z.string().min(4).max(8),
    name: z.string().max(24),
    title: z.string().max(24).optional(),
    device: z.string().max(64).optional(),
    deck: deckListSchema,
  }),
  z.object({
    type: z.literal("joinQueue"),
    name: z.string().max(24),
    title: z.string().max(24).optional(),
    device: z.string().max(64).optional(),
    deck: deckListSchema,
  }),
  z.object({
    type: z.literal("reattach"),
    code: z.string().min(4).max(8),
    sessionToken: z.string().max(64),
  }),
  z.object({ type: z.literal("ready") }),
  z.object({
    type: z.literal("janken"),
    hand: z.enum(["rock", "scissors", "paper"]),
  }),
  z.object({ type: z.literal("action"), action: z.unknown() }),
  z.object({ type: z.literal("resign") }),
  z.object({ type: z.literal("rematch") }),
  z.object({
    type: z.literal("stamp"),
    // RoomCore の STAMP_IDS と一致させること
    id: z.enum([
      "yoroshiku", "nice", "yaruna", "arigatou", "gg", "tsuyoi",
      "makenai", "yarune", "benkyou", "safety", "mouikkai", "gaman",
    ]),
  }),
  z.object({
    type: z.literal("spectate"),
    code: z.string().min(4).max(8),
  }),
  z.object({
    type: z.literal("cheer"),
    emoji: z.string().max(8),
  }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("ping") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** 表示名の整形（制御文字除去・全角正規化・長さ制限） */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 12);
  return cleaned || "教習生";
}

/** 称号の整形。空なら undefined（称号なし） */
export function sanitizeTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 12);
  return cleaned || undefined;
}

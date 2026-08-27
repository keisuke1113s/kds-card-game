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
    deck: deckListSchema,
  }),
  z.object({
    type: z.literal("joinRoom"),
    code: z.string().min(4).max(8),
    name: z.string().max(24),
    deck: deckListSchema,
  }),
  z.object({
    type: z.literal("joinQueue"),
    name: z.string().max(24),
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

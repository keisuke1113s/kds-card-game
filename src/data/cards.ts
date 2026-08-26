import { CardDef, CardRegistry } from "@/engine/types";
import { DeckList } from "@/engine/deckRules";
import { cardSetSchema } from "./schema";

// 開発用プレースホルダーカードセット。
// 実カードデータが届いたらこの配列を差し替える（スキーマは schema.ts）。
// 渋谷(華)・武田・受付は公式説明書に登場する実カードの効果に合わせている。

const instructor = (
  id: string,
  name: string,
  combat: number,
  lesson: number,
  extra?: Partial<CardDef>
): CardDef => ({
  id,
  name,
  type: "instructor",
  combat,
  lesson,
  effectText: extra?.effectText ?? "",
  ...extra,
});

export const placeholderCards: CardDef[] = [
  // ---- バニラインストラクター（戦闘力/教習力のバリエーション） ----
  instructor("sato", "佐藤", 1, 1),
  instructor("suzuki", "鈴木", 1, 2),
  instructor("takahashi", "高橋", 1, 3),
  instructor("tanaka", "田中", 2, 1),
  instructor("ito", "伊藤", 2, 2),
  instructor("watanabe", "渡辺", 2, 3),
  instructor("yamamoto", "山本", 2, 4),
  instructor("nakamura", "中村", 3, 1),
  instructor("kobayashi", "小林", 3, 2),
  instructor("kato", "加藤", 3, 3),
  instructor("yoshida", "吉田", 4, 1),
  instructor("yamada", "山田", 4, 2),
  instructor("sasaki", "佐々木", 1, 4),
  instructor("yamaguchi", "山口", 3, 4),
  instructor("matsumoto", "松本", 4, 3),
  instructor("inoue", "井上", 5, 1),

  // ---- 効果持ちインストラクター（公式カード） ----
  instructor("shibuya_hana", "渋谷(華)", 2, 3, {
    effectText: "【登場時】相手の『学科』の教習時限-4",
    effects: [
      {
        trigger: "onPlay",
        ops: [{ op: "modifyTrack", target: "opponent", track: "academic", amount: -4 }],
      },
    ],
  }),
  instructor("takeda", "武田", 2, 2, {
    effectText:
      "【登場時】山札の上から2枚見て、インストラクターカードを1枚手札に加える。残りは山札の下に置く。",
    effects: [
      {
        trigger: "onPlay",
        ops: [{ op: "searchTop", count: 2, filterType: "instructor", take: 1 }],
      },
    ],
  }),

  // ---- サポートカード ----
  {
    id: "uketsuke",
    name: "受付",
    type: "support",
    timing: "battle",
    effectText: "バトル中、自分のインストラクターの戦闘力+2",
    effects: [
      {
        trigger: "onSupport",
        ops: [{ op: "buffCombat", target: "ownBattler", amount: 2, duration: "battle" }],
      },
    ],
  },
  {
    id: "ouen",
    name: "応援",
    type: "support",
    timing: "battle",
    effectText: "バトル中、自分のインストラクターの戦闘力+1",
    effects: [
      {
        trigger: "onSupport",
        ops: [{ op: "buffCombat", target: "ownBattler", amount: 1, duration: "battle" }],
      },
    ],
  },
  {
    id: "tokubetsu_shido",
    name: "特別指導",
    type: "support",
    timing: "battle",
    effectText: "バトル中、自分のインストラクターの戦闘力+3",
    effects: [
      {
        trigger: "onSupport",
        ops: [{ op: "buffCombat", target: "ownBattler", amount: 3, duration: "battle" }],
      },
    ],
  },
  {
    id: "meeting",
    name: "ミーティング",
    type: "support",
    timing: "main",
    effectText: "自分の山札から1枚引く。",
    effects: [{ trigger: "onSupport", ops: [{ op: "draw", count: 1 }] }],
  },

  // ---- 担当カード ----
  {
    id: "kocho",
    name: "校長",
    type: "tantou",
    effectText: "（効果なし）",
  },
  {
    id: "kyoto",
    name: "教頭",
    type: "tantou",
    effectText: "【自分のターン終了時】自分の『学科』の教習時限+1",
    effects: [
      {
        trigger: "onTurnEnd",
        ops: [{ op: "modifyTrack", target: "self", track: "academic", amount: 1 }],
      },
    ],
  },
];

// 開発ビルドではスキーマ検証を走らせて、データ不整合を即時に検出する
declare const __DEV__: boolean | undefined;
if (typeof __DEV__ === "undefined" || __DEV__) {
  const result = cardSetSchema.safeParse(placeholderCards);
  if (!result.success) {
    throw new Error(`カードデータが不正です: ${result.error.message}`);
  }
}

export const cardRegistry: CardRegistry = Object.fromEntries(
  placeholderCards.map((c) => [c.id, c])
);

export function getCard(id: string): CardDef {
  const def = cardRegistry[id];
  if (!def) throw new Error(`不明なカードID: ${id}`);
  return def;
}

/** デフォルトデッキ（全メインカード22枚＋担当:校長） */
export const defaultDeck: DeckList = {
  main: placeholderCards.filter((c) => c.type !== "tantou").map((c) => c.id),
  tantou: "kocho",
};

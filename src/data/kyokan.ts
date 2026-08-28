import { cardRegistry, getCard } from "@/data/cards";
import { DeckList, randomDeckList, validateDeck } from "@/engine/deckRules";

/**
 * 「教官に挑戦」モード。
 * 実在インストラクターのキャラデッキ（本人のカード入り・固定シード）と
 * 専用の口上セリフで戦う特別なCPU戦。強さは「つよい」固定。
 */
export interface KyokanDef {
  cardId: string;
  /** 表示名（「◯◯教官」） */
  name: string;
  desc: string;
  seed: number;
  lines: {
    start: readonly string[];
    playerReach: readonly string[];
    cpuReach: readonly string[];
    cpuWin: readonly string[];
    cpuLose: readonly string[];
  };
}

export const KYOKAN_LIST: KyokanDef[] = [
  {
    cardId: "i_okumura",
    name: "奥村",
    desc: "効果を寄せつけない鉄壁の教官。正攻法で崩せ！",
    seed: 946001,
    lines: {
      start: ["小手先の効果は私には通じませんよ", "基本に忠実に、いきましょう"],
      playerReach: ["ほう…基本ができていますね", "最後まで気を抜かないことです"],
      cpuReach: ["これが積み重ねの力です", "仕上げに入りますよ"],
      cpuWin: ["基本を磨いて、また来なさい", "焦りは事故のもとですよ"],
      cpuLose: ["見事…正攻法で崩されるとは", "あなたの運転、合格です"],
    },
  },
  {
    cardId: "i_shigaya",
    name: "志萱",
    desc: "サポートを許さない孤高の教官。真っ向勝負あるのみ！",
    seed: 946002,
    lines: {
      start: ["補助輪は外していけ。一対一だ", "助けは来ない。自分の腕で走れ"],
      playerReach: ["支えなしでここまで来たか", "その調子だ、油断するな"],
      cpuReach: ["俺の走りに追いつけるか", "ゴールは目の前だ"],
      cpuWin: ["まだまだ独り立ちには早いな", "腕を磨いて出直してこい"],
      cpuLose: ["…一人前だ。もう何も言うことはない", "いい走りだった。認めよう"],
    },
  },
  {
    cardId: "i_iida",
    name: "飯田",
    desc: "最大戦闘力の猛攻教官。バトルを制する者が勝つ！",
    seed: 946003,
    lines: {
      start: ["全力でぶつかってこい！", "遠慮はいらん、燃えてきた！"],
      playerReach: ["やるじゃないか、面白い！", "だがここからが本番だ！"],
      cpuReach: ["俺の卒業が先だ！", "アクセル全開でいくぞ！"],
      cpuWin: ["まだパワーが足りんな！鍛え直せ！", "いい勝負だった、また来い！"],
      cpuLose: ["完敗だ！お前の勝ちだ！", "その闘志、免許皆伝だ！"],
    },
  },
];

/**
 * 教官のキャラデッキを組む。
 * 固定シードのランダムデッキをベースに、本人のカードを必ずメインに入れる。
 * 同名カード禁止のルールを崩さないよう、同名カードは先に取り除く
 */
export function buildKyokanDeck(def: KyokanDef): DeckList {
  const { deck } = randomDeckList(cardRegistry, def.seed);
  const self = getCard(def.cardId);
  if (!deck.main.includes(def.cardId)) {
    // 同名カードがいたら外し、いなければ先頭のインストラクターと入れ替える
    const sameNameIdx = deck.main.findIndex((id) => getCard(id).name === self.name);
    if (sameNameIdx >= 0) {
      deck.main[sameNameIdx] = def.cardId;
    } else {
      const instIdx = deck.main.findIndex((id) => getCard(id).type === "instructor");
      deck.main[instIdx >= 0 ? instIdx : 0] = def.cardId;
    }
  }
  const errors = validateDeck(cardRegistry, deck);
  if (errors.length > 0) {
    // 万一ルールを満たせなければ、素のランダムデッキで戦う（対戦は成立させる）
    return randomDeckList(cardRegistry, def.seed + 1).deck;
  }
  return deck;
}

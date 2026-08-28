import { allCards, cardRegistry, getCard } from "@/data/cards";
import { DeckList, randomDeckList, validateDeck } from "@/engine/deckRules";

/**
 * 「インストラクターに挑戦」モード。
 * 全インストラクターが本人のカード入りキャラデッキ（固定シード）と
 * 口上セリフで立ちはだかる特別なCPU戦。強さは「つよい」固定。
 */
export interface KyokanDef {
  cardId: string;
  /** 表示名 */
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

type Lines = KyokanDef["lines"];

/** 特別に口上を作り込んだインストラクター */
const CUSTOM: Record<string, { desc: string; lines: Lines }> = {
  i_okumura: {
    desc: "効果を寄せつけない鉄壁の守り。正攻法で崩せ！",
    lines: {
      start: ["小手先の効果は私には通じませんよ", "基本に忠実に、いきましょう"],
      playerReach: ["ほう…基本ができていますね", "最後まで気を抜かないことです"],
      cpuReach: ["これが積み重ねの力です", "仕上げに入りますよ"],
      cpuWin: ["基本を磨いて、また来なさい", "焦りは事故のもとですよ"],
      cpuLose: ["見事…正攻法で崩されるとは", "あなたの運転、合格です"],
    },
  },
  i_shigaya: {
    desc: "サポートを許さない孤高の存在。真っ向勝負あるのみ！",
    lines: {
      start: ["補助輪は外していけ。一対一だ", "助けは来ない。自分の腕で走れ"],
      playerReach: ["支えなしでここまで来たか", "その調子だ、油断するな"],
      cpuReach: ["俺の走りに追いつけるか", "ゴールは目の前だ"],
      cpuWin: ["まだまだ独り立ちには早いな", "腕を磨いて出直してこい"],
      cpuLose: ["…一人前だ。もう何も言うことはない", "いい走りだった。認めよう"],
    },
  },
  i_iida: {
    desc: "最大戦闘力の猛攻タイプ。バトルを制する者が勝つ！",
    lines: {
      start: ["全力でぶつかってこい！", "遠慮はいらん、燃えてきた！"],
      playerReach: ["やるじゃないか、面白い！", "だがここからが本番だ！"],
      cpuReach: ["俺の卒業が先だ！", "アクセル全開でいくぞ！"],
      cpuWin: ["まだパワーが足りんな！鍛え直せ！", "いい勝負だった、また来い！"],
      cpuLose: ["完敗だ！お前の勝ちだ！", "その闘志、免許皆伝だ！"],
    },
  },
};

/** タイプ別の汎用口上（戦闘型／教習型／バランス型） */
const GENERIC: Record<"attack" | "lesson" | "balanced", Lines> = {
  attack: {
    start: ["力勝負なら負けませんよ！", "さあ、熱い勝負にしましょう！"],
    playerReach: ["おっと、やりますね…！", "ここからが踏ん張りどころです！"],
    cpuReach: ["このまま一気に行きますよ！", "ゴールが見えてきました！"],
    cpuWin: ["いい勝負でした！また挑んでください！", "パワーで押し切りました！"],
    cpuLose: ["参りました！あなたの勝ちです！", "その腕前、本物ですね！"],
  },
  lesson: {
    start: ["コツコツ積み重ねるのが私の流儀です", "丁寧にいきましょう"],
    playerReach: ["順調ですね。ですが私も進んでいますよ", "あと少し、集中していきましょう"],
    cpuReach: ["私の教習が仕上がってきました", "着実に、卒業が近づいています"],
    cpuWin: ["継続は力なり、です", "また一緒に頑張りましょう"],
    cpuLose: ["素晴らしい積み重ねでした", "卒業おめでとうございます！"],
  },
  balanced: {
    start: ["今日もよろしくお願いします！", "安全第一で、いい勝負をしましょう"],
    playerReach: ["いい調子ですね…！", "最後まで丁寧にいきましょう"],
    cpuReach: ["私も負けていられません", "そろそろ仕上げに入りますよ"],
    cpuWin: ["今日の教習はここまで。また来てくださいね", "次はもっといい勝負になりますよ"],
    cpuLose: ["お見事！立派なドライバーです", "私から教えることはもうありません"],
  },
};

/** カードIDから安定した数値（デッキの固定シード用） */
function seedOf(id: string): number {
  let h = 946000;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

function autoDesc(combat: number, lesson: number): string {
  const type =
    combat >= 4 ? "バトルで押し切る戦闘型。" : lesson >= 4 ? "教習を一気に進める教習型。" : "攻守そろったバランス型。";
  return `${type}（戦闘力${combat}・教習力${lesson}）`;
}

/** 全インストラクターぶんの挑戦リスト */
export const KYOKAN_LIST: KyokanDef[] = allCards
  .filter((c) => c.type === "instructor")
  .map((c) => {
    const custom = CUSTOM[c.id];
    const combat = c.combat ?? 0;
    const lesson = c.lesson ?? 0;
    return {
      cardId: c.id,
      name: c.name,
      desc: custom?.desc ?? autoDesc(combat, lesson),
      seed: seedOf(c.id),
      lines: custom?.lines ?? GENERIC[combat >= 4 ? "attack" : lesson >= 4 ? "lesson" : "balanced"],
    };
  });

/**
 * インストラクターのキャラデッキを組む。
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

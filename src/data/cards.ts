import { CardDef, CardRegistry, EffectOp } from "@/engine/types";
import { DeckList } from "@/engine/deckRules";
import { cardSetSchema } from "./schema";

// KDSカードゲーム 実カードセット（公式PDFから転記）
// 効果テキストはカードの印字どおり。効果の実装は effects フィールドの宣言的DSL。

const battleBuff2: EffectOp[] = [
  { op: "buffCombat", target: "ownBattler", amount: 2, duration: "battle" },
];

export const realCards: CardDef[] = [
  // ================================================== インストラクター
  {
    id: "i_kuji", name: "久慈", type: "instructor", combat: 1, lesson: 3,
    effectText: "【自分のターン中】【ターン1回】このカードを休憩状態にして、相手のインストラクターを１人退場させる。",
    flavor: "趣味は飛行機です",
    ability: {
      window: "main", oncePerTurn: true, costRestSelf: true,
      ops: [{ op: "removeTarget", target: "opponent" }],
      label: "休憩して相手を1人退場させる",
    },
  },
  {
    id: "i_iseki", name: "井関", type: "instructor", combat: 1, lesson: 2,
    effectText: "【登場時】自分と相手の場の『井関』以外のインストラクターを全て退場させる。",
    flavor: "趣味は日曜大工です",
    effects: [{ trigger: "onPlay", ops: [{ op: "removeAllExceptSource" }] }],
  },
  {
    id: "i_ito", name: "伊藤", type: "instructor", combat: 4, lesson: 2,
    effectText: "【登場時】場外からインストラクター１人手札に加える。",
    flavor: "趣味は洗車です",
    effects: [{ trigger: "onPlay", ops: [{ op: "salvage", cardType: "instructor" }] }],
  },
  {
    id: "i_sasaki", name: "佐々木", type: "instructor", combat: 2, lesson: 2,
    effectText: "【退場時】相手のインストラクター１人を退場させる。",
    flavor: "趣味は猫吸いです",
    effects: [{ trigger: "onRemoved", ops: [{ op: "removeTarget", target: "opponent" }] }],
  },
  {
    id: "i_sato", name: "佐藤", type: "instructor", combat: 3, lesson: 3,
    effectText: "【登場時】相手の手札を１枚選び、場外に置く。",
    flavor: "趣味は家庭菜園です",
    effects: [{ trigger: "onPlay", ops: [{ op: "discardOpponentChoice", count: 1 }] }],
  },
  {
    id: "i_maeda", name: "前田", type: "instructor", combat: 3, lesson: 3,
    effectText: "【登場時】場のインストラクター１人をこのターン中、戦闘力 ＋1",
    flavor: "趣味は釣りです",
    effects: [{ trigger: "onPlay", ops: [{ op: "combatMod", target: "chooseOwn", amount: 1, until: "turnEnd" }] }],
  },
  {
    id: "i_oikawa", name: "及川", type: "instructor", combat: 3, lesson: 3,
    effectText: "【登場時】このターン中、相手のインストラクター１人を戦闘力 －1",
    flavor: "趣味は家庭菜園です",
    effects: [{ trigger: "onPlay", ops: [{ op: "combatMod", target: "chooseOpponent", amount: -1, until: "turnEnd" }] }],
  },
  {
    id: "i_oyanagi", name: "大柳", type: "instructor", combat: 2, lesson: 5,
    effectText: "【登場時】カードを1枚引き、手札から1枚捨てる。",
    flavor: "趣味はドライブ、アニメです",
    effects: [{ trigger: "onPlay", ops: [{ op: "draw", count: 1 }, { op: "discardOwnChoice", count: 1 }] }],
  },
  {
    id: "i_okumura", name: "奥村", type: "instructor", combat: 3, lesson: 3,
    effectText: "このカードは相手の効果で場を離れない。",
    flavor: "趣味は釣り、家庭菜園です",
    keywords: ["immuneToOpponentEffects"],
  },
  {
    id: "i_tomino", name: "富野", type: "instructor", combat: 2, lesson: 2,
    effectText: "【登場時】自分の手札から『諏訪』を登場させる。",
    flavor: "趣味はスポーツです",
    effects: [{ trigger: "onPlay", ops: [{ op: "summonNamed", name: "諏訪" }] }],
  },
  {
    id: "i_terashima", name: "寺島", type: "instructor", combat: 3, lesson: 3,
    effectText: "【登場時】カードを3枚引き、手札を2枚山札の下に置く。",
    flavor: "趣味は料理です",
    effects: [{ trigger: "onPlay", ops: [{ op: "draw", count: 3 }, { op: "bottomOwnChoice", count: 2 }] }],
  },
  {
    id: "i_oda", name: "小田", type: "instructor", combat: 4, lesson: 3,
    effectText: "【登場時】じゃんけんをして勝った場合、相手のインストラクターを１人退場させる。負けた場合、このインストラクターは退場する。",
    flavor: "趣味はバイク、歌です",
    effects: [{
      trigger: "onPlay",
      ops: [{ op: "janken", win: [{ op: "removeTarget", target: "opponent" }], lose: [{ op: "removeSource" }] }],
    }],
  },
  {
    id: "i_hirama", name: "平間", type: "instructor", combat: 2, lesson: 3,
    effectText: "【登場時】このターン中、このインストラクターは戦闘力 ＋3",
    flavor: "趣味は日曜大工、料理です",
    effects: [{ trigger: "onPlay", ops: [{ op: "combatMod", target: "source", amount: 3, until: "turnEnd" }] }],
  },
  {
    id: "i_tokumitsu", name: "徳光", type: "instructor", combat: 4, lesson: 2,
    effectText: "【登場時】カードを1枚引く。",
    flavor: "趣味は旅行です",
    effects: [{ trigger: "onPlay", ops: [{ op: "draw", count: 1 }] }],
  },
  {
    id: "i_shigaya", name: "志萱", type: "instructor", combat: 5, lesson: 2,
    effectText: "このキャラのバトル中、自分はサポートカードを使用することはできない。",
    flavor: "趣味は雑貨屋巡りです",
    keywords: ["noSupportInOwnBattle"],
  },
  {
    id: "i_umemoto", name: "梅本", type: "instructor", combat: 3, lesson: 3,
    effectText: "【退場時】場外からサポートカードを１枚、手札に加える。",
    flavor: "趣味はゲームです",
    effects: [{ trigger: "onRemoved", ops: [{ op: "salvage", cardType: "support" }] }],
  },
  {
    id: "i_nashimoto", name: "梨本", type: "instructor", combat: 2, lesson: 4,
    effectText: "このインストラクターの教習時、じゃんけんをする。勝った場合、この教習中は、このカードの教習力 ＋2",
    flavor: "趣味は釣りです",
    effects: [{
      trigger: "onLesson",
      ops: [{ op: "janken", win: [{ op: "lessonMod", target: "source", amount: 2 }], lose: [] }],
    }],
  },
  {
    id: "i_takeda", name: "武田", type: "instructor", combat: 4, lesson: 2,
    effectText: "【登場時】山札の上から2枚見て、その中からインストラクターを1人選び手札に加える。残りは山札の下に戻す。",
    flavor: "趣味は風呂です",
    effects: [{ trigger: "onPlay", ops: [{ op: "searchTop", count: 2, filterType: "instructor", take: 1 }] }],
  },
  {
    id: "i_hamada", name: "浜田", type: "instructor", combat: 1, lesson: 3,
    effectText: "【自分のターン終了時】『技能』か『学科』の教習時限 ＋1",
    flavor: "趣味は愛犬と遊ぶことです",
    effects: [{ trigger: "onTurnEnd", ops: [{ op: "modifyTrackChoice", amount: 1 }] }],
  },
  {
    id: "i_shibuya_hana", name: "渋谷（華）", type: "instructor", combat: 2, lesson: 3,
    effectText: "【登場時】相手の『学科』の教習時限 －4",
    flavor: "趣味は音楽鑑賞です",
    effects: [{ trigger: "onPlay", ops: [{ op: "modifyTrack", target: "opponent", track: "academic", amount: -4 }] }],
  },
  {
    id: "i_shibuya", name: "渋谷", type: "instructor", combat: 2, lesson: 3,
    effectText: "【登場時】相手の『技能』と『学科』の教習時限 －2",
    flavor: "趣味は野球です",
    effects: [{
      trigger: "onPlay",
      ops: [
        { op: "modifyTrack", target: "opponent", track: "skill", amount: -2 },
        { op: "modifyTrack", target: "opponent", track: "academic", amount: -2 },
      ],
    }],
  },
  {
    id: "i_watanabe_tsutomu", name: "渡辺（勉）", type: "instructor", combat: 2, lesson: 3,
    effectText: "【登場時】相手の休憩状態のインストラクターを1人相手の手札に戻す。",
    flavor: "趣味は釣りです",
    effects: [{ trigger: "onPlay", ops: [{ op: "bounceTarget", target: "opponentRested" }] }],
  },
  {
    id: "i_watanabe_takashi", name: "渡邊（孝）", type: "instructor", combat: 2, lesson: 2,
    effectText: "【ターン終了時】このインストラクターを元気状態にする。",
    flavor: "趣味は歌です",
    effects: [{ trigger: "onTurnEnd", ops: [{ op: "untapSelf" }] }],
  },
  {
    id: "i_takimoto", name: "瀧本", type: "instructor", combat: 4, lesson: 2,
    effectText: "【登場時】相手の手札を全て見る。",
    flavor: "趣味はドライブです",
    effects: [{ trigger: "onPlay", ops: [{ op: "revealOpponentHand" }] }],
  },
  {
    id: "i_kataoka", name: "片岡", type: "instructor", combat: 3, lesson: 2,
    effectText: "【登場時】カードを1枚引く。その後、じゃんけんをして勝った場合は、カードをもう1枚引く。",
    flavor: "趣味はマラソンです",
    effects: [{
      trigger: "onPlay",
      ops: [{ op: "draw", count: 1 }, { op: "janken", win: [{ op: "draw", count: 1 }], lose: [] }],
    }],
  },
  {
    id: "i_tanaka", name: "田中", type: "instructor", combat: 1, lesson: 2,
    effectText: "【登場時】このインストラクターを休憩状態にして、手札から新たなインストラクター1人を登場させる。",
    flavor: "趣味はテニスです",
    effects: [{ trigger: "onPlay", ops: [{ op: "restSelf" }, { op: "summonChoice" }] }],
  },
  {
    id: "i_fukumoto", name: "福本", type: "instructor", combat: 4, lesson: 2,
    effectText: "このインストラクターのアタック時、じゃんけんをする。勝った場合、このバトル中は、このカードの戦闘力 ＋2",
    flavor: "趣味は野球です",
    effects: [{
      trigger: "onAttack",
      ops: [{ op: "janken", win: [{ op: "combatMod", target: "source", amount: 2, until: "battleEnd" }], lose: [] }],
    }],
  },
  {
    id: "i_konno", name: "金野", type: "instructor", combat: 1, lesson: 4,
    effectText: "【登場時】『学科』の教習時限 ＋2",
    flavor: "趣味は街中の風景を撮影する事です",
    effects: [{ trigger: "onPlay", ops: [{ op: "modifyTrack", target: "self", track: "academic", amount: 2 }] }],
  },
  {
    id: "i_nagao", name: "長尾", type: "instructor", combat: 1, lesson: 4,
    effectText: "【登場時】『技能』の教習時限 ＋2",
    flavor: "趣味はサザンオールスターズです",
    effects: [{ trigger: "onPlay", ops: [{ op: "modifyTrack", target: "self", track: "skill", amount: 2 }] }],
  },
  {
    id: "i_iida", name: "飯田", type: "instructor", combat: 5, lesson: 2,
    effectText: "登場したターン、このインストラクターはアタックできない。",
    flavor: "趣味は家庭菜園です",
    keywords: ["cantAttackOnEntry"],
  },
  {
    id: "i_suwa", name: "諏訪", type: "instructor", combat: 2, lesson: 2,
    effectText: "【登場時】自分の手札から『富野』を登場させる。",
    flavor: "趣味は釣りです",
    effects: [{ trigger: "onPlay", ops: [{ op: "summonNamed", name: "富野" }] }],
  },
  {
    id: "i_takakura", name: "髙倉", type: "instructor", combat: 2, lesson: 3,
    effectText: "【登場時】相手の『技能』の教習時限 －4",
    flavor: "趣味はスポーツ鑑賞です",
    effects: [{ trigger: "onPlay", ops: [{ op: "modifyTrack", target: "opponent", track: "skill", amount: -4 }] }],
  },

  // ================================================== サポート
  {
    id: "s_ueno", name: "上野", type: "support", timing: "battle",
    effectText: "【バトル時】このバトル中、インストラクター1人の戦闘力 ＋2",
    flavor: "趣味は旅行、キャンプです",
    effects: [{ trigger: "onSupport", ops: battleBuff2 }],
  },
  {
    id: "s_nakamura", name: "中村", type: "support", timing: "battle",
    effectText: "【バトル時】このバトル中、インストラクター1人の戦闘力 ＋2",
    flavor: "趣味は道の駅めぐりです",
    effects: [{ trigger: "onSupport", ops: battleBuff2 }],
  },
  {
    id: "s_iwase", name: "岩瀬", type: "support", timing: "battle",
    effectText: "【バトル時】このバトル中、インストラクター1人の戦闘力 ＋2",
    flavor: "趣味はハンドメイドです",
    effects: [{ trigger: "onSupport", ops: battleBuff2 }],
  },
  {
    id: "s_morita", name: "森田", type: "support", timing: "battle",
    effectText: "【バトル時】このバトル中、インストラクター1人の戦闘力 ＋2",
    flavor: "趣味はゲームです",
    effects: [{ trigger: "onSupport", ops: battleBuff2 }],
  },
  {
    id: "s_shirahama", name: "白浜", type: "support", timing: "battle",
    effectText: "【バトル時】このバトル中、インストラクター1人の戦闘力 ＋2",
    flavor: "趣味は音楽鑑賞です",
    effects: [{ trigger: "onSupport", ops: battleBuff2 }],
  },
  {
    id: "s_sato", name: "佐藤", type: "support", timing: "main",
    effectText: "【自分のターン終了時】インストラクターを1人元気状態にする。",
    flavor: "趣味は車です",
    effects: [{ trigger: "onSupport", ops: [{ op: "untapAtTurnEndCharge" }] }],
  },
  {
    id: "s_kobayashi", name: "小林", type: "support", timing: "main",
    effectText: "【自分のターン終了時】インストラクターを1人元気状態にする。",
    flavor: "趣味は車です",
    effects: [{ trigger: "onSupport", ops: [{ op: "untapAtTurnEndCharge" }] }],
  },
  {
    id: "s_kono", name: "河野", type: "support", timing: "main",
    effectText: "【自分のターン終了時】インストラクターを1人元気状態にする。",
    flavor: "趣味は牡蠣です",
    effects: [{ trigger: "onSupport", ops: [{ op: "untapAtTurnEndCharge" }] }],
  },
  {
    id: "s_watanabe", name: "渡邊", type: "support", timing: "main",
    effectText: "【自分のターン終了時】インストラクターを1人元気状態にする。",
    flavor: "趣味は卓球です",
    effects: [{ trigger: "onSupport", ops: [{ op: "untapAtTurnEndCharge" }] }],
  },
  {
    id: "s_sji", name: "S字", type: "support", timing: "main",
    effectText: "【自分のターン中】じゃんけんする。\n勝った場合、『技能』の教習時限 ＋2\n負けた場合、『技能』の教習時限 ＋1",
    flavor: "乗り上げないように",
    effects: [{
      trigger: "onSupport",
      ops: [{
        op: "janken",
        win: [{ op: "modifyTrack", target: "self", track: "skill", amount: 2 }],
        lose: [{ op: "modifyTrack", target: "self", track: "skill", amount: 1 }],
      }],
    }],
  },
  {
    id: "s_crank", name: "クランク", type: "support", timing: "main",
    effectText: "【自分のターン中】じゃんけんする。\n勝った場合、『技能』の教習時限 ＋2\n負けた場合、『技能』の教習時限 ＋1",
    flavor: "内輪差に注意しましょう",
    effects: [{
      trigger: "onSupport",
      ops: [{
        op: "janken",
        win: [{ op: "modifyTrack", target: "self", track: "skill", amount: 2 }],
        lose: [{ op: "modifyTrack", target: "self", track: "skill", amount: 1 }],
      }],
    }],
  },
  {
    id: "s_kokasokutei", name: "効果測定", type: "support", timing: "main",
    effectText: "【自分のターン中】じゃんけんする。\n勝った場合、『学科』の教習時限 ＋2\n負けた場合、『学科』の教習時限 ＋1",
    flavor: "勉強してから受けましょう",
    effects: [{
      trigger: "onSupport",
      ops: [{
        op: "janken",
        win: [{ op: "modifyTrack", target: "self", track: "academic", amount: 2 }],
        lose: [{ op: "modifyTrack", target: "self", track: "academic", amount: 1 }],
      }],
    }],
  },
  {
    id: "s_honma", name: "本間", type: "support", timing: "battle",
    effectText: "【バトル時】バトル中のお互いのインストラクターを退場させる。",
    flavor: "趣味は睡眠です",
    effects: [{ trigger: "onSupport", ops: [{ op: "removeBothBattlers" }] }],
  },
  {
    id: "s_nagayama", name: "永山", type: "support", timing: "main",
    effectText: "このターン中、自分の場の全てのインストラクターの教習力 ＋1",
    flavor: "趣味は道の駅巡りです",
    effects: [{ trigger: "onSupport", ops: [{ op: "lessonMod", target: "allOwn", amount: 1 }] }],
  },
  {
    id: "s_kushiro_yuhi", name: "釧路の夕日", type: "support", timing: "main",
    effectText: "【自分のターン中】場外のサポートカードを全て山札に戻し、山札をシャッフルする。",
    flavor: "世界三大夕日と言われています",
    effects: [{ trigger: "onSupport", ops: [{ op: "recycleSupports" }] }],
  },

  // ================================================== 担当カード
  // タイプA: 【ターン1回】自分のインストラクター1人の教習力をこのターン中 ＋１
  ...(["t_kuji|久慈", "t_tomino|富野", "t_oda|小田", "t_hamada|浜田", "t_tanaka|田中", "t_nagao|長尾"].map(
    (s): CardDef => {
      const [id, name] = s.split("|");
      return {
        id, name, type: "tantou",
        effectText: "【ターン1回】自分のインストラクター1人の教習力をこのターン中 ＋１",
        ability: {
          window: "main", oncePerTurn: true,
          ops: [{ op: "lessonMod", target: "chooseOwn", amount: 1 }],
          label: "教習力＋1（ターン1回）",
        },
      };
    }
  )),
  // タイプB: 【ターン1回】アタック中のインストラクター1人の戦闘力をこのバトル中 ＋１
  ...(["t_tokumitsu|徳光", "t_shigaya|志萱", "t_takeda|武田", "t_takimoto|瀧本", "t_fukumoto|福本", "t_suwa|諏訪"].map(
    (s): CardDef => {
      const [id, name] = s.split("|");
      return {
        id, name, type: "tantou",
        effectText: "【ターン1回】アタック中のインストラクター1人の戦闘力をこのバトル中 ＋１",
        ability: {
          window: "battle", oncePerTurn: true,
          ops: [{ op: "combatMod", target: "battleAttacker", amount: 1, until: "battleEnd" }],
          label: "アタック側の戦闘力＋1（ターン1回）",
        },
      };
    }
  )),
  // タイプC: デッキに入れられるサポートカードを7枚までにする
  ...(["t_sasaki|佐々木", "t_umemoto|梅本", "t_shibuya_masa|渋谷", "t_shibuya_hana|渋谷（華）", "t_takakura|髙倉"].map(
    (s): CardDef => {
      const [id, name] = s.split("|");
      return {
        id, name, type: "tantou",
        effectText: "デッキに入れられるサポートカードを7枚までにする",
        supportLimit: 7,
      };
    }
  )),
];

// 開発ビルドではスキーマ検証を走らせて、データ不整合を即時に検出する
declare const __DEV__: boolean | undefined;
if (typeof __DEV__ === "undefined" || __DEV__) {
  const result = cardSetSchema.safeParse(realCards);
  if (!result.success) {
    throw new Error(`カードデータが不正です: ${result.error.message}`);
  }
}

export const cardRegistry: CardRegistry = Object.fromEntries(realCards.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const def = cardRegistry[id];
  if (!def) throw new Error(`不明なカードID: ${id}`);
  return def;
}

/** すべてのカード（図鑑・デッキ構築用） */
export const allCards = realCards;

/** デフォルトデッキ（プレイヤー用スタンダード） */
export const defaultDeck: DeckList = {
  main: [
    "i_shibuya_hana", "i_takakura", "i_konno", "i_nagao", "i_hamada", "i_tokumitsu",
    "i_takeda", "i_terashima", "i_kataoka", "i_tanaka", "i_maeda", "i_oikawa",
    "i_hirama", "i_iida", "i_okumura", "i_oyanagi",
    "s_ueno", "s_nakamura", "s_kokasokutei", "s_sji", "s_honma",
  ],
  tantou: "t_kuji",
};

/** CPU用デッキ */
export const cpuDeck: DeckList = {
  main: [
    "i_shibuya", "i_kuji", "i_iseki", "i_ito", "i_sasaki", "i_sato",
    "i_oda", "i_fukumoto", "i_nashimoto", "i_shigaya", "i_watanabe_tsutomu",
    "i_watanabe_takashi", "i_takimoto", "i_suwa", "i_tomino", "i_umemoto",
    "s_iwase", "s_morita", "s_shirahama", "s_crank", "s_kushiro_yuhi",
  ],
  tantou: "t_tanaka",
};

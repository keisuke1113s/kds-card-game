// KDSカードゲーム エンジン型定義
// このディレクトリは純粋な TypeScript のみ。react / react-native を import しないこと。

export type PlayerId = 0 | 1;

export type Track = "academic" | "skill"; // 学科 / 技能

export const ACADEMIC_GOAL = 10; // 学科教習 10時限
export const SKILL_GOAL = 19; // 技能教習 19時限
export const TRACK_GOALS: Record<Track, number> = {
  academic: ACADEMIC_GOAL,
  skill: SKILL_GOAL,
};

export const DECK_MIN = 20; // デッキ最小枚数（担当カードを除く）
export const SUPPORT_MAX_DEFAULT = 5; // サポートカード上限（担当カードで変わる場合あり）
export const INITIAL_HAND = 5;

// ---------------------------------------------------------------- カード定義

export type CardType = "instructor" | "support" | "tantou";

/** 効果の発動タイミング */
export type Trigger =
  | "onPlay" // 【登場時】
  | "onAttack" // 【アタック時】（バトル宣言時）
  | "onDefendAttacked" // 【相手のアタック時】
  | "onTurnEnd" // 【自分のターン終了時】
  | "onBattle" // 【バトル時】（解決直前）
  | "onSupport" // サポートカード使用時
  | "onRemoved" // 【退場時】
  | "onLesson"; // このインストラクターの教習時（教習の直前に発動）

/** カード固有の常在能力 */
export type Keyword =
  | "immuneToOpponentEffects" // 奥村: 相手の効果で場を離れない（デバフも受けない）
  | "noSupportInOwnBattle" // 志萱: このカードのバトル中、持ち主はサポートカードを使えない
  | "cantAttackOnEntry"; // 飯田: 登場したターンはアタックできない

/** 宣言的な効果プリミティブ。実カードが必要とする語彙のみ */
export type EffectOp =
  | { op: "modifyTrack"; target: "self" | "opponent"; track: Track; amount: number }
  | { op: "modifyTrackChoice"; amount: number } // 自分の技能か学科を選んで増減（浜田）
  | { op: "draw"; count: number }
  | { op: "searchTop"; count: number; filterType: CardType; take: number } // 武田
  | { op: "buffCombat"; target: "ownBattler"; amount: number; duration: "battle" } // 受付系サポート
  | {
      // 特定インストラクターへの戦闘力修正
      op: "combatMod";
      target: "source" | "chooseOwn" | "chooseOpponent" | "battleAttacker";
      amount: number;
      until: "turnEnd" | "battleEnd";
    }
  | { op: "lessonMod"; target: "source" | "chooseOwn" | "allOwn"; amount: number } // このターン中の教習力修正
  | { op: "removeTarget"; target: "opponent" } // 相手インストラクター1人を選んで退場
  | { op: "removeSource" } // 効果の発生源自身を退場（小田の負け）
  | { op: "removeAllExceptSource" } // 井関
  | { op: "removeBothBattlers" } // 本間
  | { op: "bounceTarget"; target: "opponentRested" } // 渡辺(勉)
  | { op: "salvage"; cardType: "instructor" | "support" } // 自分の場外から手札へ（伊藤・梅本）
  | { op: "discardOpponentChoice"; count: number } // 佐藤: 相手の手札を見て1枚場外へ
  | { op: "discardOwnChoice"; count: number } // 大柳
  | { op: "bottomOwnChoice"; count: number } // 寺島: 手札を山札の下へ
  | { op: "summonNamed"; name: string } // 富野・諏訪: 手札の特定名カードを登場
  | { op: "summonChoice" } // 田中: 手札からインストラクター1人を登場
  | { op: "restSelf" }
  | { op: "untapChoice" } // 自分のインストラクター1人を元気に（送迎系）
  | { op: "untapSelf" } // 渡邊(孝)
  | { op: "untapAtTurnEndCharge" } // 送迎サポート: ターン終了時の元気化を1回分予約
  | { op: "revealOpponentHand" } // 瀧本
  | { op: "recycleSupports" } // 釧路の夕日
  | { op: "janken"; win: EffectOp[]; lose: EffectOp[] } // じゃんけん
  | { op: "advanceSourceTrack" } // 内部用: 発生源の教習力で ctx.track を進める（onLesson の後）
  | { op: "endTurnFinalize" }; // 内部用: ターン終了処理の最終段

export interface EffectDef {
  trigger: Trigger;
  ops: EffectOp[];
}

/** 起動型能力（【ターン1回】など、プレイヤーが任意に使う） */
export interface AbilityDef {
  /** 使えるタイミング */
  window: "main" | "battle";
  oncePerTurn: boolean;
  /** コスト: このカードを休憩状態にする（元気状態でのみ起動可） */
  costRestSelf?: boolean;
  ops: EffectOp[];
  label: string; // UI表示用（例: 「相手を1人退場させる」）
}

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  combat?: number; // 戦闘力
  lesson?: number; // 教習力
  /** サポートカードの使用可能タイミング */
  timing?: "battle" | "main" | "any";
  effects?: EffectDef[];
  keywords?: Keyword[];
  ability?: AbilityDef;
  /** 担当カードによるサポートカード上限の変更（佐々木系: 7） */
  supportLimit?: number;
  /** カードに印刷されている効果テキスト（表示・検索用） */
  effectText?: string;
  flavor?: string;
  /** assets/cards/<image>.webp のキー。未指定なら id を使う */
  image?: string;
}

export type CardRegistry = Record<string, CardDef>;

export interface GameContext {
  defs: CardRegistry;
}

// ---------------------------------------------------------------- 効果キュー

export interface EffectContext {
  owner: PlayerId;
  /** 効果の発生源（場のインストラクターの uid。担当・サポートは undefined） */
  sourceUid?: string;
  /** 効果の発生源のカードID（解決中のサポートカード自身を除外する用途など） */
  sourceCardId?: string;
  /** onLesson 用: この教習で進めるトラック */
  track?: Track;
}

export interface QueuedOp {
  op: EffectOp;
  ctx: EffectContext;
}

// ---------------------------------------------------------------- ゲーム状態

export interface InstructorOnField {
  uid: string;
  cardId: string;
  rested: boolean; // true = 休憩（横向き）
  actedThisTurn: boolean;
  enteredThisTurn: boolean; // 飯田の「登場ターンはアタック不可」用
  abilityUsedThisTurn: boolean;
}

export interface PlayerState {
  deck: string[]; // 先頭が山札の一番上
  hand: string[];
  field: InstructorOnField[];
  tantou: string;
  tantouAbilityUsedThisTurn: boolean;
  outOfPlay: string[]; // 場外
  academic: number;
  skill: number;
  mulliganDecided: boolean;
  /** 送迎サポートによる「ターン終了時に1人元気化」の残回数 */
  untapCharges: number;
}

/** ターン/バトル限定の戦闘力・教習力修正 */
export interface CombatMod {
  player: PlayerId;
  uid: string;
  amount: number;
  until: "turnEnd" | "battleEnd";
}

export interface LessonMod {
  player: PlayerId;
  /** null = そのプレイヤーの場全体（永山） */
  uid: string | null;
  amount: number; // until turnEnd 固定
}

export interface BattleContext {
  attackerPlayer: PlayerId;
  attackerUid: string;
  defenderUid: string;
  priority: PlayerId; // サポートの優先権（防御側から）
  consecutivePasses: number;
  buffs: { player: PlayerId; amount: number }[]; // サポート等によるバトル側バフ
}

/** プレイヤー入力が必要な選択の内部解決情報（ビューでは秘匿） */
export type ResolveSpec =
  | { type: "searchTake"; revealed: string[]; map: number[] }
  | { type: "janken"; win: EffectOp[]; lose: EffectOp[]; firstPick?: number }
  | {
      type: "targetUid";
      uids: string[];
      action: "remove" | "bounce" | "combatMod" | "lessonMod" | "untap";
      amount?: number;
      until?: "turnEnd" | "battleEnd";
    }
  | {
      type: "handIndex";
      indices: number[];
      action: "discardOpp" | "discardOwn" | "bottomOwn" | "summonOwn";
      remaining: number;
    }
  | { type: "salvage"; indices: number[] }
  | { type: "track"; amount: number };

export interface PendingChoice {
  player: PlayerId; // 入力すべきプレイヤー
  owner: PlayerId; // 効果の持ち主
  prompt: string;
  /** AI用ヒント: "janken" | "removeOpp" | "discardOwn" など */
  purpose: string;
  options: { label: string; cardId?: string }[];
  resolve: ResolveSpec;
  queue: QueuedOp[]; // この選択の後に続く効果
  sourceCtx: EffectContext;
}

export type Phase =
  | { type: "mulligan" }
  | { type: "main"; canPlayInstructor: boolean }
  | { type: "battleSupport"; battle: BattleContext }
  | { type: "choice"; pending: PendingChoice; resume: Phase }
  | { type: "finished"; winner: PlayerId | null; reason: GameEndReason };

export type GameEndReason = "bothTracksComplete" | "deckOut";

export interface GameState {
  rngState: number;
  turnPlayer: PlayerId;
  turnNumber: number;
  phase: Phase;
  players: [PlayerState, PlayerState];
  combatMods: CombatMod[];
  lessonMods: LessonMod[];
}

// ---------------------------------------------------------------- アクション

export type GameAction =
  | { type: "mulligan"; player: PlayerId; redraw: boolean }
  | { type: "playInstructor"; player: PlayerId; handIndex: number }
  | {
      type: "instructorAction";
      player: PlayerId;
      uid: string;
      action: "skill" | "academic" | "doNothing";
    }
  | { type: "declareBattle"; player: PlayerId; attackerUid: string; defenderUid: string }
  | { type: "playSupport"; player: PlayerId; handIndex: number }
  | { type: "passSupport"; player: PlayerId }
  | {
      /** 起動型能力。uid 省略時は担当カードの能力 */
      type: "activateAbility";
      player: PlayerId;
      uid?: string;
    }
  | { type: "resolveChoice"; player: PlayerId; optionIndex: number }
  | { type: "endTurn"; player: PlayerId };

// ---------------------------------------------------------------- イベント

export type GameEvent =
  | { type: "gameStarted"; firstPlayer: PlayerId }
  | { type: "mulliganTaken"; player: PlayerId; redraw: boolean }
  | { type: "turnStarted"; player: PlayerId; turnNumber: number }
  | { type: "cardDrawn"; player: PlayerId; cardId?: string }
  | { type: "instructorPlayed"; player: PlayerId; uid: string; cardId: string }
  | { type: "instructorUntapped"; player: PlayerId; uid: string }
  | { type: "instructorRested"; player: PlayerId; uid: string }
  | { type: "didNothing"; player: PlayerId; uid: string }
  | {
      // どのインストラクターがどの行動をとったか（実況表示用）
      type: "instructorActed";
      player: PlayerId;
      uid: string;
      cardId: string;
      action: "skill" | "academic" | "doNothing";
    }
  | {
      type: "trackAdvanced";
      player: PlayerId;
      track: Track;
      amount: number;
      newValue: number;
    }
  | { type: "battleDeclared"; attackerPlayer: PlayerId; attackerUid: string; defenderUid: string }
  | { type: "supportPlayed"; player: PlayerId; cardId: string }
  | { type: "supportPassed"; player: PlayerId }
  | {
      type: "battleResolved";
      attackerPlayer: PlayerId;
      attackerTotal: number;
      defenderTotal: number;
      removedUids: string[];
    }
  | { type: "instructorRemoved"; player: PlayerId; uid: string; cardId: string }
  | { type: "instructorBounced"; player: PlayerId; uid: string; cardId: string }
  | { type: "cardDiscarded"; player: PlayerId; cardId: string }
  | { type: "cardSalvaged"; player: PlayerId; cardId: string }
  | { type: "abilityActivated"; player: PlayerId; cardId: string }
  | { type: "combatModApplied"; player: PlayerId; uid: string; amount: number }
  | { type: "lessonModApplied"; player: PlayerId; uid: string | null; amount: number }
  | { type: "jankenPlayed"; owner: PlayerId; won: boolean }
  | { type: "handRevealed"; player: PlayerId; cardIds: string[] } // player = 手札を見られた側
  | { type: "supportsRecycled"; player: PlayerId; count: number }
  | { type: "choiceRequired"; player: PlayerId }
  | { type: "cardsRevealed"; player: PlayerId; cardIds: string[] } // searchTop の公開
  | { type: "turnEnded"; player: PlayerId }
  | { type: "gameEnded"; winner: PlayerId | null; reason: GameEndReason };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

// ---------------------------------------------------------------- ビュー（情報秘匿）

export interface OpponentView {
  handCount: number;
  /** 公開情報（mulliganTaken イベントで既に露出している） */
  mulliganDecided: boolean;
  deckCount: number;
  field: InstructorOnField[];
  tantou: string;
  tantouAbilityUsedThisTurn: boolean;
  outOfPlay: string[];
  academic: number;
  skill: number;
}

export interface SelfView {
  hand: string[];
  deckCount: number;
  /**
   * 自分の山札の中身（並び順を伏せるため辞書順に整列済み）。
   * 「山札の中身を確認」画面用。実際の並び順とは無関係。
   */
  deckContents: string[];
  mulliganDecided: boolean;
  field: InstructorOnField[];
  tantou: string;
  tantouAbilityUsedThisTurn: boolean;
  outOfPlay: string[];
  academic: number;
  skill: number;
  untapCharges: number;
}

/** ビュー用に秘匿処理した選択情報 */
export interface PendingChoiceView {
  player: PlayerId;
  owner: PlayerId;
  prompt: string;
  purpose: string;
  options: { label: string; cardId?: string }[];
}

export type PhaseView =
  | { type: "mulligan" }
  | { type: "main"; canPlayInstructor: boolean }
  | { type: "battleSupport"; battle: BattleContext }
  | { type: "choice"; pending: PendingChoiceView }
  | { type: "finished"; winner: PlayerId | null; reason: GameEndReason };

export interface PlayerView {
  playerId: PlayerId;
  turnPlayer: PlayerId;
  turnNumber: number;
  phase: PhaseView;
  combatMods: CombatMod[];
  lessonMods: LessonMod[];
  self: SelfView;
  opponent: OpponentView;
}

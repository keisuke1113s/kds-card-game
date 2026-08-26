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
export const SUPPORT_MAX = 5; // サポートカード上限
export const INITIAL_HAND = 5;

// ---------------------------------------------------------------- カード定義

export type CardType = "instructor" | "support" | "tantou";

/** 効果の発動タイミング */
export type Trigger =
  | "onPlay" // 【登場時】
  | "onAttack" // 【アタック時】
  | "onDefendAttacked" // 【相手のアタック時】
  | "onTurnEnd" // 【自分のターン終了時】
  | "onBattle" // 【バトル時】
  | "onSupport"; // サポートカード使用時

/** 宣言的な効果プリミティブ。語彙は実カードが必要とした時だけ増やす */
export type EffectOp =
  | {
      op: "modifyTrack";
      target: "self" | "opponent";
      track: Track;
      amount: number; // 負数で教習時限を戻す
    }
  | {
      op: "buffCombat";
      // ownBattler: このバトルにおける自分側の参加インストラクター
      target: "ownBattler";
      amount: number;
      duration: "battle";
    }
  | { op: "draw"; count: number }
  | {
      // 山札の上から count 枚見て、filterType のカードを take 枚まで手札に。
      // 残りは山札の下へ。（例: 武田）
      op: "searchTop";
      count: number;
      filterType: CardType;
      take: number;
    };

export interface EffectDef {
  trigger: Trigger;
  ops: EffectOp[];
}

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  combat?: number; // 戦闘力（インストラクターのみ）
  lesson?: number; // 教習力（インストラクターのみ）
  /** サポートカードの使用可能タイミング */
  timing?: "battle" | "main" | "any";
  effects?: EffectDef[];
  /** カードに印刷されている効果テキスト（表示用） */
  effectText?: string;
  /** assets/cards/<image>.png のキー。未指定ならテキストフェイス描画 */
  image?: string;
}

export type CardRegistry = Record<string, CardDef>;

export interface GameContext {
  defs: CardRegistry;
}

// ---------------------------------------------------------------- ゲーム状態

export interface InstructorOnField {
  uid: string; // 場のインスタンスID（同名は無いが将来のため）
  cardId: string;
  rested: boolean; // true = 休憩（横向き）
  actedThisTurn: boolean; // このターン行動済みか（なにもしない含む）
}

export interface PlayerState {
  deck: string[]; // 先頭が山札の一番上
  hand: string[];
  field: InstructorOnField[];
  tantou: string; // 担当カードID
  outOfPlay: string[]; // 場外（退場したインストラクター・使用済みサポート）
  academic: number; // 学科の進捗 0..10
  skill: number; // 技能の進捗 0..19
  mulliganDecided: boolean;
}

export interface BattleContext {
  attackerPlayer: PlayerId;
  attackerUid: string;
  defenderUid: string;
  /** サポートカードをプレイする優先権（防御側から開始） */
  priority: PlayerId;
  /** 連続パス数。2 で解決 */
  consecutivePasses: number;
  /** バトル中の一時的な戦闘力修正 */
  buffs: { player: PlayerId; amount: number }[];
}

/** プレイヤー入力が必要な効果の保留状態 */
export type PendingChoice = {
  kind: "searchTake";
  player: PlayerId;
  /** 公開されたカードID（選択者のみ閲覧可） */
  revealed: string[];
  /** revealed のうち選択可能な index */
  selectable: number[];
  /** 選択後に山札の下へ送る残りの処理用 */
  filterType: CardType;
};

export type Phase =
  | { type: "mulligan" }
  | { type: "main"; canPlayInstructor: boolean }
  | { type: "battleSupport"; battle: BattleContext }
  | {
      type: "choice";
      pending: PendingChoice;
      /** choice 解決後に戻るフェーズ */
      resume: Phase;
    }
  | { type: "finished"; winner: PlayerId | null; reason: GameEndReason };

export type GameEndReason = "bothTracksComplete" | "deckOut";

export interface GameState {
  rngState: number; // シード付きPRNGの現在状態
  turnPlayer: PlayerId;
  turnNumber: number;
  phase: Phase;
  players: [PlayerState, PlayerState];
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
  | {
      type: "declareBattle";
      player: PlayerId;
      attackerUid: string;
      defenderUid: string;
    }
  | { type: "playSupport"; player: PlayerId; handIndex: number }
  | { type: "passSupport"; player: PlayerId }
  | { type: "resolveChoice"; player: PlayerId; optionIndex: number }
  | { type: "endTurn"; player: PlayerId };

// ---------------------------------------------------------------- イベント

export type GameEvent =
  | { type: "gameStarted"; firstPlayer: PlayerId }
  | { type: "mulliganTaken"; player: PlayerId; redraw: boolean }
  | { type: "turnStarted"; player: PlayerId; turnNumber: number }
  | { type: "cardDrawn"; player: PlayerId; cardId?: string } // cardId は自分のみ
  | { type: "instructorPlayed"; player: PlayerId; uid: string; cardId: string }
  | { type: "instructorUntapped"; player: PlayerId; uid: string }
  | { type: "instructorRested"; player: PlayerId; uid: string }
  | { type: "didNothing"; player: PlayerId; uid: string }
  | {
      type: "trackAdvanced";
      player: PlayerId;
      track: Track;
      amount: number; // 実際に動いた量（切り捨て・下限適用後）
      newValue: number;
    }
  | {
      type: "battleDeclared";
      attackerPlayer: PlayerId;
      attackerUid: string;
      defenderUid: string;
    }
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
  | { type: "choiceRequired"; player: PlayerId }
  | { type: "cardsRevealed"; player: PlayerId; cardIds: string[] }
  | { type: "turnEnded"; player: PlayerId }
  | { type: "gameEnded"; winner: PlayerId | null; reason: GameEndReason };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

// ---------------------------------------------------------------- ビュー（情報秘匿）

export interface OpponentView {
  handCount: number;
  deckCount: number;
  field: InstructorOnField[];
  tantou: string;
  outOfPlay: string[];
  academic: number;
  skill: number;
}

export interface SelfView {
  hand: string[];
  deckCount: number;
  field: InstructorOnField[];
  tantou: string;
  outOfPlay: string[];
  academic: number;
  skill: number;
}

export interface PlayerView {
  playerId: PlayerId;
  turnPlayer: PlayerId;
  turnNumber: number;
  phase: Phase; // choice の revealed は viewFor で秘匿処理
  self: SelfView;
  opponent: OpponentView;
}

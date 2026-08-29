/**
 * 運転適性診断（OD式風のパロディ）。
 * 3つの軸（アクセル/ブレーキ・ロジック/フィーリング・ソロ/チーム）で
 * 8タイプに分類する。診断結果は免許証にも表示される。
 */

export interface ShindanQuestion {
  q: string;
  /** [Aを選んだときの軸, Bを選んだときの軸] */
  a: { label: string; axis: Axis };
  b: { label: string; axis: Axis };
}

export type Axis = "A" | "B" | "L" | "F" | "S" | "T";

export interface ShindanType {
  key: string; // 例 "ALS"
  name: string;
  emoji: string;
  desc: string;
  /** おすすめの遊び方 */
  advice: string;
  /** 相性の良いインストラクターのカードID */
  partner: string;
  /** おすすめデッキ */
  deck: string;
}

export const SHINDAN_QUESTIONS: ShindanQuestion[] = [
  {
    q: "初めての道を走るなら？",
    a: { label: "とりあえず走りながら覚える", axis: "A" },
    b: { label: "先にルートをしっかり確認", axis: "B" },
  },
  {
    q: "ゲームで負けたときは？",
    a: { label: "すぐ再戦！熱くなるタイプ", axis: "A" },
    b: { label: "一度冷静に敗因を考える", axis: "B" },
  },
  {
    q: "旅行の計画は？",
    a: { label: "その場のノリで決めたい", axis: "F" },
    b: { label: "時刻表まできっちり組む", axis: "L" },
  },
  {
    q: "カードを選ぶ基準は？",
    a: { label: "数字や相性を計算して選ぶ", axis: "L" },
    b: { label: "直感で「好き」を選ぶ", axis: "F" },
  },
  {
    q: "休みの日の過ごし方は？",
    a: { label: "ひとりの時間を満喫", axis: "S" },
    b: { label: "友だちとワイワイ", axis: "T" },
  },
  {
    q: "困っている人を見かけたら？",
    a: { label: "まず声をかける", axis: "T" },
    b: { label: "そっと見守って必要なら助ける", axis: "S" },
  },
  {
    q: "エレベーターが閉まりかけ！",
    a: { label: "小走りで飛び乗る", axis: "A" },
    b: { label: "次のを待つ", axis: "B" },
  },
  {
    q: "説明書は？",
    a: { label: "読まずに触って覚える", axis: "F" },
    b: { label: "ちゃんと読む派", axis: "L" },
  },
  {
    q: "チーム戦とひとり旅、どっちが好き？",
    a: { label: "チーム戦", axis: "T" },
    b: { label: "ひとり旅", axis: "S" },
  },
  {
    q: "青信号が点滅し始めたら？",
    a: { label: "急いで渡る", axis: "A" },
    b: { label: "止まって次を待つ", axis: "B" },
  },
];

export const SHINDAN_TYPES: ShindanType[] = [
  { key: "ALS", name: "クールな一匹狼", emoji: "🐺", desc: "判断が速く、データで動く孤高のドライバー。決めたら迷わない強さがあります。", advice: "攻めの手が速いので、リーチのタイミングを計算し尽くす戦い方が向いています。", partner: "i_kuji", deck: "チャレンジャーデッキ" },
  { key: "ALT", name: "頼れる司令塔", emoji: "🧭", desc: "全体を見て的確に指示を出せるタイプ。仲間からの信頼も厚いはず。", advice: "盤面全体を読む力が武器。サポートカードを組み合わせるコンボが得意なはず。", partner: "i_tomino", deck: "スタンダードデッキ" },
  { key: "AFS", name: "風を感じる冒険家", emoji: "🏍", desc: "直感とスピードで道を切り拓くタイプ。思い切りの良さはピカイチです。", advice: "ひらめきの一手が強み。バトルを多めに仕掛ける速攻スタイルで！", partner: "i_iida", deck: "チャレンジャーデッキ" },
  { key: "AFT", name: "みんなのムードメーカー", emoji: "🎉", desc: "場を明るくする天性のエンターテイナー。ノリの良さでピンチも乗り切ります。", advice: "オンライン対戦でスタンプを飛ばしながら、楽しく熱い勝負を！", partner: "i_takakura", deck: "チャレンジャーデッキ" },
  { key: "BLS", name: "職人気質の安全マスター", emoji: "🛠", desc: "確実・丁寧・ミスが少ない。積み重ねで必ず上達する努力の人です。", advice: "山札管理と場外リサイクルを極める、堅実な長期戦が向いています。", partner: "i_okumura", deck: "スタンダードデッキ" },
  { key: "BLT", name: "みんなの安心番長", emoji: "🛡", desc: "慎重で思いやりがあり、周りに安心感を与えるタイプ。守りの要です。", advice: "守りを固めてから反撃する後の先スタイル。休憩管理を丁寧に。", partner: "i_shigaya", deck: "スタンダードデッキ" },
  { key: "BFS", name: "マイペースな観察者", emoji: "🔭", desc: "静かに全体を観察し、ここぞで動くタイプ。独自の視点が光ります。", advice: "相手の癖を観察して裏をかく戦い方が得意。リプレイ研究もおすすめ。", partner: "i_takimoto", deck: "スタンダードデッキ" },
  { key: "BFT", name: "思いやり満点ドライバー", emoji: "💐", desc: "優しさと感性で運転するタイプ。同乗者を安心させる運転ができる人です。", advice: "焦らず自分のペースで。豆知識やクイズでコツコツ学ぶ楽しみ方も◎。", partner: "i_hamada", deck: "スタンダードデッキ" },
];

/** 回答（軸の配列）からタイプを判定する */
export function computeShindanType(axes: Axis[]): ShindanType {
  const count = (x: Axis) => axes.filter((a) => a === x).length;
  const key =
    (count("A") >= count("B") ? "A" : "B") +
    (count("L") >= count("F") ? "L" : "F") +
    (count("S") >= count("T") ? "S" : "T");
  return SHINDAN_TYPES.find((t) => t.key === key) ?? SHINDAN_TYPES[0];
}

/** 保存されたタイプキーから定義を引く */
export function shindanTypeOf(key: string | undefined | null): ShindanType | null {
  if (!key) return null;
  return SHINDAN_TYPES.find((t) => t.key === key) ?? null;
}

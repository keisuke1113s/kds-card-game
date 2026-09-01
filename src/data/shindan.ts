/**
 * 運転適性診断（OD式風のパロディ）。
 * 4つの軸 × 各4問（計16問）で16タイプに分類する。
 *   軸1: アクセル(A) ↔ ブレーキ(B) … 行動派か慎重派か
 *   軸2: ロジック(L) ↔ フィーリング(F) … 理屈か直感か
 *   軸3: ソロ(S) ↔ チーム(T) … ひとり派かみんな派か
 *   軸4: じっくり(D) ↔ ぱっと(Q) … 持久型か瞬発型か
 * 診断結果は免許証にも表示される。
 */

export type Axis = "A" | "B" | "L" | "F" | "S" | "T" | "D" | "Q";

export interface ShindanQuestion {
  q: string;
  a: { label: string; axis: Axis };
  b: { label: string; axis: Axis };
}

export interface ShindanType {
  key: string; // 例 "ALSD"
  name: string;
  emoji: string;
  /** ひとことキャッチコピー */
  catch: string;
  /** 性格の説明 */
  desc: string;
  /** 運転のクセと安全アドバイス（自動車学校らしい分析） */
  drive: string;
  /** おすすめの戦い方 */
  advice: string;
  /** おすすめデッキ */
  deck: string;
  /** 相性の良いインストラクターのカードID */
  partner: string;
}

export const SHINDAN_QUESTIONS: ShindanQuestion[] = [
  // ---- 軸1: アクセル / ブレーキ ----
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
    q: "青信号が点滅し始めたら？",
    a: { label: "急いで渡る", axis: "A" },
    b: { label: "止まって次を待つ", axis: "B" },
  },
  {
    q: "欲しいものが売り切れだったら？",
    a: { label: "別の店を今すぐはしごする", axis: "A" },
    b: { label: "入荷を待つ・ネットで探す", axis: "B" },
  },
  // ---- 軸2: ロジック / フィーリング ----
  {
    q: "旅行の計画は？",
    a: { label: "時刻表まできっちり組む", axis: "L" },
    b: { label: "その場のノリで決めたい", axis: "F" },
  },
  {
    q: "カードを選ぶ基準は？",
    a: { label: "数字や相性を計算して選ぶ", axis: "L" },
    b: { label: "直感で「好き」を選ぶ", axis: "F" },
  },
  {
    q: "説明書は？",
    a: { label: "ちゃんと読む派", axis: "L" },
    b: { label: "読まずに触って覚える", axis: "F" },
  },
  {
    q: "道に迷ったら？",
    a: { label: "地図アプリで現在地から分析", axis: "L" },
    b: { label: "方向のカンで歩き出す", axis: "F" },
  },
  // ---- 軸3: ソロ / チーム ----
  {
    q: "休みの日の過ごし方は？",
    a: { label: "ひとりの時間を満喫", axis: "S" },
    b: { label: "友だちとワイワイ", axis: "T" },
  },
  {
    q: "困っている人を見かけたら？",
    a: { label: "そっと見守って必要なら助ける", axis: "S" },
    b: { label: "まず声をかける", axis: "T" },
  },
  {
    q: "ひとり旅とグループ旅行、どっちが好き？",
    a: { label: "ひとり旅", axis: "S" },
    b: { label: "グループ旅行", axis: "T" },
  },
  {
    q: "うれしいことがあったら？",
    a: { label: "心の中でじっくり味わう", axis: "S" },
    b: { label: "すぐ誰かに話したい", axis: "T" },
  },
  // ---- 軸4: じっくり / ぱっと ----
  {
    q: "宿題や仕事の進め方は？",
    a: { label: "毎日コツコツ進める", axis: "D" },
    b: { label: "期限前に一気に集中", axis: "Q" },
  },
  {
    q: "渋滞にはまったら？",
    a: { label: "音楽でも聴いてのんびり待つ", axis: "D" },
    b: { label: "別ルートをすぐ探す", axis: "Q" },
  },
  {
    q: "デッキの遊び方は？",
    a: { label: "同じデッキをじっくり使い込む", axis: "D" },
    b: { label: "いろんなデッキを次々試す", axis: "Q" },
  },
  {
    q: "長編アニメやドラマは？",
    a: { label: "毎日1話ずつ楽しむ", axis: "D" },
    b: { label: "休日に一気見する", axis: "Q" },
  },
];

export const SHINDAN_TYPES: ShindanType[] = [
  { key: "ALSD", name: "孤高の職人レーサー", emoji: "🐺", catch: "積み上げた技術は裏切らない",
    desc: "自分の判断とデータを信じ、腕をコツコツ磨き上げる求道者タイプ。決めたら迷わない強さがあります。",
    drive: "運転は安定志向ですが、自分のペースを乱されるとイライラしがち。「譲る余裕」を持てれば無敵です。",
    advice: "同じデッキを使い込んで精度を極める戦い方が最強。リーチまでの最短手順を体に覚え込ませよう。",
    deck: "スタンダードデッキ", partner: "i_kuji" },
  { key: "ALSQ", name: "瞬断のソロパイロット", emoji: "🦅", catch: "考えるより早く、正しく動く",
    desc: "状況を一瞬で計算して即断即決。ひとりで戦局を切り拓くスピード頭脳の持ち主です。",
    drive: "判断の速さは武器ですが、速さに自信がある人ほど「だろう運転」に注意。確認の一拍を大切に。",
    advice: "相手の手を読んで先回りする速攻が得意。バトルを仕掛けるタイミングの見極めで勝負しよう。",
    deck: "チャレンジャーデッキ", partner: "i_takimoto" },
  { key: "ALTD", name: "頼れる司令塔", emoji: "🧭", catch: "全体を見て、みんなを導く",
    desc: "計画を立てて着実に実行し、周りへの目配りも欠かさないリーダー気質。信頼される存在です。",
    drive: "模範的な運転ができるタイプ。ただし同乗者の世話を焼きすぎて注意が逸れないように。",
    advice: "盤面全体を管理する長期戦向き。サポートカードを軸にした盤石なコンボを組み立てよう。",
    deck: "スタンダードデッキ", partner: "i_tomino" },
  { key: "ALTQ", name: "電光石火のリーダー", emoji: "⚡", catch: "決断が早い、切り替えも早い",
    desc: "テキパキ決めてグイグイ引っ張る行動派リーダー。ピンチでも切り替えの早さで乗り切ります。",
    drive: "急いでいる時ほど操作が雑になりがち。「急がば回れ」を合言葉に、車間と心の余裕を。",
    advice: "序盤から主導権を握る積極采配が向いています。手数の多さで相手を圧倒しよう。",
    deck: "チャレンジャーデッキ", partner: "i_iseki" },
  { key: "AFSD", name: "風を感じる旅人", emoji: "🏍", catch: "自分の道を、自分のペースで",
    desc: "直感を信じてマイペースに突き進む自由人。周りに流されない芯の強さがあります。",
    drive: "気持ちよく走ることが好きなぶん、スピードの出しすぎに注意。メーターをこまめにチラ見する癖を。",
    advice: "ひらめきの一手と粘り強さの両立が持ち味。じわじわ有利を広げる中長期戦で輝きます。",
    deck: "チャレンジャーデッキ", partner: "i_oyanagi" },
  { key: "AFSQ", name: "直感のスプリンター", emoji: "🎯", catch: "ひらめいたら、もう動いている",
    desc: "考えるより先に体が動く瞬発型。ここぞの勝負勘は全タイプ随一です。",
    drive: "とっさの反応は抜群ですが、予測より反射に頼りがち。「かもしれない運転」で先読みを補いましょう。",
    advice: "短期決戦のスピード勝負が最適。強いカードを引いたら迷わず勝負を仕掛けよう。",
    deck: "チャレンジャーデッキ", partner: "i_iida" },
  { key: "AFTD", name: "情熱のエンターテイナー", emoji: "🎪", catch: "楽しさは、続けた者が勝つ",
    desc: "場を盛り上げながらコツコツ続けられる、情熱と持久力の人。仲間から愛されるタイプです。",
    drive: "同乗者との会話が弾みすぎて注意散漫になることも。楽しい時こそ「運転に集中」の切り替えを。",
    advice: "オンライン対戦でスタンプを飛ばしながらの長期戦が楽しいはず。連戦で調子を上げていこう。",
    deck: "チャレンジャーデッキ", partner: "i_konno" },
  { key: "AFTQ", name: "みんなのムードメーカー", emoji: "🎉", catch: "ノリと勢いで場をさらう",
    desc: "その場の空気を一瞬で明るくする天性のエンターテイナー。勢いに乗ったときの爆発力は圧巻です。",
    drive: "気分が乗った日ほどアクセルが軽くなりがち。出発前のひと呼吸で「今日も安全に」と唱えて。",
    advice: "ノリノリの速攻と派手なコンボが似合います。連勝の勢いをそのままぶつけよう。",
    deck: "チャレンジャーデッキ", partner: "i_takakura" },
  { key: "BLSD", name: "職人気質の安全マスター", emoji: "🛠", catch: "確実・丁寧・ミスをしない",
    desc: "石橋を叩いて渡る慎重派で、積み重ねの努力を惜しまない職人肌。ミスの少なさが最大の武器です。",
    drive: "教習所の模範生タイプ。ただ慎重すぎて合流などで思い切れないことも。「行くと決めたら迷わない」練習を。",
    advice: "山札管理と場外リサイクルを極める堅実な長期戦がぴったり。負けない試合運びを磨こう。",
    deck: "スタンダードデッキ", partner: "i_okumura" },
  { key: "BLSQ", name: "冷静な分析官", emoji: "🧪", catch: "観察、分析、そして最適解",
    desc: "少ない情報から素早く本質を見抜く頭脳派。無駄のない動きでスマートに結果を出します。",
    drive: "状況判断は正確ですが、考えごとをしながらの運転に注意。悩みは目的地に着いてから。",
    advice: "相手の癖を数手で見抜いて裏をかく戦い方が得意。リプレイ研究で読みの精度を上げよう。",
    deck: "スタンダードデッキ", partner: "i_watanabe_tsutomu" },
  { key: "BLTD", name: "みんなの安心番長", emoji: "🛡", catch: "この人がいると、なぜか安心",
    desc: "慎重で思いやりがあり、長く信頼を積み重ねるタイプ。守りの要として欠かせない存在です。",
    drive: "同乗者を安心させる丁寧な運転ができる人。夜間や雨の日など、条件が悪い日の判断力も抜群です。",
    advice: "守りを固めてから反撃する「後の先」スタイル。休憩管理を丁寧に、隙のない盤面を作ろう。",
    deck: "スタンダードデッキ", partner: "i_shigaya" },
  { key: "BLTQ", name: "気配りのプランナー", emoji: "📋", catch: "段取り上手は、運転上手",
    desc: "先を読んで手際よく段取りし、みんなが動きやすいよう整える名参謀。切り替えの早さも持っています。",
    drive: "予定変更にも柔軟に対応できるタイプ。ただし時間に追われると焦りが出るので、出発は5分早めに。",
    advice: "状況に合わせてプランを組み替える柔軟な試合運びが持ち味。手札の選択肢を広く保とう。",
    deck: "スタンダードデッキ", partner: "i_maeda" },
  { key: "BFSD", name: "マイペースな観察者", emoji: "🔭", catch: "静かに見て、深く分かる",
    desc: "静かに全体を観察し、じっくり感じ取ってから動くタイプ。人が気づかないことに気づく目を持っています。",
    drive: "周囲をよく見る観察力は安全運転の才能そのもの。ただ考え込むと反応が遅れるので、迷ったらまず減速。",
    advice: "相手をじっくり観察して土壇場で逆転する粘りの戦い方。終盤力を信じて焦らないこと。",
    deck: "スタンダードデッキ", partner: "i_nashimoto" },
  { key: "BFSQ", name: "気ままな感性派", emoji: "🐈", catch: "気分で動く、でも外さない",
    desc: "自分の感覚に正直で、意外な場面でひらりと動ける身軽さの持ち主。独特のセンスが光ります。",
    drive: "調子の波が運転に出やすいタイプ。「今日は乗らないな」と感じた日は、いつもより丁寧を心がけて。",
    advice: "定石にとらわれない変則的な一手が武器。相手が読めない独自のデッキを組んでみよう。",
    deck: "チャレンジャーデッキ", partner: "i_shibuya_hana" },
  { key: "BFTD", name: "思いやり満点ドライバー", emoji: "💐", catch: "やさしさが、いちばんの安全装備",
    desc: "人の気持ちを感じ取る力に長け、コツコツ続ける誠実さも併せ持つ癒やし系。周りを穏やかにします。",
    drive: "歩行者や自転車への気配りは満点。遠慮しすぎて交差点で譲り合いが長引かないよう、合図ははっきりと。",
    advice: "焦らず自分のペースで。クイズや豆知識でコツコツ学びながら、堅実に強くなるのが向いています。",
    deck: "スタンダードデッキ", partner: "i_hamada" },
  { key: "BFTQ", name: "ひらめきのサポーター", emoji: "🌈", catch: "みんなのピンチに、ぱっと閃く",
    desc: "困っている人にすぐ気づき、機転を利かせて助けられる人。柔らかい発想でチームを救います。",
    drive: "とっさの機転は頼もしい反面、割り込みへの反応など感情が動く場面で慌てやすい。深呼吸を習慣に。",
    advice: "サポートカードを使うタイミングの妙で勝つタイプ。相手の勝負手に合わせたカウンターを狙おう。",
    deck: "スタンダードデッキ", partner: "i_terashima" },
];

/** 軸ごとの回答数から4文字のタイプキーを作る */
export function computeShindanType(axes: Axis[]): ShindanType {
  const count = (x: Axis) => axes.filter((a) => a === x).length;
  const key =
    (count("A") >= count("B") ? "A" : "B") +
    (count("L") >= count("F") ? "L" : "F") +
    (count("S") >= count("T") ? "S" : "T") +
    (count("D") >= count("Q") ? "D" : "Q");
  return SHINDAN_TYPES.find((t) => t.key === key) ?? SHINDAN_TYPES[0];
}

/** 保存されたタイプキーから定義を引く（旧3文字キーは未診断扱いにして再診断を促す） */
export function shindanTypeOf(key: string | undefined | null): ShindanType | null {
  if (!key) return null;
  return SHINDAN_TYPES.find((t) => t.key === key) ?? null;
}

/** 軸ごとの内訳（メーター表示用）。answers は回答した軸文字の並び */
export interface AxisBreakdown {
  left: { letter: Axis; label: string; count: number };
  right: { letter: Axis; label: string; count: number };
}

export function axisBreakdown(answers: Axis[]): AxisBreakdown[] {
  const count = (x: Axis) => answers.filter((a) => a === x).length;
  return [
    { left: { letter: "A", label: "アクセル", count: count("A") }, right: { letter: "B", label: "ブレーキ", count: count("B") } },
    { left: { letter: "L", label: "ロジック", count: count("L") }, right: { letter: "F", label: "フィーリング", count: count("F") } },
    { left: { letter: "S", label: "ソロ", count: count("S") }, right: { letter: "T", label: "チーム", count: count("T") } },
    { left: { letter: "D", label: "じっくり", count: count("D") }, right: { letter: "Q", label: "ぱっと", count: count("Q") } },
  ];
}

/** 極（軸の傾き）ごとの強みと、運転で気をつけたい場面 */
export const POLE_TRAITS: Record<Axis, { label: string; strength: string; caution: string }> = {
  A: { label: "アクセル", strength: "決断が早く、合流や追い越しでもたつかない", caution: "スピードの出しすぎ・黄信号での「行けるか」判断。迷ったら止まる癖を" },
  B: { label: "ブレーキ", strength: "無理をしない安全マージンの取り方が上手", caution: "合流や右折でためらいすぎると逆に危ない。「行くと決めたら迷わない」練習を" },
  L: { label: "ロジック", strength: "ルールや標識を正確に理解して運転に活かせる", caution: "考え事をしながらの運転。頭が忙しい日ほど意識して周りを見る" },
  F: { label: "フィーリング", strength: "場の空気や危険の気配を肌で感じ取れる", caution: "「なんとなく大丈夫」の油断。カンに頼らず確認で裏づけを" },
  S: { label: "ソロ", strength: "ひとりでも集中力が切れず淡々と走れる", caution: "長距離のひとり運転は眠気に気づきにくい。2時間に1回は必ず休憩を" },
  T: { label: "チーム", strength: "同乗者を安心させる気配りの運転ができる", caution: "おしゃべりや同乗者の世話での脇見。会話が盛り上がる時こそ前を見る" },
  D: { label: "じっくり", strength: "長時間でも安定したペースを保てる持久力", caution: "単調な道での漫然運転。景色に変化がない道こそ意識して確認を" },
  Q: { label: "ぱっと", strength: "急な状況変化への反応と切り替えが早い", caution: "せっかちな発進・車線変更。1テンポ待つだけで事故リスクは大きく下がる" },
};

/** 回答から傾きの強い順に極を返す（強み・注意点の個別表示用） */
export function dominantPoles(answers: Axis[]): Axis[] {
  const pairs: [Axis, Axis][] = [
    ["A", "B"],
    ["L", "F"],
    ["S", "T"],
    ["D", "Q"],
  ];
  const count = (x: Axis) => answers.filter((a) => a === x).length;
  return pairs
    .map(([l, r]) => {
      const cl = count(l);
      const cr = count(r);
      return { letter: cl >= cr ? l : r, gap: Math.abs(cl - cr) };
    })
    .sort((x, y) => y.gap - x.gap)
    .map((p) => p.letter);
}

/** 全軸が反対の「補い合える相棒」タイプ */
export function partnerTypeOf(key: string): ShindanType | null {
  const flip: Record<string, string> = { A: "B", B: "A", L: "F", F: "L", S: "T", T: "S", D: "Q", Q: "D" };
  const opp = key
    .split("")
    .map((c) => flip[c] ?? c)
    .join("");
  return SHINDAN_TYPES.find((t) => t.key === opp) ?? null;
}

// ============================================================
// セーフティチェック（安全運転の6観点）
// 実際の運転適性検査（OD式等）が測る観点になぞらえた自己診断。
// 質問紙＋ゲーム内の実測データ（動体視力・KYT・学科・対戦傾向）を
// 突き合わせて表示する。あくまで学習用の簡易版であり、
// 本格的な適性検査は入校後に受けられる旨を画面に明記する。
// ============================================================

export type SafetyAxis =
  | "accuracy" // 操作・正確さ
  | "attention" // 注意力
  | "judgment" // 判断・自制
  | "stability" // 情緒安定
  | "cooperation" // 協調性
  | "humility"; // 慎重さ（過信しない）

export const SAFETY_AXES: { key: SafetyAxis; label: string; emoji: string; desc: string }[] = [
  { key: "accuracy", label: "操作・正確さ", emoji: "🎯", desc: "落ち着いて正確に操作できる力" },
  { key: "attention", label: "注意力", emoji: "👀", desc: "周囲の変化にいち早く気づく力" },
  { key: "judgment", label: "判断・自制", emoji: "🧠", desc: "冷静に判断し、衝動を抑える力" },
  { key: "stability", label: "情緒安定", emoji: "🧘", desc: "イライラせず平常心を保つ力" },
  { key: "cooperation", label: "協調性", emoji: "🤝", desc: "譲り合い・思いやりの心" },
  { key: "humility", label: "慎重さ", emoji: "🔍", desc: "過信せず、確認を怠らない姿勢" },
];

export interface SafetyQuestion {
  text: string;
  axis: SafetyAxis | "lie";
  /** 「そう思う」ほどスコアが下がる逆転項目 */
  reverse?: boolean;
}

/** 各観点2問＋正直度チェック（ライスケール）2問。場面を思い浮かべて答える形式 */
export const SAFETY_QUESTIONS: SafetyQuestion[] = [
  { text: "ゲームや細かい作業では、焦っているときほど操作ミスが増える", axis: "accuracy", reverse: true },
  { text: "歩いていて、飛び出しそうな子どもや自転車に早めに気づくほうだ", axis: "attention" },
  { text: "「たぶん大丈夫」で行動して、ヒヤッとした経験がある", axis: "humility", reverse: true },
  { text: "予定が急に変わっても、気持ちの切り替えは早いほうだ", axis: "stability" },
  { text: "行列に割り込まれたら、しばらくイライラを引きずってしまう", axis: "stability", reverse: true },
  { text: "混んでいる場所では、自分から道を譲ることが多い", axis: "cooperation" },
  { text: "今まで一度もうそをついたことがない", axis: "lie" },
  { text: "急いでいるときでも、いったん立ち止まって考えることができる", axis: "judgment" },
  { text: "慣れてきた作業ほど、確認を省略しがちだ", axis: "humility", reverse: true },
  { text: "ふたつのことを同時にやると、どちらかがおろそかになりやすい", axis: "attention", reverse: true },
  { text: "初めて使う道具や機械でも、すぐに使いこなせるほうだ", axis: "accuracy" },
  { text: "人にイライラしたことは一度もない", axis: "lie" },
  { text: "勝負事で負けが続くと、つい無茶な賭けに出たくなる", axis: "judgment", reverse: true },
  { text: "自分のペースを乱されても、相手に合わせられるほうだ", axis: "cooperation" },
];

/** 回答（0=そう思わない〜3=そう思う）から観点スコア（0〜100）と正直度を出す */
export function scoreSafety(answers: number[]): {
  scores: Record<SafetyAxis, number>;
  lie: number;
} {
  const sums: Record<string, { sum: number; n: number }> = {};
  let lie = 0;
  SAFETY_QUESTIONS.forEach((q, i) => {
    const raw = Math.max(0, Math.min(3, answers[i] ?? 0));
    if (q.axis === "lie") {
      lie += raw;
      return;
    }
    const v = q.reverse ? 3 - raw : raw;
    const s = (sums[q.axis] ??= { sum: 0, n: 0 });
    s.sum += v;
    s.n++;
  });
  const scores = {} as Record<SafetyAxis, number>;
  for (const a of SAFETY_AXES) {
    const s = sums[a.key] ?? { sum: 0, n: 1 };
    scores[a.key] = Math.round((s.sum / (s.n * 3)) * 100);
  }
  return { scores, lie };
}

/** 観点別のワンポイント（スコアの低い観点に出す教習アドバイス） */
export const SAFETY_ADVICE: Record<SafetyAxis, string> = {
  accuracy:
    "焦ったときほど操作は「ゆっくり・大きく」。乗車前のミラー・シート合わせを毎回の儀式にすると、操作全体が落ち着きます。",
  attention:
    "「車の陰・木の陰に人がいるかも」と探す癖をつけましょう。KYT（危険予測）トレーニングで実際に鍛えられます。",
  judgment:
    "迷ったら「止まる・待つ・譲る」。黄信号は「急いで通過する合図」ではなく「止まる準備の合図」と覚えましょう。",
  stability:
    "イラッとしたら深呼吸1回＋車間距離を1秒プラス。感情はそのままスピードに乗り移ります。",
  cooperation:
    "「お先にどうぞ」は最強の安全装備。譲った数だけ事故は遠ざかります。",
  humility:
    "「だろう」ではなく「かもしれない」。慣れた道こそ、確認をひとつ増やしましょう。",
};

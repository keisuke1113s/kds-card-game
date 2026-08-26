# KDSカードゲーム（デジタル版）

[card.kds946.com](https://card.kds946.com) で公開されている KDS オリジナルカードゲームの、CPU対戦できるスマホアプリ（iOS / Android）。React Native + Expo 製。

## 開発

```bash
npm install
npm start          # Expo 開発サーバー（w で Web、i で iOSシミュレータ）
npm test           # エンジン・AIのテスト（vitest）
npm run typecheck  # 型チェック
```

## 構成

- `src/engine/` — ゲームルールの純TypeScript実装（React非依存）。決定的リデューサー＋シード付き乱数。`getLegalActions` が合法手を列挙し、UIとAIの両方がそれを使う
- `src/ai/` — ヒューリスティックCPU（よわい/ふつう/つよい）。秘匿済みビューしか見えない設計
- `src/data/` — カード定義（宣言的な効果DSL）。`schema.ts` の zod スキーマが実カードJSONの受け口
- `src/app/` — expo-router 画面（ホーム/対戦/デッキ構築/図鑑/ルール/設定）
- `src/store/` — zustand ストア（対局進行・デッキ・設定。AsyncStorage 永続化）

## 実カードデータの追加方法

1. カード画像（868×1213px）を `assets/cards/<cardId>.png` に置く
2. `src/data/cards.ts` の配列にカード定義を追加（または JSON を `cardSetSchema` で検証して読み込む）
3. 効果は `{ trigger, ops }` で宣言的に書く。語彙: `modifyTrack` / `buffCombat` / `draw` / `searchTop`。語彙で表せない特殊カードはエンジンの効果システムに op を追加する

## 今後（未実装）

- 実カードデータ・画像の取り込み（現在はプレースホルダー22枚＋担当2枚）
- カードアニメーション（reanimated）・効果音
- EAS Build でのストア申請（アイコン・スプラッシュ含む）
- オンライン対戦（エンジンは決定的・直列化可能でその前提で設計済み）

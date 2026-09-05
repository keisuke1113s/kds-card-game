# CLAUDE.md

KDS釧路自動車学校のオリジナルカードゲーム「KDSトレーディングカードゲーム」のデジタル対戦アプリ。
CPU対戦・オンライン対戦に加え、学科クイズ・危険予測(KYT)・適性診断・動体視力など自動車学校らしい学習機能を持つ。

## 全体ルール

- **応答・コードコメント・コミットメッセージはすべて日本語**。
- **すべての変更は online → main の両ブランチへ反映する**（例外なし）。作業ブランチは `online`。
- リポジトリは **public**。パスワード・鍵・秘密の値をコード/ドキュメントに書かない。
- 修正後は必ず `npx tsc --noEmit` と `npm test` を通してからコミットする。

## デプロイ

- Web本番: GitHub Pages https://keisuke1113s.github.io/kds-card-game/ （mainへのpushでGitHub Actionsが自動ビルド）
- 開発版: 同URLの /dev/ （onlineブランチ）
- 標準デプロイチェーン（クライアントのみの変更時）:

```bash
git push origin online && git checkout main && git merge online && git push origin main && git checkout online && sleep 20 && RUN_ID=$(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId') && while [ "$(gh run view $RUN_ID --json status -q .status)" != "completed" ]; do sleep 15; done; gh run view $RUN_ID --json conclusion -q .conclusion && curl -s "https://keisuke1113s.github.io/kds-card-game/?x=$(date +%s)" | grep -o 'entry-[a-f0-9]\{8\}' | head -1
```

- 最後に出る `entry-XXXXXXXX` の8桁がバージョン。ユーザーには設定画面のバージョン8桁で最新確認してもらう。
- **サーバー（server/）を変更したら** `flyctl deploy --ha=false --remote-only` も実行する。ただし**必ず先に `https://kds-taisen.fly.dev/matches` で対局中がゼロなことを確認**（デプロイで進行中の対局が消えるため）。
- サーバー本番: Fly.io アプリ `kds-taisen`（東京・常時1台） wss://kds-taisen.fly.dev。WS形式エラーの内容は `fly logs` に残る。
- **ネイティブアプリへのOTA配信（EAS Update）**: JS/アセットのみの変更は、Webデプロイに加えて
  `npx eas-cli update --channel production --message "変更の要約" --non-interactive`
  でストア審査なしに配信できる（アプリを開き直した次の起動で反映）。
  ネイティブ変更（ライブラリ追加・権限・アイコン・SDK更新）はOTA不可＝ストアビルドが必要。
  runtimeVersionはappVersion方式なので、app.jsonのversionを上げたら以降のOTAは新しいビルドにだけ届く。

## コマンド

- `npm test` — vitest（エンジンのルール網羅・ファジング・リプレイ決定性・サーバー結合など）
- `npx tsc --noEmit` — 型チェック（CIには無いので手元で必ず実行）
- 開発サーバーはポート8085で起動して動作確認する

## 構成

- `src/engine/` — 純TS決定的リデューサー（React非依存・サーバーと共有）。効果は宣言的DSL
- `src/ai/` — ヒューリスティックCPU（PlayerViewのみ参照）
- `src/data/` — カード定義・クイズ200問・KYT80場面・標識図鑑65種・豆知識・共有画像生成など
- `src/store/` — zustand + AsyncStorage(localStorage) 永続化
- `src/app/` — expo-router 画面群（battle.tsx は約8000行の中心画面）
- `src/audio/sound.ts` — Web Audio再生の中核（下記「音」参照）
- `server/` — オンライン対戦サーバー（ws+zod、RoomCore権威、トーナメント、テレメトリ）
- `scripts/` — 素材の取り込み・生成スクリプト（下記）

## 不変の制約

- `src/data/unlock.ts` の **QR_SECRET と発行済みカードIDは変更禁止**（実物カードに印刷済み。IDから決定論的にQRが決まる）
- **`ALL_CARDS_OPEN_FOR_TESTING` は本番アプリ公開前に必ず false に戻す**（現在true=全カード開放）
- fal.ai のAPIキーはこのMacの `~/.fal_key` のみ。リポジトリに入れない
- `raw-cards/`・`raw-audio/` は素材原本置き場でgit管理外
- カードの追加・変更はアプリ更新として配信（サーバー配信の仕組みは作らない）

## 素材生成・取り込み（fal.ai / スクリプト）

- **カード取り込み**: raw-cards/ にPDF → `python3 scripts/import-card.py <カードID> <PDF>` → cards.ts に定義追加
- **実況ボイス**: raw-audio/voice に日本語名mp3 → `scripts/import-voice.py`（`voice_*` は無音トリム後の実長+0.3秒を上限に自動変換。**実長より短い上限だと尻切れになる**）→ gen-audio-map.js → sound.ts の VoiceKey に追加 → battle.tsx で発動条件。カード個別実況は `voice_c_<カードID>.wav` 規約
- **KYT場面イラスト**: `python3 scripts/gen-kyt-scenes.py`（80場面のプロンプト辞書入り、既存ファイルはスキップ）。
  確定テイスト=セルシェーディングの教本イラスト調（スタイル語を先頭に置く）。
  **日本仕様（右ハンドル・左側通行）はプロンプトのleft/rightを入れ替えて生成→画像を左右反転**（スクリプトに組込済み。プロンプトは日本での正しい配置で書く）。
  fluxの癖: 向き指定が弱い（seen from behind等で明示・要リトライ）／交差点に勝手に信号を足す／negativeプロンプト不可／
  車内に人物を描く事故は "empty driver seat view, no person inside the car" で防ぐ。
  手仕上げ例外3枚（reverse_out・green_arrow・kyushajo）の注記がスクリプト冒頭にある
- **標識画像**: Wikimedia CommonsのPD素材（`curl -sL -A "KDS-CardGame/1.0 (educational)" "https://commons.wikimedia.org/wiki/Special:FilePath/<FILE>.svg?width=240"`。UA必須・404はAPI検索でファイル名解決）
- BGM/SE: `scripts/gen-bgm.py` / `gen-se.py`（stable-audio）。アイコンの `gen-art.py` icon機能は**再実行しないこと**（ユーザーが元デザインへ差し戻し済み）

## 音まわりの注意（src/audio/sound.ts）

- Webは事前デコード済みAudioBuffer即時再生（カクつき対策の要。効果音ONで盤面更新平均15ms）
- 対戦開始に使う音は `warmBattleStart()` で先読み（全ボイスの順次読み込みは十数秒かかる）
- iOSはバックグラウンド復帰でAudioContextが止まる → 復帰・タップごとに resume 済み
- 実況は1チャンネル制（voiceBusyUntil）。大事なボイスは `playVoiceSoon`（空き待ち再生）
- BGMの停止は battle.tsx の「最後にマウントされた対戦画面」だけが行う（連戦レース対策）

## 落とし穴・過去の教訓

- `src/data/quizQuestions.ts` への追記は「ファイル末尾のrstrip後の `];`」を置換する（`s.replace("\n];",...)` は最初のマッチ=QUIZ_CATEGORIES配列を壊した前科あり）
- python heredoc内に `{"\n"}` を書くと実改行になりJSX文字列が壊れる → 一括編集時は `assert old in s` で置換確認
- RN WebのTextInputは `flex:1` でも固有幅で縮まない → 行内に置くなら `minWidth: 0` を付ける
- Reanimatedの `animationKeyframes` はWebで無効 → `+html.tsx` のグローバル@keyframes + `dataSet={{kdsanim:"名前"}}` 方式
- HMR後は合成MouseEventが効かないことが多い → find→実クリック、必要ならリロード
- 更新が反映されない報告はまず設定画面のバージョン8桁を確認してもらう（SW/キャッシュ対策実装済み）

## 運用メモ

- 管理画面はブラウザ専用URL `/admin`（認証情報はリポジトリに書かない）。分析タブにアクセス/ゲーム/カード強さ/デッキ解析
- LINE連携: 現在は連携コード方式（`src/data/lineConfig.ts`）。方式B=LINEログインへ移行予定（ユーザーのLINE Developers作業待ち）
- ネイティブ配布(TestFlight/EAS)はD-U-N-S登録完了のユーザー合図待ち
- 同名カード禁止は「名前基準」（公式説明書どおり）

import { ScrollViewStyleReset } from "expo-router/html";
import React from "react";

/**
 * Web 版（ブラウザ・ホーム画面に追加）の <head> を組み立てる。
 *
 * iPhone で「ホーム画面に追加」したときは、
 *   - アイコン        … apple-touch-icon（180px・透過なし）
 *   - タイトル        … apple-mobile-web-app-title
 * の2つを見るため、manifest.json だけでは名前もアイコンも付かない。
 */

// 公開時は "/kds-card-game"、開発サーバーでは空文字になる
const BASE = (process.env.EXPO_BASE_URL ?? "").replace(/\/$/, "");
const asset = (path: string) => `${BASE}/${path}`;

// 起動画面で回すカード裏面（assets/cards_small/cardback.webp を埋め込み）
const CARDBACK_DATA_URI = "data:image/webp;base64,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";

const APP_NAME = "KDSトレーディングカードゲーム";
// ホーム画面のアイコン下に出る名前（アプリ名と同じにそろえる）
const HOME_SCREEN_NAME = APP_NAME;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
         * viewport-fit=cover は入れない。
         * iPhone で画面の下に余白が出る（セーフエリアぶん盤面が押し上げられる）ため。
         */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <title>{APP_NAME}</title>
        <meta name="description" content="KDS a go! go! トレーディングカードゲームのCPU対戦アプリ" />
        <meta name="theme-color" content="#1565c0" />

        {/* ホーム画面に追加したときの表示（iOS） */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={HOME_SCREEN_NAME} />
        <meta name="application-name" content={HOME_SCREEN_NAME} />
        <link rel="apple-touch-icon" sizes="180x180" href={asset("apple-touch-icon.png")} />
        <link rel="icon" type="image/png" sizes="192x192" href={asset("icon-192.png")} />
        <link rel="icon" type="image/png" sizes="512x512" href={asset("icon-512.png")} />
        <link rel="manifest" href={asset("manifest.json")} />

        {/* React Native Web の ScrollView を正しく表示するための既定スタイル */}
        <ScrollViewStyleReset />

        {/*
         * Android の Chrome に「インストールできるアプリ」だと認めてもらうための登録。
         * これがあると、こちらから OS 標準のインストールダイアログを出せる。
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('${asset("sw.js")}', { scope: '${BASE}/' })
      .catch(function () { /* 対応していない環境では何もしない */ });
  });
}
// インストールダイアログを出す権利は一度きりなので、拾って取っておく
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__installPrompt = e;
  window.dispatchEvent(new Event('kds-installable'));
});
window.addEventListener('appinstalled', function () {
  window.__installPrompt = null;
  window.dispatchEvent(new Event('kds-installed'));
});
`,
          }}
        />
        {/*
         * 起動中に出しておく画面。
         * アプリの本体が読み込まれるまで真っ白のままだと、壊れたように見えるため。
         * 中身が表示できるようになったら _layout.tsx が消す。
         */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
/* 演出（降るカード・紙吹雪など）が画面の右端からはみ出しても
 * ページの横幅が広がらないようにする（広がるとスマホで全体が縮んで見える） */
html, body { overflow-x: hidden; }

#kds-boot {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: linear-gradient(160deg, #eef2f9 0%, #dbe4f3 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
  transition: opacity .32s ease;
}
#kds-boot.kds-hide { opacity: 0; pointer-events: none; }
/* 画像は起動が遅くなるので使わない。ホーム画面と同じ見た目を文字で作る */
#kds-boot .kds-logo {
  display: flex; align-items: baseline; gap: 8px;
  animation: kds-pop .45s cubic-bezier(.2,1.3,.5,1) both;
}
#kds-boot .kds-name { font-size: 40px; font-weight: 900; letter-spacing: 2px; line-height: 1; }
#kds-boot .kds-go { font-size: 20px; font-weight: 900; letter-spacing: 1px; line-height: 1; }
#kds-boot .kds-catch {
  font-size: 14px; font-weight: 900; margin-top: 2px;
  animation: kds-pop .45s .08s cubic-bezier(.2,1.3,.5,1) both;
}
@keyframes kds-pop {
  from { transform: scale(.82); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
#kds-boot .kds-sub { font-size: 13px; font-weight: 700; color: #4a5b7a; }
/* カード裏面がクルクル回るローディング。
 * 画像は data URI で HTML に埋め込んであるため、通信状態に関係なく必ず出る */
#kds-boot .kds-spinner {
  width: 46px; height: 64px; border-radius: 6px;
  background: linear-gradient(150deg, #1e5aa8 0%, #123c78 100%);
  box-shadow: 0 4px 14px rgba(20, 50, 100, .3);
  animation: kds-cardflip 1.6s ease-in-out infinite;
}
/* 3D回転（rotateY）だと真横を向いた瞬間や描画の相性でカードが
 * 見えなくなる端末があるため、常に見えている2D回転にしている */
/* ループ演出用（アプリ側から data-kdsanim 属性で使う。
 * ブラウザ合成で動くため、JSが混んでいてもカクつかない） */
[data-kdsanim="float"] { animation-name: kds-float; }
[data-kdsanim="pulsering"] { animation-name: kds-pulsering; }
[data-kdsanim="breathe"] { animation-name: kds-breathe; }
[data-kdsanim="tremble"] { animation-name: kds-tremble; }
[data-kdsanim="goldpulse"] { animation-name: kds-goldpulse; }
[data-kdsanim="reachpulse"] { animation-name: kds-reachpulse; }
[data-kdsanim="dots"] { animation-name: kds-dots; }
[data-kdsanim="fall"] { animation-name: kds-fall; }
[data-kdsanim="sway"] { animation-name: kds-sway; }
@keyframes kds-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes kds-pulsering { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes kds-glowpulse { 0%, 100% { opacity: .1; } 50% { opacity: 1; } }
[data-kdsanim="glowpulse"] { animation-name: kds-glowpulse; }
@keyframes kds-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.022); } }
@keyframes kds-tremble { 0%, 100% { transform: translateX(-1.6px); } 50% { transform: translateX(1.6px); } }
@keyframes kds-goldpulse { 0%, 100% { opacity: .25; } 50% { opacity: .9; } }
@keyframes kds-reachpulse { 0%, 100% { opacity: .2; } 50% { opacity: .55; } }
@keyframes kds-dots { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
@keyframes kds-fall { 0% { transform: translateY(-40px); opacity: 0; } 5% { opacity: .7; } 90% { opacity: .7; } 100% { transform: translateY(940px); opacity: 0; } }
[data-kdsanim="wipeleft"] { animation-name: kds-wipeleft; }
[data-kdsanim="wiperight"] { animation-name: kds-wiperight; }
[data-kdsanim="wipebeam"] { animation-name: kds-wipebeam; }
@keyframes kds-wipeleft { from { transform: translateX(0); } to { transform: translateX(calc(-52vw - 12px)); } }
@keyframes kds-wiperight { from { transform: translateX(0); } to { transform: translateX(calc(52vw + 12px)); } }
@keyframes kds-wipebeam { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
[data-kdsanim="drift"] { animation-name: kds-drift; }
@keyframes kds-drift { 0%, 100% { transform: translateX(-30px); } 50% { transform: translateX(30px); } }
@keyframes kds-sway { 0%, 100% { transform: translateX(-14px) rotate(-20deg); } 50% { transform: translateX(14px) rotate(20deg); } }
@keyframes kds-cardflip {
  0%   { transform: rotate(0deg)   scale(1); }
  50%  { transform: rotate(180deg) scale(0.88); }
  100% { transform: rotate(360deg) scale(1); }
}
`,
          }}
        />
      </head>
      <body>
        <div id="kds-boot">
          {/* 文字色はカード実物のロゴから採ったもの */}
          <div className="kds-logo">
            <span className="kds-name">
              <span style={{ color: "#d83030" }}>K</span>
              <span style={{ color: "#e49c18" }}>D</span>
              <span style={{ color: "#78b424" }}>S</span>
            </span>
            <span className="kds-go">
              <span style={{ color: "#e2604a" }}>a</span>
              <span style={{ color: "#e49c18" }}> G</span>
              <span style={{ color: "#3d8fd0" }}>O</span>
              <span style={{ color: "#d83030" }}>!</span>
              <span style={{ color: "#c9d63a" }}> G</span>
              <span style={{ color: "#8fd3ee" }}>O</span>
              <span style={{ color: "#eeb121" }}>!</span>
            </span>
          </div>
          {/* 「運転」「楽しく」だけ赤、つなぎの言葉は黒 */}
          <div className="kds-catch">
            <span style={{ color: "#d83030" }}>運転</span>
            <span style={{ color: "#16283c" }}>が</span>
            <span style={{ color: "#d83030" }}>楽しく</span>
            <span style={{ color: "#16283c" }}>なる!!</span>
          </div>
          <img className="kds-spinner" src={CARDBACK_DATA_URI} alt="" />
          <div className="kds-sub">読み込んでいます…</div>
        </div>
        {children}
      </body>
    </html>
  );
}

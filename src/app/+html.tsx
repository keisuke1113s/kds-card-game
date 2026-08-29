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
/* カード裏面がクルクル回るローディング */
#kds-boot .kds-spinner {
  width: 44px; height: 62px; border-radius: 6px;
  background: linear-gradient(150deg, #1e5aa8 0%, #123c78 100%);
  border: 2px solid #e4a018;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 11px; font-weight: 900; letter-spacing: 1px;
  animation: kds-cardflip 1.6s ease-in-out infinite;
}
#kds-boot .kds-spinner::after { content: "KDS"; }
/* 3D回転（rotateY）だと真横を向いた瞬間や描画の相性でカードが
 * 見えなくなる端末があるため、常に見えている2D回転にしている */
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
          <div className="kds-spinner" />
          <div className="kds-sub">読み込んでいます…</div>
        </div>
        {children}
      </body>
    </html>
  );
}

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
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  background: linear-gradient(160deg, #eef2f9 0%, #dbe4f3 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
  transition: opacity .32s ease;
}
#kds-boot.kds-hide { opacity: 0; pointer-events: none; }
#kds-boot .kds-logo {
  font-size: 30px; font-weight: 900; letter-spacing: 1px;
  color: #d83030;
}
#kds-boot .kds-logo span:nth-child(2) { color: #e49c18; }
#kds-boot .kds-logo span:nth-child(3) { color: #78b424; }
#kds-boot .kds-sub { font-size: 13px; font-weight: 700; color: #4a5b7a; }
#kds-boot .kds-spinner {
  width: 30px; height: 30px; border-radius: 50%;
  border: 3px solid #c3d0e6; border-top-color: #1565c0;
  animation: kds-spin .8s linear infinite;
}
@keyframes kds-spin { to { transform: rotate(360deg); } }
`,
          }}
        />
      </head>
      <body>
        <div id="kds-boot">
          <div className="kds-logo">
            <span>K</span>
            <span>D</span>
            <span>S</span>
          </div>
          <div className="kds-spinner" />
          <div className="kds-sub">読み込んでいます…</div>
        </div>
        {children}
      </body>
    </html>
  );
}

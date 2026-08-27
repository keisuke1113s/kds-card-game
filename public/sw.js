// ホーム画面への追加（インストール）をブラウザに認めてもらうための最小の Service Worker。
//
// オフライン対応は行わない（キャッシュを持つと、更新したのに古い画面が出る事故が起きるため）。
// fetch をそのまま素通しするハンドラだけを置き、常にネットワークの最新を表示する。

self.addEventListener("install", () => {
  // 新しい版をすぐ有効にする
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // 何も加工せずネットワークに任せる
  event.respondWith(fetch(event.request));
});

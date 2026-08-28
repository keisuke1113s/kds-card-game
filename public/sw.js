/* KDSカードゲームの Service Worker（オフライン対応）。
 * - カード画像・音は一度読んだら端末に保存 → オフラインでも図鑑・CPU対戦が動き、
 *   iPhoneで絵が一瞬白くなる問題の根本対策にもなる
 * - ページ本体はネット優先（更新は必ず届く）。圏外のときだけ保存済みを表示
 * - アプリ本体(JS/CSS)はファイル名が更新ごとに変わるため、保存しても古い版が
 *   出続ける事故は起きない（新しいページは新しいファイル名を読みに行く）
 */
const CACHE = "kds-cache-v1";

self.addEventListener("install", () => {
  // 新しい版をすぐ有効にする
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const ASSET_RE = /\.(webp|png|jpg|jpeg|gif|svg|mp3|wav|ttf|otf|woff2?)($|\?)/i;
const CODE_RE = /\.(js|css)($|\?)/i;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ページ本体: 常に最新をネットから取得（HTTPキャッシュも無視）→ 圏外は保存済みを表示。
  // ページ本体をキャッシュから返すと、更新したはずのアプリが古いまま
  // 表示され続けることがあるため、必ず取りに行く（本体は小さいので負担は無い）
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req.url, { cache: "no-store" });
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const hit = await cache.match(req, { ignoreSearch: true });
          return hit ?? Response.error();
        }
      })()
    );
    return;
  }

  // 画像・音: 保存優先（無ければ取得して保存）
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  // アプリ本体: 保存を返しつつ、裏で最新を取り直す
  if (CODE_RE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        if (hit) return hit;
        const fresh = await refresh;
        return fresh ?? Response.error();
      })()
    );
  }
});

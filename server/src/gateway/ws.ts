import fs from "node:fs";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { cardRegistry } from "@/data/cards";
import { GameContext, PlayerId } from "@/engine/types";
import { Matchmaker } from "../core/matchmaker";
import { RoomCore, ServerMessage } from "../core/room";
import { clientMessageSchema, sanitizeName, sanitizeTitle } from "../protocol/messages";
import { Telemetry } from "../core/telemetry";
import { Challenges } from "../core/challenges";
import { Tourney } from "../core/tourney";
import { config } from "../config";

/** ディレクトリとして存在し書き込めそうか */
/** プライバシーポリシーのページHTML */
function PRIVACY_PAGE(): string {
  return `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>プライバシーポリシー | KDSトレーディングカードゲーム</title>
<style>
body{margin:0;font-family:-apple-system,"Hiragino Sans",sans-serif;background:#f5f7fb;color:#1c2430;line-height:1.9}
.wrap{max-width:720px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:22px;border-bottom:3px solid #1a5fb4;padding-bottom:8px}
h2{font-size:17px;margin-top:32px;color:#1a5fb4}
li{margin:6px 0}
.date{color:#6a7686;font-size:13px}
</style></head><body><div class="wrap">
<h1>KDSトレーディングカードゲーム プライバシーポリシー</h1>
<p class="date">制定日: 2026年9月5日</p>
<p>KDS釧路自動車学校（株式会社苗穂自動車学園。以下「当校」）は、アプリ「KDSトレーディングカードゲーム」（以下「本アプリ」）における利用者情報の取り扱いについて、以下のとおり定めます。</p>
<h2>1. 収集する情報</h2>
<ul>
<li><b>端末の識別子（ランダムに生成されるID）</b> — オンライン対戦の対戦相手の識別、および利用状況の集計のために生成します。氏名・電話番号・メールアドレス等の個人を特定する情報とは紐付きません。</li>
<li><b>利用状況の統計情報</b> — アプリの起動回数、対戦回数、機能の利用状況など。サービスの改善のために匿名で集計します。</li>
<li><b>エラー情報</b> — 不具合の調査のため、エラー発生時の技術情報（エラー内容・端末の種類）を収集します。</li>
<li><b>表示名（任意）</b> — 利用者が任意で設定した場合のみ、オンライン対戦・週間ランキングに表示されます。</li>
</ul>
<h2>2. 収集しない情報</h2>
<ul>
<li>氏名・住所・電話番号・メールアドレス等の個人情報は収集しません。</li>
<li>位置情報は端末内での天気演出のみに使用し、外部へ送信しません。</li>
<li>写真（教習生免許証の顔写真機能）は端末内にのみ保存され、外部へ送信されません。</li>
<li>広告の配信および広告目的のトラッキングは行いません。</li>
</ul>
<h2>3. 情報の利用目的</h2>
<ul>
<li>オンライン対戦・ランキング等のサービス提供</li>
<li>利用状況の把握とサービスの改善</li>
<li>不具合の調査と修正</li>
</ul>
<h2>4. 第三者への提供</h2>
<p>法令に基づく場合を除き、収集した情報を第三者に提供しません。広告事業者・分析事業者への提供もありません。</p>
<h2>5. 情報の保管</h2>
<p>収集した情報は当校が管理するサーバーに保管し、通信はすべて暗号化（HTTPS/WSS）されます。</p>
<h2>6. お問い合わせ</h2>
<p>本ポリシーに関するお問い合わせは、KDS釧路自動車学校（<a href="https://kds946.com">kds946.com</a>）までご連絡ください。</p>
<h2>7. 改定</h2>
<p>本ポリシーを改定する場合は、本ページにて公表します。</p>
</div></body></html>`;
}

/** 合言葉共有リンクの中継ページHTML */
function JOIN_PAGE(code: string, appUrl: string, webUrl: string): string {
  return `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KDSカードゲーム 対戦に参加</title>
<style>
body{margin:0;font-family:-apple-system,sans-serif;background:linear-gradient(160deg,#1e5aa8,#123c78);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{text-align:center;padding:32px 24px;max-width:340px}
h1{font-size:20px;margin:0 0 6px}
.code{font-size:34px;font-weight:900;letter-spacing:6px;background:#ffffff22;border-radius:12px;padding:10px 0;margin:14px 0 22px}
a.btn{display:block;border-radius:999px;padding:15px 0;margin:10px 0;font-weight:700;text-decoration:none;font-size:16px}
.app{background:#eeb121;color:#16283c}
.web{background:#ffffff22;color:#fff;border:1.5px solid #ffffff88}
p{font-size:12px;color:#cfe0f5;line-height:1.7}
</style></head><body><div class="box">
<h1>🎮 KDSトレーディングカードゲーム</h1>
<div>合言葉</div><div class="code">${code}</div>
<a class="btn app" href="${appUrl}">📱 アプリで参加する</a>
<a class="btn web" href="${webUrl}">🌐 ブラウザ（Web版）で参加する</a>
<p>アプリが入っていない場合は、Web版を選んでください。<br>
「アプリで参加」が開かないときは、メニューから「Safariで開く」を選ぶと確実です。</p>
</div></body></html>`;
}

/**
 * スペシャルコードの照合。環境変数（カンマ区切り）に登録されたコードと
 * 完全一致（前後の空白は無視）したときだけ true
 */
export function checkUnlockCode(registered: string | undefined, entered: string): boolean {
  const codes = (registered ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const code = entered.trim();
  return code.length > 0 && codes.includes(code);
}

/**
 * スペシャルコードがどの操作に対応するかを判定する。
 * unlock=全カード開放（KDS_UNLOCK_ALL_CODES）、release=通常配布へ戻す
 * （KDS_UNLOCK_RELEASE_CODES）、lineLink=LINE連携を登録
 * （KDS_LINE_LINK_CODES）、lineUnlink=LINE連携を解除
 * （KDS_LINE_UNLINK_CODES）。どれにも無ければ null
 */
export type SpecialAction = "unlock" | "release" | "lineLink" | "lineUnlink";
export function unlockActionFor(
  codes: {
    unlock?: string;
    release?: string;
    lineLink?: string;
    lineUnlink?: string;
  },
  entered: string
): SpecialAction | null {
  if (checkUnlockCode(codes.unlock, entered)) return "unlock";
  if (checkUnlockCode(codes.release, entered)) return "release";
  if (checkUnlockCode(codes.lineLink, entered)) return "lineLink";
  if (checkUnlockCode(codes.lineUnlink, entered)) return "lineUnlink";
  return null;
}

function fsExistsDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * WebSocket の薄皮。プロトコルの入口検証と接続の管理だけを行い、
 * ゲームの判断はすべて RoomCore に任せる。
 */

interface ConnState {
  room: RoomCore | null;
  roomCode: string | null;
  seat: PlayerId | null;
  /** 観戦中の部屋と観戦者ID */
  spectating: { room: RoomCore; id: number } | null;
}

export function startServer(port: number): http.Server {
  const ctx: GameContext = { defs: cardRegistry };
  const matchmaker = new Matchmaker(ctx);

  // 利用状況の匿名集計（データディレクトリに保存。Fly.io では /data ボリューム）
  const dataDir =
    process.env.KDS_DATA_DIR ?? (fsExistsDir("/data") ? "/data" : "./data");
  const telemetry = new Telemetry(dataDir);
  const challenges = new Challenges();
  // オンライントーナメント（常設ロビー・4人制）
  const tourney = new Tourney({
    createRoom: () => ({ code: matchmaker.createRoom().code }),
    info: (code) => matchmaker.findRoom(code)?.tourneyInfo() ?? null,
  });
  process.on("beforeExit", () => telemetry.saveNow());

  // アプリから届いたエラー報告（直近200件をメモリに保持）
  const errorLog: {
    at: string;
    msg: string;
    stack?: string;
    url?: string;
    ua?: string;
  }[] = [];

  const server = http.createServer((req, res) => {
    // 利用状況イベントの受け口（匿名）。ブラウザからのPOSTを受けるためCORSを許可
    if (req.url === "/track" && req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (req.url === "/track" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 4000) req.destroy();
      });
      req.on("end", () => {
        try {
          telemetry.track(JSON.parse(body));
        } catch {
          // 壊れたイベントは無視
        }
        res.writeHead(204, { "access-control-allow-origin": "*" });
        res.end();
      });
      return;
    }
    if (req.url === "/privacy" && req.method === "GET") {
      // ストア掲載用のプライバシーポリシー
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "max-age=3600" });
      res.end(PRIVACY_PAGE());
      return;
    }
    if (req.url === "/.well-known/apple-app-site-association" && req.method === "GET") {
      // iOSユニバーサルリンク: /join/* をネイティブアプリで開く関連付け
      res.writeHead(200, { "content-type": "application/json", "cache-control": "max-age=3600" });
      res.end(
        JSON.stringify({
          applinks: {
            apps: [],
            details: [{ appID: "KT58QLHTC3.com.kds946.cardgame", paths: ["/join/*"] }],
          },
        })
      );
      return;
    }
    {
      // 合言葉の共有リンクの中継ページ。
      // LINE内ブラウザはユニバーサルリンクを無視するため、
      // カスタムスキーム（kdscardgame://）でアプリを開くボタンを出す。
      // Safari等から開いた場合はユニバーサルリンクが先に効くので、
      // このページが出るのは主にアプリ内ブラウザ経由のとき
      const joinMatch = /^\/join\/([A-Za-z0-9]{4,8})$/.exec(req.url ?? "");
      if (joinMatch && req.method === "GET") {
        const code = joinMatch[1].toUpperCase();
        const appUrl = `kdscardgame:///join/${code}`;
        const webUrl = `https://keisuke1113s.github.io/kds-card-game/online?code=${code}`;
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JOIN_PAGE(code, appUrl, webUrl));
        return;
      }
    }
    if (req.url?.startsWith("/statsRange?") && req.method === "GET") {
      // 管理画面の「分析」タブの期間・時間帯絞り込み
      const u = new URL(req.url, "http://localhost");
      if (u.searchParams.get("key") !== "946946") {
        res.writeHead(403, { "access-control-allow-origin": "*" });
        res.end();
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const from = (u.searchParams.get("from") || today).slice(0, 10);
      const to = (u.searchParams.get("to") || today).slice(0, 10);
      const hf = Number(u.searchParams.get("hf") ?? 0);
      const ht = Number(u.searchParams.get("ht") ?? 23);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify(
          telemetry.rangeStats(from, to, Number.isFinite(hf) ? hf : 0, Number.isFinite(ht) ? ht : 23)
        )
      );
      return;
    }
    if (req.url?.startsWith("/stats?key=946946") && req.method === "GET") {
      // 管理画面の「分析」タブが読む集計
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(telemetry.stats()));
      return;
    }
    // エラー報告の受け口。ブラウザからのPOSTを受けるためCORSを許可する
    if (req.url === "/errlog" && req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (req.url === "/errlog" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 20000) req.destroy(); // 巨大な報告は捨てる
      });
      req.on("end", () => {
        try {
          const e = JSON.parse(body) as { msg?: string; stack?: string; url?: string; ua?: string };
          const entry = {
            at: new Date().toISOString(),
            msg: String(e.msg ?? "").slice(0, 500),
            stack: e.stack ? String(e.stack).slice(0, 2000) : undefined,
            url: e.url ? String(e.url).slice(0, 300) : undefined,
            ua: e.ua ? String(e.ua).slice(0, 300) : undefined,
          };
          errorLog.push(entry);
          if (errorLog.length > 200) errorLog.shift();
          console.warn("[アプリのエラー報告]", entry.msg, entry.url ?? "");
        } catch {
          // 壊れた報告は無視
        }
        res.writeHead(204, { "access-control-allow-origin": "*" });
        res.end();
      });
      return;
    }
    if (req.url?.startsWith("/errlog?key=946946") && req.method === "GET") {
      // 管理者がブラウザで確認する用（新しい順）
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify([...errorLog].reverse(), null, 2));
      return;
    }
    if (req.url === "/ranking" && req.method === "GET") {
      // 週間ランキング（ホームの掲示板と管理画面が読む）
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(telemetry.ranking()));
      return;
    }
    if (req.url === "/matches" && req.method === "GET") {
      // 観戦できる進行中の対戦一覧
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ matches: matchmaker.listWatchable() }));
      return;
    }
    // スペシャルコード（卒業生向けの全カード開放など）。
    // 有効なコードは環境変数 KDS_UNLOCK_ALL_CODES（カンマ区切り）で管理し、
    // いつでも差し替え・無効化できる。リポジトリにはコードを書かないこと
    if (req.url === "/unlock-all" && req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (req.url === "/unlock-all" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 500) req.destroy();
      });
      req.on("end", () => {
        let action: SpecialAction | null = null;
        try {
          const b = JSON.parse(body) as { code?: string };
          action = unlockActionFor(
            {
              unlock: process.env.KDS_UNLOCK_ALL_CODES,
              release: process.env.KDS_UNLOCK_RELEASE_CODES,
              lineLink: process.env.KDS_LINE_LINK_CODES,
              lineUnlink: process.env.KDS_LINE_UNLINK_CODES,
            },
            String(b.code ?? "")
          );
        } catch {
          // 壊れた入力は不一致として扱う
        }
        const respond = () => {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
          });
          res.end(JSON.stringify(action ? { ok: true, action } : { ok: false }));
        };
        // 不一致は少し待たせて総当たりを遅くする
        if (action) respond();
        else setTimeout(respond, 800);
      });
      return;
    }
    if (req.url === "/challenge" && req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (req.url === "/challenge" && req.method === "POST") {
      // 挑戦状を送る
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 2000) req.destroy();
      });
      req.on("end", () => {
        let out: object = { error: "送信内容を読み取れませんでした" };
        try {
          const b = JSON.parse(body) as {
            fromDevice?: string; fromName?: string; toDevice?: string; toName?: string;
          };
          out = challenges.create(
            String(b.fromDevice ?? ""),
            sanitizeName(String(b.fromName ?? "")),
            String(b.toDevice ?? ""),
            sanitizeName(String(b.toName ?? ""))
          );
        } catch {
          // 壊れた入力はそのままエラー応答
        }
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
        });
        res.end(JSON.stringify(out));
      });
      return;
    }
    if (req.url?.startsWith("/challenges?device=") && req.method === "GET") {
      const device = decodeURIComponent(req.url.split("device=")[1] ?? "").slice(0, 64);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(challenges.listFor(device)));
      return;
    }
    if (req.url === "/challenge/respond" && req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (req.url === "/challenge/respond" && req.method === "POST") {
      // 挑戦状に返事する（受ける=部屋コードつき／断る）
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 2000) req.destroy();
      });
      req.on("end", () => {
        let out: object = { error: "送信内容を読み取れませんでした" };
        try {
          const b = JSON.parse(body) as {
            id?: string; device?: string; accept?: boolean; code?: string;
          };
          out = challenges.respond(
            String(b.id ?? ""),
            String(b.device ?? ""),
            Boolean(b.accept),
            b.code ? String(b.code) : undefined
          );
        } catch {
          // 壊れた入力はそのままエラー応答
        }
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
        });
        res.end(JSON.stringify(out));
      });
      return;
    }
    if (req.url?.startsWith("/tourney?device=") && req.method === "GET") {
      // トーナメントの状況（ロビーにいる人はこれがハートビートを兼ねる）
      const device = decodeURIComponent(req.url.split("device=")[1] ?? "").slice(0, 64);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(tourney.status(device)));
      return;
    }
    if (
      (req.url === "/tourney/join" || req.url === "/tourney/leave") &&
      req.method === "OPTIONS"
    ) {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (
      (req.url === "/tourney/join" || req.url === "/tourney/leave") &&
      req.method === "POST"
    ) {
      const isJoin = req.url === "/tourney/join";
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 2000) req.destroy();
      });
      req.on("end", () => {
        let out: object = { error: "送信内容を読み取れませんでした" };
        try {
          const b = JSON.parse(body) as { device?: string; name?: string };
          const device = String(b.device ?? "");
          if (isJoin) {
            out = tourney.join(device, sanitizeName(String(b.name ?? "")));
          } else {
            tourney.leave(device);
            out = { ok: true };
          }
        } catch {
          // 壊れた入力はそのままエラー応答
        }
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
        });
        res.end(JSON.stringify(out));
      });
      return;
    }
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: matchmaker.roomCount }));
      return;
    }
    if (req.url === "/lobby") {
      // ランダムマッチで待っている人がいるか（アプリの表示用）
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(
        JSON.stringify({ waiting: matchmaker.waitingCount, tourney: tourney.lobbySize() })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server });

  // ホーム画面へのリアルタイム待ち人数配信。
  // 購読者がいる間だけ2秒ごとに数え、変化したときだけ全員へ送る
  const lobbyWatchers = new Set<WebSocket>();
  const lobbyCounts = () => ({
    waiting: matchmaker.waitingCount,
    tourney: tourney.lobbySize(),
  });
  let lastLobbyJson = "";
  setInterval(() => {
    if (lobbyWatchers.size === 0) return;
    const payload = JSON.stringify({ type: "lobbyUpdate", ...lobbyCounts() });
    if (payload === lastLobbyJson) return;
    lastLobbyJson = payload;
    for (const w of lobbyWatchers) {
      if (w.readyState === WebSocket.OPEN) w.send(payload);
    }
  }, 2000);

  wss.on("connection", (ws: WebSocket, req) => {
    // Origin 検証（WS に古典的 CORS は効かないため自前で確認する）。
    // iOSネイティブアプリのWebSocketは「接続先自身」をOriginとして送るため、
    // 自ホストと同じOriginも許可する（ブラウザはOriginを偽装できないので安全。
    // 悪意あるサイトからの接続は必ずそのサイトのOriginが付く）
    const origin = req.headers.origin;
    if (config.allowedOrigins.length > 0 && origin) {
      const selfOrigin = `https://${req.headers.host ?? ""}`;
      if (!config.allowedOrigins.includes(origin) && origin !== selfOrigin) {
        console.warn("WS接続を拒否（origin不許可）:", origin);
        ws.close(4003, "origin not allowed");
        return;
      }
    }

    const conn: ConnState = { room: null, roomCode: null, seat: null, spectating: null };
    const send = (
      msg:
        | ServerMessage
        | { type: "roomCreated"; code: string }
        | { type: "pong" }
        | { type: "lobbyUpdate"; waiting: number; tourney: number }
    ) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        send({ type: "error", message: "JSONを読み取れませんでした" });
        return;
      }
      const result = clientMessageSchema.safeParse(parsed);
      if (!result.success) {
        // 原因調査のためサーバーログに中身を残す（fly logs で確認できる）
        console.warn("不正なWSメッセージ:", JSON.stringify(parsed).slice(0, 300));
        send({ type: "error", message: "メッセージの形式が正しくありません" });
        return;
      }
      const msg = result.data;

      switch (msg.type) {
        case "ping":
          send({ type: "pong" });
          break;

        case "watchLobby":
          // ホーム画面の待ち人数購読。現在値をすぐ返し、以後は変化時に配信される
          lobbyWatchers.add(ws);
          send({ type: "lobbyUpdate", ...lobbyCounts() });
          break;

        case "createRoom": {
          const { code, room } = matchmaker.createRoom();
          const joined = room.join(
            sanitizeName(msg.name), msg.deck, send, sanitizeTitle(msg.title), msg.device
          );
          if ("error" in joined) {
            send({ type: "error", message: joined.error });
            return;
          }
          conn.room = room;
          conn.roomCode = code;
          conn.seat = joined.seat;
          send({ type: "roomCreated", code });
          break;
        }

        case "joinRoom": {
          const room = matchmaker.findRoom(msg.code);
          if (!room) {
            send({ type: "error", message: "その合言葉の部屋が見つかりません" });
            return;
          }
          const joined = room.join(
            sanitizeName(msg.name), msg.deck, send, sanitizeTitle(msg.title), msg.device
          );
          if ("error" in joined) {
            send({ type: "error", message: joined.error });
            return;
          }
          conn.room = room;
          conn.roomCode = msg.code.toUpperCase();
          conn.seat = joined.seat;
          break;
        }

        case "joinQueue": {
          const { code, room } = matchmaker.joinQueue();
          const joined = room.join(
            sanitizeName(msg.name), msg.deck, send, sanitizeTitle(msg.title), msg.device
          );
          if ("error" in joined) {
            send({ type: "error", message: joined.error });
            return;
          }
          conn.room = room;
          conn.roomCode = code;
          conn.seat = joined.seat;
          break;
        }

        case "reattach": {
          const room = matchmaker.findRoom(msg.code);
          if (!room) {
            send({ type: "error", message: "その部屋はもうありません" });
            return;
          }
          const res = room.reattach(msg.sessionToken, send);
          if ("error" in res) {
            send({ type: "error", message: res.error });
            return;
          }
          conn.room = room;
          conn.roomCode = msg.code.toUpperCase();
          conn.seat = res.seat;
          break;
        }

        case "ready":
          if (conn.room && conn.seat !== null) conn.room.setReady(conn.seat);
          break;

        case "janken":
          if (conn.room && conn.seat !== null) conn.room.handleJanken(conn.seat, msg.hand);
          break;

        case "action":
          if (conn.room && conn.seat !== null) conn.room.handleAction(conn.seat, msg.action);
          break;

        case "resign":
          if (conn.room && conn.seat !== null) conn.room.resign(conn.seat);
          break;

        case "rematch":
          if (conn.room && conn.seat !== null) conn.room.handleRematch(conn.seat);
          break;

        case "stamp":
          if (conn.room && conn.seat !== null) conn.room.handleStamp(conn.seat, msg.id);
          break;

        case "spectate": {
          // 観戦。すでに観戦中なら前の部屋から抜ける
          if (conn.spectating) {
            conn.spectating.room.removeSpectator(conn.spectating.id);
            conn.spectating = null;
          }
          const room = matchmaker.findRoom(msg.code);
          if (!room || !room.started) {
            send({ type: "error", message: "その対戦はもう観戦できません" });
            return;
          }
          conn.spectating = { room, id: room.addSpectator(send) };
          break;
        }

        case "cheer":
          if (conn.spectating) {
            conn.spectating.room.handleCheer(conn.spectating.id, msg.emoji);
          }
          break;

        case "leave":
          if (conn.room && conn.seat !== null) conn.room.leave(conn.seat);
          if (conn.spectating) {
            conn.spectating.room.removeSpectator(conn.spectating.id);
            conn.spectating = null;
          }
          conn.room = null;
          conn.roomCode = null;
          conn.seat = null;
          break;
      }
    });

    ws.on("close", () => {
      lobbyWatchers.delete(ws);
      if (conn.room && conn.seat !== null) conn.room.markDisconnected(conn.seat);
      if (conn.spectating) conn.spectating.room.removeSpectator(conn.spectating.id);
    });
  });

  server.listen(port);
  return server;
}

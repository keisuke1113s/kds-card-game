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

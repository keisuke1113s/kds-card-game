import fs from "node:fs";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { cardRegistry } from "@/data/cards";
import { GameContext, PlayerId } from "@/engine/types";
import { Matchmaker } from "../core/matchmaker";
import { RoomCore, ServerMessage } from "../core/room";
import { clientMessageSchema, sanitizeName, sanitizeTitle } from "../protocol/messages";
import { Telemetry } from "../core/telemetry";
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
}

export function startServer(port: number): http.Server {
  const ctx: GameContext = { defs: cardRegistry };
  const matchmaker = new Matchmaker(ctx);

  // 利用状況の匿名集計（データディレクトリに保存。Fly.io では /data ボリューム）
  const dataDir =
    process.env.KDS_DATA_DIR ?? (fsExistsDir("/data") ? "/data" : "./data");
  const telemetry = new Telemetry(dataDir);
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
    if (req.url?.startsWith("/stats?key=946946") && req.method === "GET") {
      // 管理画面の「分析」タブが読む集計
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
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
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify([...errorLog].reverse(), null, 2));
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
      res.end(JSON.stringify({ waiting: matchmaker.waitingCount }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req) => {
    // Origin 検証（WS に古典的 CORS は効かないため自前で確認する）
    const origin = req.headers.origin;
    if (config.allowedOrigins.length > 0 && origin) {
      if (!config.allowedOrigins.includes(origin)) {
        ws.close(4003, "origin not allowed");
        return;
      }
    }

    const conn: ConnState = { room: null, roomCode: null, seat: null };
    const send = (msg: ServerMessage | { type: "roomCreated"; code: string } | { type: "pong" }) => {
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
        send({ type: "error", message: "メッセージの形式が正しくありません" });
        return;
      }
      const msg = result.data;

      switch (msg.type) {
        case "ping":
          send({ type: "pong" });
          break;

        case "createRoom": {
          const { code, room } = matchmaker.createRoom();
          const joined = room.join(sanitizeName(msg.name), msg.deck, send, sanitizeTitle(msg.title));
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
          const joined = room.join(sanitizeName(msg.name), msg.deck, send, sanitizeTitle(msg.title));
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
          const joined = room.join(sanitizeName(msg.name), msg.deck, send, sanitizeTitle(msg.title));
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

        case "leave":
          if (conn.room && conn.seat !== null) conn.room.leave(conn.seat);
          conn.room = null;
          conn.roomCode = null;
          conn.seat = null;
          break;
      }
    });

    ws.on("close", () => {
      if (conn.room && conn.seat !== null) conn.room.markDisconnected(conn.seat);
    });
  });

  server.listen(port);
  return server;
}

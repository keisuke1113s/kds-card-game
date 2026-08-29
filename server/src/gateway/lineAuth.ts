import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/**
 * LINEログイン（LINE Developers）による本人確認つき連携。
 *
 * 流れ:
 *   1. アプリ → GET /line/login?device=xxx&ret=<戻り先URL>
 *      → LINEの認可画面へ302（友だち追加の案内つき bot_prompt=aggressive）
 *   2. LINE → GET /line/callback?code=...&state=...
 *      → トークン交換 → プロフィール取得 → 友だち状態を確認 → 保存 → アプリへ戻す
 *   3. アプリ → GET /line/check?device=xxx → { linked, friend, displayName }
 *      （20時間おきに友だち状態を取り直す。ブロック検知はここで行う）
 *
 * チャネル情報は環境変数で渡す。未設定の間は /line/available が false を返し、
 * アプリ側は従来の連携コード方式のまま動く。
 *   KDS_LINE_CHANNEL_ID / KDS_LINE_CHANNEL_SECRET
 */

interface LinkRecord {
  userId: string;
  displayName: string;
  friend: boolean;
  linkedAt: string;
  accessToken: string;
  refreshToken?: string;
  checkedAt: string;
  revoked?: boolean;
}

interface LinkStore {
  byDevice: Record<string, LinkRecord>;
}

const RECHECK_MS = 20 * 60 * 60 * 1000; // 20時間

/** アプリの戻り先として許可するURLの先頭（それ以外は既定に差し替える） */
const ALLOWED_RETURNS = [
  "https://keisuke1113s.github.io/kds-card-game/",
  "http://localhost:",
  "http://127.0.0.1:",
];
const DEFAULT_RETURN = "https://keisuke1113s.github.io/kds-card-game/";

export class LineAuth {
  private file: string;
  private store: LinkStore = { byDevice: {} };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "line-links.json");
    try {
      if (fs.existsSync(this.file)) {
        this.store = JSON.parse(fs.readFileSync(this.file, "utf-8")) as LinkStore;
        this.store.byDevice ??= {};
      }
    } catch (e) {
      console.warn("LINE連携の保存データを読めませんでした（新規で始めます）:", e);
      this.store = { byDevice: {} };
    }
  }

  private channelId(): string {
    return process.env.KDS_LINE_CHANNEL_ID ?? "";
  }

  private channelSecret(): string {
    return process.env.KDS_LINE_CHANNEL_SECRET ?? "";
  }

  available(): boolean {
    return this.channelId() !== "" && this.channelSecret() !== "";
  }

  private callbackUrl(req: http.IncomingMessage): string {
    // Fly の裏では http で来るので、ホスト名から本番URLを組み立てる
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}/line/callback`;
  }

  private sign(payload: string): string {
    return crypto.createHmac("sha256", this.channelSecret()).update(payload).digest("base64url");
  }

  private saveSoon(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.writeFileSync(this.file, JSON.stringify(this.store));
      } catch (e) {
        console.warn("LINE連携の保存に失敗しました:", e);
      }
    }, 500);
  }

  /** /line/* のHTTPリクエストを処理する。処理したら true */
  async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://x");
    const cors = { "access-control-allow-origin": "*" };

    if (url.pathname === "/line/available") {
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify({ available: this.available() }));
      return true;
    }

    if (url.pathname === "/line/login") {
      if (!this.available()) {
        res.writeHead(503, cors);
        res.end("LINE login is not configured");
        return true;
      }
      const device = String(url.searchParams.get("device") ?? "");
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(device)) {
        res.writeHead(400, cors);
        res.end("bad device");
        return true;
      }
      let ret = String(url.searchParams.get("ret") ?? "");
      if (!ALLOWED_RETURNS.some((p) => ret.startsWith(p))) ret = DEFAULT_RETURN;
      const payload = Buffer.from(JSON.stringify({ d: device, r: ret })).toString("base64url");
      const state = `${payload}.${this.sign(payload)}`;
      const authorize = new URL("https://access.line.me/oauth2/v2.1/authorize");
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("client_id", this.channelId());
      authorize.searchParams.set("redirect_uri", this.callbackUrl(req));
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("scope", "profile openid");
      // ログイン時に公式アカウントの友だち追加を促す
      authorize.searchParams.set("bot_prompt", "aggressive");
      res.writeHead(302, { location: authorize.toString() });
      res.end();
      return true;
    }

    if (url.pathname === "/line/callback") {
      const fail = (msg: string) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<html><body style="font-family:sans-serif;padding:24px"><h3>連携できませんでした</h3><p>${msg}</p><p>アプリに戻ってやり直してください。</p></body></html>`
        );
      };
      try {
        const state = String(url.searchParams.get("state") ?? "");
        const code = String(url.searchParams.get("code") ?? "");
        const [payload, sig] = state.split(".");
        if (!payload || sig !== this.sign(payload)) return fail("確認情報が一致しません"), true;
        const { d: device, r: ret } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
          d: string;
          r: string;
        };
        if (!code) return fail("LINEでの承認がキャンセルされました"), true;

        // 認可コード → アクセストークン
        const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: this.callbackUrl(req),
            client_id: this.channelId(),
            client_secret: this.channelSecret(),
          }),
        });
        if (!tokenRes.ok) return fail("トークンの取得に失敗しました"), true;
        const token = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
        };

        // プロフィール（userId・表示名）
        const profRes = await fetch("https://api.line.me/v2/profile", {
          headers: { authorization: `Bearer ${token.access_token}` },
        });
        if (!profRes.ok) return fail("プロフィールの取得に失敗しました"), true;
        const prof = (await profRes.json()) as { userId: string; displayName: string };

        // 公式アカウントの友だち状態
        let friend = false;
        try {
          const fRes = await fetch("https://api.line.me/friendship/v1/status", {
            headers: { authorization: `Bearer ${token.access_token}` },
          });
          if (fRes.ok) friend = Boolean(((await fRes.json()) as { friendFlag?: boolean }).friendFlag);
        } catch {
          // 友だち状態が取れなくても連携自体は成立させる
        }

        this.store.byDevice[device] = {
          userId: prof.userId,
          displayName: String(prof.displayName ?? "").slice(0, 20),
          friend,
          linkedAt: new Date().toISOString(),
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          checkedAt: new Date().toISOString(),
        };
        this.saveSoon();

        const back = new URL(ret);
        back.searchParams.set("line", "done");
        res.writeHead(302, { location: back.toString() });
        res.end();
      } catch (e) {
        console.warn("LINEログインのコールバック処理に失敗しました:", e);
        fail("通信エラーが起きました");
      }
      return true;
    }

    if (url.pathname === "/line/check") {
      const device = String(url.searchParams.get("device") ?? "");
      const rec = this.store.byDevice[device];
      if (!rec || rec.revoked) {
        res.writeHead(200, { "content-type": "application/json", ...cors });
        res.end(JSON.stringify({ linked: false }));
        return true;
      }
      // 20時間おきに友だち状態を取り直す（ブロック・解除の検知）
      if (Date.now() - Date.parse(rec.checkedAt) > RECHECK_MS) {
        try {
          const fRes = await fetch("https://api.line.me/friendship/v1/status", {
            headers: { authorization: `Bearer ${rec.accessToken}` },
          });
          if (fRes.ok) {
            rec.friend = Boolean(((await fRes.json()) as { friendFlag?: boolean }).friendFlag);
          } else if (fRes.status === 401) {
            // ユーザーがLINE側で連携解除した（トークン失効）
            rec.revoked = true;
          }
          rec.checkedAt = new Date().toISOString();
          this.saveSoon();
        } catch {
          // 通信できないときは前回の状態のまま返す
        }
      }
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(
        JSON.stringify(
          rec.revoked
            ? { linked: false }
            : { linked: true, friend: rec.friend, displayName: rec.displayName }
        )
      );
      return true;
    }

    return false;
  }
}

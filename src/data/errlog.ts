import { Platform } from "react-native";

/**
 * エラーの自動報告。
 * ユーザーの端末で起きた予期しないエラーを対戦サーバーの /errlog に送り、
 * 「たまに起きる」系の不具合を調査できるようにする。
 * - 公開ページ（github.io）でだけ送る。開発中(localhost)は送らない
 * - 1セッション最大5件・同じ内容は1回だけ
 * - 既知の無害なエラー（音の自動再生ブロック等）は送らない
 */

const ENDPOINT = "https://tcg.kds946.com/errlog";
const MAX_REPORTS = 12;

let sent = 0;
const seen = new Set<string>();

const IGNORE_PATTERNS = [
  "The play() request was interrupted",
  "not allowed by the user agent",
  "navigator.vibrate",
  "AbortError",
  "Loading chunk",
  "ResizeObserver loop",
];

function shouldReport(msg: string): boolean {
  if (!msg) return false;
  if (IGNORE_PATTERNS.some((p) => msg.includes(p))) return false;
  if (sent >= MAX_REPORTS) return false;
  const key = msg.slice(0, 200);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

function report(msg: string, stack?: string): void {
  if (!shouldReport(msg)) return;
  sent++;
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg,
        stack,
        url:
          (globalThis as { location?: { href: string } }).location?.href ??
          `app://${Platform.OS}`,
        ua:
          (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ??
          `native/${Platform.OS}`,
      }),
      // 送れなくてもアプリの動作には影響させない
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 報告自体の失敗は無視
  }
}

/**
 * 性能診断の自動報告（自動軽量化が発動したときの詳細）。
 * どのタイミングでどれくらい重かったかを調査するために送る。
 * 公開ページ以外（localhost等）では送らない
 */
export function reportPerf(detail: string): void {
  const loc = (globalThis as { location?: { hostname: string } }).location;
  if (!loc || !loc.hostname.endsWith("github.io")) return;
  // どのビルドで起きたか分かるようにバージョン（entryハッシュ8桁）を添える
  const doc = (globalThis as { document?: Document }).document;
  const src = (doc?.querySelector('script[src*="entry-"]') as { src?: string } | null)?.src ?? "";
  const buildId = /entry-([a-f0-9]{8})/.exec(src)?.[1] ?? "?";
  report(`[性能診断 v${buildId}] ${detail.slice(0, 380)}`);
}

/**
 * ユーザーが設定画面から手で送る不具合報告。
 * 自動報告と同じ /errlog に「[ユーザー報告]」の印を付けて送る。
 * 端末情報（機種・画面URL）は自動で添える。成功したら true
 */
export async function reportByUser(text: string): Promise<boolean> {
  const msg = `[ユーザー報告] ${text.trim().slice(0, 400)}`;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg,
        url: (globalThis as { location?: { href: string } }).location?.href,
        ua: (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent,
      }),
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 音声まわりの失敗を報告する（Androidの無音調査用）。
 * 通常のreportと同じ上限・重複排除に乗る
 */
export function reportAudioIssue(msg: string): void {
  report(`[音声] ${msg.slice(0, 300)}`);
}

/** アプリ起動時に一度だけ呼ぶ */
export function setupErrorReporting(): void {
  if (Platform.OS !== "web") {
    // ネイティブ: JS起因のクラッシュ（未捕捉例外）を落ちる前に報告する。
    // 報告後は元のハンドラに渡す（RNの通常のクラッシュ処理を妨げない）
    type ErrorUtilsLike = {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (error: unknown, isFatal?: boolean) => void) => void;
    };
    const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
    if (eu?.setGlobalHandler) {
      const prev = eu.getGlobalHandler?.();
      eu.setGlobalHandler((error, isFatal) => {
        const e = error as { message?: string; stack?: string } | undefined;
        report(
          `[ネイティブ${isFatal ? "致命的" : ""}] ${String(e?.message ?? error).slice(0, 300)}`,
          e?.stack
        );
        prev?.(error, isFatal);
      });
    }
    return;
  }
  const loc = (globalThis as { location?: { hostname: string } }).location;
  // 公開ページでだけ送る（開発中のエラーでログを埋めない）
  if (!loc?.hostname.endsWith("github.io")) return;
  const win = globalThis as unknown as Window;
  win.addEventListener("error", (e) => {
    report(String(e.message ?? e.error ?? "unknown error"), e.error?.stack);
  });
  win.addEventListener("unhandledrejection", (e) => {
    const r = (e as PromiseRejectionEvent).reason as { message?: string; stack?: string } | string;
    const msg = typeof r === "string" ? r : (r?.message ?? "unhandled rejection");
    report(`unhandledrejection: ${msg}`, typeof r === "object" ? r?.stack : undefined);
  });
}

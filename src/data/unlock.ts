import { sha256 } from "js-sha256";
import { allCards, cardRegistry, cpuDeck, defaultDeck } from "@/data/cards";

/**
 * カードの開放（アンロック）とQRコードの仕組み。
 *
 * - 配布時に開いているカード以外は図鑑でブラックアウトされ、デッキにも入れられない
 * - 実物カードに印刷したQRコードを読み込むと、そのカードが開放される
 * - QRの中身は「カードID＋署名」。署名が合わないコードでは開放できない
 *   （実物のQRを撮影・共有されれば開放できてしまう簡易方式。オフラインで動く）
 */

/** 署名の種。印刷後に変えると既存のQRがすべて無効になるので変更しないこと */
const QR_SECRET = "kds-agogo-2026-himitsu-no-tane";

const QR_PREFIX = "KDSCARD:v1:";

/** カード1種類ぶんのQRコードの中身（同じ種類のカードはすべて同じコード） */
export function qrPayloadFor(cardId: string): string {
  const sig = sha256(`${QR_SECRET}:${cardId}`).slice(0, 16);
  return `${QR_PREFIX}${cardId}:${sig}`;
}

/** 読み込んだQRの中身を検証する。正しければカードIDを返し、違えば null */
export function verifyQrPayload(raw: string): string | null {
  const text = raw.trim();
  if (!text.startsWith(QR_PREFIX)) return null;
  const rest = text.slice(QR_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  const cardId = rest.slice(0, sep);
  const sig = rest.slice(sep + 1);
  if (!allCards.some((c) => c.id === cardId)) return null;
  const expected = sha256(`${QR_SECRET}:${cardId}`).slice(0, 16);
  return sig === expected ? cardId : null;
}

/**
 * 配布時に開いているカードの標準セット。
 * スタンダードデッキとチャレンジャーデッキに入っているカードは、
 * これが無いと最初の対戦ができないため必ず開けておく。
 * （全ユーザーへの変更はアプリ更新で行う。管理画面の設定は端末内の上書き）
 */
/**
 * 開放済みカードだけのカード表（ランダムデッキ生成用）。
 * 開放数が少なすぎてルールを満たすデッキが組めないときは、
 * 保険として全カードの表を返す
 */
export function registryForUnlocked(unlocked: Set<string>) {
  const entries = Object.entries(cardRegistry).filter(([id]) => unlocked.has(id));
  const defs = entries.map(([, d]) => d);
  const mains = defs.filter((d) => d.type !== "tantou").length;
  const tantous = defs.filter((d) => d.type === "tantou").length;
  if (mains < 21 || tantous < 1) return cardRegistry;
  return Object.fromEntries(entries);
}

export const DEFAULT_OPEN_CARDS: string[] = Array.from(
  new Set([
    ...defaultDeck.main,
    defaultDeck.tantou,
    ...cpuDeck.main,
    cpuDeck.tantou,
  ])
);

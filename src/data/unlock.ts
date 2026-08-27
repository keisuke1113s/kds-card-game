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

/**
 * QRの中身はできるだけ短くする（短いほどQRのマス目が減り、小さく印刷できる）。
 * 現行形式: `KC1:<カードID>:<署名8桁>` … 25〜40文字 → 25×25〜29×29マス程度
 */
const QR_PREFIX = "KC1:";
/** 初期に使っていた長い形式（互換のため読み込みだけ対応） */
const LEGACY_PREFIX = "KDSCARD:v1:";

function sigFor(cardId: string, length: number): string {
  return sha256(`${QR_SECRET}:${cardId}`).slice(0, length);
}

/** カード1種類ぶんのQRコードの中身（同じ種類のカードはすべて同じコード） */
export function qrPayloadFor(cardId: string): string {
  return `${QR_PREFIX}${cardId}:${sigFor(cardId, 8)}`;
}

/** 旧形式（テスト用） */
export function legacyQrPayloadFor(cardId: string): string {
  return `${LEGACY_PREFIX}${cardId}:${sigFor(cardId, 16)}`;
}

/** QRの検証結果 */
export type QrCheck =
  | { status: "ok"; cardId: string }
  /** 署名は本物だが、このアプリのバージョンにまだ入っていないカード */
  | { status: "unknownCard"; cardId: string }
  | { status: "invalid" };

/** 読み込んだQRの中身を検証する */
export function checkQrPayload(raw: string): QrCheck {
  const text = raw.trim();
  let sigLen: number;
  let rest: string;
  if (text.startsWith(QR_PREFIX)) {
    rest = text.slice(QR_PREFIX.length);
    sigLen = 8;
  } else if (text.startsWith(LEGACY_PREFIX)) {
    rest = text.slice(LEGACY_PREFIX.length);
    sigLen = 16;
  } else {
    return { status: "invalid" };
  }
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return { status: "invalid" };
  const cardId = rest.slice(0, sep);
  const sig = rest.slice(sep + 1);
  if (sig !== sigFor(cardId, sigLen)) return { status: "invalid" };
  if (!allCards.some((c) => c.id === cardId)) return { status: "unknownCard", cardId };
  return { status: "ok", cardId };
}

/** 正しいQRならカードIDを返し、違えば null（テスト・互換用の簡易版） */
export function verifyQrPayload(raw: string): string | null {
  const r = checkQrPayload(raw);
  return r.status === "ok" ? r.cardId : null;
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

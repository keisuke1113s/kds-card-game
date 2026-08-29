/**
 * LINE連携（任意連携で機能解放）の設定。
 *
 * 仕組み（連携コード方式・LINE Developers不要）:
 *   1. アプリの「友だち追加」ボタンで公式アカウントを追加
 *   2. Lステップの自動応答（キーワード「トレカ連携」への返信）で連携コードを配布
 *   3. アプリにコードを入力すると連携完了 → 機能解放
 *
 * 将来LINEログイン（本人確認つき）へ移行するときも、この画面と
 * ストアをそのまま入り口として使う。
 */

/** 公式アカウントの友だち追加URL（Lステップの流入経路URLに差し替える） */
export const LINE_FRIEND_URL = "https://lin.ee/xxxxxxx"; // TODO: 本物の流入経路URLに変更

/**
 * 連携コード（Lステップで配布する合言葉）。
 * 大文字小文字・前後の空白は無視して照合する。
 * 印刷物には載せず、LINEの自動応答でのみ配ること。
 */
export const LINE_LINK_CODES = ["KDS946GO"];

/** 連携ゲートを有効にするか（false にすると全機能が誰でも使える従来動作） */
export const LINE_GATE_ENABLED = false; // 安定版ではLINE連携を無効（開発版のみ有効。反映時にtrueへ）

/** コードの照合 */
export function isValidLinkCode(input: string): boolean {
  const norm = input.trim().toUpperCase().replace(/[\s-]/g, "");
  return LINE_LINK_CODES.some((c) => c.toUpperCase().replace(/[\s-]/g, "") === norm);
}

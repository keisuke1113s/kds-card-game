import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * Webの静的書き出しHTMLと初回描画のずれ（Reactのhydrationエラー #418）を防ぐための道具。
 *
 * 書き出し時（サーバー側）には window も「いまの時刻」も存在しないため、
 * URLや時刻に依存する表示を描画中に決めると、静的HTMLとブラウザの初回描画が
 * 食い違ってしまう。判定をマウント後に行えば、初回はHTMLと同じ姿で描画され、
 * その直後にブラウザ側の正しい値へ更新される。
 */

/** マウント済みか。時刻・日付・季節などブラウザでしか決まらない表示のガード用 */
export function useHydrated(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(true), []);
  return ok;
}

/** 開発版デモ（GitHub Pages の /dev/ 配下）で開いているか（マウント後に確定） */
export function useDevDemo(): boolean {
  const [dev, setDev] = useState(false);
  useEffect(() => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.location.pathname.includes("/dev/")
    ) {
      setDev(true);
    }
  }, []);
  return dev;
}

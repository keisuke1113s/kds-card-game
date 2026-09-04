import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

/**
 * 合言葉の共有リンク（https://tcg.kds946.com/join/<合言葉>）の受け口。
 * ユニバーサルリンクでアプリが開いたとき、オンライン対戦画面へ
 * 合言葉を引き継いで移動する。
 */
export default function JoinRedirect() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const c = typeof code === "string" ? code.toUpperCase() : "";
  return <Redirect href={{ pathname: "/online", params: c ? { code: c } : {} }} />;
}

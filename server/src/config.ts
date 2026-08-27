/**
 * サーバーの動作ポリシー。closed（社内・教習生限定）と open（一般公開）を
 * コードを変えずに環境変数で切り替える。
 */
export interface ServerConfig {
  /** 許可する Origin（空なら全許可＝開発用） */
  allowedOrigins: string[];
  /** closed / open */
  mode: "closed" | "open";
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config: ServerConfig = {
  allowedOrigins: parseOrigins(process.env.KDS_ALLOWED_ORIGINS),
  mode: process.env.KDS_MODE === "open" ? "open" : "closed",
};

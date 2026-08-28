import { Platform } from "react-native";

/**
 * 対戦結果を1枚の画像にして、共有（iPhoneの共有シート）または
 * ダウンロードする。Webのみ対応（キャンバスに描いてPNG化する）。
 */
export interface ResultShareData {
  won: boolean;
  myAcademic: number;
  mySkill: number;
  oppAcademic: number;
  oppSkill: number;
  deckName: string;
  oppLabel: string;
  streak: number;
  title: string | null;
}

export async function shareResultImage(data: ResultShareData): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  // 背景（勝ち: 金色がかった空 / 負け: 落ち着いた青）
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (data.won) {
    grad.addColorStop(0, "#fff7dc");
    grad.addColorStop(0.5, "#ffe9a8");
    grad.addColorStop(1, "#ffd166");
  } else {
    grad.addColorStop(0, "#e8eef7");
    grad.addColorStop(1, "#b8c6dc");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const center = W / 2;
  ctx.textAlign = "center";

  // ヘッダー
  ctx.fillStyle = "#2d1b14";
  ctx.font = "900 44px 'Hiragino Sans', sans-serif";
  ctx.fillText("KDS a GO!GO! トレーディングカードゲーム", center, 90);

  // 勝敗
  ctx.font = "900 150px 'Hiragino Sans', sans-serif";
  ctx.fillStyle = data.won ? "#d83030" : "#44586c";
  ctx.fillText(data.won ? "勝利！" : "敗北…", center, 290);
  ctx.font = "900 72px 'Hiragino Sans', sans-serif";
  ctx.fillText(data.won ? "🎉🎉🎉" : "🚗💨", center, 380);

  // スコア表
  const drawRow = (y: number, label: string, a: number, ag: number, s: number, sg: number, hl: boolean) => {
    ctx.fillStyle = hl ? "#ffffff" : "#ffffffaa";
    roundRect(ctx, 90, y - 62, W - 180, 96, 20);
    ctx.fill();
    ctx.fillStyle = "#2d1b14";
    ctx.font = "800 40px 'Hiragino Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, 130, y);
    ctx.textAlign = "right";
    ctx.font = "900 44px 'Hiragino Sans', sans-serif";
    ctx.fillText(`学科 ${a}/${ag}　技能 ${s}/${sg}`, W - 130, y);
    ctx.textAlign = "center";
  };
  drawRow(500, "あなた", data.myAcademic, 10, data.mySkill, 19, true);
  drawRow(620, data.oppLabel, data.oppAcademic, 10, data.oppSkill, 19, false);

  // デッキ・称号・連勝
  ctx.fillStyle = "#2d1b14";
  ctx.font = "700 38px 'Hiragino Sans', sans-serif";
  ctx.fillText(`使用デッキ: ${data.deckName}`, center, 730);
  let y = 800;
  if (data.title) {
    ctx.fillText(`称号: ${data.title}`, center, y);
    y += 70;
  }
  if (data.won && data.streak >= 2) {
    ctx.fillStyle = "#d83030";
    ctx.font = "900 46px 'Hiragino Sans', sans-serif";
    ctx.fillText(`🔥 ${data.streak}連勝中！`, center, y);
    y += 70;
  }

  // フッター
  ctx.fillStyle = "#2d1b14";
  ctx.font = "700 34px 'Hiragino Sans', sans-serif";
  ctx.fillText(new Date().toLocaleDateString("ja-JP"), center, 960);
  ctx.font = "800 36px 'Hiragino Sans', sans-serif";
  ctx.fillText("KDSに入校すると、本物のカードがもらえるよ♪", center, 1020);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;
  const file = new File([blob], "kds-result.png", { type: "image/png" });

  // iPhoneなどでは共有シートを開き、使えない環境ではダウンロードする
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: "KDSカードゲームの対戦結果" });
      return true;
    } catch {
      // キャンセル時などはダウンロードにフォールバックしない（そのまま終わる）
      return true;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kds-result.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

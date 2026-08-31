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

/** 免許証風プロフィールカードの画像を共有/ダウンロードする */
export interface LicenseShareData {
  name: string;
  /** 適性診断のタイプ（未診断なら空文字） */
  typeName: string;
  /** 選んだ称号（未設定なら空文字） */
  title: string;
  rankName: string;
  rankEmoji: string;
  since: string;
  wins: number;
  losses: number;
  km: number;
  gold: boolean;
  /** 自分の写真（dataURL）。あれば右側の写真枠に描く */
  photo?: string;
}

export async function shareLicenseImage(d: LicenseShareData): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const W = 1080;
  const H = 740;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  // 台紙（薄い若草色＝免許証風）
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#f2f7ec");
  grad.addColorStop(1, "#e2ecd8");
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, W, H, 36);
  ctx.fill();
  ctx.strokeStyle = "#9db48a";
  ctx.lineWidth = 6;
  roundRect(ctx, 8, 8, W - 16, H - 16, 30);
  ctx.stroke();

  // 上部の帯（免許取得＝金 / それ以外＝緑）
  ctx.fillStyle = d.gold ? "#c9a227" : "#3f7d3a";
  roundRect(ctx, 40, 40, W - 80, 90, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "900 52px 'Hiragino Sans', sans-serif";
  ctx.fillText("KDSカードゲーム 教習生免許証", W / 2, 102);

  ctx.textAlign = "left";
  const L = 80;
  ctx.fillStyle = "#1c2a1a";
  ctx.font = "900 60px 'Hiragino Sans', sans-serif";
  ctx.fillText(`氏名　${d.name || "教習生"}`, L, 225);
  // 各行は等間隔（55px）。称号・適性が無ければ行が詰まらないよう順に積む
  ctx.font = "700 38px 'Hiragino Sans', sans-serif";
  let y = 295;
  const line = (text: string, color = "#1c2a1a") => {
    ctx.fillStyle = color;
    ctx.fillText(text, L, y);
    y += 55;
  };
  line(`段階　${d.rankEmoji} ${d.rankName}`);
  line(`交付日　${d.since}`);
  line(`通算成績　${d.wins}勝 ${d.losses}敗`);
  line(`総走行距離　${d.km.toLocaleString()}km`);
  if (d.typeName) line(`適性タイプ　${d.typeName}`);
  if (d.title) line(`称号　🎖 ${d.title}`, "#7a5a00");

  // 判子（文字が枠に収まる大きさに）
  ctx.strokeStyle = "#d02020";
  ctx.lineWidth = 6;
  roundRect(ctx, W - 280, 420, 200, 116, 12);
  ctx.stroke();
  ctx.fillStyle = "#d02020";
  ctx.textAlign = "center";
  ctx.font = "900 46px 'Hiragino Sans', sans-serif";
  ctx.fillText("KDS", W - 180, 470);
  ctx.font = "900 26px 'Hiragino Sans', sans-serif";
  ctx.fillText("釧路自動車学校", W - 180, 510);

  // フッターは最下段に固定。ホームのロゴと同じ文字色で1文字ずつ描く
  ctx.font = "900 34px 'Hiragino Sans', sans-serif";
  ctx.textAlign = "left";
  const segs: { t: string; c: string }[] = [
    { t: "K", c: "#d83030" },
    { t: "D", c: "#e49c18" },
    { t: "S", c: "#78b424" },
    { t: " ", c: "#000" },
    { t: "a", c: "#e2604a" },
    { t: " G", c: "#e49c18" },
    { t: "O", c: "#3d8fd0" },
    { t: "!", c: "#d83030" },
    { t: " G", c: "#c9d63a" },
    { t: "O", c: "#8fd3ee" },
    { t: "!", c: "#eeb121" },
    { t: "　", c: "#000" },
    { t: "運転", c: "#d83030" },
    { t: "が", c: "#16283c" },
    { t: "楽しく", c: "#d83030" },
    { t: "なる", c: "#16283c" },
  ];
  const total = segs.reduce((w, seg) => w + ctx.measureText(seg.t).width, 0);
  let fx = (W - total) / 2;
  for (const seg of segs) {
    ctx.fillStyle = seg.c;
    ctx.fillText(seg.t, fx, H - 45);
    fx += ctx.measureText(seg.t).width;
  }

  // 自分の写真が登録されていれば右側の写真枠に描く（判子の上）
  if (d.photo) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = d.photo!;
      });
      const bx = W - 300;
      const by = 165;
      const bw = 220;
      const bh = 235;
      ctx.save();
      roundRect(ctx, bx, by, bw, bh, 14);
      ctx.clip();
      const sc = Math.max(bw / img.width, bh / img.height);
      ctx.drawImage(
        img,
        bx + (bw - img.width * sc) / 2,
        by + (bh - img.height * sc) / 2,
        img.width * sc,
        img.height * sc
      );
      ctx.restore();
      ctx.strokeStyle = "#9db48a";
      ctx.lineWidth = 5;
      roundRect(ctx, bx, by, bw, bh, 14);
      ctx.stroke();
    } catch {
      // 写真が読み込めなければ写真なしのまま出力する
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;
  const file = new File([blob], "kds-license.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (x: { files: File[] }) => boolean;
    share?: (x: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: "KDSカードゲーム 教習生免許証" });
      return true;
    } catch {
      return true;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kds-license.png";
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

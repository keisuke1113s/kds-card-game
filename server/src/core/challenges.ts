/**
 * 挑戦状（リベンジ予約）。
 * 対戦で負けた側が相手に「もう一度勝負」を申し込み、相手が受けると
 * 合言葉部屋のコードが共有されて対戦が始まる。
 * すべてインメモリ（24時間で消える）。個人情報は表示名だけを持つ。
 */

export interface Challenge {
  id: string;
  fromDevice: string;
  fromName: string;
  toDevice: string;
  toName: string;
  at: number;
  status: "pending" | "accepted" | "declined";
  /** 受けた側が作った部屋の合言葉（accepted のとき） */
  code?: string;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CHALLENGES = 500;
const MAX_PENDING_PER_DEVICE = 3;

function randomId(): string {
  let id = "";
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export class Challenges {
  private list: Challenge[] = [];
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  private sweep(): void {
    const cutoff = this.now() - TTL_MS;
    this.list = this.list.filter((c) => c.at > cutoff);
  }

  create(
    fromDevice: string,
    fromName: string,
    toDevice: string,
    toName: string
  ): { id: string } | { error: string } {
    this.sweep();
    if (!fromDevice || !toDevice || fromDevice === toDevice) {
      return { error: "宛先が正しくありません" };
    }
    const pending = this.list.filter(
      (c) => c.fromDevice === fromDevice && c.status === "pending"
    );
    if (pending.length >= MAX_PENDING_PER_DEVICE) {
      return { error: "返事待ちの挑戦状が多すぎます（最大3通）" };
    }
    // 同じ相手への保留中の挑戦状は1通まで
    if (pending.some((c) => c.toDevice === toDevice)) {
      return { error: "この相手にはすでに挑戦状を送っています" };
    }
    if (this.list.length >= MAX_CHALLENGES) this.list.shift();
    const c: Challenge = {
      id: randomId(),
      fromDevice: fromDevice.slice(0, 64),
      fromName: fromName.slice(0, 12) || "教習生",
      toDevice: toDevice.slice(0, 64),
      toName: toName.slice(0, 12) || "相手",
      at: this.now(),
      status: "pending",
    };
    this.list.push(c);
    return { id: c.id };
  }

  /** その端末に届いている挑戦状と、送った挑戦状の状況（端末IDは外に出さない） */
  listFor(device: string): {
    incoming: { id: string; fromName: string; at: number }[];
    sent: { id: string; toName: string; status: string; code?: string; at: number }[];
  } {
    this.sweep();
    return {
      incoming: this.list
        .filter((c) => c.toDevice === device && c.status === "pending")
        .map((c) => ({ id: c.id, fromName: c.fromName, at: c.at })),
      sent: this.list
        .filter((c) => c.fromDevice === device)
        .map((c) => ({ id: c.id, toName: c.toName, status: c.status, code: c.code, at: c.at })),
    };
  }

  /** 受ける（部屋コードを添えて）／断る */
  respond(
    id: string,
    device: string,
    accept: boolean,
    code?: string
  ): { ok: true } | { error: string } {
    this.sweep();
    const c = this.list.find((x) => x.id === id);
    if (!c || c.toDevice !== device) return { error: "その挑戦状が見つかりません" };
    if (c.status !== "pending") return { error: "この挑戦状には返事済みです" };
    if (accept) {
      const clean = String(code ?? "").toUpperCase().slice(0, 8);
      if (!clean) return { error: "部屋コードがありません" };
      c.status = "accepted";
      c.code = clean;
    } else {
      c.status = "declined";
    }
    return { ok: true };
  }

  /** 挑戦を取り下げる（送った本人のみ） */
  cancel(id: string, device: string): void {
    this.list = this.list.filter((c) => !(c.id === id && c.fromDevice === device));
  }
}

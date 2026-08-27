import { GameContext } from "@/engine/types";
import { RoomCore } from "./room";

/**
 * 部屋の管理。合言葉（部屋コード）とランダムマッチの両方を扱う。
 * すべてインメモリ（DBなし）。プロセスが落ちたら部屋も消える。
 */

/** 紛らわしい文字（0/O, 1/I/L）を除いたコード用文字 */
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 部屋コードの有効期限（相手が来ないまま放置されたとき用） */
const ROOM_TTL_MS = 10 * 60 * 1000;

interface RoomEntry {
  room: RoomCore;
  createdAt: number;
}

export class Matchmaker {
  private readonly ctx: GameContext;
  private rooms = new Map<string, RoomEntry>();
  /** ランダムマッチの待機部屋（1人入って相手待ちの部屋コード） */
  private queueRoomCode: string | null = null;
  private readonly now: () => number;

  constructor(ctx: GameContext, now: () => number = () => Date.now()) {
    this.ctx = ctx;
    this.now = now;
  }

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  /** 期限切れ・空になった部屋を掃除する */
  private sweep(): void {
    const now = this.now();
    for (const [code, entry] of this.rooms) {
      // 未開始のまま期限が切れた部屋と、対局が始まったのに全員が退室した部屋を消す
      // （作成直後の部屋は空なので、「空だから消す」だけの条件にしてはいけない）
      const expiredWaiting = !entry.room.started && now - entry.createdAt > ROOM_TTL_MS;
      const abandoned = entry.room.started && entry.room.playerCount === 0;
      if (expiredWaiting || abandoned) {
        this.rooms.delete(code);
        if (this.queueRoomCode === code) this.queueRoomCode = null;
      }
    }
  }

  /** 合言葉で部屋を作る */
  createRoom(): { code: string; room: RoomCore } {
    this.sweep();
    const code = this.newCode();
    const room = new RoomCore(this.ctx, code);
    this.rooms.set(code, { room, createdAt: this.now() });
    return { code, room };
  }

  /** 合言葉で部屋に入る */
  findRoom(code: string): RoomCore | null {
    this.sweep();
    return this.rooms.get(code.toUpperCase())?.room ?? null;
  }

  /**
   * ランダムマッチ。待っている部屋があればそこへ、無ければ新しく作って待つ。
   * 返る room に join するのは呼び出し側の責務。
   */
  joinQueue(): { code: string; room: RoomCore } {
    this.sweep();
    if (this.queueRoomCode) {
      const waiting = this.rooms.get(this.queueRoomCode);
      // 待っている人の接続が生きている部屋だけマッチさせる。
      // 待機中にタブを閉じた「幽霊」と組むと、開始直後から相手が
      // 手を打たないまま固まってしまうため
      if (
        waiting &&
        waiting.room.playerCount === 1 &&
        waiting.room.connectedCount === 1 &&
        !waiting.room.started
      ) {
        const code = this.queueRoomCode;
        this.queueRoomCode = null;
        return { code, room: waiting.room };
      }
      this.queueRoomCode = null;
    }
    const created = this.createRoom();
    this.queueRoomCode = created.code;
    return created;
  }

  get roomCount(): number {
    this.sweep();
    return this.rooms.size;
  }

  /** ランダムマッチで相手を待っている人数（0か1）。切断済みの幽霊は数えない */
  get waitingCount(): number {
    this.sweep();
    if (!this.queueRoomCode) return 0;
    const entry = this.rooms.get(this.queueRoomCode);
    if (!entry || entry.room.started) return 0;
    return entry.room.connectedCount;
  }
}

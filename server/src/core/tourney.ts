/**
 * オンライントーナメント（常設ロビー・4人制）。
 * エントリーした人が4人そろったら自動で組み合わせを抽選し、
 * 準決勝2試合 → 決勝の順に部屋を作って進行を管理する。
 * すべてインメモリ。参加はポーリング（GET /tourney）がハートビートを兼ねる。
 */

export interface TourneyRoomInfo {
  started: boolean;
  joinedDevices: string[];
  finished: boolean;
  winnerDevice: string | null;
}

/** 部屋の作成と結果の読み取り（Matchmaker への依存を注入して単体テストできるように） */
export interface TourneyRooms {
  createRoom(): { code: string };
  info(code: string): TourneyRoomInfo | null;
}

interface Entrant {
  device: string;
  name: string;
  lastSeen: number;
}

interface TMatch {
  a: Entrant;
  b: Entrant;
  code: string;
  createdAt: number;
  winner: Entrant | null;
  /** 両者不参加などで成立しなかった試合 */
  voided: boolean;
  /** 部屋が消えても結果を失わないよう、最後に見えた状態を控えておく */
  lastInfo: TourneyRoomInfo | null;
}

/** ロビーの生存確認: ポーリング（約3秒間隔）が途切れたら退出とみなす */
const HEARTBEAT_MS = 12 * 1000;
/** 試合開始の待ち時間: これを過ぎても入室しない人は不戦敗 */
const NOSHOW_MS = 90 * 1000;
/** 優勝発表を表示しておく時間（過ぎたらロビーへ戻る） */
const DONE_TTL_MS = 5 * 60 * 1000;
/** ロビーの最大人数（次回開催分まで並べる） */
const LOBBY_MAX = 12;

export interface TourneyStatus {
  phase: "waiting" | "semi" | "final" | "done";
  lobbyCount: number;
  lobbyNames: string[];
  inLobby: boolean;
  inTournament: boolean;
  bracket: {
    semis: { a: string; b: string; winner: string | null; voided: boolean }[];
    final: { a: string; b: string; winner: string | null } | null;
    champion: string | null;
    championIsYou: boolean;
  } | null;
  /** 自分が今すぐ入るべき試合の部屋コード（未終了の自分の試合） */
  yourMatchCode: string | null;
  /** 自分の試合がないとき観戦できる進行中の試合コード（参加者のみ） */
  watchCode: string | null;
}

export class Tourney {
  private lobby: Entrant[] = [];
  private current: {
    entrants: Entrant[];
    semis: [TMatch, TMatch];
    final: TMatch | null;
    champion: Entrant | null;
    doneAt: number | null;
  } | null = null;

  constructor(
    private readonly rooms: TourneyRooms,
    private readonly now: () => number = () => Date.now(),
    private readonly shuffle: (n: number) => number[] = defaultShuffle
  ) {}

  /** ロビーに入る（2回目以降は生存確認と名前の更新） */
  join(device: string, name: string): { ok: true } | { error: string } {
    if (!device) return { error: "端末IDがありません" };
    const cleanName = name.slice(0, 12) || "教習生";
    const existing = this.lobby.find((e) => e.device === device);
    if (existing) {
      existing.lastSeen = this.now();
      existing.name = cleanName;
      return { ok: true };
    }
    // すでに進行中のトーナメントに出ている人はロビーに並び直せない
    if (this.current?.entrants.some((e) => e.device === device) && !this.current.doneAt) {
      return { ok: true };
    }
    if (this.lobby.length >= LOBBY_MAX) return { error: "ロビーが満員です" };
    this.lobby.push({ device: device.slice(0, 64), name: cleanName, lastSeen: this.now() });
    this.tick();
    return { ok: true };
  }

  leave(device: string): void {
    this.lobby = this.lobby.filter((e) => e.device !== device);
  }

  /** ロビーで待っている人数（ホームの表示用） */
  lobbySize(): number {
    this.tick();
    return this.lobby.length;
  }

  /** 状況を返す。device がロビーにいれば生存時刻も更新する（ハートビート） */
  status(device: string): TourneyStatus {
    const me = this.lobby.find((e) => e.device === device);
    if (me) me.lastSeen = this.now();
    this.tick();
    const cur = this.current;
    const inTournament = !!cur && cur.entrants.some((e) => e.device === device);

    let yourMatchCode: string | null = null;
    let watchCode: string | null = null;
    if (cur && inTournament) {
      const mine = (m: TMatch | null) =>
        m && (m.a.device === device || m.b.device === device) ? m : null;
      const open = (m: TMatch | null) => m && !m.winner && !m.voided;
      const mySemi = mine(cur.semis[0]) ?? mine(cur.semis[1]);
      if (open(mySemi)) yourMatchCode = mySemi!.code;
      else if (open(mine(cur.final))) yourMatchCode = cur.final!.code;
      if (!yourMatchCode) {
        const ongoing = [cur.semis[0], cur.semis[1], cur.final].find((m) => open(m));
        watchCode = ongoing?.code ?? null;
      }
    }

    return {
      phase: !cur ? "waiting" : cur.champion ? "done" : cur.final ? "final" : "semi",
      lobbyCount: this.lobby.length,
      lobbyNames: this.lobby.map((e) => e.name),
      inLobby: !!me,
      inTournament,
      bracket: cur
        ? {
            semis: cur.semis.map((m) => ({
              a: m.a.name,
              b: m.b.name,
              winner: m.winner?.name ?? null,
              voided: m.voided,
            })),
            final: cur.final
              ? { a: cur.final.a.name, b: cur.final.b.name, winner: cur.final.winner?.name ?? null }
              : null,
            champion: cur.champion?.name ?? null,
            championIsYou: cur.champion?.device === device,
          }
        : null,
      yourMatchCode,
      watchCode,
    };
  }

  /** 進行を1歩進める（ポーリングのたびに呼ばれる） */
  private tick(): void {
    const now = this.now();
    this.lobby = this.lobby.filter((e) => now - e.lastSeen < HEARTBEAT_MS);

    // 4人そろっていて開催中でなければ開始
    if (!this.current && this.lobby.length >= 4) {
      const order = this.shuffle(4);
      const four = [0, 1, 2, 3].map((i) => this.lobby[order[i]]);
      this.lobby = this.lobby.filter((e) => !four.includes(e));
      const mk = (a: Entrant, b: Entrant): TMatch => ({
        a,
        b,
        code: this.rooms.createRoom().code,
        createdAt: now,
        winner: null,
        voided: false,
        lastInfo: null,
      });
      this.current = {
        entrants: four,
        semis: [mk(four[0], four[1]), mk(four[2], four[3])],
        final: null,
        champion: null,
        doneAt: null,
      };
    }
    const cur = this.current;
    if (!cur) return;

    this.resolve(cur.semis[0]);
    this.resolve(cur.semis[1]);

    // 準決勝が両方片づいたら決勝を作る
    const settled = (m: TMatch) => m.winner !== null || m.voided;
    if (!cur.final && !cur.champion && settled(cur.semis[0]) && settled(cur.semis[1])) {
      const advancers = [cur.semis[0].winner, cur.semis[1].winner].filter(
        (w): w is Entrant => !!w
      );
      if (advancers.length === 2) {
        cur.final = {
          a: advancers[0],
          b: advancers[1],
          code: this.rooms.createRoom().code,
          createdAt: this.now(),
          winner: null,
          voided: false,
          lastInfo: null,
        };
      } else if (advancers.length === 1) {
        // 片方の準決勝が不成立 → 残った1人がそのまま優勝
        cur.champion = advancers[0];
        cur.doneAt = this.now();
      } else {
        this.current = null; // 全員不参加
        return;
      }
    }
    if (cur.final) {
      this.resolve(cur.final);
      if (cur.final.winner) {
        cur.champion = cur.final.winner;
        cur.doneAt = this.now();
      } else if (cur.final.voided) {
        this.current = null; // 決勝不成立（優勝なし）
        return;
      }
    }
    if (cur.doneAt && this.now() - cur.doneAt > DONE_TTL_MS) this.current = null;
  }

  /** 1試合の結果を部屋から回収する（不戦勝・部屋消滅も処理） */
  private resolve(m: TMatch): void {
    if (m.winner || m.voided) return;
    const info = this.rooms.info(m.code) ?? m.lastInfo;
    if (info) m.lastInfo = info;
    if (info?.finished) {
      m.winner =
        m.a.device === info.winnerDevice
          ? m.a
          : m.b.device === info.winnerDevice
            ? m.b
            : null;
      if (!m.winner) m.voided = true;
      return;
    }
    if (!this.rooms.info(m.code) && !info?.finished) {
      // 部屋が消えたのに終局していない（両者退室など）→ 不成立
      m.voided = true;
      return;
    }
    if (info && !info.started && this.now() - m.createdAt > NOSHOW_MS) {
      // 期限までに対局が始まらない → 入室していた側の不戦勝
      const aIn = info.joinedDevices.includes(m.a.device);
      const bIn = info.joinedDevices.includes(m.b.device);
      if (aIn && !bIn) m.winner = m.a;
      else if (bIn && !aIn) m.winner = m.b;
      else m.voided = true;
    }
  }
}

function defaultShuffle(n: number): number[] {
  const a = [...Array(n).keys()];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

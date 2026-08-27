import { CardRegistry, GameAction, PlayerView, TRACK_GOALS } from "@/engine/types";

/**
 * 練習対戦で「次に何をすればいいか」を案内するヒント。
 *
 * 台本（決まった手順）ではなく、そのときの盤面から判断して出す。
 * こうしておけば、カードやAIを変えてもチュートリアルが壊れない。
 */
export interface Hint {
  /** 短い見出し（強調表示） */
  title: string;
  /** 説明（1〜2文） */
  body: string;
}

/**
 * 盤面と選べる行動から、いま出すべきヒントを1つ選ぶ。
 * 何も案内することがなければ null。
 */
export function hintFor(
  defs: CardRegistry,
  view: PlayerView,
  legal: GameAction[],
  opts: { myTurnCount: number } = { myTurnCount: 0 }
): Hint | null {
  const phase = view.phase;

  if (phase.type === "finished") {
    const won = phase.winner === view.playerId;
    return won
      ? {
          title: "おめでとうございます！",
          body: "これで基本の操作は身につきました。ホームから本番の対戦に挑戦してみましょう。",
        }
      : {
          title: "今回は負けてしまいました",
          body: "何度でも練習できます。教習を進めるか、バトルで相手を止めるか、配分を変えて試してみましょう。",
        };
  }

  if (phase.type === "mulligan") {
    const instructors = view.self.hand.filter((id) => defs[id]?.type === "instructor").length;
    if (instructors === 0) {
      return {
        title: "手札を引き直しましょう",
        body: "場に出せるインストラクターが1人もいません。「引き直す」を押して配り直してもらいましょう（1回だけできます）。",
      };
    }
    return {
      title: "はじめの手札を確認しましょう",
      body: `インストラクターが${instructors}人いるので、この手札で始めて大丈夫です。カードをタップすると内容を確認できます。`,
    };
  }

  if (phase.type === "choice") {
    if (phase.pending.player !== view.playerId) return null;
    if (phase.pending.purpose === "janken") {
      return {
        title: "じゃんけんをします",
        body: "好きな手を選んでください。勝てば良いことが起きます。",
      };
    }
    return {
      title: "カードを選びましょう",
      body: "カードをタップすると大きく表示され、効果を読んでから選べます。",
    };
  }

  if (phase.type === "battleSupport") {
    const b = phase.battle;
    if (b.priority !== view.playerId) return null;
    const iAmAttacker = b.attackerPlayer === view.playerId;
    const hasSupport = legal.some((a) => a.type === "playSupport");
    if (hasSupport) {
      return {
        title: iAmAttacker ? "サポートで押し切れます" : "サポートで守れます",
        body: "戦闘力を上げるサポートカードが使えます。使わない場合は「パス」を押してください。",
      };
    }
    return {
      title: "「パス」を押してください",
      body: "使えるサポートカードがありません。お互いがパスすると戦闘力を比べて勝負がつきます。",
    };
  }

  if (phase.type !== "main") return null;

  if (view.turnPlayer !== view.playerId) {
    // 序盤だけ、相手の番に何が起きるかを案内する（毎回出すとうるさいため）
    if (opts.myTurnCount <= 2) {
      return {
        title: "相手の番です",
        body: "CPUの動きを見てみましょう。出したカードや教習の進みは実況で流れ、上の盤面にも反映されます。",
      };
    }
    return null;
  }

  // --- 自分のメインフェイズ ---

  const canPlayInstructor = legal.some((a) => a.type === "playInstructor");
  const readyInstructors = view.self.field.filter((f) => !f.actedThisTurn && !f.rested);
  const canBattle = legal.some((a) => a.type === "declareBattle");

  // 1. まだ場にインストラクターがいない
  if (canPlayInstructor && view.self.field.length === 0) {
    return {
      title: "インストラクターを場に出しましょう",
      body: "画面いちばん下の手札から、黄色いふちのカードをタップして「場に出す」を選んでください。",
    };
  }

  // 2. 出せるうちに出しておく
  if (canPlayInstructor) {
    return {
      title: "もう1人出せます",
      body: "インストラクターは1ターンに1人だけ出せます。行動を始める前に出しておきましょう。",
    };
  }

  // 3. 行動していないインストラクターがいる
  if (readyInstructors.length > 0) {
    const remainAcademic = TRACK_GOALS.academic - view.self.academic;
    const remainSkill = TRACK_GOALS.skill - view.self.skill;
    const oppRemain = Math.max(
      0,
      Math.min(
        TRACK_GOALS.academic - view.opponent.academic,
        TRACK_GOALS.skill - view.opponent.skill
      )
    );

    // 相手が達成間近なら、バトルでじゃまをすることを教える
    if (canBattle && oppRemain <= 3) {
      return {
        title: "相手がもうすぐ達成します！",
        body: "バトルで相手の休憩中のインストラクターを場外に送れば、教習の勢いを止められます。攻めどきです。",
      };
    }
    if (canBattle && opts.myTurnCount >= 3) {
      return {
        title: "バトルもできます",
        body: "相手の休憩中（横向き）のインストラクターを場外に送れます。教習を優先するか、じゃまをするか選びましょう。",
      };
    }
    // 「なにもしない」で守る戦術は、慣れてきた4ターン目に一度だけ教える
    if (opts.myTurnCount === 4) {
      return {
        title: "「なにもしない」で守れます",
        body: "行動せず元気なまま残したインストラクターには、相手はバトルを仕掛けられません。狙われたくない人は「なにもしない」を選びましょう。",
      };
    }
    // 片方が終わっていれば、残りに集中させる
    if (remainAcademic <= 0 && remainSkill > 0) {
      return {
        title: "学科は修了！あとは技能だけ",
        body: `技能をあと${remainSkill}時限進めれば勝ちです。「技能を進める」を選びましょう。`,
      };
    }
    if (remainSkill <= 0 && remainAcademic > 0) {
      return {
        title: "技能は修了！あとは学科だけ",
        body: `学科をあと${remainAcademic}時限進めれば勝ちです。「学科を進める」を選びましょう。`,
      };
    }
    if (remainSkill > remainAcademic) {
      return {
        title: "教習を進めましょう",
        body: "場のインストラクターをタップして「技能を進める」を選んでください。技能は19時限あるので早めに進めるのがコツです。",
      };
    }
    return {
      title: "教習を進めましょう",
      body: "場のインストラクターをタップして、「技能を進める」か「学科を進める」を選んでください。",
    };
  }

  // 4. 担当カードの力が残っている
  const tantouUsable = legal.some((a) => a.type === "activateAbility" && a.uid === undefined);
  if (tantouUsable) {
    const name = defs[view.self.tantou]?.name ?? "担当カード";
    return {
      title: `担当カード「${name}」の力が使えます`,
      body: "自分の名前の右にある担当カードをタップすると、1ターンに1回だけ使える力が確認できます。",
    };
  }

  // 5. やることが終わった
  if (view.self.deckCount <= 3) {
    return {
      title: "山札が残りわずかです！",
      body: `山札はあと${view.self.deckCount}枚。自分の番のはじめに引けないと負けです。急いで教習を終わらせましょう。`,
    };
  }
  if (opts.myTurnCount <= 1) {
    return {
      title: "ターンを終わりましょう",
      body: "教習をしたカードは横向きの「休憩」になります。次の自分の番で元気に戻るので安心してください。右下の「ターン終了」を押しましょう。",
    };
  }
  return {
    title: "ターンを終わりましょう",
    body: "右下の「ターン終了」を押すと相手の番になります。",
  };
}

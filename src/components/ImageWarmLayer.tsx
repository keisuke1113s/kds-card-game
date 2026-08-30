import { Asset } from "expo-asset";
import React, { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { cardSmalls, cardThumbs } from "@/data/images";

/**
 * カード画像の常駐ウォームレイヤー（Webのみ）。
 *
 * 全カードの画像要素を画面の隅に極小サイズで置いたままにして、
 * ブラウザに「今も使われている画像」と認識させる。これにより
 * iPhoneのSafariが展開済みの画像データを捨てにくくなり、
 * カードが一瞬白く（テキスト面で）表示される現象を減らす。
 *
 * 一時オブジェクトで先読みするだけの方式（preload.ts）だと、
 * 展開後に参照が消えて早期に破棄されることがあるため、その補完。
 */
export function ImageWarmLayer() {
  // 起動直後の本来の読み込み（カード絵・画面表示）と競合しないよう少し待ってから並べる
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const uris = useMemo(() => {
    if (Platform.OS !== "web") return [];
    const out: string[] = [];
    // 対戦のカットインで使う演出背景も温めておく（初回表示のカクつき防止）
    const fxImages = [
      require("../../assets/images/fx/fx_battle.webp"),
      require("../../assets/images/fx/fx_up.webp"),
      require("../../assets/images/fx/fx_down.webp"),
      require("../../assets/images/fx/fx_victory.webp"),
      require("../../assets/images/fx/fx_reach_gold.webp"),
      require("../../assets/images/fx/fx_reach_red.webp"),
      require("../../assets/images/fx/fx_defeat.webp"),
      require("../../assets/images/fx/fx_janken.webp"),
      require("../../assets/images/kds-car.png"),
    ];
    for (const src of [...fxImages, ...Object.values(cardSmalls), ...Object.values(cardThumbs)]) {
      try {
        const uri = Asset.fromModule(src).uri;
        if (uri) out.push(uri);
      } catch {
        // URLに直せない画像は諦める（表示自体は通常の読み込みで行われる）
      }
    }
    return out;
  }, []);

  if (Platform.OS !== "web" || !ready || uris.length === 0) return null;
  return (
    <div
      aria-hidden
      style={{
        // 画面右下の1点に全カードを重ねて置く。
        // 見た目にはほぼ気づかないが「描画されている」状態を保つのがミソ
        // （display:none や画面外だと描画対象から外れ、展開データを捨てられてしまう）。
        // 極小(2px)だと縮小版しか保持されないことがあるため、実用に近い40px前後で描く
        position: "fixed",
        right: 0,
        bottom: 0,
        width: 38,
        height: 53,
        zIndex: -1,
        pointerEvents: "none",
        opacity: 0.02,
      }}
    >
      {uris.map((uri) => (
        <img
          key={uri}
          src={uri}
          alt=""
          decoding="async"
          style={{ position: "absolute", inset: 0, width: 38, height: 53 }}
        />
      ))}
    </div>
  );
}

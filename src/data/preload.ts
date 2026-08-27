import { Image } from "expo-image";
import { Asset } from "expo-asset";
import { Platform } from "react-native";
import { cardSmalls, cardThumbs } from "@/data/images";

/**
 * カード画像を先に読み込んでおく。
 *
 * 表示のたびに読み込むと、カードが一瞬「文字だけ」の状態で出てしまうため、
 * アプリの起動直後と対戦の準備中に、必要な絵をまとめて用意しておく。
 *
 * 小さい絵（150px）は数が多くても軽いので全部、
 * 拡大表示に使う絵（300px）は、その対戦で使うカードだけを読み込む。
 */

/** require された画像を、読み込みに使えるURLに直す */
function uriOf(source: number): string | null {
  try {
    const asset = Asset.fromModule(source);
    return asset.uri ?? null;
  } catch {
    return null;
  }
}

async function warm(sources: number[]): Promise<void> {
  const uris = sources.map(uriOf).filter((u): u is string => !!u);
  if (uris.length === 0) return;
  try {
    if (Platform.OS === "web") {
      // ブラウザのキャッシュに入れる。1枚でも失敗した場合に止めない
      await Promise.all(
        uris.map(
          (uri) =>
            new Promise<void>((resolve) => {
              const img = new globalThis.Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = uri;
            })
        )
      );
      return;
    }
    await Image.prefetch(uris, { cachePolicy: "disk" });
  } catch {
    // 読み込めなくても表示自体はできるので、失敗は無視する
  }
}

/** 起動直後に呼ぶ。全カードの小さい絵をそろえる */
export function preloadAllSmall(): Promise<void> {
  return warm(Object.values(cardSmalls));
}

/**
 * 起動時に全カードの拡大用の絵（300px）もそろえる。
 * 実況や拡大表示で絵が一瞬遅れて出るのを防ぐ。
 * 原寸（868px・合計6MB）は重すぎるので読み込まない。
 */
export function preloadAllThumbs(): Promise<void> {
  return warm(Object.values(cardThumbs));
}

/** 対戦で使うカードだけ、拡大表示用の絵もそろえる */
export function preloadForMatch(cardIds: string[]): Promise<void> {
  const ids = [...new Set([...cardIds, "cardback"])];
  const sources = ids
    .map((id) => cardThumbs[id])
    .filter((s): s is number => s !== undefined);
  return warm(sources);
}

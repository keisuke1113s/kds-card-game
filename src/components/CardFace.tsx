import { Asset } from "expo-asset";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { getCard } from "@/data/cards";
import { cardImages, cardSmalls, cardThumbs } from "@/data/images";
import { cardSize, CardSizeKey, colors } from "@/theme";

// 実カード画像を表示する。
// 画像の後ろには常に名前・数値のテキストを敷いておき、
// 画像が読み込めない/描画されない場合でもカードの中身が分かるようにする
// （iOS Safari は多数の画像を同時に描画するとメモリ制限で一部を描かないことがある）。

/** 表示サイズに応じた画像を選ぶ（大きさに見合う解像度だけを読み込む） */
function imageFor(key: string, size: CardSizeKey): number | undefined {
  if (size === "xl") return cardImages[key] ?? cardThumbs[key] ?? cardSmalls[key];
  if (size === "lg") return cardThumbs[key] ?? cardSmalls[key] ?? cardImages[key];
  return cardSmalls[key] ?? cardThumbs[key] ?? cardImages[key];
}

function uriOf(source: number): string | undefined {
  try {
    return Asset.fromModule(source).uri ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Web専用: 同期デコード指定の素の <img>。
 * expo-image は読み込み完了イベントを待ってから描くため、キャッシュ済みでも
 * 1〜2フレーム白く見えることがある。素の <img> ＋ decoding="sync" なら
 * 描画の瞬間に展開まで済ませるので、キャッシュ済みのカードは待ちゼロで出る
 */
function SyncImg({ source, onError }: { source: number; onError?: () => void }) {
  const uri = uriOf(source);
  if (!uri) return null;
  return React.createElement("img", {
    src: uri,
    decoding: "sync",
    loading: "eager",
    draggable: false,
    onError,
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      pointerEvents: "none",
    },
  });
}

const typeColor: Record<string, string> = {
  instructor: colors.instructor,
  support: colors.support,
  tantou: colors.tantou,
};

interface Props {
  cardId: string;
  size: CardSizeKey;
  faceDown?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

/** 画像が無い/描画されないときに見えるテキスト表示 */
function TextFace({ cardId, size }: { cardId: string; size: CardSizeKey }) {
  const def = getCard(cardId);
  const color = typeColor[def.type];
  const big = size === "lg" || size === "xl";
  return (
    <View style={[styles.textFace, { borderColor: color }]}>
      <View style={[styles.header, { backgroundColor: color }]}>
        <Text style={[styles.name, big && styles.nameBig]} numberOfLines={1}>
          {def.name}
        </Text>
      </View>
      {def.type === "instructor" && (
        <Text style={[styles.stats, big && styles.statsBig]}>
          戦{def.combat} 教{def.lesson}
        </Text>
      )}
      {big && !!def.effectText && (
        <Text style={styles.effect} numberOfLines={6}>
          {def.effectText}
        </Text>
      )}
    </View>
  );
}

/**
 * カードの見た目本体。画像の組み立てが重いので React.memo で、
 * cardId など見た目が変わるときだけ再描画する（実況や演出のたびに
 * 盤面全体のカードが作り直されるのを防ぐ＝カクつき対策の要）
 */
const CardBody = React.memo(function CardBody({
  cardId,
  size,
  faceDown,
  dimmed,
}: {
  cardId: string;
  size: CardSizeKey;
  faceDown?: boolean;
  dimmed?: boolean;
}) {
  const dims = cardSize[size];
  const [imageFailed, setImageFailed] = useState(false);

  let body: React.ReactNode;
  if (faceDown) {
    const back = imageFor("cardback", size);
    body = (
      <View style={[styles.slot, dims]}>
        <View style={[styles.textFace, styles.faceDownFallback]}>
          <Text style={styles.faceDownText}>KDS</Text>
        </View>
        {back &&
          (Platform.OS === "web" ? (
            <SyncImg source={back} />
          ) : (
            <Image source={back} style={StyleSheet.absoluteFill} contentFit="cover" />
          ))}
      </View>
    );
  } else {
    const def = getCard(cardId);
    const key = def.image ?? def.id;
    const img = imageFailed ? undefined : imageFor(key, size);
    // 拡大表示では、大きい画像の読み込み中に小さい画像を先に見せる
    const placeholder = size === "lg" || size === "xl" ? cardSmalls[key] : undefined;
    body = (
      <View style={[styles.slot, dims, dimmed && styles.dimmed]}>
        <TextFace cardId={cardId} size={size} />
        {img &&
          (Platform.OS === "web" ? (
            <>
              {/* 大きい絵の展開中は小さい絵を下に敷く（どちらも同期デコード） */}
              {placeholder !== undefined && <SyncImg source={placeholder} />}
              <SyncImg source={img} onError={() => setImageFailed(true)} />
            </>
          ) : (
            <Image
              source={img}
              placeholder={placeholder}
              placeholderContentFit="cover"
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
              priority="high"
              onError={() => setImageFailed(true)}
            />
          ))}
      </View>
    );
  }

  return <>{body}</>;
});

export function CardFace({ cardId, size, faceDown, dimmed, onPress, disabled }: Props) {
  const body = <CardBody cardId={cardId} size={size} faceDown={faceDown} dimmed={dimmed} />;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  textFace: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  faceDownFallback: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  faceDownText: { color: "#ffffff88", fontWeight: "800", fontSize: 12 },
  dimmed: { opacity: 0.45 },
  header: { paddingHorizontal: 3, paddingVertical: 2 },
  name: { color: "#fff", fontWeight: "700", fontSize: 10 },
  nameBig: { fontSize: 16 },
  stats: { fontSize: 10, fontWeight: "700", color: colors.text, padding: 3 },
  statsBig: { fontSize: 14 },
  effect: { fontSize: 11, color: colors.text, paddingHorizontal: 6, lineHeight: 16 },
});

/**
 * いまいる場所の実際の天気を取得する（対戦画面の天気演出用）。
 * 位置情報の許可がない・取得に失敗したときは釧路の天気にフォールバックする。
 * 天気は Open-Meteo（無料・キー不要）から取得し、30分キャッシュする。
 */

export type WeatherKind = "sunny" | "rain" | "snow";

const KUSHIRO = { lat: 42.98, lon: 144.38 };
const CACHE_MS = 30 * 60 * 1000;

let cached: { at: number; kind: WeatherKind } | null = null;
let inFlight: Promise<WeatherKind> | null = null;

/** Open-Meteo の weather_code を演出の3種類に丸める */
function kindFromCode(code: number): WeatherKind {
  // 71-77: 降雪, 85-86: にわか雪
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  // 51-67: 霧雨・雨, 80-82: にわか雨, 95-99: 雷雨
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  return "sunny";
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherKind | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=weather_code`
    );
    const d = (await res.json()) as { current?: { weather_code?: number } };
    const code = d.current?.weather_code;
    return typeof code === "number" ? kindFromCode(code) : null;
  } catch {
    return null;
  }
}

/** 現在地（許可がなければ釧路）を返す。5秒で見切りをつける */
function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (p: { lat: number; lon: number }) => {
      if (!done) {
        done = true;
        resolve(p);
      }
    };
    const geo = (globalThis.navigator as { geolocation?: Geolocation } | undefined)?.geolocation;
    if (!geo) {
      finish(KUSHIRO);
      return;
    }
    try {
      geo.getCurrentPosition(
        (pos) => finish({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => finish(KUSHIRO),
        { timeout: 5000, maximumAge: CACHE_MS }
      );
    } catch {
      finish(KUSHIRO);
    }
    setTimeout(() => finish(KUSHIRO), 6000);
  });
}

/** いまの天気（現在地→だめなら釧路）。失敗したら晴れ扱い */
export function currentWeather(): Promise<WeatherKind> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.kind);
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const pos = await getPosition();
    let kind = await fetchWeather(pos.lat, pos.lon);
    if (kind === null && pos !== KUSHIRO) kind = await fetchWeather(KUSHIRO.lat, KUSHIRO.lon);
    const final = kind ?? "sunny";
    cached = { at: Date.now(), kind: final };
    inFlight = null;
    return final;
  })();
  return inFlight;
}

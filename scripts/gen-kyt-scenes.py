# KYT全80場面の専用背景を生成する（fal.ai flux schnell）
import io, json, os, re, time, urllib.request
from PIL import Image

KEY = open(os.path.expanduser("~/.fal_key")).read().strip()
OUT = "/Users/keisoma/kds-card-game/assets/images/kyt/scenes"

# 2026-08-31 ユーザー承認テイスト: セルシェーディングの教本イラスト調。
# 実写化を防ぐためスタイル語を先頭に置き、末尾でも念押しする。
# 車内に人物が描かれる事故が起きたら SUF に
# "empty driver seat view, no person inside the car" を足して再生成する。
PRE = (
    "hand-drawn anime illustration, flat cel shading, clean line art, "
    "japanese driving school textbook illustration style, illustrated artwork, "
    "driver's point of view through car windshield, "
)
STYLE = (
    ", japanese road scene, no text, no letters, no signage text, wide angle, "
    "2D illustration, not a photograph"
)

P = {
 "ball": "quiet residential street daytime, a soccer ball rolling onto the road from a gap between houses on the right, a parked small truck on the left, an adult walking on the right sidewalk",
 "parked_shadow": "narrow residential street, a parked white van on the left side casting shadow, clear day",
 "genkan": "narrow street lined with concrete block walls and house entrances on both sides, daytime",
 "gakudou": "school route street with small children wearing yellow caps walking in a line on the left sidewalk, daytime",
 "jihanki": "street passing a small park with playground equipment on the right, a vending machine on the left, daytime",
 "gomi": "early morning residential street, garbage bags piled at a collection point on the left curb",
 "kyushajo": "narrow residential lane, a low house wall running along the left side, an open garage door in the wall with the nose of a small car sticking halfway out over the sidewalk, the street ahead otherwise empty",
 "takuhai": "residential street, a delivery truck parked on the right with rear door open and a hand cart beside it",
 "thank_you": "two-lane street, in the opposite lane an oncoming white sedan facing the camera has stopped, its front grille and windshield facing the viewer, leaving a gap open, intersection",
 "left_bike": "urban intersection while starting to turn left, a cyclist riding up alongside on the left side of the car, zebra crosswalk ahead",
 "yellow": "approaching an urban intersection, the traffic light directly ahead glowing amber yellow, only the middle yellow lamp lit",
 "deaigashira": "old narrow lane in a quiet traditional japanese neighborhood, a tiny crossing of two alleys ahead, weathered wooden fences and stone walls hard against both corners hiding the side alleys, an orange round convex mirror on a wooden utility pole at the corner, countryside town, cloudy soft light",
 "migi_chokushin": "urban intersection waiting to turn right, an oncoming motorcycle approaching in the distance",
 "hodou_jitensha": "city street with a zebra crosswalk ahead, on the left sidewalk one pedestrian walking slowly while pushing a bicycle at their side, dismounted, both shoes on the ground, approaching the crosswalk edge",
 "kansei": "urban intersection, the traffic light ahead glowing green, one car still crossing the intersection from the right side",
 "fumikiri": "railway level crossing ahead with yellow and black barriers, daytime",
 "night_cyclist": "dark suburban road at night, a faint cyclist without lights on the left road shoulder",
 "night_black": "night street at the edge of a shopping district, dim streetlights, a pedestrian in dark clothes barely visible on the right",
 "night_glare": "night road with glaring headlights of an oncoming car, dark shoulders",
 "night_deer": "dark mountain road at night, a pair of glowing animal eyes in the bushes on the right",
 "night_station": "night street in front of a small train station building, people standing near the curb looking down at glowing smartphones, street lamps",
 "dusk": "residential road at dusk, dim purple sky, silhouettes of pedestrians on the left",
 "snow_bridge": "snowy road approaching a small bridge, frost on the bridge surface, winter",
 "snow_wall": "snowy intersection with high snowbanks on the corners blocking the view, hokkaido winter",
 "snow_shadow": "sunny winter morning road, icy shady patch under trees ahead, hokkaido",
 "snow_stop": "snowy downhill road with an intersection at the bottom, compacted snow, hokkaido",
 "snow_bus": "snowy day street, a bus stop shelter on the left sidewalk with a person holding an umbrella tilted forward, high snowbanks, the road ahead clear",
 "snow_wiper": "blizzard on a straight road, barely visible red taillights ahead, heavy snow",
 "rain_start": "street at the beginning of rain, partly wet asphalt, people hurrying on the sidewalk",
 "rain_umbrella": "rainy morning school route street, a line of small school children holding colorful umbrellas walking on the left sidewalk, wet asphalt",
 "rain_night": "rainy night intersection, glare reflections on wet asphalt",
 "rain_hydro": "highway in heavy rain, a large puddle across the left lane ahead",
 "park_cart": "supermarket parking lot, a shopping cart between parked cars, daytime",
 "park_back": "supermarket parking lot aisle with empty spaces, concrete pillar, view slightly angled for backing",
 "park_door": "narrow parking lot aisle between rows of parked cars, one car door slightly open",
 "park_conv": "convenience store front parking area, entrance right ahead, sidewalk crossing",
 "bus_front": "city street, the rear of a route bus stopped at a bus stop ahead on the left, passengers stepping off onto the sidewalk beside it",
 "truck_left": "urban intersection with a large truck on the left lane starting to turn left",
 "truck_mirror": "directly behind a large truck on a city road, its cargo box filling the view",
 "bus_start": "directly behind a large city bus stopped at a bus stop on the left ahead, only the flat rear end of the bus visible with tail lights and rear window, orange right-turn blinker lit",
 "bike_wobble": "city street, a cyclist ahead on the left wobbling near a parked car",
 "bike_reverse": "narrow city street, a bicycle coming head-on toward the viewer on the right side of the road, the rider's face and the front wheel of the bicycle facing the camera",
 "bike_earphone": "city street, a young cyclist wearing white earphones riding a bicycle ahead in the same direction seen from behind",
 "bike_kids": "residential street, two children on small bicycles riding side by side ahead",
 "scooter_slip": "rainy street, the rear view of a small moped ahead driving away in the same direction as the viewer, rider's back visible, round metal manhole cover on the wet road",
 "sag": "highway with a traffic jam tail ahead, rows of brake lights",
 "gs_exit": "city street, a gas station with red canopy and fuel pumps on the left side, a car at the gas station exit about to pull out into the street",
 "narrow_pass": "very narrow residential street with an oncoming car, walls on both sides",
 "animal_road": "rural farm road, a tractor driving slowly ahead, fields on both sides",
 "sunset_glare": "road facing a blinding low sunset, strong backlight, silhouettes",
 "door_zone": "city street with a row of parallel parked cars on the left",
 "phone_walk": "street with a zebra crosswalk ahead, a pedestrian stepping onto the crosswalk while staring down at a smartphone, not looking at traffic",
 "silver_car": "residential road, an elderly person with a walking cart crossing slowly ahead",
 "reverse_out": "view through the rear window of a car while backing out of a home garage, looking backward over the shoulder, a sidewalk right behind the car with a cyclist riding along it, residential street beyond",
 "snow_rut": "compacted snow road with deep wheel ruts, snowbanks, hokkaido winter",
 "snow_whiteout": "near whiteout drifting snow over a road, visibility very low, hokkaido",
 "snow_cross_walker": "snowy residential road with buried sidewalks, a pedestrian walking on the roadway ahead left",
 "snow_melt": "winter evening road, wet-looking dark refrozen ice patches, dusk light",
 "snow_corner_kid": "snowy intersection near a school, high snowbank on the corner, a school bag visible behind it",
 "snow_spin_hill": "snowy uphill road, a car ahead struggling with spinning wheels, hokkaido",
 "snow_tunnel_exit": "inside a dark tunnel looking toward the bright snowy exit ahead",
 "snow_parking_lot": "icy supermarket parking lot, a pedestrian walking carefully, winter",
 "snow_wild": "winter dusk rural road in hokkaido, a deer standing at the roadside ahead",
 "snow_windshield": "driver view with snow partially covering the windshield edges, snowy street barely visible",
 "night_crosswalk": "dark crosswalk on a road with few street lamps, a person waiting to cross on the right",
 "night_truck_park": "dark night road with few street lights, the faint dark rear silhouette of an unlit parked truck on the left road shoulder ahead, no lights on the truck",
 "rain_brake": "rainy downhill road with a curve ahead, wet asphalt, guardrail",
 "rain_visor": "rainy street, a bus stop with waiting people under umbrellas on the left sidewalk, a large puddle on the road beside the bus stop, no bus",
 "kei_truck": "rural farm road, the rear of a small white japanese kei mini truck driving slowly ahead in the same direction, fields on both sides",
 "open_door_taxi": "city street with a row of taxis waiting on the left near a building entrance",
 "garbage_truck": "residential street with a garbage collection truck working ahead, workers carrying bags",
 "school_gate": "school gate area in the morning, cars parked in a row for drop-off, children between cars",
 "shopping_street": "lively local shopping street with pedestrians near shops on both sides",
 "u_turn_car": "city street, the car ahead slowing down and drifting toward the road edge",
 "green_arrow": "urban intersection, close-up of a traffic signal ahead showing a lit red circle and beneath it a green arrow pointing to the right side of the image, evening",
 "ambulance": "city street, several cars ahead slowing and pulling over to the left edge of the road leaving the center open, no emergency vehicle anywhere in the scene, daytime",
 "bridge_wind": "coastal bridge over the sea in kushiro, windsock blowing sideways, wide ocean view",
 "fog_road": "road covered in thick sea fog, very short visibility, faint silhouettes, kushiro summer morning",
 "long_drive": "long straight monotonous hokkaido highway in the afternoon, endless fields",
 "senior_driver": "supermarket parking lot, a small car with an elderly driver mark slowly backing out ahead",
}

# 手仕上げの例外（再生成すると上書きされるので注意）:
#  - reverse_out: 車庫からバックの後方視界。PREの「windshield POV」を外して生成する
#  - green_arrow: 矢印の向きは生成で制御不能→左向き矢印を生成し、ランプ円内だけPILで局所左右反転
#  - kyushajo: 鼻先だけ出す構図が出ない→承認済み旧版(e120d66)を左右反転して流用
# 日本仕様（右ハンドル・左側通行）の作り方:
# 生成AIは左ハンドル・右側通行の絵しか安定して描けないため、
# プロンプト内の left/right を入れ替えて生成し、画像を左右反転して保存する。
# P のプロンプトは「日本での正しい配置」で書くこと（変換は自動）。
def swap_lr(text):
    text = re.sub(r"\bleft\b", "\x00", text)
    text = re.sub(r"\bright\b", "left", text)
    return text.replace("\x00", "right")

# 車内に運転者の頭・体が描かれる事故の防止
ANTI = ", empty driver seat view, no person inside the car, only hands on the steering wheel visible"

failed = []
for i, (name, prompt) in enumerate(P.items()):
    out_path = os.path.join(OUT, f"{name}.webp")
    if os.path.exists(out_path):
        continue
    try:
        body = json.dumps({"prompt": PRE + swap_lr(prompt) + STYLE + ANTI, "image_size": "landscape_16_9", "num_images": 1}).encode()
        req = urllib.request.Request(
            "https://fal.run/fal-ai/flux/schnell",
            data=body,
            headers={"Authorization": "Key " + KEY, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        with urllib.request.urlopen(d["images"][0]["url"], timeout=120) as r:
            img = Image.open(io.BytesIO(r.read())).convert("RGB")
        w = 720
        h = round(img.height * w / img.width)
        img = img.resize((w, h), Image.LANCZOS)
        img = img.transpose(Image.FLIP_LEFT_RIGHT)  # 右ハンドル・左側通行化
        img.save(out_path, "WEBP", quality=80, method=6)
        print(f"[{i+1}/80] {name} ok", flush=True)
    except Exception as e:
        failed.append(name)
        print(f"[{i+1}/80] {name} 失敗: {e}", flush=True)
        time.sleep(2)

print("完了。失敗:", failed if failed else "なし")

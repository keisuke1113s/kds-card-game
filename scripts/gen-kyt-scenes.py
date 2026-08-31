# KYT全80場面の専用背景を生成する（fal.ai flux schnell）
import io, json, os, time, urllib.request
from PIL import Image

KEY = open(os.path.expanduser("~/.fal_key")).read().strip()
OUT = "/Users/keisoma/kds-card-game/assets/images/kyt/scenes"

STYLE = (
    ", driver's point of view through car windshield, japanese road scene, "
    "soft illustrated realism like driving school textbook illustration, "
    "no text, no letters, no signage text, wide angle"
)

P = {
 "ball": "quiet residential street daytime, a soccer ball rolling onto the road from a gap between houses on the right, a parked small truck on the left, an adult walking on the right sidewalk",
 "parked_shadow": "narrow residential street, a parked white van on the left side casting shadow, clear day",
 "genkan": "narrow street lined with concrete block walls and house entrances on both sides, daytime",
 "gakudou": "school route street with small children wearing yellow caps walking in a line on the left sidewalk, daytime",
 "jihanki": "street passing a small park with playground equipment on the right, a vending machine on the left, daytime",
 "gomi": "early morning residential street, garbage bags piled at a collection point on the left curb",
 "kyushajo": "residential street, the nose of a car slowly emerging from a home garage driveway on the left",
 "takuhai": "residential street, a delivery truck parked on the right with rear door open and a hand cart beside it",
 "thank_you": "urban intersection, waiting to turn right, an opposing car stopped leaving a gap, its headlights flashing",
 "left_bike": "urban intersection about to turn left, a bicycle visible on the left rear side, crosswalk ahead",
 "yellow": "approaching an urban intersection, the traffic light showing yellow",
 "deaigashira": "small residential intersection without traffic lights, concrete walls blocking the view of both sides",
 "migi_chokushin": "urban intersection waiting to turn right, an oncoming motorcycle approaching in the distance",
 "hodou_jitensha": "street with a crosswalk ahead, a person standing with a bicycle at the edge of the crosswalk",
 "kansei": "urban intersection where the light just turned green, another car still crossing from the right",
 "fumikiri": "railway level crossing ahead with yellow and black barriers, daytime",
 "night_cyclist": "dark suburban road at night, a faint cyclist without lights on the left road shoulder",
 "night_black": "night street at the edge of a shopping district, dim streetlights, a pedestrian in dark clothes barely visible on the right",
 "night_glare": "night road with glaring headlights of an oncoming car, dark shoulders",
 "night_deer": "dark mountain road at night, a pair of glowing animal eyes in the bushes on the right",
 "night_station": "night street in front of a small train station, people looking at phones near the curb",
 "dusk": "residential road at dusk, dim purple sky, silhouettes of pedestrians on the left",
 "snow_bridge": "snowy road approaching a small bridge, frost on the bridge surface, winter",
 "snow_wall": "snowy intersection with high snowbanks on the corners blocking the view, hokkaido winter",
 "snow_shadow": "sunny winter morning road, icy shady patch under trees ahead, hokkaido",
 "snow_stop": "snowy downhill road with an intersection at the bottom, compacted snow, hokkaido",
 "snow_bus": "snowy day at a bus stop on the left, a person with an umbrella standing, hokkaido",
 "snow_wiper": "blizzard on a straight road, barely visible red taillights ahead, heavy snow",
 "rain_start": "street at the beginning of rain, partly wet asphalt, people hurrying on the sidewalk",
 "rain_umbrella": "rainy school route, small children with umbrellas walking on the left sidewalk",
 "rain_night": "rainy night intersection, glare reflections on wet asphalt",
 "rain_hydro": "highway in heavy rain, a large puddle across the left lane ahead",
 "park_cart": "supermarket parking lot, a shopping cart between parked cars, daytime",
 "park_back": "supermarket parking lot aisle with empty spaces, concrete pillar, view slightly angled for backing",
 "park_door": "narrow parking lot aisle between rows of parked cars, one car door slightly open",
 "park_conv": "convenience store front parking area, entrance right ahead, sidewalk crossing",
 "bus_front": "street with a bus stopped at a bus stop ahead on the left, passengers getting off",
 "truck_left": "urban intersection with a large truck on the left lane starting to turn left",
 "truck_mirror": "directly behind a large truck on a city road, its cargo box filling the view",
 "bus_start": "a route bus at a stop ahead on the left with right blinker on, about to depart",
 "bike_wobble": "city street, a cyclist ahead on the left wobbling near a parked car",
 "bike_reverse": "city street, a bicycle riding toward the camera on the right side against traffic",
 "bike_earphone": "city street, a young cyclist with earphones riding ahead",
 "bike_kids": "residential street, two children on small bicycles riding side by side ahead",
 "scooter_slip": "rainy street, a scooter ahead near a metal manhole cover on wet asphalt",
 "sag": "highway with a traffic jam tail ahead, rows of brake lights",
 "gs_exit": "city street passing a gas station on the left, a car at its exit about to pull out",
 "narrow_pass": "very narrow residential street with an oncoming car, walls on both sides",
 "animal_road": "rural farm road, a tractor driving slowly ahead, fields on both sides",
 "sunset_glare": "road facing a blinding low sunset, strong backlight, silhouettes",
 "door_zone": "city street with a row of parallel parked cars on the left",
 "phone_walk": "crosswalk ahead with a pedestrian staring at a smartphone stepping off the curb",
 "silver_car": "residential road, an elderly person with a walking cart crossing slowly ahead",
 "reverse_out": "view from a home garage looking out to the street, sidewalk crossing in front",
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
 "night_truck_park": "dark night road, an unlit parked truck looming ahead on the left shoulder",
 "rain_brake": "rainy downhill road with a curve ahead, wet asphalt, guardrail",
 "rain_visor": "rainy street passing a bus stop with waiting people and a large puddle on the left",
 "kei_truck": "rural road following a slow japanese mini truck (kei truck) ahead",
 "open_door_taxi": "city street with a row of taxis waiting on the left near a building entrance",
 "garbage_truck": "residential street with a garbage collection truck working ahead, workers carrying bags",
 "school_gate": "school gate area in the morning, cars parked in a row for drop-off, children between cars",
 "shopping_street": "lively local shopping street with pedestrians near shops on both sides",
 "u_turn_car": "city street, the car ahead slowing down and drifting toward the road edge",
 "green_arrow": "urban intersection with a traffic light showing a green right arrow",
 "ambulance": "urban intersection with an ambulance with flashing red lights approaching from behind traffic",
 "bridge_wind": "coastal bridge over the sea in kushiro, windsock blowing sideways, wide ocean view",
 "fog_road": "road covered in thick sea fog, very short visibility, faint silhouettes, kushiro summer morning",
 "long_drive": "long straight monotonous hokkaido highway in the afternoon, endless fields",
 "senior_driver": "supermarket parking lot, a small car with an elderly driver mark slowly backing out ahead",
}

failed = []
for i, (name, prompt) in enumerate(P.items()):
    out_path = os.path.join(OUT, f"{name}.webp")
    if os.path.exists(out_path):
        continue
    try:
        body = json.dumps({"prompt": prompt + STYLE, "image_size": "landscape_16_9", "num_images": 1}).encode()
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
        img.save(out_path, "WEBP", quality=80, method=6)
        print(f"[{i+1}/80] {name} ok", flush=True)
    except Exception as e:
        failed.append(name)
        print(f"[{i+1}/80] {name} 失敗: {e}", flush=True)
        time.sleep(2)

print("完了。失敗:", failed if failed else "なし")

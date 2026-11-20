"""Progress layer for the browser demo (game only, like crops.py): coins, levels, building beds and more
greenhouses, upgrades, items, achievements, problems and roadblocks.

- Scaling out is real: every greenhouse is its own copy of plc/greenhouse.st (one Demo each), unchanged.
- Upgrades that are PLC functions (shade net, pad-and-fan, fogging, light-sum watering) are in the program
  from the start; until the hardware is bought their set points are parked where they never act.
- Problems and roadblocks are hidden faults in one greenhouse; the visitor diagnoses them on the
  equipment's panel. A roadblock must be solved before a big build goes through.
"""
from __future__ import annotations

import json
import random

from . import tags
from .crops import CROPS, ZONE_M2
from .webdemo import TICKS_PER_MIN, WEB_FAULTS, Demo

PRICE = {"kangkung": 0.6, "lettuce": 0.8, "tomato": 1.5, "chili": 4.0, "cucumber": 1.0, "strawberry": 4.0,
         "melon": 2.5}                                  # coins per kg
# heat-tolerant crops first: lettuce and strawberry need a cool house, which a tropical one is not
# crop tree: crop -> (level, parent crop to harvest first, upgrade it needs, row, column in the tree view)
CROP_TREE = {
    "kangkung": (1, None, None, 0, 1),
    "chili": (1, "kangkung", None, 1, 0), "cucumber": (2, "kangkung", "solar", 1, 1),
    "lettuce": (3, "kangkung", "cool", 1, 2),
    "tomato": (2, "chili", None, 2, 0), "melon": (3, "cucumber", None, 2, 1),
    "strawberry": (4, "lettuce", "fog", 2, 2),
}
LEVELS = (0, 1200, 4000, 10000, 20000)                  # xp (= kg harvested) to reach level 1, 2, ...
HOUSE_NAMES = ("GH-1", "GH-2", "GH-3")
START_BEDS = 2
BED_COST = {2: 800, 3: 2000}                            # bed 3 and bed 4, times the greenhouse number
BED_LEVEL = {2: 1, 3: 2}
HOUSE_COST = {1: 6000, 2: 15000}
HOUSE_LEVEL = {1: 3, 2: 4}
ROADBLOCKS = {                                          # build id -> (house, fault, what the farmer says)
    "bed:0:3": (0, "p201_trip", "The irrigation pump in GH-1 keeps stopping. Bed 4 would need it even more."),
    "house:1": (0, "stock_a_empty", "The crops in GH-1 look hungry. Fix the feed before we copy this house."),
    "house:2": (1, "vent_stuck", "GH-2 is cooking. Find out why before we build GH-3."),
}

# id, title, what it does, cost, level, set points parked while it is NOT installed
UPGRADES = (
    ("solar", "Light-sum watering", "A sun sensor: water when the light has added up, not on a timer.", 400, 1,
     {"SP_RAD_SUM": 300}),
    ("net", "Shade net", "A net rolls over the roof in strong sun.", 900, 1, {"SP_SCREEN_RAD": 1000}),
    ("film", "Clear cover film", "More light through the roof: crops grow faster.", 1500, 2, {}),
    ("cool", "Pad-and-fan cooling", "Wet pads and exhaust fans cool the air on hot afternoons.", 2500, 2,
     {"SP_COOL_T": 40}),
    ("fog", "Fogging", "A fine mist raises the humidity when the air is dry.", 2000, 3, {"SP_VPD_FOG": 2.5}),
    ("robot", "Harvest robot", "Harvests ripe beds on its own.", 3000, 3, {}),
    ("cold", "Cold room", "Produce keeps fresh and sells for 20 % more.", 4000, 3, {}),
)
UP = {u[0]: u for u in UPGRADES}
# upgrade tree: what must be owned (a tool) or installed (an upgrade) first; tools are the roots
UP_AFTER = {"solar": ("multimeter",), "net": ("ladder",), "film": ("net",), "cool": ("net", "wrench"),
            "fog": ("cool",), "robot": ("solar",), "cold": ("cool",)}
UP_POS = {"multimeter": (0, 0), "ladder": (0, 1), "wrench": (0, 2), "solar": (1, 0), "net": (1, 1),
          "robot": (2, 0), "film": (2, 1), "cool": (2, 2), "fog": (3, 1), "cold": (3, 2)}
FILM = (0.62, 0.75)                                     # cover transmissivity before and after the upgrade
# id, title, what it does, cost, simulated minutes (0 = instant)
ITEMS = (
    ("tea", "Compost tea", "Heals every crop by 30 health.", 200, 0),
    ("lamp", "Grow lamps", "Crops grow at night and on dull days, for 6 hours.", 300, 360),
    ("bees", "Bee hive", "25 % more kg from every harvest, for a day.", 400, 1440),
    ("market", "Market day", "Produce sells for 50 % more, for 12 hours.", 500, 720),
)
IT = {i[0]: i for i in ITEMS}

# where a fault is diagnosed: the panel of the equipment it belongs to
GROUPS = {
    "water": ("p201_trip", "burst_pipe", "blocked_line", "xv301_passing", "ft201_reads_high"),
    "beds": ("z3_clogged", "z4_leak", "z2_partly_clogged"),
    "feed": ("stock_a_empty", "acid_empty", "stock_a_weak", "ec_reads_high", "ph_b_drift"),
    "climate": ("vent_stuck", "f602_trip", "pad_sump_low", "tt501_break", "tt501_reads_low", "st101_break",
                "rain_wire_break"),
}
# random problems by level: the first ones show in the field, the late ones only in the numbers
PROBLEMS = {1: ("p201_trip", "burst_pipe", "stock_a_empty", "acid_empty", "z3_clogged"),
            2: ("blocked_line", "z4_leak", "vent_stuck", "xv301_passing", "rain_wire_break"),
            3: ("st101_break", "tt501_break", "z2_partly_clogged", "f602_trip", "pad_sump_low", "stock_a_weak"),
            4: ("ec_reads_high", "tt501_reads_low", "ft201_reads_high", "ph_b_drift")}
PROBLEM_BED = {"z2_partly_clogged": 1, "z3_clogged": 2, "z4_leak": 3}
PROBLEM_CHANCE = 0.3                                    # per simulated daylight hour, once the tutorial is past
PROBLEM_REWARD = 150                                    # paid when you repair it yourself
CALLOUT_FEE = 100                                       # a wrong diagnosis: the technician comes and fixes it
TECH_FEE = 250                                          # or hire the technician to repair a fault you found

# market: tools are bought once, parts are used up by a repair or a build
TOOLS = (("wrench", "Pipe wrench", "Pipes, valves and the vent drive.", 300),
         ("multimeter", "Multimeter", "Motors, sensors and cables.", 500),
         ("ladder", "Ladder", "Anything on the roof.", 400))
PARTS = (("pipe_kit", "Pipe kit", "Fittings, seals and a strainer screen.", 120),
         ("drippers", "Dripper kit", "New drippers for one bed.", 80),
         ("fertilizer", "Fertilizer sack", "Refills or remixes stock tank A.", 100),
         ("acid", "Acid can", "Refills the acid tank.", 60),
         ("cal_kit", "Calibration kit", "Standard solutions for the EC and pH probes.", 90),
         ("cable", "Sensor cable", "A new cable run for one sensor.", 70),
         ("neem", "Neem oil", "Sprays one pest outbreak.", 50))
TL, PT = {t[0]: t for t in TOOLS}, {t[0]: t for t in PARTS}
FIX = {                                                 # fault -> (tools, parts) to repair it
    "p201_trip": (("multimeter",), ()), "f602_trip": (("multimeter",), ()),
    "ft201_reads_high": (("multimeter",), ()), "tt501_reads_low": (("multimeter",), ()),
    "burst_pipe": (("wrench",), ("pipe_kit",)), "blocked_line": (("wrench",), ("pipe_kit",)),
    "xv301_passing": (("wrench",), ("pipe_kit",)), "pad_sump_low": (("wrench",), ("pipe_kit",)),
    "z2_partly_clogged": ((), ("drippers",)), "z3_clogged": ((), ("drippers",)), "z4_leak": ((), ("drippers",)),
    "stock_a_empty": ((), ("fertilizer",)), "stock_a_weak": ((), ("fertilizer",)), "acid_empty": ((), ("acid",)),
    "ec_reads_high": ((), ("cal_kit",)), "ph_b_drift": ((), ("cal_kit",)),
    "vent_stuck": (("wrench", "ladder"), ()),
    "st101_break": (("multimeter",), ("cable",)), "tt501_break": (("multimeter",), ("cable",)),
    "rain_wire_break": (("multimeter",), ("cable",)),
}
NEEDS = {                                               # what a build takes besides coins
    "up:solar": (("multimeter",), ("cable",)), "up:net": (("ladder",), ()), "up:film": (("ladder",), ()),
    "up:cool": (("wrench",), ("pipe_kit",)), "up:fog": (("wrench",), ("pipe_kit",)),
    "up:robot": (("multimeter",), ()), "up:cold": (("wrench",), ()),
    "bed": ((), ("drippers",)), "house": (("wrench", "ladder"), ()),
}
STARTER = (("wrench",), {"drippers": 1, "fertilizer": 1})
# id, slot, title, cost: outfit, paint and path are worn one at a time; decor can be switched on and off
COSMETICS = (
    ("outfit:farmer", "outfit", "Farmer outfit", 0), ("outfit:mechanic", "outfit", "Mechanic overalls", 600),
    ("outfit:pajama", "outfit", "Pajamas", 400),
    ("paint:white", "paint", "White frame", 0), ("paint:green", "paint", "Forest green frame", 500),
    ("paint:red", "paint", "Barn red frame", 500), ("paint:blue", "paint", "Sky blue frame", 500),
    ("path:gravel", "path", "Concrete path", 0), ("path:brick", "path", "Brick path", 400),
    ("path:planks", "path", "Wooden boardwalk", 400),
    ("decor:flowers", "decor", "Flower border", 300), ("decor:scarecrow", "decor", "Scarecrow", 350),
    ("decor:lanterns", "decor", "Night lanterns", 450), ("decor:flag", "decor", "Farm flag", 250),
)
CO = {c[0]: c for c in COSMETICS}

# dynamic days: the weather, the market, buyers, pests and birds
WEATHER_ODDS = (("clear", 0.45), ("cloudy", 0.30), ("rain", 0.17), ("storm", 0.08))
HEATWAVE = (0.25, 4.0)                                   # chance on a clear day, degC added outside
MARKET_UP, MARKET_DOWN = 1.8, 0.6                       # today's price for the crop in demand / in glut
ORDER_CHANCE, ORDER_DAYS = 0.5, 3
PEST_CHANCE, BIRD_CHANCE = 0.12, 0.35                   # per simulated daylight hour
BIRD_BITE = 15.0                                        # health a flock takes from a ripe fruit bed
FRUIT = ("tomato", "chili", "cucumber", "melon", "strawberry")
ACH_BONUS = 100
ACHIEVEMENTS = (
    ("first_harvest", "First harvest", "Harvest a ripe bed."),
    ("regular", "Market regular", "Harvest 10 times."),
    ("tonne", "One tonne", "Harvest 1,000 kg in total."),
    ("ten_tonnes", "Ten tonnes", "Harvest 10,000 kg in total."),
    ("catalogue", "Full catalogue", "Harvest every crop at least once."),
    ("perfect", "Picture perfect", "Harvest a bed at 95 % health or better."),
    ("weathered", "Weathered", "Harvest while it rains or storms."),
    ("full_house", "Full house", "Open all four beds in a greenhouse."),
    ("scale_out", "Scaled out", "Build a second greenhouse: the same PLC program, copied."),
    ("estate", "Estate", "Run three greenhouses."),
    ("engineer", "Engineer", "Install every upgrade."),
    ("detective", "Detective", "Diagnose a fault correctly."),
    ("sharp_eye", "Sharp eye", "Diagnose a fault without inspecting."),
    ("tuner", "Tuner", "Change a set point yourself."),
    ("night_shift", "Night shift", "Skip a night."),
    ("lesson", "Lesson learned", "Lose a crop. It happens."),
    ("handy", "Handy", "Repair something with your own tools."),
    ("stylish", "Stylish", "Buy a cosmetic from the market."),
    ("trader", "Trader", "Fill a buyer's order."),
    ("pest_control", "Pest control", "Spray a pest outbreak."),
)
ACH_IDS = [a[0] for a in ACHIEVEMENTS]


def level_of(xp: float) -> int:
    return sum(1 for t in LEVELS if xp >= t)


def needs_of(item: str):
    return NEEDS.get(item) or NEEDS.get(item.split(":")[0]) or ((), ())


def sp_default(name: str) -> float:
    _mw, raw, scale = tags.SP[name]
    return raw / scale


class Farm:
    def __init__(self, clock="07:00", save: dict | None = None, seed=None):
        self.seed = seed
        self.rng = random.Random(seed)
        self.coins, self.xp, self.kg, self.harvests, self.lost = 0.0, 0.0, 0.0, 0, 0
        self.ach: list[str] = []
        self.cleared: list[str] = []                     # roadblocks already passed
        self.crops_done: list[str] = []
        self.upgrades: list[str] = []
        self.items = {i: 0 for i in IT}
        self.boosts: dict[str, int] = {}                 # item -> tick (of GH-1) it runs out
        self.trouble = None                              # the one hidden fault running: problem / roadblock / practice
        self.problems_on = True
        self.tools: list[str] = list(STARTER[0])
        self.parts = {k: STARTER[1].get(k, 0) for k in PT}
        self.owned = [c[0] for c in COSMETICS if c[3] == 0]
        self.style = {"outfit": "farmer", "paint": "white", "path": "gravel", "decor": []}
        self.repairs: list[dict] = []                    # faults found but not fixed yet
        self.today = {"weather": "clear", "heat": False, "hot": None, "glut": None}
        self.order = None                                # a buyer's order: crop, kg, got, due day, bonus
        self.events: list[dict] = []
        if save:
            self._load(save)
        else:
            self.houses = [Demo(clock, seed=seed, beds=(("kangkung", 0),))]
            self.open_beds = [START_BEDS]
        for h in self.houses:
            self._hardware(h)
            self._sky(h)
        self._lost_seen = self._lost_total()
        self._open = set(self.crops_open())
        self._day = self.houses[0].b.plant.day
        self._hour = self.houses[0].b.plant.clock_min // 60

    # ------------------------------------------------------------------ hardware
    def _hardware(self, house: Demo):
        """Park the set points of hardware not bought yet; restore the rest; then the crop recipe."""
        house.park = {n: v for u in UPGRADES if u[0] not in self.upgrades for n, v in u[5].items()}
        for u in UPGRADES:
            for n in u[5]:
                if n not in house.park:
                    house.b.setpoint(n, sp_default(n))
        house.b.plant.cfg.transmissivity = FILM["film" in self.upgrades]
        house.apply_recipe()

    def _sky(self, h: Demo):
        """One sky over the farm: today's weather and heatwave."""
        h.b.plant.weather.scenario = self.today["weather"]
        h.b.plant.weather.heat = HEATWAVE[1] if self.today["heat"] else 0.0

    # ------------------------------------------------------------------ simulation
    def run(self, n: int):
        lamp = 0.6 if "lamp" in self.boosts else 0.0
        for h in self.houses:
            h.light_floor = lamp
            h.run(n)
        t = self.houses[0].ticks
        for k, until in list(self.boosts.items()):
            if t >= until:
                del self.boosts[k]
                self.events.append({"type": "boost_end", "item": k})
        lost = self._lost_total()
        if lost > self._lost_seen:
            self.lost += lost - self._lost_seen
            self._lost_seen = lost
            self.events.append({"type": "lost"})
            self._award("lesson")
        if t // TICKS_PER_MIN != (t - n) // TICKS_PER_MIN:          # once per simulated minute
            if "robot" in self.upgrades:
                for hi, h in enumerate(self.houses):
                    for z, bed in enumerate(h.beds):
                        if bed.stage == "ripe":
                            r = self._harvest(hi, z)
                            self.events.append({"type": "auto_harvest", "house": hi, "zone": z, **r})
        day = self.houses[0].b.plant.day
        if day != self._day:                                            # a new day: weather, market, buyers
            self._day = day
            self._new_day()
        hour = self.houses[0].b.plant.clock_min // 60
        if hour != self._hour:                                          # a new hour has started
            self._hour = hour
            self._maybe_problem()
            self._maybe_critters()

    def _new_day(self):
        r = self.rng
        x, sc = r.random(), "clear"
        for name, odds in WEATHER_ODDS:
            if x < odds:
                sc = name
                break
            x -= odds
        heat = sc == "clear" and r.random() < HEATWAVE[0]
        for h in self.houses:
            w = h.b.plant.weather
            w.scenario, w.heat = sc, HEATWAVE[1] if heat else 0.0
            w.override.clear()
        opens = self.crops_open()
        hot = r.choice(opens)
        glut = r.choice([c for c in opens if c != hot]) if len(opens) > 1 else None
        self.today = {"weather": sc, "heat": heat, "hot": hot, "glut": glut}
        if self.order and self._day > self.order["due"]:
            self.events.append({"type": "order_failed", **self.order})
            self.order = None
        new_order = None
        if not self.order and self.harvests >= 1 and r.random() < ORDER_CHANCE:
            crop = r.choice(opens)
            kg = round(CROPS[crop]["variants"][0][2] * ZONE_M2 * r.choice((1, 1.5, 2)) / 50) * 50
            new_order = self.order = {"crop": crop, "kg": kg, "got": 0, "due": self._day + ORDER_DAYS,
                                      "bonus": round(kg * PRICE[crop] * 0.6 + 200, -1)}
        self.events.append({"type": "new_day", "day": self._day + 1, **self.today, "order": new_order})

    def _maybe_critters(self):
        p = self.houses[0].b.plant
        if self.harvests < 1 or not 7 * 60 <= p.clock_min < 17 * 60:
            return
        beds = [(hi, z, b) for hi, h in enumerate(self.houses) for z, b in enumerate(h.beds) if b.crop and b.health > 0]
        pests = [x for x in beds if not x[2].pest and x[2].stage != "ripe"]
        if pests and self.rng.random() < PEST_CHANCE:
            hi, z, b = self.rng.choice(pests)
            b.pest = True
            self.events.append({"type": "pest", "house": hi, "zone": z, "crop": b.crop})
        fruit = [x for x in beds if x[2].stage == "ripe" and x[2].crop in FRUIT]
        if fruit and self.rng.random() < BIRD_CHANCE:
            hi, z, b = self.rng.choice(fruit)
            if "decor:scarecrow" in self.style["decor"]:
                self.events.append({"type": "birds_scared", "house": hi, "zone": z})
            else:
                b.health = max(1.0, b.health - BIRD_BITE)
                self.events.append({"type": "birds", "house": hi, "zone": z, "crop": b.crop})

    def spray(self, hi: int, z: int):
        bed = self.houses[hi].beds[z]
        if not bed.pest:
            raise ValueError("no pests on that bed")
        if self.parts["neem"] < 1:
            raise ValueError("needs Neem oil")
        self.parts["neem"] -= 1
        bed.pest = False
        self._award("pest_control")
        self.events.append({"type": "sprayed", "house": hi, "zone": z})

    def _lost_total(self):
        return sum(h.lost for h in self.houses)

    def _maybe_problem(self):
        p = self.houses[0].b.plant
        if not self.problems_on or self.trouble or self.repairs or self.harvests < 1 or not 7 * 60 <= p.clock_min < 17 * 60:
            return
        if self.rng.random() >= PROBLEM_CHANCE:
            return
        hi = self.rng.randrange(len(self.houses))
        h = self.houses[hi]
        pool = [f for lv in range(1, self.level + 1) for f in PROBLEMS.get(lv, ())
                if (f not in PROBLEM_BED or h.beds[PROBLEM_BED[f]].crop)
                and (f not in ("f602_trip", "pad_sump_low") or "cool" in self.upgrades)]
        if pool:
            self.start_trouble(hi, self.rng.choice(pool), "problem")

    def start_trouble(self, hi: int, fault: str, kind: str, item=None, title=None):
        self.houses[hi]._challenge("start", fault)
        self.trouble = {"house": hi, "kind": kind, "item": item, "title": title}
        self.events.append({"type": kind, "house": hi, "item": item, "title": title})

    @property
    def level(self) -> int:
        return level_of(self.xp)

    def _award(self, ach: str):
        if ach not in self.ach:
            self.ach.append(ach)
            self.coins += ACH_BONUS
            self.events.append({"type": "achievement", "id": ach})

    def price_mult(self, crop=None) -> float:
        news = MARKET_UP if crop and crop == self.today["hot"] else MARKET_DOWN if crop and crop == self.today["glut"] else 1.0
        return (1.2 if "cold" in self.upgrades else 1.0) * (1.5 if "market" in self.boosts else 1.0) * news

    def _harvest(self, hi: int, z: int) -> dict:
        h = self.houses[hi]
        bed = h.beds[z]
        crop, health, ripe = bed.crop, bed.health, bed.stage == "ripe"
        look = json.loads(h.state())["weather"]["look"] if ripe else ""
        kg = h.beds[z].harvest()
        if ripe:
            h.harvested_kg += kg
            h.harvests += 1
        h.apply_recipe()
        if kg <= 0:
            return {"kg": 0}
        kg *= 1.25 if "bees" in self.boosts else 1.0
        coins = kg * PRICE[crop] * self.price_mult(crop)
        self._gain(kg, coins, crop, health, look)
        o = self.order
        if o and o["crop"] == crop:
            o["got"] = round(o["got"] + kg)
            if o["got"] >= o["kg"]:
                self.coins += o["bonus"]
                self.order = None
                self.events.append({"type": "order_done", **o})
                self._award("trader")
        return {"kg": round(kg), "coins": round(coins), "crop": crop}

    def _gain(self, kg, coins, crop, health, look):
        before = self.level
        self.kg += kg
        self.xp += kg
        self.coins += coins
        self.harvests += 1
        if crop not in self.crops_done:
            self.crops_done.append(crop)
        self._award("first_harvest")
        for n, a in ((self.harvests >= 10, "regular"), (self.kg >= 1000, "tonne"), (self.kg >= 10000, "ten_tonnes"),
                     (len(self.crops_done) == len(CROPS), "catalogue"), (health >= 95, "perfect"),
                     (look in ("rain", "storm"), "weathered")):
            if n:
                self._award(a)
        if self.level > before:
            self.events.append({"type": "level", "level": self.level})
        self._check_unlocks()

    # ------------------------------------------------------------------ the crop tree
    def crop_lock(self, crop: str) -> str:
        """Why a crop is still locked ('' when it is open)."""
        lv, parent, up, *_ = CROP_TREE[crop]
        if parent and parent not in self.crops_done:
            return f"harvest {CROPS[parent]['name'].lower()} first"
        if up and up not in self.upgrades:
            return f"needs {UP[up][1].lower()}"
        if self.level < lv:
            return f"needs level {lv}"
        return ""

    def crops_open(self) -> list[str]:
        return [c for c in CROP_TREE if not self.crop_lock(c)]

    def _check_unlocks(self):
        now = set(self.crops_open())
        new = [c for c in CROP_TREE if c in now - self._open]
        self._open = now
        if new:
            self.events.append({"type": "unlock", "crops": new})

    # ------------------------------------------------------------------ building, upgrades, items
    def shop(self) -> list[dict]:
        """What can be built next: the next bed in each greenhouse, then the next greenhouse."""
        items = []
        for h, n in enumerate(self.open_beds):
            if n < 4:
                items.append({"id": f"bed:{h}:{n}", "title": f"{HOUSE_NAMES[h]} bed {n + 1}",
                              "cost": BED_COST[n] * (h + 1), "level": BED_LEVEL[n]})
        n = len(self.houses)
        if n < len(HOUSE_NAMES):
            items.append({"id": f"house:{n}", "title": f"Greenhouse {HOUSE_NAMES[n]}",
                          "cost": HOUSE_COST[n], "level": HOUSE_LEVEL[n]})
        for u in UPGRADES:
            if u[0] not in self.upgrades:
                items.append({"id": f"up:{u[0]}", "title": u[1], "cost": u[3], "level": u[4],
                              "after": UP_AFTER.get(u[0], ())})
        for it in items:
            tools, parts = needs_of(it["id"])
            it["roadblock"] = it["id"] in ROADBLOCKS and it["id"] not in self.cleared
            it["tools"], it["parts"], it["missing"] = tools, parts, self.missing((tools, parts))
            it["locked_by"] = [a for a in it.get("after", ()) if a in UP and a not in self.upgrades]
            it["ok"] = (self.coins >= it["cost"] and self.level >= it["level"] and not self.trouble
                        and not it["missing"] and not it["locked_by"])
        return items

    def missing(self, need) -> list[str]:
        tools, parts = need
        return [t for t in tools if t not in self.tools] + [x for x in parts if self.parts.get(x, 0) < 1]

    def build(self, item: str):
        it = next((i for i in self.shop() if i["id"] == item), None)
        if it is None:
            raise ValueError(f"cannot build {item!r} now")
        if self.trouble:
            raise ValueError("sort out the problem on the farm first")
        if it["locked_by"]:
            raise ValueError("build " + " and ".join(UP[a][1] for a in it["locked_by"]) + " first")
        if self.level < it["level"]:
            raise ValueError(f"needs level {it['level']}")
        if self.coins < it["cost"]:
            raise ValueError(f"needs {it['cost']} coins")
        if it["missing"]:
            raise ValueError("needs " + ", ".join(self._name(x) for x in it["missing"]))
        if it["roadblock"]:
            hi, fault, why = ROADBLOCKS[item]
            self.start_trouble(hi, fault, "roadblock", item, it["title"])
            self.events[-1]["why"] = why
            return {"roadblock": True, "house": hi}
        self._finish(it)
        return {"built": item}

    def _name(self, x):
        return (TL.get(x) or PT.get(x))[1]

    def _finish(self, it):
        self.coins -= it["cost"]
        for x in needs_of(it["id"])[1]:
            self.parts[x] -= 1
        kind, *rest = it["id"].split(":")
        ev = {"type": "built", "item": it["id"], "title": it["title"]}
        if kind == "bed":
            h, z = int(rest[0]), self.open_beds[int(rest[0])]
            self.open_beds[h] += 1
            ev.update(house=h, zone=z)
            if self.open_beds[h] == 4:
                self._award("full_house")
        elif kind == "house":
            clock = self.houses[0].b.plant.clock_min
            h = Demo(f"{clock // 60:02d}:{clock % 60:02d}", seed=self.seed, beds=())
            self._sky(h)
            self._hardware(h)
            self.houses.append(h)
            self.open_beds.append(START_BEDS)
            ev["house"] = len(self.houses) - 1
            self._award("scale_out")
            if len(self.houses) == 3:
                self._award("estate")
        else:
            self.upgrades.append(rest[0])
            for h in self.houses:
                self._hardware(h)
            if len(self.upgrades) == len(UPGRADES):
                self._award("engineer")
            self._check_unlocks()
        self.events.append(ev)

    def buy(self, item: str):
        spec = IT.get(item) or TL.get(item) or PT.get(item)
        if spec is None:
            raise ValueError(item)
        if item in TL and item in self.tools:
            raise ValueError("you already have one")
        if self.coins < spec[3]:
            raise ValueError(f"needs {spec[3]} coins")
        self.coins -= spec[3]
        if item in IT:
            self.items[item] += 1
        elif item in TL:
            self.tools.append(item)
        else:
            self.parts[item] += 1

    def cosmetic(self, cid: str):
        """Buy a cosmetic the first time, then wear it (or switch a decoration on and off)."""
        if cid not in CO:
            raise ValueError(cid)
        _, slot, _title, cost = CO[cid]
        if cid not in self.owned:
            if self.coins < cost:
                raise ValueError(f"needs {cost} coins")
            self.coins -= cost
            self.owned.append(cid)
            self._award("stylish")
        if slot == "decor":
            d = self.style["decor"]
            if cid in d:
                d.remove(cid)
            else:
                d.append(cid)
        else:
            self.style[slot] = cid.split(":")[1]

    def repair(self, hi: int, fault: str, hire: bool):
        rep = next((r for r in self.repairs if r["house"] == hi and r["fault"] == fault), None)
        if rep is None:
            raise ValueError("nothing to repair there")
        if hire:
            if self.coins < TECH_FEE:
                raise ValueError(f"the technician wants {TECH_FEE} coins")
            self.coins -= TECH_FEE
        else:
            miss = self.missing(FIX[fault])
            if miss:
                raise ValueError("needs " + ", ".join(self._name(x) for x in miss))
            for x in FIX[fault][1]:
                self.parts[x] -= 1
            self._award("handy")
            if rep["kind"] == "problem":
                self.coins += PROBLEM_REWARD
        self.repairs.remove(rep)
        self.houses[hi].b.fault(fault, False)
        self.events.append({"type": "repaired", "house": hi, "fault": fault, "hired": hire, "kind": rep["kind"]})
        if rep["kind"] == "roadblock":
            self.cleared.append(rep["item"])
            it = next((i for i in self.shop() if i["id"] == rep["item"]), None)
            if it and it["ok"]:
                self._finish(it)

    def use(self, item: str):
        if self.items.get(item, 0) < 1:
            raise ValueError("none left: buy one first")
        self.items[item] -= 1
        mins = IT[item][4]
        if item == "tea":
            for h in self.houses:
                for b in h.beds:
                    if b.crop and b.health > 0:
                        b.health = min(100.0, b.health + 30.0)
        else:
            self.boosts[item] = max(self.boosts.get(item, 0), self.houses[0].ticks) + mins * TICKS_PER_MIN
        self.events.append({"type": "used", "item": item})

    # ------------------------------------------------------------------ visitor actions
    def command(self, msg: str) -> str:
        m = json.loads(msg)
        try:
            out = self._command(m)
            return json.dumps({"ok": True, **(out or {})})
        except (KeyError, ValueError, TypeError, IndexError) as e:
            return json.dumps({"ok": False, "error": str(e)})

    def _call(self, house, m):
        r = json.loads(house.command(json.dumps(m)))
        if not r.pop("ok"):
            raise ValueError(r["error"])
        return r

    def _command(self, m):
        c = m["cmd"]
        if c == "build":
            return self.build(m["item"])
        if c == "buy":
            return self.buy(m["item"])
        if c == "use":
            return self.use(m["item"])
        if c == "cosmetic":
            return self.cosmetic(m["id"])
        if c == "spray":
            return self.spray(int(m["house"]), int(m["zone"]))
        if c == "repair":
            return self.repair(int(m["house"]), m["fault"], bool(m.get("hire")))
        if c == "problems":
            self.problems_on = bool(m["on"])
            return None
        if c in ("weather", "skip_night"):              # one sky and one clock over the whole farm
            for h in self.houses:
                r = self._call(h, m)
            if c == "skip_night":
                self._award("night_shift")
            return r
        hi = int(m.get("house", 0))
        if not 0 <= hi < len(self.houses):
            raise ValueError("no such greenhouse")
        house = self.houses[hi]
        if c == "plant":
            z, crop = int(m["zone"]), m["crop"]
            if z >= self.open_beds[hi]:
                raise ValueError("this bed is not built yet")
            if crop not in CROP_TREE:
                raise ValueError(f"unknown crop {crop!r}")
            why = self.crop_lock(crop)
            if why:
                raise ValueError(f"{CROPS[crop]['name']} is locked: {why}")
        if c == "harvest":
            return self._harvest(hi, int(m["zone"]))
        if c == "setpoint" and m["name"] not in house.park:
            self._award("tuner")
        if c == "challenge":
            return self._challenge(hi, m)
        return self._call(house, m)

    def _challenge(self, hi, m):
        a = m["action"]
        if a == "start":                                 # practice: a random fault, nothing at stake
            if self.trouble:
                raise ValueError("a problem is already running")
            self.start_trouble(hi, self.rng.choice(WEB_FAULTS), "practice")
            return None
        if not self.trouble:
            raise ValueError("nothing to diagnose right now")
        tr = self.trouble
        r = self._call(self.houses[tr["house"]], {**m, "house": tr["house"]})
        if "result" not in r:
            return r
        self.trouble = None
        res = r["result"]
        if res["correct"]:
            self._award("detective")
            if not res["hints"]:
                self._award("sharp_eye")
        fault = self.houses[tr["house"]].challenge_fault
        ev = {"type": tr["kind"] + ("_solved" if res["correct"] else "_failed"), "house": tr["house"],
              "item": tr["item"], "title": tr["title"], "fault": res["title"]}
        if res["correct"]:                               # found it: it stays broken until it is repaired
            self.houses[tr["house"]].b.fault(fault, True)
            self.repairs.append({"house": tr["house"], "fault": fault, "kind": tr["kind"], "item": tr["item"]})
            ev["needs"] = self.missing(FIX[fault])
        elif tr["kind"] == "problem":
            self.coins = max(0.0, self.coins - CALLOUT_FEE)
        self.events.append(ev)
        return r

    # ------------------------------------------------------------------ snapshot
    def state(self) -> str:
        houses = []
        for hi, h in enumerate(self.houses):
            s = json.loads(h.state())
            for i, z in enumerate(s["zones"]):
                z["locked"] = i >= self.open_beds[hi]
            s["parked"] = sorted(h.park)
            houses.append(s)
        lv, h0, t = self.level, houses[0], self.houses[0].ticks
        out = {
            "clock": h0["clock"], "clock_min": h0["clock_min"], "day": h0["day"], "sim_s": h0["sim_s"],
            "weather": h0["weather"], "houses": houses,
            "farm": {
                "coins": round(self.coins), "xp": round(self.xp), "level": lv,
                "level_from": LEVELS[lv - 1], "level_to": LEVELS[lv] if lv < len(LEVELS) else None,
                "kg": round(self.kg), "harvests": self.harvests, "lost": self.lost,
                "beds": self.open_beds, "shop": self.shop(), "upgrades": self.upgrades,
                "items": self.items, "boosts": {k: (u - t) // TICKS_PER_MIN for k, u in self.boosts.items()},
                "crops": self.crops_open(), "crop_locks": {c: self.crop_lock(c) for c in CROP_TREE},
                "crops_done": self.crops_done, "today": self.today, "order": self.order,
                "prices_now": {c: round(PRICE[c] * self.price_mult(c), 2) for c in CROP_TREE},
                "ach": self.ach, "trouble": self.trouble, "problems_on": self.problems_on,
                "tools": self.tools, "parts": self.parts, "owned": self.owned, "style": self.style,
                "repairs": [{**r, "tools": FIX[r["fault"]][0], "parts": FIX[r["fault"]][1],
                             "missing": self.missing(FIX[r["fault"]])} for r in self.repairs],
                "events": self.events,
            },
        }
        self.events = []
        return json.dumps(out, default=str)

    # ------------------------------------------------------------------ save / load (kept by the page)
    def save(self) -> str:
        return json.dumps({
            "v": 2, "coins": self.coins, "xp": self.xp, "kg": self.kg, "harvests": self.harvests,
            "lost": self.lost, "ach": self.ach, "cleared": self.cleared, "crops_done": self.crops_done,
            "upgrades": self.upgrades, "items": self.items, "problems_on": self.problems_on,
            "tools": self.tools, "parts": self.parts, "owned": self.owned, "style": self.style,
            "repairs": self.repairs, "order": self.order, "today": self.today,
            "clock": self.houses[0].b.plant.clock_min, "open_beds": self.open_beds,
            "beds": [[{"crop": b.crop, "variant": b.variant, "days": b.days, "health": b.health, "pest": b.pest}
                      for b in h.beds] for h in self.houses],
        })

    def _load(self, d: dict):
        if d.get("v") not in (1, 2):
            raise ValueError("unknown save version")
        self.coins, self.xp, self.kg = float(d["coins"]), float(d["xp"]), float(d["kg"])
        self.harvests, self.lost = int(d["harvests"]), int(d["lost"])
        self.ach = [a for a in d["ach"] if a in ACH_IDS]
        self.cleared = [c for c in d["cleared"] if c in ROADBLOCKS]
        self.crops_done = [c for c in d["crops_done"] if c in CROPS]
        self.upgrades = [u for u in d.get("upgrades", []) if u in UP]
        self.items.update({k: max(0, int(v)) for k, v in d.get("items", {}).items() if k in IT})
        self.problems_on = bool(d.get("problems_on", True))
        o = d.get("order")
        if isinstance(o, dict) and o.get("crop") in CROPS:
            self.order = {"crop": o["crop"], "kg": int(o["kg"]), "got": int(o["got"]), "due": int(o["due"]),
                          "bonus": int(o["bonus"])}
        t = d.get("today")
        if isinstance(t, dict) and t.get("weather") in ("clear", "cloudy", "rain", "storm"):
            self.today = {"weather": t["weather"], "heat": bool(t.get("heat")),
                          "hot": t.get("hot") if t.get("hot") in CROPS else None,
                          "glut": t.get("glut") if t.get("glut") in CROPS else None}
        if "tools" in d:
            self.tools = [t for t in d["tools"] if t in TL]
            self.parts.update({k: max(0, int(v)) for k, v in d["parts"].items() if k in PT})
            self.owned = sorted(set(self.owned) | {c for c in d["owned"] if c in CO})
            st = d["style"]
            for slot in ("outfit", "paint", "path"):
                if f"{slot}:{st.get(slot)}" in self.owned:
                    self.style[slot] = st[slot]
            self.style["decor"] = [c for c in st.get("decor", []) if c in self.owned and c.startswith("decor:")]
        n = max(1, min(len(HOUSE_NAMES), len(d["beds"])))
        self.open_beds = [max(START_BEDS, min(4, int(x))) for x in d["open_beds"][:n]]
        clock = int(d["clock"]) % 1440
        self.houses = []
        for beds in d["beds"][:n]:
            h = Demo(f"{clock // 60:02d}:{clock % 60:02d}", seed=self.seed, beds=())
            for bed, sb in zip(h.beds, beds):
                if sb["crop"] in CROPS:
                    bed.plant(sb["crop"], int(sb["variant"]))
                    bed.days, bed.health = float(sb["days"]), max(0.0, min(100.0, float(sb["health"])))
                    bed.pest = bool(sb.get("pest", False))
            self.houses.append(h)
        for r in d.get("repairs", []):                   # a found fault is still broken after a reload
            if r.get("fault") in FIX and 0 <= int(r.get("house", -1)) < n:
                self.repairs.append({"house": int(r["house"]), "fault": r["fault"],
                                     "kind": r.get("kind", "problem"), "item": r.get("item")})
                self.houses[int(r["house"])].b.fault(r["fault"], True)


def meta() -> str:
    from .webdemo import meta as demo_meta
    m = json.loads(demo_meta())
    m.update({"prices": PRICE, "levels": LEVELS, "house_names": HOUSE_NAMES,
              "crop_tree": [{"id": c, "level": v[0], "after": v[1], "up": v[2], "row": v[3], "col": v[4]}
                            for c, v in CROP_TREE.items()],
              "up_tree": [{"id": k, "row": r, "col": c, "after": UP_AFTER.get(k, ()), "tool": k in TL}
                          for k, (r, c) in UP_POS.items()],
              "achievements": [{"id": i, "title": t, "desc": d} for i, t, d in ACHIEVEMENTS],
              "upgrades": [{"id": u[0], "title": u[1], "desc": u[2], "cost": u[3], "level": u[4],
                            "parks": sorted(u[5])} for u in UPGRADES],
              "items": [{"id": i[0], "title": i[1], "desc": i[2], "cost": i[3], "minutes": i[4]} for i in ITEMS],
              "groups": GROUPS, "ach_bonus": ACH_BONUS, "problem_reward": PROBLEM_REWARD,
              "callout_fee": CALLOUT_FEE, "tech_fee": TECH_FEE, "fix": FIX,
              "tools": [{"id": t[0], "title": t[1], "desc": t[2], "cost": t[3]} for t in TOOLS],
              "parts": [{"id": t[0], "title": t[1], "desc": t[2], "cost": t[3]} for t in PARTS],
              "cosmetics": [{"id": c[0], "slot": c[1], "title": c[2], "cost": c[3]} for c in COSMETICS], "bed_costs": BED_COST, "house_costs": HOUSE_COST,
              "house_levels": HOUSE_LEVEL})
    return json.dumps(m)

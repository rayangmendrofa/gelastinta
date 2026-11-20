"""Crop catalogue and growth layer for the browser demo (a game layer, not part of the tested plant model).

Each crop has a recipe (what the PLC should hold for it) and a comfort range (what it tolerates).
Growth integrates per simulated minute: light x the worst of temperature, root-zone EC/pH and water.
Crop clock: one simulated minute of full daylight in ideal conditions = one growing day.
"""
from __future__ import annotations

from dataclasses import dataclass, field

GROW_DAYS_PER_MIN = 1.0      # shortcut: accelerated crop clock so a visitor sees a harvest; real crops take weeks

# crop: name, colour, recipe (ec, ph, shot L, vent C, cool C, rh max %), comfort (t_min, t_lo, t_hi, t_max,
#       ec_lo, ec_hi), variants (name, days to harvest, kg/m2, heat tolerance C)
CROPS = {
    "tomato": dict(name="Tomato", colour="#d8432f", recipe=(3.0, 5.8, 60, 26.0, 30.0, 85.0),
                   comfort=(10, 20, 28, 35, 2.4, 3.6),
                   variants=[("Cherry", 70, 3.0, 1.0), ("Beefsteak", 90, 4.5, 0.0)]),
    "chili": dict(name="Chili", colour="#b5201c", recipe=(2.4, 6.0, 45, 28.0, 32.0, 85.0),
                  comfort=(15, 22, 30, 37, 1.8, 3.0),
                  variants=[("Cayenne", 80, 1.5, 0.0), ("Bird's eye", 95, 1.2, 2.0)]),
    "lettuce": dict(name="Lettuce", colour="#7cc242", recipe=(1.4, 6.0, 25, 24.0, 27.0, 85.0),
                    comfort=(5, 16, 24, 30, 0.9, 2.0),
                    variants=[("Butterhead", 35, 3.0, 0.0), ("Romaine", 45, 3.5, 1.0)]),
    "cucumber": dict(name="Cucumber", colour="#3f8f3a", recipe=(2.2, 5.8, 70, 27.0, 31.0, 88.0),
                     comfort=(12, 22, 30, 36, 1.6, 2.8),
                     variants=[("Mini", 45, 5.0, 0.0), ("English", 60, 7.0, 0.0)]),
    "melon": dict(name="Melon", colour="#e6b43c", recipe=(2.5, 6.0, 55, 29.0, 33.0, 80.0),
                  comfort=(15, 25, 32, 38, 1.8, 3.2),
                  variants=[("Rock melon", 75, 3.0, 0.0), ("Golden", 85, 3.5, 1.0)]),
    "kangkung": dict(name="Water spinach", colour="#4fb06a", recipe=(1.6, 6.2, 40, 30.0, 34.0, 90.0),
                     comfort=(18, 26, 34, 40, 1.0, 2.4),
                     variants=[("Kangkung", 25, 2.5, 0.0)]),
    "strawberry": dict(name="Strawberry", colour="#e0405e", recipe=(1.5, 5.8, 30, 22.0, 26.0, 80.0),
                       comfort=(5, 15, 24, 30, 1.0, 2.0),
                       variants=[("Day-neutral", 60, 2.0, 0.0)]),
}
ZONE_M2 = 250.0
STAGES = ("seedling", "growing", "flowering", "ripe")
PEST_DAMAGE = 0.4            # health per simulated minute


def _ramp(x, lo0, lo1, hi1, hi0):
    """1 between lo1 and hi1, falling linearly to 0 at lo0 and hi0."""
    if x <= lo0 or x >= hi0:
        return 0.0
    if x < lo1:
        return (x - lo0) / (lo1 - lo0)
    if x > hi1:
        return (hi0 - x) / (hi0 - hi1)
    return 1.0


@dataclass
class Bed:
    crop: str | None = None
    variant: int = 0
    days: float = 0.0            # growing days accumulated
    health: float = 100.0
    stress: dict = field(default_factory=dict)
    last_ec: float | None = None  # EC of the last water this zone received
    last_ph: float | None = None
    pest: bool = False           # an outbreak eats health until it is sprayed

    @property
    def spec(self):
        return CROPS[self.crop] if self.crop else None

    @property
    def target_days(self) -> float:
        return self.spec["variants"][self.variant][1]

    @property
    def maturity(self) -> float:
        return min(100.0, 100.0 * self.days / self.target_days) if self.crop else 0.0

    @property
    def stage(self) -> str:
        if not self.crop:
            return "empty"
        if self.health <= 0:
            return "dead"
        m = self.maturity
        return STAGES[0 if m < 15 else 1 if m < 55 else 2 if m < 100 else 3]

    def plant(self, crop: str, variant: int = 0):
        if crop not in CROPS or not 0 <= variant < len(CROPS[crop]["variants"]):
            raise ValueError(f"unknown crop {crop!r}/{variant}")
        self.__init__(crop, variant)

    def harvest(self) -> float:
        """kg harvested (0 if not ripe); the bed is cleared."""
        kg = 0.0
        if self.stage == "ripe":
            kg = self.spec["variants"][self.variant][2] * ZONE_M2 * self.health / 100.0
        self.__init__()
        return kg

    def step_minute(self, t_in, rad_in, deficit_l, light_floor=0.0):
        """Advance one simulated minute with the conditions the crop actually saw."""
        if not self.crop or self.health <= 0 or self.stage == "ripe":
            return
        if self.pest:
            self.health = max(0.0, self.health - PEST_DAMAGE)
        t_min, t_lo, t_hi, t_max, ec_lo, ec_hi = self.spec["comfort"]
        heat_tol = self.spec["variants"][self.variant][3]
        f_t = _ramp(t_in, t_min, t_lo, t_hi + heat_tol, t_max + heat_tol)
        f_ec = 1.0 if self.last_ec is None else _ramp(self.last_ec, ec_lo - 1.0, ec_lo, ec_hi, ec_hi + 1.0)
        f_ph = 1.0 if self.last_ph is None else _ramp(self.last_ph, 4.6, 5.4, 6.6, 7.4)
        f_w = _ramp(deficit_l, -1.0, 0.0, 60.0, 220.0)
        f_light = max(light_floor, min(1.0, rad_in / 300.0))
        worst = min(f_t, f_ec, f_ph, f_w)
        self.stress = {k: round(v, 2) for k, v in (("heat" if t_in > t_hi else "cold", f_t), ("ec", f_ec),
                                                     ("ph", f_ph), ("water", f_w)) if v < 0.8}
        self.days += GROW_DAYS_PER_MIN * f_light * worst
        if worst < 0.3:
            self.health = max(0.0, self.health - 2.0 * (0.3 - worst) / 0.3)
        elif self.health < 100:
            self.health = min(100.0, self.health + 0.05)


def house_recipe(beds: list[Bed]) -> dict | None:
    """Set points for the whole house: the mean of the planted crops' recipes (one dosing line, one
    climate) and each zone's own shot size."""
    live = [b for b in beds if b.crop and b.health > 0]
    if not live:
        return None
    mean = lambda i: sum(b.spec["recipe"][i] for b in live) / len(live)  # noqa: E731
    vent = round(mean(3), 1)
    sp = {"SP_EC": round(mean(0), 2), "SP_PH": round(mean(1), 2), "SP_VENT_T": vent,
          "SP_COOL_T": max(round(mean(4), 1), vent + 1.0), "SP_RH_MAX": round(mean(5), 1)}
    for i, b in enumerate(beds):
        sp[f"SP_SHOT_Z{i + 1}"] = b.spec["recipe"][2] if b.crop else 10
    sp["SP_ZONE_EN"] = sum(1 << i for i, b in enumerate(beds) if b.crop and b.health > 0)
    return sp

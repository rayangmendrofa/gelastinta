"""Animals for the browser demo (a game layer, like crops.py): a chicken coop, a goat pen and a fish pond.

Each pen has a feed level, a cleanliness level and a health level, stepped once per simulated minute on
the same accelerated clock as the crops. Fed, clean, healthy animals produce; heat (the outside air from
the weather model) halves it. Manure turns into compost tea for the crops.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

# pen: title, animal, capacity, build cost, level, tools, parts, map plot
PENS = {
    "coop": ("Chicken coop", "chicken", 8, 1500, 2, ("wrench",), ("lumber",), "coop"),
    "pigs": ("Pig sty", "pig", 4, 2000, 2, ("wrench",), ("lumber",), "coop"),
    "barn": ("Cow barn", "cow", 4, 4000, 3, ("wrench", "ladder"), ("lumber",), "barn"),
    "pasture": ("Sheep meadow", "sheep", 6, 3000, 3, ("wrench",), ("lumber",), "pasture"),
    "pond": ("Fish pond", "fish", 30, 2500, 3, ("wrench",), ("pipe_kit",), "pond"),
    "orchard": ("Mango grove", "tree", 6, 2500, 4, (), ("drippers",), "orchard"),
}
# animal: price each, feed part, medicine part, product, units per animal per simulated hour, coins per unit,
#         kg per unit, outside temperature above which production halves, manure per hour
ANIMALS = {
    "chicken": dict(name="Chicken", price=150, feed="grain", medicine="vet_kit", product="egg", per_h=1.0, sell=25,
                    kg=0.06, heat=32.0, manure=0.1),
    "pig": dict(name="Pig", price=500, feed="grain", medicine="vet_kit", product="truffle", per_h=0.25, sell=220,
                kg=0.1, heat=30.0, manure=0.5),
    "cow": dict(name="Cow", price=1200, feed="hay", medicine="vet_kit", product="milk", per_h=2.0, sell=40, kg=1.0,
                heat=30.0, manure=0.6),
    "sheep": dict(name="Sheep", price=700, feed="hay", medicine="vet_kit", product="wool", per_h=0.5, sell=90, kg=0.5,
                  heat=33.0, manure=0.3),
    "fish": dict(name="Catfish", price=20, feed="pellets", medicine="vet_kit", product="fish", per_h=0.0, sell=50.0,
                 kg=0.8, heat=99.0, manure=0.0),
    "tree": dict(name="Mango tree", price=400, feed="fertilizer", medicine="neem", product="mango", per_h=0.8, sell=30,
                 kg=0.3, heat=99.0, manure=0.0),
}
FISH_GROW_H = 6.0                # simulated hours of feeding until the pond can be harvested
FEED_PER_H, DIRT_PER_H, WATER_PER_H = 25.0, 15.0, 10.0
SICK_CHANCE_PER_H = 0.05         # while the pen is dirty
STOCK_HOURS = 3.0                # produce waiting to be collected stops piling up after this
MANURE_PER_TEA = 5.0


@dataclass
class Pen:
    n: int = 0                   # animals
    feed: float = 100.0
    clean: float = 100.0         # for the pond: water quality
    health: float = 100.0
    sick: bool = False
    stock: float = 0.0           # eggs or litres waiting; for the pond: hours grown
    manure: float = 0.0


class Ranch:
    def __init__(self, rng):
        self.rng = rng
        self.pens: dict[str, Pen] = {}
        self.collected = {a["product"]: 0 for a in ANIMALS.values()}
        self.events: list[dict] = []

    def animal(self, pid):
        return ANIMALS[PENS[pid][1]]

    def build(self, pid):
        self.pens[pid] = Pen()

    def minute(self, t_out: float):
        """Advance every pen one simulated minute."""
        for pid, p in self.pens.items():
            if p.n == 0:
                continue
            a = self.animal(pid)
            p.feed = max(0.0, p.feed - FEED_PER_H / 60)
            p.clean = max(0.0, p.clean - (WATER_PER_H if pid == "pond" else DIRT_PER_H) / 60)
            hungry, dirty = p.feed <= 15, p.clean <= 25
            if hungry or dirty or p.sick:
                p.health = max(0.0, p.health - (3.0 + 2.0 * p.sick) / 60)
            else:
                p.health = min(100.0, p.health + 1.0 / 60)
            if dirty and not p.sick and self.rng.random() < SICK_CHANCE_PER_H / 60:
                p.sick = True
                self.events.append({"type": "animal_sick", "pen": pid})
            if p.health <= 0:
                p.n -= 1
                p.health = 50.0
                self.events.append({"type": "animal_lost", "pen": pid, "animal": a["name"]})
                continue
            if hungry or p.sick:
                continue
            rate = (0.5 if t_out > a["heat"] else 1.0) * p.health / 100
            if pid == "pond":
                p.stock = min(FISH_GROW_H, p.stock + rate / 60)
            else:
                p.stock = min(p.n * a["per_h"] * STOCK_HOURS, p.stock + p.n * a["per_h"] * rate / 60)
                p.manure += p.n * a["manure"] / 60

    def ready(self, pid) -> bool:
        p = self.pens[pid]
        return p.n > 0 and p.stock >= (FISH_GROW_H if pid == "pond" else 1)

    def state(self) -> dict:
        return {pid: {**asdict(p), "ready": self.ready(pid), "cap": PENS[pid][2]} for pid, p in self.pens.items()}

    def save(self) -> dict:
        return {"pens": {pid: asdict(p) for pid, p in self.pens.items()}, "collected": self.collected}

    def load(self, d: dict):
        for pid, p in d.get("pens", {}).items():
            if pid in PENS:
                pen = Pen(**{k: v for k, v in p.items() if k in Pen.__dataclass_fields__})
                pen.n = max(0, min(PENS[pid][2], int(pen.n)))
                self.pens[pid] = pen
        self.collected.update({k: int(v) for k, v in d.get("collected", {}).items() if k in self.collected})

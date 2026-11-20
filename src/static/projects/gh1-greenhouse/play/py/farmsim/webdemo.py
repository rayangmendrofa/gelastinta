"""Browser demo glue (runs in Pyodide in a web worker): the real PLC program (plc/greenhouse.st in the
ST interpreter) wired to the plant model through the test bench, plus the crop game layer.

The worker calls ``Demo.run(n)`` to advance n PLC scans (50 ms each), ``Demo.state()`` for a JSON
snapshot, and ``Demo.command(json)`` for visitor actions.
"""
from __future__ import annotations

import json
import random

from . import tags
from .bench import ST_FILE, Bench
from .crops import CROPS, Bed, house_recipe
from .faults import FAULT_INFO
from .plant import FIELD_CHECKS
from .stvm import STMachine
from .weather import SCENARIOS

# faults offered on the page: the ones a visitor can see the effect of within a few minutes
WEB_FAULTS = ("p201_trip", "z3_clogged", "z4_leak", "burst_pipe", "blocked_line", "stock_a_empty", "acid_empty",
              "ph_b_drift", "vent_stuck", "f602_trip", "pad_sump_low", "st101_break", "tt501_break",
              "rain_wire_break", "ec_reads_high", "tt501_reads_low", "ft201_reads_high", "z2_partly_clogged",
              "stock_a_weak", "xv301_passing")
DEFAULT_BEDS = (("tomato", 0), ("cucumber", 0), ("lettuce", 0), ("chili", 0))
TICKS_PER_MIN = 1200          # 50 ms scans


class Demo:
    def __init__(self, clock="07:00", scenario="clear", seed=None, beds=DEFAULT_BEDS):
        self.b = Bench(vm=STMachine(ST_FILE.read_text(encoding="utf-8"), strict=False), clock=clock,
                       scenario=scenario)
        self.beds = [Bed() for _ in range(4)]
        for bed, (crop, var) in zip(self.beds, beds):
            bed.plant(crop, var)
        self.harvested_kg, self.harvests, self.lost = 0.0, 0, 0
        self.ticks = 0
        self.rng = random.Random(seed)
        self.challenge, self.result = None, None
        self.park = {}                  # set point -> value held while its hardware is not installed
        self.light_floor = 0.0          # grow lamps: light the crops get even in the dark
        self.apply_recipe()
        self.b.run(2.0)                 # analog filters settle, then clear the power-up alarms
        self.b.hmi("reset")
        self.b.run(0.5)

    # ------------------------------------------------------------------ simulation
    def run(self, n: int):
        b, p = self.b, self.b.plant
        for _ in range(n):
            b.tick()
            self.ticks += 1
            if self.ticks % 20 == 0:                 # once per simulated second
                for i, bed in enumerate(self.beds):
                    if p.q_zone[i] > 0.05:
                        bed.last_ec, bed.last_ph = p.ec_true, p.ph_true
            if self.ticks % TICKS_PER_MIN == 0:
                rad_in = p.wx.rad * p.cfg.transmissivity * (1 - p.cfg.net_shading * p.net_pos / 100.0)
                for i, bed in enumerate(self.beds):
                    alive = bed.health > 0
                    bed.step_minute(p.t_in, rad_in, p.deficit[i], light_floor=self.light_floor)
                    if alive and bed.crop and bed.health <= 0:
                        self.lost += 1
                        self.apply_recipe()

    def apply_recipe(self):
        sp = house_recipe(self.beds) or {"SP_ZONE_EN": 0}
        sp.update(self.park)
        for name, v in sp.items():
            self.b.setpoint(name, v)

    # ------------------------------------------------------------------ visitor actions
    def command(self, msg: str) -> str:
        m = json.loads(msg)
        try:
            out = self._command(m) or {}
            return json.dumps({"ok": True, **out})
        except (KeyError, ValueError, TypeError) as e:
            return json.dumps({"ok": False, "error": str(e)})

    def _command(self, m):
        c, b = m["cmd"], self.b
        if c == "plant":
            self.beds[int(m["zone"])].plant(m["crop"], int(m.get("variant", 0)))
            self.apply_recipe()
        elif c == "harvest":
            bed = self.beds[int(m["zone"])]
            ripe = bed.stage == "ripe"
            kg = bed.harvest()
            if ripe:
                self.harvested_kg += kg
                self.harvests += 1
            self.apply_recipe()
            return {"kg": round(kg)}
        elif c == "hmi":
            if m["name"] not in tags.CMD_BITS:
                raise ValueError(m["name"])
            b.hmi(m["name"])
        elif c == "setpoint":
            tags.SP[m["name"]]                       # KeyError for an unknown name
            if m["name"] in self.park:
                raise ValueError("that hardware is not installed yet")
            b.setpoint(m["name"], float(m["value"]))
        elif c == "recipe":
            self.apply_recipe()
        elif c == "weather":
            # the model's rain and storm come only in the afternoon; a visitor gets them now
            look = m["scenario"]
            if look not in SCENARIOS:
                raise ValueError(look)
            b.plant.weather.scenario = look if look in ("clear", "cloudy") else "cloudy"
            b.weather(rain=True if look in ("rain", "storm") else None, wind=18.0 if look == "storm" else None)
        elif c == "skip_night":
            self.skip_night()
        elif c == "fault":
            if self.challenge:
                raise ValueError("faults are locked during the challenge")
            if m["name"] not in WEB_FAULTS:
                raise ValueError(m["name"])
            b.fault(m["name"], bool(m["on"]))
        elif c == "clear_faults":
            if not self.challenge:
                b.plant.faults.clear()
        elif c == "challenge":
            # a visitor's challenge is always random; a forced fault comes only from the progress layer
            return self._challenge(m["action"], None if m["action"] == "start" else m.get("fault"))
        else:
            raise ValueError(f"unknown command {c!r}")

    def skip_night(self):
        """Jump to 05:50 the next morning, through midnight so the PLC's daily counters roll over."""
        p = self.b.plant
        if p.clock_min >= 5 * 60 + 50:
            p.set_clock("23:59")
            self.run(2 * TICKS_PER_MIN)           # past midnight: daily rollover in the PLC
        p.set_clock("05:50")
        self.run(2)                               # the PLC publishes the clock it read last scan

    def _challenge(self, action, fault):
        b = self.b
        if action == "start":
            if fault is not None and fault not in WEB_FAULTS:
                raise ValueError(fault)
            b.plant.faults.clear()
            self.challenge = {"fault": fault or self.rng.choice(WEB_FAULTS), "start": self.ticks, "hints": 0}
            b.fault(self.challenge["fault"])
            self.result = None
        elif action == "hint" and self.challenge:
            self.challenge["hints"] += 1
        elif action in ("answer", "quit") and self.challenge:
            f = self.challenge["fault"]
            if action == "answer" and fault not in FAULT_INFO:
                raise ValueError(fault)
            answered = FAULT_INFO[fault]["title"] if action == "answer" else "(gave up)"
            self.challenge_fault = f                     # the progress layer keeps a found fault until repaired
            self.result = {"correct": fault == f, "answered": answered, **FAULT_INFO[f],
                           "sim_min": (self.ticks - self.challenge["start"]) // TICKS_PER_MIN,
                           "hints": self.challenge["hints"]}
            b.plant.faults.discard(f)
            self.challenge = None
            return {"result": self.result}
        else:
            raise ValueError(f"challenge {action!r} not possible now")

    # ------------------------------------------------------------------ snapshot
    def state(self) -> str:
        b, p, vm = self.b, self.b.plant, self.b.vm
        st = b.status
        dv = {d["key"]: d for d in st["devices"]}
        sp = {name: vm[name] / scale for name, _mw, _d, scale, *_ in tags.SETPOINTS}
        ch = self.challenge
        truth = {"t_in": p.t_in, "rh": p.rh_in, "ec": p.ec_true, "ph": p.ph_true, "flow": p.q_pump * 1000.0,
                 "vent": p.vent_pos}
        field = {name: bool(p.field_checks() >> i & 1) for i, name in enumerate(FIELD_CHECKS)}
        s = {
            "clock": st["clock_text"], "clock_min": p.clock_min, "day": p.day + 1, "sim_s": round(b.t),
            "weather": {"scenario": p.weather.scenario, "look": "storm" if p.wx.rain and p.wx.wind > 12 else
                        "rain" if p.wx.rain else p.weather.scenario, "rad": p.wx.rad, "t_out": p.wx.t_out, "rh_out": p.wx.rh_out,
                        "wind": p.wx.wind, "rain": p.wx.rain},
            "plc": {"step": st["irr_step"], "step_name": st["irr_step_name"], "zone": st["zone"],
                    "zone_vol": st["zone_vol"], "rad_sum": st["rad_sum"], "min_since": st["min_since"],
                    "cycles": st["cycles_day"], "water": st["water_day"], "drain": st["drain_day"],
                    "enabled": st["irr_flags"]["enabled"], "manual": st["irr_flags"]["manual"],
                    "clim": st["clim_state_name"], "clim_flags": {k: v for k, v in st["clim_flags"].items() if v},
                    "ec": st["ec"], "ph": st["ph"], "t_in": st["t_in"], "rh": st["rh_in"], "vpd": st["vpd"],
                    "co2": st["co2"], "vent": st["vent_pos"], "fan_stage": st["fan_stage"], "level": st["level"],
                    "flow": st["flow"], "press": st["press"], "dose": [st["dose_a"], st["dose_b"], st["dose_acid"]],
                    "outputs": {k: v for k, v in st["outputs"].items() if v},
                    "running": [k for k, d in dv.items() if d.get("running")],
                    "net": "deployed" if dv["m521"]["at_closed"] else "retracted" if dv["m521"]["at_open"] else "moving",
                    "alarms": [{"tag": a["tag"], "text": a["text"], "cls": a["class"], "active": a["active"]}
                               for a in st["alarm_list"]]},
            "sp": sp,
            "zones": [{"crop": bed.crop, "name": bed.spec["name"] if bed.crop else None,
                       "variant": bed.spec["variants"][bed.variant][0] if bed.crop else None,
                       "maturity": round(bed.maturity, 1), "health": round(bed.health, 1), "stage": bed.stage,
                       "stress": bed.stress, "last_ec": bed.last_ec, "last_ph": bed.last_ph,
                       "watering": p.q_zone[i] > 0.05, "deficit": round(p.deficit[i], 1), "pest": bed.pest}
                      for i, bed in enumerate(self.beds)],
            "score": {"kg": round(self.harvested_kg), "harvests": self.harvests, "lost": self.lost},
            "faults": [] if ch else sorted(p.faults),
            "challenge": {"active": bool(ch), "hints": ch["hints"] if ch else 0,
                          "sim_min": (self.ticks - ch["start"]) // TICKS_PER_MIN if ch else 0,
                          "truth": truth if ch and ch["hints"] else None,
                          "field": field if ch and ch["hints"] else None},
            "result": self.result,
            "field": self.field(),
        }
        return json.dumps(s, default=str)


    def field(self) -> dict:
        """What you would see walking the site (the physical plant, not the PLC's sensors)."""
        p, f, c = self.b.plant, self.b.plant.faults, self.b.plant.cfg
        run = p.running
        return {
            "pump": run["p201"], "pump_trip": "p201_trip" in f,
            "burst": "burst_pipe" in f, "spray": "burst_pipe" in f and run["p201"],
            "blocked": "blocked_line" in f and run["p201"],
            "passing": "xv301_passing" in f and run["p201"],
            "drip": [round(q * 1000.0) for q in p.q_zone],
            "leak": [i == 3 and "z4_leak" in f for i in range(4)],                  # a broken dripper
            "leaking": [i == 3 and "z4_leak" in f and p.valve["xv404"] > 0.5 for i in range(4)],
            "jugs": [0.0 if "stock_a_empty" in f else p.stock["a"] / c.stock_l, p.stock["b"] / c.stock_l,
                     0.0 if "acid_empty" in f else p.stock["acid"] / c.acid_l],
            "vent": round(p.vent_pos, 1), "vent_stuck": "vent_stuck" in f and p.vent_dir != 0,
            "fans": [run["f601"], run["f602"], run["f603"]], "fan_trip": [False, "f602_trip" in f, False],
            "pad_wet": round(p.pad_wet, 2), "pad_dry": "pad_sump_low" in f,
            "fog": run["p541"], "net": round(p.net_pos, 1),
            "wires": [w for w, flt in (("wind", "st101_break"), ("temp", "tt501_break"), ("rain", "rain_wire_break"))
                      if flt in f],
        }


def meta() -> str:
    """Static tables for the page."""
    return json.dumps({
        "crops": {k: {"name": v["name"], "colour": v["colour"], "recipe": v["recipe"], "comfort": v["comfort"],
                      "variants": [{"name": n, "days": d, "kg_m2": kg} for n, d, kg, _h in v["variants"]]}
                  for k, v in CROPS.items()},
        "faults": [{"id": f, "title": FAULT_INFO[f]["title"], "level": FAULT_INFO[f]["level"]} for f in WEB_FAULTS],
        "scenarios": list(SCENARIOS),
        "setpoints": [{"name": n, "unit": u, "lo": lo / s, "hi": hi / s, "scale": s}
                      for n, _mw, _d, s, u, lo, hi in tags.SETPOINTS],
    })

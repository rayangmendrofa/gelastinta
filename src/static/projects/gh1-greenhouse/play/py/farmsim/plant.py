"""Process model of the GH-1 tropical greenhouse (the "virtual plant").

Lumped, uncalibrated models chosen to give plausible dynamics (docs/FDS.md section 3):

* weather (``weather.py``) and the I/O clock module (time of day);
* greenhouse air: sensible heat, water vapour and CO2 balances per m2 of floor, with
  natural ventilation, pad-and-fan, fogging, shade net and crop transpiration;
* substrate water deficit per zone, drain from the Z1 measuring gutter;
* hydraulics: pump curve against pressure-compensated drippers, return valve and faults;
* fertigation chemistry: EC from stock flows, pH from a carbonate titration of the raw
  water's alkalinity, a volume-based transport delay and sensor lags;
* reversing actuators with end limits, contactor feedback, E-stop safety relay.

Pure Python with no I/O: ``plant_server`` puts it behind Modbus TCP; the bench wires it
straight to the ST virtual machine.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field

from .weather import Weather

RHO_CP = 1200.0       # J/(m3 K), air
LAMBDA = 2450.0       # J/g, latent heat of vaporisation
CO2_OUT = 410.0       # ppm
K1 = 10 ** -6.35      # carbonic acid, first dissociation constant

FAULTS = (
    "estop", "lt201_break", "ft201_break", "pt201_break", "ec_break", "ph_a_break", "ph_b_break",
    "ft402_break", "rt101_break", "st101_break", "tt101_break", "tt501_break", "mt501_break",
    "at502_break", "zt511_break", "clock_frozen",
    "ph_b_drift", "p201_trip", "p311_trip", "p312_trip", "p313_trip", "burst_pipe", "blocked_line",
    "z3_clogged", "z4_leak", "vent_stuck", "m511_overload", "net_stuck", "m521_overload",
    "f602_trip", "p531_trip", "fog_inlet_low",
    "pad_sump_low", "refill_fail", "stock_a_empty", "stock_b_empty", "acid_empty", "rain_wire_break",
    "f601_trip", "f603_trip", "p541_trip", "lsl201_dry",
    # subtle faults: no alarm, found by reasoning and a field check (troubleshooting trainer)
    "ec_reads_high", "tt501_reads_low", "ft201_reads_high", "z2_partly_clogged", "stock_a_weak",
    "xv301_passing",
)
assert len(FAULTS) <= 48            # three Modbus holding registers of fault bits
SUBTLE = {"ec_reads_high": 0.40,     # AIT-301 calibration drift, mS/cm
          "tt501_reads_low": -3.0,   # TT-501 drift, degC
          "ft201_reads_high": 1.20,  # FT-201 reads 20 % high
          "z2_partly_clogged": 0.82, # Z2 dripper flow factor (alarm threshold is -25 %)
          "stock_a_weak": 0.5,       # stock A mixed at half strength
          "xv301_passing": 0.15}     # return valve seat leak, as a fraction of full opening

# What a technician sees walking the site (trainer "field check"); bit set = observation normal
FIELD_CHECKS = ("P-201 shaft turning when its contactor is in", "Stock tank A at normal strength (EC of the concentrate)",
                "Zone 2 drippers all dripping evenly", "Zone 3 drippers all dripping evenly",
                "Zone 4 laterals intact (no wet patch)", "Main line dry outside (no burst)",
                "Vent moves when its contactor pulls in", "Shade net moves when its contactor pulls in",
                "Fog pump inlet pressure normal", "Refill valve passes water when open",
                "Rain sensor dry and its wiring intact", "Strainer before the zone header clean",
                "Return line quiet with XV-301 closed (no flow through the seat)")
BUTTONS = ("start", "stop", "reset")


@dataclass
class PlantConfig:
    floor_m2: float = 1000.0
    height_m: float = 5.25            # mean air height
    heat_cap: float = 36000.0         # J/(m2 K): air + structure + crop
    transmissivity: float = 0.70
    sensible_frac: float = 0.35       # absorbed solar to air
    latent_frac: float = 0.55         # absorbed solar to transpiration (well-watered crop)
    u_cover: float = 7.8              # W/(m2 floor K)
    g_leak: float = 0.0005            # m3/(m2 s)
    vent_g0: float = 0.010            # m3/(m2 s) at 100 % opening, calm
    vent_gw: float = 0.008            # per m/s wind
    vent_gb: float = 0.004            # buoyancy, per sqrt(K)
    vent_stroke_s: float = 120.0
    net_stroke_s: float = 90.0
    net_shading: float = 0.50
    fan_g: float = 0.01333            # m3/(m2 s) per fan (48 000 m3/h)
    pad_eff: float = 0.80
    fog_lph: float = 500.0
    # irrigation
    tank_l: float = 5000.0
    refill_lph: float = 3000.0
    pump_h0: float = 4.0              # bar, shut-off head (1.5 m3/h at 3.2 bar)
    pump_qmax: float = 3.35           # m3/h at zero head
    zone_lph: float = 1250.0
    zone_m2: float = 250.0
    return_k: float = 0.87            # m3/h per sqrt(bar): 1.5 m3/h at 3 bar
    burst_k: float = 3.0
    pipe_l: float = 1.4               # mixer outlet to sensors (plug flow)
    mixer_l: float = 3.0              # mixing chamber after the injection point
    # chemistry
    water_ec: float = 0.30
    water_alk: float = 3.4            # mmol/L HCO3- (design value 3.0: the feedforward is off)
    water_ph: float = 7.4
    stock_strength: float = 1.10      # stock mixed 10 % strong (feedforward assumes 1.0)
    ab_max_lph: float = 40.0
    acid_max_lph: float = 10.0
    acid_mmol_l: float = 1670.0       # 10 % nitric acid
    stock_l: float = 200.0
    acid_l: float = 100.0
    ph_b_drift: float = 0.6
    contactor_s: float = 0.15


def es_kpa(t: float) -> float:
    """Saturation vapour pressure, kPa (FAO-56)."""
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def vapour_gm3(t: float, rh: float) -> float:
    return 2165.0 * es_kpa(t) * rh / 100.0 / (t + 273.15)


def rh_from(t: float, c_gm3: float) -> float:
    return 100.0 * c_gm3 * (t + 273.15) / 2165.0 / es_kpa(t)


def wet_bulb(t: float, rh: float) -> float:
    """Stull (2011) wet-bulb approximation, degC."""
    return (t * math.atan(0.151977 * math.sqrt(rh + 8.313659)) + math.atan(t + rh)
            - math.atan(rh - 1.676331) + 0.00391838 * rh ** 1.5 * math.atan(0.023101 * rh) - 4.686035)


def ph_of(alk_mmol: float, ct_mmol: float) -> float:
    """pH of a carbonate solution from alkalinity and total carbonate (mmol/L)."""
    lo, hi = 1.5, 9.5
    for _ in range(40):
        ph = (lo + hi) / 2
        h = 10 ** -ph
        f = ct_mmol * K1 / (h + K1) - 1000.0 * h - alk_mmol   # rises with pH
        if f > 0:
            hi = ph
        else:
            lo = ph
    return (lo + hi) / 2


def encode_ma(value: float, lo: float, hi: float) -> int:
    """Engineering value -> OpenPLC raw count (0..65535 = 0..20 mA, 4 mA = lo)."""
    frac = min(1.0, max(0.0, (value - lo) / (hi - lo)))
    return min(65535, round((4.0 + 16.0 * frac) * 65535 / 20.0))


class _Lag:
    """First-order lag."""
    __slots__ = ("tau", "y")

    def __init__(self, tau: float, y: float):
        self.tau, self.y = tau, y

    def step(self, u: float, dt: float) -> float:
        self.y += (u - self.y) * min(1.0, dt / self.tau)
        return self.y


class _Contactor:
    """Coil -> running, with pick-up delay; ``ok`` = no trip."""
    __slots__ = ("delay", "t", "on")

    def __init__(self, delay: float):
        self.delay, self.t, self.on = delay, 0.0, False

    def step(self, coil: bool, ok: bool, dt: float) -> bool:
        if coil and ok:
            self.t += dt
            self.on = self.t >= self.delay
        else:
            self.t, self.on = 0.0, False
        return self.on


@dataclass
class Plant:
    cfg: PlantConfig = field(default_factory=PlantConfig)
    clock: str = "08:00"
    scenario: str = "clear"
    tank_pct: float = 70.0

    def __post_init__(self):
        c = self.cfg
        hh, mm = (int(x) for x in self.clock.split(":"))
        self.clock_s = hh * 3600.0 + mm * 60.0
        self.day = 0
        self.weather = Weather(self.scenario)
        self.faults: set[str] = set()
        self.buttons: dict[str, float] = {}
        self.coils = [False] * 24
        self.refs = [0, 0, 0]
        w = self.weather.at(self.clock_s)
        self.wx = w
        # greenhouse
        self.t_in = w.t_out + 0.5 + 0.004 * w.rad
        self.c_in = vapour_gm3(self.t_in, min(95.0, w.rh_out))
        self.co2 = 420.0
        self.vent_pos = 20.0
        self.net_pos = 0.0
        self.pad_wet = 0.0
        self.pad_sump = 80.0
        # irrigation
        self.tank_v = c.tank_l * self.tank_pct / 100.0
        self.valve = {k: 0.0 for k in ("xv201", "xv301", "xv401", "xv402", "xv403", "xv404")}
        self.pump_spin = 0.0
        self.q_pump = self.q_ret = 0.0          # m3/h
        self.q_zone = [0.0] * 4
        self.press = 0.0                        # bar
        self.ft = _Lag(1.0, 0.0)
        self.pt = _Lag(0.3, 0.0)
        self.stock = {"a": c.stock_l, "b": c.stock_l, "acid": c.acid_l}
        self.q_dose = [0.0, 0.0, 0.0]           # L/h
        self.tank_ec, self.tank_alk = c.water_ec, c.water_alk
        self.ct0 = c.water_alk + c.water_alk / 10 ** (c.water_ph - 6.35)   # total carbonate
        self.tank_ct = self.ct0
        ph0 = ph_of(c.water_alk, self.ct0)
        self.mixer = (c.water_ec, c.water_alk, self.ct0)
        self.pipe: deque = deque()
        self.pipe_vol = 0.0
        self.at_sensor = (c.water_ec, c.water_alk, self.ct0)
        self.ec_s = _Lag(3.0, c.water_ec)
        self.ph_s = _Lag(3.0, ph0)
        self.deficit = [5.0] * 4                # L per zone
        self.drain_buf = [0.0] * 4
        self.drain_lph = 0.0                    # Z1 measuring gutter
        self.supplied_l = [0.0] * 4
        self.drained_l = 0.0
        # motors
        n = c.contactor_s
        self.mot = {k: _Contactor(n) for k in ("p201", "p311", "p312", "p313", "f601", "f602", "f603",
                                                "p531", "p541")}
        self.running = {k: False for k in self.mot}
        self.vent_dir = self.net_dir = 0
        self.frozen_clock = None

    # ------------------------------------------------------------------ helpers
    @property
    def clock_min(self) -> int:
        return int(round(self.clock_s, 6) // 60) % 1440     # round: float drift of dt sums

    @property
    def level_pct(self) -> float:
        return 100.0 * self.tank_v / self.cfg.tank_l

    @property
    def rh_in(self) -> float:
        return min(100.0, rh_from(self.t_in, self.c_in))

    @property
    def vpd(self) -> float:
        return es_kpa(self.t_in) * (1 - self.rh_in / 100.0)

    @property
    def estop(self) -> bool:
        return "estop" in self.faults

    @property
    def ph_true(self) -> float:
        return self.ph_s.y

    @property
    def ec_true(self) -> float:
        return self.ec_s.y

    def set_clock(self, hhmm: str):
        hh, mm = (int(x) for x in hhmm.split(":"))
        self.clock_s = hh * 3600.0 + mm * 60.0

    def press_button(self, name: str, seconds: float = 0.3):
        self.buttons[name] = seconds

    press = press_button

    def set_fault_words(self, words):
        bits = 0
        for i, w in enumerate(words):
            bits |= (w & 0xFFFF) << (16 * i)
        self.faults = {f for i, f in enumerate(FAULTS) if bits >> i & 1}

    def field_checks(self) -> int:
        """Bit n set = FIELD_CHECKS[n] looks normal."""
        f = self.faults
        ok = (not (self.coils[1] and not self.estop and not self.running["p201"]), "stock_a_weak" not in f, "z2_partly_clogged" not in f,
              "z3_clogged" not in f, "z4_leak" not in f, "burst_pipe" not in f,
              "vent_stuck" not in f, "net_stuck" not in f, "fog_inlet_low" not in f,
              "refill_fail" not in f, "rain_wire_break" not in f, "blocked_line" not in f,
              "xv301_passing" not in f)
        return sum(1 << i for i, v in enumerate(ok) if v)

    def fault_words(self) -> list[int]:
        bits = sum(1 << i for i, f in enumerate(FAULTS) if f in self.faults)
        return [bits & 0xFFFF, bits >> 16 & 0xFFFF, bits >> 32 & 0xFFFF]

    # ------------------------------------------------------------------ I/O
    def write_outputs(self, coils, refs):
        self.coils = list(coils) + [False] * (24 - len(coils))
        self.refs = list(refs) + [0] * (3 - len(refs))

    def discrete_inputs(self) -> list[bool]:
        f, r = self.faults, self.running
        di = [
            not self.estop,
            self.buttons.get("start", 0) > 0,
            not (self.buttons.get("stop", 0) > 0),
            self.buttons.get("reset", 0) > 0,
            self.level_pct > 5.0 and "lsl201_dry" not in f,
            r["p201"],
            self.stock["a"] > 10.0 and "stock_a_empty" not in f,
            self.stock["b"] > 10.0 and "stock_b_empty" not in f,
            self.stock["acid"] > 5.0 and "acid_empty" not in f,
            r["p311"], r["p312"], r["p313"],
            not self.wx.rain and "rain_wire_break" not in f,
            self.vent_pos >= 99.5, self.vent_pos <= 0.5, "m511_overload" not in f,
            self.net_pos <= 0.5, self.net_pos >= 99.5, "m521_overload" not in f,
            r["f601"], r["f602"], r["f603"], r["p531"],
            "pad_sump_low" not in f,
            r["p541"],
        ]
        return di + [False] * (32 - len(di))

    def input_registers(self) -> list[int]:
        f, w = self.faults, self.wx

        def ai(name, value, lo, hi):
            return 0 if f"{name}_break" in f else encode_ma(value, lo, hi)

        ph_b = self.ph_s.y + (self.cfg.ph_b_drift if "ph_b_drift" in f else 0.0)
        ec = self.ec_s.y + (SUBTLE["ec_reads_high"] if "ec_reads_high" in f else 0.0)
        t_in = self.t_in + (SUBTLE["tt501_reads_low"] if "tt501_reads_low" in f else 0.0)
        flow = self.ft.y * 1000.0 * (SUBTLE["ft201_reads_high"] if "ft201_reads_high" in f else 1.0)
        if "clock_frozen" in f:
            if self.frozen_clock is None:
                self.frozen_clock = self.clock_min
            clock = self.frozen_clock
        else:
            self.frozen_clock = None
            clock = self.clock_min
        return [
            ai("lt201", self.level_pct, 0, 100),
            ai("ft201", flow, 0, 6000),
            ai("pt201", self.pt.y, 0, 6.0),
            ai("ec", ec, 0, 5.0),
            ai("ph_a", self.ph_s.y, 0, 14.0),
            ai("ph_b", ph_b, 0, 14.0),
            ai("ft402", self.drain_lph, 0, 200),
            ai("rt101", w.rad, 0, 1500),
            ai("tt101", w.t_out, 0, 50),
            0 if "tt101_break" in f else encode_ma(w.rh_out, 0, 100),
            ai("st101", w.wind, 0, 40),
            ai("tt501", t_in, 0, 50),
            0 if "mt501_break" in f else encode_ma(self.rh_in, 0, 100),
            ai("at502", self.co2, 0, 2000),
            ai("zt511", self.vent_pos, 0, 100),
            clock,
        ]

    # ------------------------------------------------------------------ simulation
    def step(self, dt: float):
        c, f = self.cfg, self.faults
        self.clock_s += dt
        if self.clock_s >= 86400.0:
            self.clock_s -= 86400.0
            self.day += 1
        for k in list(self.buttons):
            self.buttons[k] -= dt
            if self.buttons[k] <= 0:
                del self.buttons[k]
        self.wx = self.weather.at(self.clock_s)
        live = not self.estop                     # safety relay removes actuator power
        co = [b and live for b in self.coils]
        self._motors(co, dt)
        self._actuators(co, dt)
        self._hydraulics(co, dt)
        self._chemistry(dt)
        self._greenhouse(dt)
        self._substrate(dt)

    def _motors(self, co, dt):
        f = self.faults
        spec = {"p201": (1, "p201_trip"), "p311": (7, "p311_trip"), "p312": (8, "p312_trip"),
                "p313": (9, "p313_trip"), "f601": (14, "f601_trip"), "f602": (15, "f602_trip"),
                "f603": (16, "f603_trip"), "p531": (17, "p531_trip"), "p541": (18, "p541_trip")}
        for k, (idx, trip) in spec.items():
            ok = trip not in f and not (k == "p541" and "fog_inlet_low" in f)
            self.running[k] = self.mot[k].step(co[idx], ok, dt)

    def _actuators(self, co, dt):
        c, f = self.cfg, self.faults
        # vent: hardwired end limits stop the motor; both contactors -> no motion
        d = 0
        if "m511_overload" not in f and co[10] != co[11]:
            d = 1 if co[10] else -1
            if (d > 0 and self.vent_pos >= 99.5) or (d < 0 and self.vent_pos <= 0.5):
                d = 0
        self.vent_dir = d
        if d and "vent_stuck" not in f:
            self.vent_pos = min(100.0, max(0.0, self.vent_pos + d * 100.0 / c.vent_stroke_s * dt))
        # shade net: position 0 = retracted (open), 100 = deployed (closed)
        d = 0
        if "m521_overload" not in f and co[12] != co[13]:
            d = 1 if co[13] else -1
            if (d > 0 and self.net_pos >= 99.5) or (d < 0 and self.net_pos <= 0.5):
                d = 0
        self.net_dir = d
        if d and "net_stuck" not in f:
            self.net_pos = min(100.0, max(0.0, self.net_pos + d * 100.0 / c.net_stroke_s * dt))

    def _hydraulics(self, co, dt):
        c, f = self.cfg, self.faults
        for i, k in enumerate(("xv201", "xv301", "xv401", "xv402", "xv403", "xv404")):
            target = 1.0 if co[(0, 2, 3, 4, 5, 6)[i]] else 0.0
            self.valve[k] += max(-dt / 0.5, min(dt / 0.5, target - self.valve[k]))
        run = self.running["p201"]
        self.pump_spin += ((1.0 if run else 0.0) - self.pump_spin) * min(1.0, dt / 0.5)
        primed = self.tank_v > 0.03 * c.tank_l
        h0 = c.pump_h0 * self.pump_spin * (1.0 if primed else 0.0)
        zones = [self.valve[f"xv40{i + 1}"] for i in range(4)]
        blocked = "blocked_line" in f

        def paths(p):
            if blocked:
                return 0.0, [0.0] * 4, 0.0
            pc = min(1.0, math.sqrt(max(p, 0.0) / 1.0))
            qz = []
            for i, fr in enumerate(zones):
                q = fr * c.zone_lph / 1000.0 * pc
                if i == 2 and "z3_clogged" in f:
                    q *= 0.55
                if i == 1 and "z2_partly_clogged" in f:
                    q *= SUBTLE["z2_partly_clogged"]
                if i == 3 and "z4_leak" in f:
                    q += fr * 0.6 * math.sqrt(max(p, 0.0) / 2.0)
                qz.append(q)
            opening = self.valve["xv301"]
            if "xv301_passing" in f:
                opening = max(opening, SUBTLE["xv301_passing"])
            qr = opening * c.return_k * math.sqrt(max(p, 0.0))
            qb = c.burst_k * math.sqrt(max(p, 0.0)) if "burst_pipe" in f and run else 0.0
            return qr, qz, qb

        if h0 <= 0.01:
            p = 0.0
        else:
            lo, hi = 0.0, h0
            for _ in range(30):
                p = (lo + hi) / 2
                qp = c.pump_qmax * math.sqrt(max(0.0, 1 - p / h0))
                qr, qz, qb = paths(p)
                if qp > qr + sum(qz) + qb:
                    lo = p
                else:
                    hi = p
            p = (lo + hi) / 2
        qr, qz, qb = paths(p) if h0 > 0.01 else (0.0, [0.0] * 4, 0.0)
        self.press = p
        self.q_ret, self.q_zone = qr, qz
        self.q_pump = qr + sum(qz) + qb if h0 > 0.01 else 0.0
        self.ft.step(self.q_pump * (1.0 if "ft201_break" not in f else 1.0), dt)
        self.pt.step(p, dt)
        # tank
        refill = c.refill_lph if self.valve["xv201"] > 0.5 and "refill_fail" not in f else 0.0
        q_in = refill + (qr * 1000.0)
        q_out = self.q_pump * 1000.0
        v_old = self.tank_v
        self.tank_v = max(0.0, min(0.98 * c.tank_l, self.tank_v + (q_in - q_out) * dt / 3600.0))
        if self.tank_v > 1.0:   # tank composition: perfect mixing
            ec_ret, alk_ret, ct_ret = self.at_sensor
            vin_r, vin_f = qr * 1000.0 * dt / 3600.0, refill * dt / 3600.0
            vtot = max(1.0, v_old - q_out * dt / 3600.0) + vin_r + vin_f
            base = max(1.0, v_old - q_out * dt / 3600.0)
            self.tank_ec = (self.tank_ec * base + ec_ret * vin_r + c.water_ec * vin_f) / vtot
            self.tank_alk = (self.tank_alk * base + alk_ret * vin_r + c.water_alk * vin_f) / vtot
            self.tank_ct = (self.tank_ct * base + ct_ret * vin_r + self.ct0 * vin_f) / vtot

    def _chemistry(self, dt):
        c, f = self.cfg, self.faults
        q = self.q_pump * 1000.0                         # L/h
        for i, (k, mx, stock) in enumerate((("p311", c.ab_max_lph, "a"), ("p312", c.ab_max_lph, "b"),
                                            ("p313", c.acid_max_lph, "acid"))):
            empty = self.stock[stock] <= 0.5 or f"stock_{stock}_empty" in f or \
                (stock == "acid" and "acid_empty" in f)
            qd = mx * self.refs[i] / 65535.0 if self.running[k] and not empty else 0.0
            self.q_dose[i] = qd
            self.stock[stock] = max(0.0, self.stock[stock] - qd * dt / 3600.0)
        if q > 1.0:
            a = self.q_dose[0] * (SUBTLE["stock_a_weak"] if "stock_a_weak" in f else 1.0)
            ec = self.tank_ec + 100.0 * c.stock_strength * (a + self.q_dose[1]) / q
            acid = self.q_dose[2] * c.acid_mmol_l / q
            k = min(1.0, q * dt / 3600.0 / c.mixer_l)          # mixing chamber: perfect mixing
            m = self.mixer
            self.mixer = (m[0] + (ec - m[0]) * k, m[1] + (self.tank_alk - acid - m[1]) * k,
                          m[2] + (self.tank_ct - m[2]) * k)
            parcel = (q * dt / 3600.0, *self.mixer)
            self.pipe.append(parcel)
            self.pipe_vol += parcel[0]
            while self.pipe and self.pipe_vol - self.pipe[0][0] >= c.pipe_l:
                old = self.pipe.popleft()
                self.pipe_vol -= old[0]
                self.at_sensor = old[1:]
        ec, alk, ct = self.at_sensor
        self.ec_s.step(ec, dt)
        self.ph_s.step(ph_of(alk, ct), dt)

    def _greenhouse(self, dt):
        c, w, f = self.cfg, self.wx, self.faults
        rad_in = w.rad * c.transmissivity * (1 - c.net_shading * self.net_pos / 100.0)
        a = self.vent_pos / 100.0
        g_nat = c.g_leak + a * (c.vent_g0 + c.vent_gw * w.wind
                                + c.vent_gb * math.sqrt(max(0.0, self.t_in - w.t_out)))
        n_fans = sum(self.running[k] for k in ("f601", "f602", "f603"))
        g_fan = n_fans * c.fan_g
        # pads
        if self.running["p531"]:
            self.pad_wet += (1 - self.pad_wet) * min(1.0, dt / 30.0)
        else:
            self.pad_wet -= self.pad_wet * min(1.0, dt / (300.0 if n_fans else 1200.0))
        c_out = vapour_gm3(w.t_out, w.rh_out)
        t_wb = wet_bulb(w.t_out, w.rh_out)
        d_t = c.pad_eff * self.pad_wet * (w.t_out - t_wb)
        t_pad, c_pad = w.t_out - d_t, c_out + RHO_CP * d_t / LAMBDA
        # fog: evaporates fully unless the air is near saturation
        fog = self.running["p541"]
        e_fog = (c.fog_lph / 3.6 / c.floor_m2) * (1.0 if self.rh_in < 95.0 else 0.2) if fog else 0.0
        e_tr = (c.latent_frac * rad_in + 8.0) / LAMBDA          # g/(m2 s), small night rate
        q_s = c.sensible_frac * rad_in
        heat = (q_s + RHO_CP * (g_nat * (w.t_out - self.t_in) + g_fan * (t_pad - self.t_in))
                + c.u_cover * (w.t_out - self.t_in) - LAMBDA * e_fog)
        self.t_in += heat / c.heat_cap * dt
        vap = e_tr + e_fog + g_nat * (c_out - self.c_in) + g_fan * (c_pad - self.c_in)
        self.c_in += vap / c.height_m * dt
        sat = vapour_gm3(self.t_in, 100.0)
        if self.c_in > sat:              # condensation on the cover
            self.c_in = sat
        uptake = 0.088 * (rad_in / 630.0) * max(0.0, self.co2 - 50.0) / 360.0
        self.co2 += ((g_nat + g_fan) / c.height_m * (CO2_OUT - self.co2) - uptake) * dt
        self.e_tr = e_tr
        self.rad_in = rad_in

    def _substrate(self, dt):
        c = self.cfg
        uptake_l = self.e_tr * c.zone_m2 / 1000.0 * dt          # L per zone this step
        for i in range(4):
            self.deficit[i] += uptake_l
            water = self.q_zone[i] * 1000.0 * dt / 3600.0
            self.supplied_l[i] += water
            to_drain = 0.10 * water
            absorbed = water - to_drain
            if absorbed > self.deficit[i]:
                to_drain += absorbed - self.deficit[i]
                absorbed = self.deficit[i]
            self.deficit[i] -= absorbed
            self.drain_buf[i] += to_drain
            out = self.drain_buf[i] * min(1.0, dt / 300.0)
            self.drain_buf[i] -= out
            if i == 0:
                self.drain_lph = out / dt * 3600.0
                self.drained_l += out

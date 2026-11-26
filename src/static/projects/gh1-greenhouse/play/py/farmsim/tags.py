"""Single source of truth for the PLC <-> HMI interface (docs/FDS.md section 9).

OpenPLC exposes %MWn as Modbus holding register 1024 + n.
"""
from __future__ import annotations

MW_BASE = 1024

# ---------------------------------------------------------------- HMI -> PLC
MW_CMD, MW_MAN_IRR, MW_MAN_DOSE_A, MW_MAN_DOSE_B, MW_MAN_DOSE_ACID, MW_MAN_CLIM, MW_MAN_VENT = range(7)

CMD_BITS = {"start": 0x001, "stop": 0x002, "reset": 0x004, "irrigate_now": 0x008, "abort": 0x010,
            "irr_auto": 0x020, "irr_manual": 0x040, "clim_auto": 0x080, "clim_manual": 0x100}
MAN_IRR_BITS = {"XV201": 0x01, "P201": 0x02, "XV301": 0x04,
                "XV401": 0x08, "XV402": 0x10, "XV403": 0x20, "XV404": 0x40}
MAN_CLIM_BITS = {"NET_DEPLOY": 0x01, "NET_RETRACT": 0x02, "F601": 0x04, "F602": 0x08, "F603": 0x10,
                 "P531": 0x20, "P541": 0x40}

# (tag, %MW, default raw, scale (raw per unit), unit, lo, hi)  - limits as in FDS 5.4
SETPOINTS = (
    ("SP_EC", 10, 250, 100, "mS/cm", 50, 400),
    ("SP_PH", 11, 580, 100, "pH", 500, 680),
    ("SP_EC_BAND", 12, 20, 100, "mS/cm", 10, 50),
    ("SP_PH_BAND", 13, 30, 100, "pH", 10, 50),
    ("SP_DAY_START", 14, 390, 1, "min", 0, 1380),
    ("SP_DAY_END", 15, 1020, 1, "min", 30, 1439),
    ("SP_RAD_SUM", 16, 130, 1, "J/cm2", 30, 300),
    ("SP_MIN_INT", 17, 20, 1, "min", 5, 240),
    ("SP_MAX_INT", 18, 120, 1, "min", 5, 480),
    ("SP_MAX_CYCLES", 19, 30, 1, "cycles", 1, 60),
    ("SP_SHOT_Z1", 20, 60, 1, "L", 10, 300),
    ("SP_SHOT_Z2", 21, 60, 1, "L", 10, 300),
    ("SP_SHOT_Z3", 22, 60, 1, "L", 10, 300),
    ("SP_SHOT_Z4", 23, 60, 1, "L", 10, 300),
    ("SP_FLOW_Z1", 24, 1250, 1, "L/h", 200, 3000),
    ("SP_FLOW_Z2", 25, 1250, 1, "L/h", 200, 3000),
    ("SP_FLOW_Z3", 26, 1250, 1, "L/h", 200, 3000),
    ("SP_FLOW_Z4", 27, 1250, 1, "L/h", 200, 3000),
    ("SP_ZONE_EN", 28, 15, 1, "bits", 0, 15),
    ("SP_VENT_T", 30, 280, 10, "degC", 200, 350),
    ("SP_COOL_T", 31, 320, 10, "degC", 210, 400),
    ("SP_RH_MAX", 32, 850, 10, "%", 600, 950),
    ("SP_VPD_FOG", 33, 160, 100, "kPa", 80, 250),
    ("SP_SCREEN_RAD", 34, 650, 1, "W/m2", 300, 1000),
    ("SP_WIND_LIM", 35, 100, 10, "m/s", 50, 200),
    ("SP_STORM", 36, 150, 10, "m/s", 60, 250),
    ("SP_RAIN_POS", 37, 100, 10, "%", 0, 300),
)
SP = {name: (mw, default, scale) for name, mw, default, scale, *_ in SETPOINTS}

# ---------------------------------------------------------------- PLC -> HMI, %MW40..%MW139
STATUS_START = 40
ILK_GROUPS = ("refill", "pump", "return", "zone", "dose_ab", "acid", "vent_open", "vent_close",
              "net_deploy", "net_retract", "fan", "pad", "fog")
DEVICE_KEYS = ("xv201", "p201", "xv301", "xv401", "xv402", "xv403", "xv404", "p311", "p312", "p313",
               "m511", "m521", "f601", "f602", "f603", "p531", "p541")
MAINT_MOTORS = ("p201", "f601", "f602", "f603", "p531", "p541")
STATUS_FIELDS = (
    ("heartbeat", "clock", "irr_step", "irr_flags", "zone", "zone_vol", "step_time", "rad_sum",
     "min_since", "cycles_day", "water_day", "drain_day", "cycles_prev", "water_prev", "drain_prev",
     "zone_diag", "level", "flow", "press", "ec", "ph", "ph_a", "ph_b", "dose_a", "dose_b",
     "dose_acid", "drain_flow", "rad", "t_out", "rh_out", "wind", "t_in", "rh_in", "co2", "vpd",
     "vent_pos", "vent_sp", "clim_state", "clim_flags", "fan_stage", "out1", "out2", "in1", "in2",
     "alm1", "alm2", "alm3", "alm4", "act1", "act2", "act3", "act4")
    + tuple(f"ilk_{g}" for g in ILK_GROUPS)
    + tuple(f"dev_{d}" for d in DEVICE_KEYS)
    + tuple(f"{m}_{k}" for m in MAINT_MOTORS for k in ("starts", "runmin"))
    + ("xv401_cyc", "xv402_cyc", "xv403_cyc", "xv404_cyc", "m511_rev", "m521_cyc")
)
assert STATUS_START + len(STATUS_FIELDS) == 140, len(STATUS_FIELDS)
STATUS_MW = {name: STATUS_START + i for i, name in enumerate(STATUS_FIELDS)}

SCALED = {"zone_vol": 10, "rad_sum": 10, "drain_day": 10, "drain_prev": 10, "level": 10,
          "press": 100, "ec": 100, "ph": 100, "ph_a": 100, "ph_b": 100, "dose_a": 10, "dose_b": 10,
          "dose_acid": 10, "drain_flow": 10, "t_out": 10, "rh_out": 10, "wind": 10, "t_in": 10,
          "rh_in": 10, "vpd": 100, "vent_pos": 10, "vent_sp": 10}

IRR_FLAG_BITS = ("auto", "manual", "enabled", "in_window", "max_cycles", "daylight_fallback",
                 "resume_pending")
CLIM_FLAG_BITS = ("auto", "manual", "rain", "wind_limit", "storm", "net_demand", "fog_demand",
                  "humidity_venting", "temp_fallback", "cool_timing")

IRR_STEPS = {0: "IDLE", 10: "PRE-MIX", 20: "SHOT", 25: "HOLD", 40: "RUN-DOWN", 80: "PAUSED",
             99: "FAULT"}
CLIM_STATES = {10: "VENT", 20: "COOL-START", 25: "PRE-WET", 30: "COOL", 40: "PAD-DRY", 90: "MANUAL"}

DI_TAGS = ("ESTOP_OK", "PB_START", "PB_STOP_OK", "PB_RESET", "LSL201_OK", "P201_FB", "LSL311_OK",
           "LSL312_OK", "LSL313_OK", "P311_FB", "P312_FB", "P313_FB", "RAIN_DRY", "ZSO511", "ZSC511",
           "M511_OK", "ZSO521", "ZSC521", "M521_OK", "F601_FB", "F602_FB", "F603_FB", "P531_FB",
           "LSL531_OK", "P541_FB")
DO_TAGS = ("XV201", "P201", "XV301", "XV401", "XV402", "XV403", "XV404", "P311", "P312", "P313",
           "M511_OPEN", "M511_CLOSE", "M521_OPEN", "M521_CLOSE", "F601", "F602", "F603", "P531",
           "P541", "LAMP_GREEN", "LAMP_AMBER", "LAMP_RED")
AI_TAGS = ("LT201_RAW", "FT201_RAW", "PT201_RAW", "AIT301_RAW", "AIT302_RAW", "AIT303_RAW",
           "FT402_RAW", "RT101_RAW", "TT101_RAW", "MT101_RAW", "ST101_RAW", "TT501_RAW",
           "MT501_RAW", "AT502_RAW", "ZT511_RAW", "CLOCK_MIN")
AO_TAGS = ("P311_REF", "P312_REF", "P313_REF")


def di_addr(n: int) -> str:
    return f"%IX{100 + n // 8}.{n % 8}"


def do_addr(n: int) -> str:
    return f"%QX{100 + n // 8}.{n % 8}"


# Interlock words (FDS 11.2): bit n set = permissive n missing
ILK_BITS = {
    "refill": ("E-stop", "LT-201 signal fault", "T-201 level at 95 %"),
    "pump": ("E-stop", "LSL-201 dry (dry-run protection)", "No flow path open (dead-head)",
             "A05 pressure high - RESET required", "PT-201 signal fault", "A04 lock-out - RESET required"),
    "return": ("E-stop",),
    "zone": ("E-stop", "A07 EC high-high - RESET required", "A08 pH low-low - RESET required"),
    "dose_ab": ("E-stop", "P-201 not running", "Flow < 500 L/h", "FT-201 signal fault", "Stock A low",
                "Stock B low", "EC signal fault or A07", "P-311 lock-out", "P-312 lock-out"),
    "acid": ("E-stop", "P-201 not running", "Flow < 500 L/h", "FT-201 signal fault", "Acid tank low",
             "pH invalid or A08", "P-313 lock-out"),
    "vent_open": ("E-stop", "Motor protection tripped", "A36 travel lock-out", "At open limit",
                  "Fan commanded (pad-and-fan)", "Reversal pause"),
    "vent_close": ("E-stop", "Motor protection tripped", "A36 travel lock-out", "At closed limit",
                   "Reversal pause"),
    "net_deploy": ("E-stop", "Motor protection tripped", "A37 travel lock-out", "At closed limit",
                   "Storm wind / wind sensor fault", "Reversal pause"),
    "net_retract": ("E-stop", "Motor protection tripped", "A37 travel lock-out", "At open limit",
                    "Reversal pause"),
    "fan": ("E-stop", "Vents not closed"),
    "pad": ("E-stop", "Pad sump low", "A43 lock-out"),
    "fog": ("E-stop", "Greenhouse RH >= 90 %", "MT-501 signal fault", "A45 lock-out"),
}
assert tuple(ILK_BITS) == ILK_GROUPS

# (key, tag, description, kind, interlock group)
DEVICES = (
    ("xv201", "XV-201", "Refill valve", "valve", "refill"),
    ("p201", "P-201", "Irrigation pump", "motor", "pump"),
    ("xv301", "XV-301", "Return valve", "valve", "return"),
    ("xv401", "XV-401", "Zone 1 valve", "valve", "zone"),
    ("xv402", "XV-402", "Zone 2 valve", "valve", "zone"),
    ("xv403", "XV-403", "Zone 3 valve", "valve", "zone"),
    ("xv404", "XV-404", "Zone 4 valve", "valve", "zone"),
    ("p311", "P-311", "Dosing pump A", "motor", "dose_ab"),
    ("p312", "P-312", "Dosing pump B", "motor", "dose_ab"),
    ("p313", "P-313", "Acid pump", "motor", "acid"),
    ("m511", "M-511", "Roof vent", "actuator", "vent_open"),
    ("m521", "M-521", "Shade net", "actuator", "net_deploy"),
    ("f601", "F-601", "Exhaust fan 1", "motor", "fan"),
    ("f602", "F-602", "Exhaust fan 2", "motor", "fan"),
    ("f603", "F-603", "Exhaust fan 3", "motor", "fan"),
    ("p531", "P-531", "Pad pump", "motor", "pad"),
    ("p541", "P-541", "Fog pump", "motor", "fog"),
)
assert tuple(d[0] for d in DEVICES) == DEVICE_KEYS

# (number, text, class)  class: trip / lockout / alarm / warning   (FDS 12.1)
ALARMS = (
    (0, "E-stop pressed", "trip"),
    (1, "Clock fault", "warning"),
    (2, "LSL-201 T-201 low (dry-run)", "trip"),
    (3, "T-201 refill failure", "warning"),
    (4, "P-201 feedback discrepancy", "trip"),
    (5, "PT-201 pressure high (blocked line)", "trip"),
    (6, "PT-201 pressure low (burst pipe / lost prime)", "trip"),
    (7, "EC high-high", "trip"),
    (8, "pH low-low", "trip"),
    (9, "pH probe deviation", "trip"),
    (10, "Fertigation out of band", "trip"),
    (11, "Stock tank A low", "warning"),
    (12, "Stock tank B low", "warning"),
    (13, "Acid tank low", "warning"),
    (14, "P-311 feedback discrepancy", "trip"),
    (15, "P-312 feedback discrepancy", "trip"),
    (16, "P-313 feedback discrepancy", "trip"),
    (17, "Zone flow high (leak / broken dripper)", "warning"),
    (18, "Zone flow low (clogged / valve)", "warning"),
    (19, "Zone shot timeout, zone skipped", "warning"),
    (20, "LT-201 signal fault", "warning"),
    (21, "FT-201 signal fault", "trip"),
    (22, "PT-201 signal fault", "trip"),
    (23, "AIT-301 EC signal fault", "trip"),
    (24, "AIT-302 pH-A signal fault", "warning"),
    (25, "AIT-303 pH-B signal fault", "warning"),
    (26, "pH measurement lost (both probes)", "trip"),
    (27, "FT-402 drain signal fault", "warning"),
    (28, "Drain % out of range", "warning"),
    (29, "RT-101 radiation signal fault", "warning"),
    (30, "ST-101 wind signal fault (storm assumed)", "warning"),
    (31, "TT-101 / MT-101 outside signal fault", "warning"),
    (32, "TT-501 greenhouse temperature signal fault", "alarm"),
    (33, "MT-501 greenhouse RH signal fault", "warning"),
    (34, "AT-502 CO2 signal fault", "warning"),
    (35, "ZT-511 vent position signal fault", "warning"),
    (36, "Vent travel fault", "lockout"),
    (37, "Shade net travel fault", "lockout"),
    (38, "Vent motor protection tripped", "lockout"),
    (39, "Shade net motor protection tripped", "lockout"),
    (40, "F-601 feedback discrepancy", "lockout"),
    (41, "F-602 feedback discrepancy", "lockout"),
    (42, "F-603 feedback discrepancy", "lockout"),
    (43, "P-531 pad pump feedback discrepancy", "lockout"),
    (44, "Pad sump low", "warning"),
    (45, "P-541 fog pump feedback discrepancy", "lockout"),
    (46, "Greenhouse temperature high", "warning"),
    (47, "Greenhouse temperature high-high (crop damage)", "alarm"),
    (48, "CO2 low", "warning"),
)
ALARM_TEXT = {n: t for n, t, _ in ALARMS}
TRIP_IRR = (0, 2, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 26)
LOCKOUT_ALARMS = (4, 14, 15, 16, 36, 37, 38, 39, 40, 41, 42, 43, 45)


def mask_words(numbers) -> list[int]:
    words = [0, 0, 0, 0]
    for n in numbers:
        words[n // 16] |= 1 << (n % 16)
    return words


def ilk_reasons(group: str, word: int) -> list[str]:
    return [t for i, t in enumerate(ILK_BITS[group]) if word >> i & 1]


def _bits(word: int, names) -> dict:
    return {n: bool(word >> i & 1) for i, n in enumerate(names)}


def decode_status(regs: list[int]) -> dict:
    """Turn the raw %MW40.. register block into an engineering-unit dict."""
    raw = dict(zip(STATUS_FIELDS, regs))
    out = {k: (v / SCALED[k] if k in SCALED else v) for k, v in raw.items()}
    out["irr_step_name"] = IRR_STEPS.get(raw["irr_step"], f"STEP {raw['irr_step']}")
    out["clim_state_name"] = CLIM_STATES.get(raw["clim_state"], f"STATE {raw['clim_state']}")
    out["irr_flags"] = _bits(raw["irr_flags"], IRR_FLAG_BITS)
    out["clim_flags"] = _bits(raw["clim_flags"], CLIM_FLAG_BITS)
    outputs = raw["out1"] | raw["out2"] << 16
    inputs = raw["in1"] | raw["in2"] << 16
    out["outputs"] = _bits(outputs, DO_TAGS)
    out["inputs"] = _bits(inputs, DI_TAGS)
    out["clock_text"] = f"{raw['clock'] // 60:02d}:{raw['clock'] % 60:02d}"
    latched = [raw[f"alm{i}"] for i in range(1, 5)]
    active = [raw[f"act{i}"] for i in range(1, 5)]
    out["alarm_list"] = [
        {"tag": f"A{n:02d}", "text": text, "class": cls,
         "active": bool(active[n // 16] >> (n % 16) & 1),
         "latched": bool(latched[n // 16] >> (n % 16) & 1)}
        for n, text, cls in ALARMS
        if (latched[n // 16] | active[n // 16]) >> (n % 16) & 1
    ]
    out["zone_diag"] = {f"Z{z + 1}": {"flow_high": bool(raw["zone_diag"] >> z & 1),
                                      "flow_low": bool(raw["zone_diag"] >> (z + 4) & 1),
                                      "timeout": bool(raw["zone_diag"] >> (z + 8) & 1)}
                        for z in range(4)}
    out["interlocks"] = {g: ilk_reasons(g, raw[f"ilk_{g}"]) for g in ILK_GROUPS}
    devices = []
    for key, tag, desc, kind, group in DEVICES:
        st = raw[f"dev_{key}"]
        if kind == "actuator":
            d = {"open_req": bool(st & 1), "close_req": bool(st >> 1 & 1),
                 "opening": bool(st >> 2 & 1), "closing": bool(st >> 3 & 1),
                 "at_open": bool(st >> 4 & 1), "at_closed": bool(st >> 5 & 1),
                 "blocked": bool(st >> 6 & 1), "travel_fault": bool(st >> 7 & 1),
                 "motor_trip": bool(st >> 8 & 1), "manual": bool(st >> 9 & 1)}
            other = "vent_close" if key == "m511" else "net_retract"
            d["interlocks"] = sorted(set(ilk_reasons(group, raw[f"ilk_{group}"])
                                         + ilk_reasons(other, raw[f"ilk_{other}"])))
        else:
            d = {"requested": bool(st & 1), "cmd": bool(st >> 1 & 1), "running": bool(st >> 2 & 1),
                 "blocked": bool(st >> 3 & 1), "discrepancy": bool(st >> 4 & 1),
                 "manual": bool(st >> 5 & 1), "interlocks": ilk_reasons(group, raw[f"ilk_{group}"])}
        d.update(key=key, tag=tag, desc=desc, kind=kind)
        if key in MAINT_MOTORS:
            d["starts"], d["run_min"] = raw[f"{key}_starts"], raw[f"{key}_runmin"]
        if key.startswith("xv40"):
            d["cycles"] = raw[f"{key}_cyc"]
        devices.append(d)
    out["devices"] = devices
    return out

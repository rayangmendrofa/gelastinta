"""In-process test bench: the ST program (in the VM) wired directly to the plant model.

The I/O wiring is identical to the OpenPLC remote-device mapping used live
(DI 0..24 -> %IX100.0..%IX103.0, IR 0..15 -> %IW100..115, %QX100.0..%QX102.5 ->
coils 0..21, %QW100..102 -> HR 0..2), but without sockets. PLC and plant advance
together in virtual time, so tests run faster than real time and are deterministic,
and the fast-forward demo behaves exactly like real time (FDS 5.3).
"""
from __future__ import annotations

import os
from pathlib import Path

from . import tags
from .plant import Plant, PlantConfig
from .stvm import STMachine

ST_FILE = Path(__file__).resolve().parent.parent / "plc" / "greenhouse.st"
# Strict VM (run-time IEC type checks, slow) when FARMSIM_STRICT=1; CI runs the FAT both ways.
STRICT = os.environ.get("FARMSIM_STRICT", "") == "1"

DI_ADDR = [tags.di_addr(i) for i in range(len(tags.DI_TAGS))]
IR_ADDR = [f"%IW{100 + i}" for i in range(len(tags.AI_TAGS))]
DO_ADDR = [tags.do_addr(i) for i in range(len(tags.DO_TAGS))]
AO_ADDR = [f"%QW{100 + i}" for i in range(len(tags.AO_TAGS))]


class Bench:
    def __init__(self, st_file: Path | str = ST_FILE, plant: Plant | None = None, *,
                 clock: str = "08:00", scenario: str = "clear", tank_pct: float = 70.0,
                 vm: STMachine | None = None, strict: bool | None = None):
        strict = STRICT if strict is None else strict
        self.vm = vm or STMachine(Path(st_file).read_text(encoding="utf-8"), strict=strict)
        self.plant = plant or Plant(PlantConfig(), clock=clock, scenario=scenario, tank_pct=tank_pct)
        self.dt = self.vm.cycle_ms / 1000.0
        self.t = 0.0
        self.history: list[dict] = []
        self.record_every = 0.0          # s; 0 = no recording
        self._next_rec = 0.0
        self._sync_inputs()

    # -- wiring ---------------------------------------------------------------------
    def _sync_inputs(self):
        vm = self.vm
        for a, v in zip(DI_ADDR, self.plant.discrete_inputs()):
            vm[a] = v
        for a, v in zip(IR_ADDR, self.plant.input_registers()):
            vm[a] = v

    def _sync_outputs(self):
        vm = self.vm
        self.plant.write_outputs([vm[a] for a in DO_ADDR], [vm[a] for a in AO_ADDR])

    def tick(self):
        """One PLC scan + one plant step of the same length."""
        self._sync_inputs()
        self.vm.scan()
        self._sync_outputs()
        self.plant.step(self.dt)
        self.t += self.dt
        if self.record_every and self.t >= self._next_rec:
            self._next_rec = self.t + self.record_every
            self.history.append(self.snapshot())

    def snapshot(self) -> dict:
        p, vm = self.plant, self.vm
        return {"t": round(self.t, 2), "clock": p.clock_min, "step": vm["step"], "zone": vm["zone"],
                "clim": vm["clim_state"], "t_in": p.t_in, "rh": p.rh_in, "vent": p.vent_pos,
                "net": p.net_pos, "fans": vm["fan_stage"], "ec": p.ec_true, "ph": p.ph_true,
                "flow": p.q_pump * 1000.0, "press": p.press, "rad": p.wx.rad, "t_out": p.wx.t_out}

    def run(self, seconds: float):
        for _ in range(round(seconds / self.dt)):
            self.tick()

    def run_until(self, predicate, timeout: float, what: str = "condition"):
        """Run until ``predicate(bench)`` is true; fail after ``timeout`` simulated seconds."""
        end = self.t + timeout
        while self.t < end:
            self.tick()
            if predicate(self):
                return self.t
        raise TimeoutError(f"{what} not reached within {timeout} s (step={self.step}, "
                           f"clim={self.vm['clim_state']}, clock={self.plant.clock_min}, "
                           f"alarms={self.alarm_list()})")

    # -- operator actions ---------------------------------------------------------------
    def hmi(self, *cmds: str):
        word = 0
        for c in cmds:
            word |= tags.CMD_BITS[c]
        self.vm["HMI_CMD"] = word

    def setpoint(self, name: str, value: float):
        mw, _, scale = tags.SP[name]
        self.vm[name] = round(value * scale)

    def manual_irr(self, *devices: str, dose_a=0.0, dose_b=0.0, dose_acid=0.0):
        self.vm["HMI_MAN_IRR"] = sum(tags.MAN_IRR_BITS[d] for d in devices)
        self.vm["HMI_MAN_DOSE_A"] = round(dose_a * 10)
        self.vm["HMI_MAN_DOSE_B"] = round(dose_b * 10)
        self.vm["HMI_MAN_DOSE_ACID"] = round(dose_acid * 10)

    def manual_clim(self, *devices: str, vent: float = 0.0):
        self.vm["HMI_MAN_CLIM"] = sum(tags.MAN_CLIM_BITS[d] for d in devices)
        self.vm["HMI_MAN_VENT"] = round(vent * 10)

    def press(self, button: str):
        self.plant.press_button(button)

    def fault(self, name: str, active: bool = True):
        (self.plant.faults.add if active else self.plant.faults.discard)(name)

    def weather(self, **override):
        """Override weather quantities (rad, t_out, rh_out, wind, rain); None removes one."""
        for k, v in override.items():
            if v is None:
                self.plant.weather.override.pop(k, None)
            else:
                self.plant.weather.override[k] = v

    # -- observations ----------------------------------------------------------------------
    @property
    def step(self) -> int:
        return self.vm["step"]

    @property
    def clim(self) -> int:
        return self.vm["clim_state"]

    @property
    def status(self) -> dict:
        regs = [self.vm[f"%MW{tags.STATUS_START + i}"] for i in range(len(tags.STATUS_FIELDS))]
        return tags.decode_status(regs)

    def out(self, tag: str) -> bool:
        return bool(self.vm[tag])

    def alarm(self, n: int, latched: bool = True) -> bool:
        word = self.vm[f"ST_{'ALM' if latched else 'ACT'}{n // 16 + 1}"]
        return bool(word >> (n % 16) & 1)

    def alarm_list(self, latched: bool = True) -> list[str]:
        return [f"A{n:02d}" for n, _, _ in tags.ALARMS if self.alarm(n, latched)]

    def ilk(self, group: str) -> list[str]:
        return tags.ilk_reasons(group, self.vm[f"ST_ILK_{group.upper()}"])

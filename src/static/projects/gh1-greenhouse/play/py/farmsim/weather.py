"""Deterministic weather for a tropical lowland site (Java, WIB, about 6 deg S).

Scenarios give the outside conditions as a function of time of day. Gusts and cloud
flicker use fixed sums of sines, so every run (and every test) is reproducible.
Individual quantities can be overridden for tests and for the field-simulation panel.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

SUNRISE_H, SUNSET_H = 6.0, 18.0
SCENARIOS = ("clear", "cloudy", "rain", "storm")


@dataclass
class WeatherState:
    rad: float = 0.0        # global radiation, W/m2
    t_out: float = 24.0     # degC
    rh_out: float = 95.0    # %
    wind: float = 1.0       # m/s
    rain: bool = False


def _wave(t: float, *terms) -> float:
    return sum(a * math.sin(2 * math.pi * t / p + ph) for a, p, ph in terms)


@dataclass
class Weather:
    scenario: str = "clear"
    override: dict = field(default_factory=dict)   # e.g. {"wind": 12.0, "rain": True}
    heat: float = 0.0                                  # degC added to the outside air (a heatwave)

    def at(self, clock_s: float) -> WeatherState:
        h = (clock_s / 3600.0) % 24.0
        s = WeatherState()
        # --- radiation: half-sine between sunrise and sunset, 900 W/m2 peak
        if SUNRISE_H < h < SUNSET_H:
            s.rad = 900.0 * math.sin(math.pi * (h - SUNRISE_H) / (SUNSET_H - SUNRISE_H)) ** 1.2
        # --- temperature: 24 degC at 06:00, 33 degC at 14:00
        if 6.0 <= h <= 14.0:
            s.t_out = 24.0 + 9.0 * (1 - math.cos(math.pi * (h - 6.0) / 8.0)) / 2
        else:
            hh = h - 14.0 if h > 14.0 else h + 10.0          # hours after 14:00, 0..16
            s.t_out = 24.0 + 9.0 * (1 + math.cos(math.pi * hh / 16.0)) / 2
        # --- wind: 1 m/s at night, 4 m/s in the afternoon, with gusts
        diurnal = 1.0 + 3.0 * max(0.0, math.sin(math.pi * (h - 9.0) / 10.0))
        s.wind = max(0.0, diurnal + _wave(clock_s, (0.6, 47, 0.0), (0.4, 13, 1.3), (0.3, 7, 2.1)))

        if self.scenario == "cloudy":
            s.rad *= 0.45 + 0.15 * _wave(clock_s, (1.0, 1700, 0.4))
            s.t_out -= 2.0 * (s.t_out - 24.0) / 9.0
        elif self.scenario in ("rain", "storm"):
            if 14.0 <= h < 15.5:                              # afternoon shower
                s.rain = True
                s.rad *= 0.15
                s.t_out = min(s.t_out, 25.5)
            elif 15.5 <= h < 17.0:
                s.rad *= 0.6
                s.t_out = min(s.t_out, 27.0)
            if self.scenario == "storm" and 13.75 <= h < 15.0:
                s.wind = 17.0 + 3.0 * abs(_wave(clock_s, (1.0, 11, 0.0)))
        s.t_out += self.heat
        # --- RH falls as temperature rises (roughly constant absolute humidity)
        s.rh_out = min(98.0, 95.0 - (s.t_out - 24.0) * 4.4)
        if s.rain:
            s.rh_out = 98.0
        for k, v in self.override.items():
            setattr(s, k, v)
        return s

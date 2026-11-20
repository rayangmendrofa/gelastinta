"""Fault knowledge base: one entry per injectable field fault (plant.FAULTS).

Used by the HMI troubleshooting trainer and rendered into docs/TROUBLESHOOTING.md by
tools/gen_troubleshooting.py (tests/test_faults.py checks both cover every fault).

Panel designations follow the electrical drawings (docs/drawings): -Q main/motor breakers,
-K contactors and relays, -F fuses/MCBs, -K0 safety relay, -A1 remote I/O coupler.
"""
from .plant import FAULTS

# level: 1 = an alarm points at it, 2 = an alarm, but the cause needs reasoning,
#        3 = no alarm at all: trends and a field check find it
FAULT_INFO = {
    # ------------------------------------------------------------------ safety, supply
    "estop": dict(
        title="E-stop pressed", level=1,
        symptoms="A00, every output off, irrigation in FAULT (99), red lamp. RESET is refused while the button is in.",
        checks="Walk the E-stop stations (irrigation panel, pump station); check the safety relay -K0 LEDs.",
        cause="Someone pressed an E-stop, or the safety circuit opened (loose wire, failed relay).",
        fix="Find out why it was pressed. Release, reset -K0, RESET on the HMI, then START."),
    "lsl201_dry": dict(
        title="T-201 low level (LSL-201 dry)", level=1,
        symptoms="A02 trip; P-201 blocked (dry-run protection).",
        checks="Compare LT-201 with the tank's sight tube. If the tank is really low, check refill (XV-201, A03).",
        cause="Tank empty (refill failed or water used faster than refilled), or a failed/dirty LSL switch.",
        fix="Restore the level, find why refill did not keep up, RESET."),
    "refill_fail": dict(
        title="Refill valve XV-201 fails to open", level=1,
        symptoms="A03 warning: XV-201 commanded for 10 min with less than 2 % level rise. The tank keeps falling; "
                 "later A02 and a trip.",
        checks="DO LED and 24 V at the XV-201 solenoid; manual override on the valve; supply pressure and the "
               "inlet strainer.",
        cause="Burnt solenoid coil, stuck valve, no supply pressure (well pump off, mains shut).",
        fix="Repair, then test a refill in IRR MANUAL. Check the well pump."),
    # ------------------------------------------------------------------ signals (NAMUR NE 43)
    "lt201_break": dict(
        title="LT-201 tank level loop open", level=1,
        symptoms="A20 warning; level frozen at the last good value; refill blocked. Irrigation continues, protected by "
                 "LSL-201.",
        checks="Loop current at the -A1 analog terminal in series (0 mA = open loop); junction box, transmitter.",
        cause="Broken cable, loose terminal, water in the junction box, failed transmitter.",
        fix="Repair, then check 4/12/20 mA with a loop calibrator (I/O checkout)."),
    "ft201_break": dict(
        title="FT-201 flow loop open", level=1,
        symptoms="A21 trip: shot metering and dosing are impossible without flow.",
        checks="Loop current at -A1; flowmeter display/LED; cable to the pump station.",
        cause="Broken cable or failed flowmeter electronics.",
        fix="Repair; verify the reading against a timed volume (bucket and stopwatch on one zone)."),
    "pt201_break": dict(
        title="PT-201 pressure loop open", level=1,
        symptoms="A22 trip; pump blocked (pressure protection lost).",
        checks="Loop current at -A1; compare with the local gauge.",
        cause="Broken cable or failed transmitter.",
        fix="Repair; check zero with the line drained and one point against the gauge."),
    "ec_break": dict(
        title="AIT-301 EC loop open", level=1,
        symptoms="A23 trip; A/B dosing blocked (interlock names 'EC signal fault').",
        checks="Loop current from the EC analyser; analyser display and power.",
        cause="Broken cable, analyser fault, analyser powered off.",
        fix="Repair; then check the EC against a hand-held meter in the line."),
    "ph_a_break": dict(
        title="AIT-302 pH probe A loop open", level=1,
        symptoms="A24 warning; the PLC controls on probe B alone (1oo2 with fallback). Irrigation continues.",
        checks="Loop current; analyser A display; probe cable.",
        cause="Broken probe cable or analyser fault.",
        fix="Repair soon: with one probe left, the next failure trips irrigation (A26)."),
    "ph_b_break": dict(
        title="AIT-303 pH probe B loop open", level=1,
        symptoms="A25 warning; the PLC controls on probe A alone.",
        checks="Loop current; analyser B display; probe cable.",
        cause="Broken probe cable or analyser fault.",
        fix="Repair soon: one more failure trips irrigation (A26)."),
    "ph_b_drift": dict(
        title="pH probe B drifting", level=2,
        symptoms="A09 trip: the two pH probes disagree by more than the limit. The alarm does not say which probe is "
                 "wrong.",
        checks="Take a sample at the analysers and measure it with a calibrated hand-held pH meter; the probe that "
               "disagrees is the bad one. Check its age and last calibration.",
        cause="Ageing glass electrode, fouled junction, calibration drift.",
        fix="Clean and two-point calibrate (pH 4 and 7) or replace the probe; RESET."),
    "ft402_break": dict(
        title="FT-402 drain flow loop open", level=1,
        symptoms="A27 warning; drain % stops updating. Irrigation continues.",
        checks="Loop current; the drain gutter's flow sensor (often blocked by substrate fines).",
        cause="Broken cable, failed sensor.",
        fix="Repair; check the drain % against a manual collection over one cycle."),
    "rt101_break": dict(
        title="RT-101 radiation loop open", level=1,
        symptoms="A29 warning; radiation sum frozen, so cycles start on the maximum interval only; the shade net "
                 "follows temperature only.",
        checks="Loop current from the weather station; pyranometer dome clean and cable intact.",
        cause="Broken cable, failed pyranometer or its transmitter.",
        fix="Repair; compare with a neighbouring station or the clear-sky value at noon."),
    "st101_break": dict(
        title="ST-101 wind loop open", level=1,
        symptoms="A30 warning; storm assumed: vents closed, shade net retracted, even in calm weather. The house heats "
                 "up.",
        checks="Loop current; anemometer cups turning freely; mast cable.",
        cause="Broken cable or failed anemometer. Fail-safe design: no wind signal is treated as a storm.",
        fix="Repair quickly (the house overheats with closed vents); spin-test the anemometer."),
    "tt101_break": dict(
        title="TT-101 / MT-101 outside sensor loop open", level=1,
        symptoms="A31 warning; outside temperature and humidity frozen; climate decisions that use them fall back.",
        checks="Loop currents of both channels; the radiation screen of the sensor.",
        cause="Shared cable to the weather station cut, or the combined sensor failed.",
        fix="Repair; compare with a hand-held thermo-hygrometer in the shade."),
    "tt501_break": dict(
        title="TT-501 greenhouse temperature loop open", level=1,
        symptoms="A32 alarm; climate in temperature fallback (flag shown on the Climate page); fogging blocked.",
        checks="Loop current; the aspirated sensor box (fan running?); cable along the truss.",
        cause="Broken cable, failed sensor or its aspiration fan.",
        fix="Repair with priority: climate control is degraded."),
    "mt501_break": dict(
        title="MT-501 greenhouse humidity loop open", level=1,
        symptoms="A33 warning; humidity venting and fogging blocked (fog interlock names the MT-501 fault).",
        checks="Loop current; sensor in the aspirated box.",
        cause="Broken cable or failed humidity sensor (they age in a humid house).",
        fix="Repair or replace; check against a hand-held hygrometer."),
    "at502_break": dict(
        title="AT-502 CO2 loop open", level=1,
        symptoms="A34 warning; CO2 display frozen. Control is not affected (CO2 is monitored only).",
        checks="Loop current; analyser power and its sample filter.",
        cause="Broken cable or failed analyser.",
        fix="Repair when convenient."),
    "zt511_break": dict(
        title="ZT-511 vent position loop open", level=1,
        symptoms="A35 warning; the vent positioner loses its feedback and can only drive to the limit switches.",
        checks="Loop current; the potentiometer/encoder on the rack-and-pinion drive.",
        cause="Broken cable or failed position transmitter.",
        fix="Repair; recalibrate 0 and 100 % at the limit switches."),
    "clock_frozen": dict(
        title="I/O clock frozen", level=2,
        symptoms="A01 warning after 150 s; the clock on the HMI stops; the day window is replaced by 'daylight' "
                 "(RT-101 above 50 W/m2 for 5 min).",
        checks="Compare the HMI clock with real time; the I/O coupler's clock/NTP status; a coupler restart that "
               "lost the time.",
        cause="Clock module failed, NTP server unreachable, coupler lost its time after a power cut.",
        fix="Restore the time source; RESET. Irrigation kept working on daylight in the meantime."),
    "rain_wire_break": dict(
        title="Rain sensor wire broken", level=3,
        symptoms="No alarm. The HMI shows 'rain' on a dry, sunny day and the vents never open beyond the rain limit "
                 "(10 %); the house runs hot.",
        checks="Look outside, then at the input LED of RAIN_DRY (off = rain). Measure 24 V at the rain sensor terminals; "
               "check the sensor plate is dry.",
        cause="Broken wire or loose terminal in the NC rain circuit: fail-safe design reads it as rain.",
        fix="Repair the wiring; test with a wet cloth on the sensor."),
    # ------------------------------------------------------------------ hydraulics
    "burst_pipe": dict(
        title="Burst pipe on the main line", level=1,
        symptoms="A06 trip: pressure low with the pump running; flow higher than any zone explains.",
        checks="Walk the main line: wet ground, spray. FT-201 against the zone reference flow.",
        cause="Mechanical damage, pressure surge, ageing PE pipe or fitting.",
        fix="Isolate, repair, flush, then run one cycle and watch pressure and flow."),
    "blocked_line": dict(
        title="Blocked main line (strainer or valve)", level=1,
        symptoms="A05 trip: pressure high with little or no flow.",
        checks="Strainer differential/inspection; manual valves in the header; zone valves really opening.",
        cause="Clogged strainer (algae, sand, precipitated fertiliser), closed manual valve.",
        fix="Clean the strainer, open the valve, RESET. Review the filter maintenance interval."),
    "z3_clogged": dict(
        title="Zone 3 drippers clogged", level=2,
        symptoms="A18 warning on zone 3: flow more than 25 % below the reference; the shot takes much longer but the "
                 "volume is still delivered (metered).",
        checks="Bucket test of several drippers in zone 3; inspect for precipitate (Ca phosphate) or root intrusion.",
        cause="Chemical precipitation (high pH, mixing A and B concentrates), biofilm, particles past the filter.",
        fix="Acid flush the zone (pH ~2 for a short time) or replace laterals; check the filter."),
    "z4_leak": dict(
        title="Zone 4 leak / broken dripper", level=2,
        symptoms="A17 warning on zone 4: flow more than 25 % above the reference. Shot completes quickly; plants near "
                 "the leak are waterlogged, the rest under-watered.",
        checks="Walk zone 4 during a shot: wet patches, a lateral off its connector, a split pipe.",
        cause="Lateral pulled off, rodent damage, dripper missing.",
        fix="Repair; re-run a shot and check the flow against the reference."),
    "xv301_passing": dict(
        title="Return valve XV-301 passing", level=3,
        symptoms="No alarm. Every zone's flow reads about 20 % above its reference (just under the 25 % alarm), shots "
                 "finish early, A/B dosing runs higher than usual and the drain % falls: the zones are getting less "
                 "water than the PLC counts.",
        checks="During a shot, listen at XV-301 and feel the return line; a clamp-on flowmeter on the return pipe shows "
               "flow with the valve closed. FT-201 itself reads true.",
        cause="Worn seat or debris holding the return valve slightly open.",
        fix="Overhaul or replace XV-301; compare the zone flows with their references afterwards."),
    "z2_partly_clogged": dict(
        title="Zone 2 drippers partly clogged", level=3,
        symptoms="No alarm. Zone 2 flow is about 18 % below its reference (the alarm needs 25 %), so its shot takes "
                 "longer than the others. Plants in some rows of zone 2 wilt at midday.",
        checks="Compare zone flows on the Irrigation page or the 10 min trend; bucket-test drippers along zone 2; look "
               "for white deposits.",
        cause="Early precipitation or biofilm, not yet bad enough to alarm.",
        fix="Acid flush the zone; review the pH set point and filter maintenance. Consider a tighter flow-low limit."),
    "ft201_reads_high": dict(
        title="FT-201 reads 20 % high (calibration)", level=3,
        symptoms="No alarm. Every zone reads about 20 % above its reference flow, shots end early, and the drain % "
                 "drops: the crop gets less water than the PLC counts.",
        checks="Bucket test: time a known volume on one zone, or fit a clamp-on flowmeter next to FT-201. Here the "
               "return line is quiet (unlike a passing XV-301).",
        cause="Flowmeter calibration drift, wrong K-factor after a replacement, air in the line.",
        fix="Recalibrate or correct the scaling; record as-found/as-left."),
    # ------------------------------------------------------------------ fertigation
    "stock_a_empty": dict(
        title="Stock tank A empty", level=1,
        symptoms="A11 warning; A and B dosing both stop (they must stay in ratio), EC falls out of band, HOLD, then "
                 "A10 trip after 180 s.",
        checks="Tank A level; LSL-311 switch.",
        cause="Concentrate used up.",
        fix="Mix a new batch (same recipe as B), RESET."),
    "stock_b_empty": dict(
        title="Stock tank B empty", level=1,
        symptoms="A12 warning; A and B dosing stop together; EC out of band, then A10.",
        checks="Tank B level; LSL-312 switch.",
        cause="Concentrate used up.",
        fix="Mix a new batch, RESET."),
    "acid_empty": dict(
        title="Acid tank empty", level=1,
        symptoms="A13 warning; acid dosing stops; pH rises out of band, HOLD, then A10.",
        checks="Acid tank level; LSL-313 switch. Wear acid PPE.",
        cause="Acid used up.",
        fix="Refill (acid into water, never the reverse), RESET."),
    "stock_a_weak": dict(
        title="Stock tank A mixed too weak", level=3,
        symptoms="No alarm. EC and pH are in band, but A/B dosing runs about a third higher than usual: the PLC "
                 "makes up EC with extra B. The crop gets too much of B's nutrients and too little calcium/nitrate.",
        checks="Compare today's dosing outputs with the usual; measure the EC of a diluted sample of each stock tank "
               "(A and B should match).",
        cause="Mixing error: too little fertiliser or too much water in tank A.",
        fix="Re-mix tank A to recipe; check with a diluted EC test before connecting it."),
    "ec_reads_high": dict(
        title="AIT-301 EC reads 0.4 mS/cm high (calibration drift)", level=3,
        symptoms="No alarm. The HMI shows EC exactly on set point and dosing a bit lower than usual, but the crop "
                 "actually gets EC 2.1 instead of 2.5; growth slows over days.",
        checks="Measure a sample from a dripper with a calibrated hand-held EC meter and compare with AIT-301.",
        cause="Fouled or drifted conductivity cell, wrong temperature compensation.",
        fix="Clean and calibrate with a reference solution; check the dripper EC weekly."),
    "p311_trip": dict(
        title="P-311 dosing pump A tripped", level=1,
        symptoms="A14 trip: P-311 commanded but no running feedback; locked out until RESET.",
        checks="MCB -F311 and the pump's own fault LED; diaphragm and suction (air lock); 230 V at the pump.",
        cause="Overcurrent, pump fault, MCB tripped.",
        fix="Repair, reset -F311, RESET A14; prime the pump."),
    "p312_trip": dict(
        title="P-312 dosing pump B tripped", level=1,
        symptoms="A15 trip: P-312 commanded but no running feedback.",
        checks="MCB -F312, pump fault LED, suction.",
        cause="Overcurrent, pump fault, MCB tripped.",
        fix="Repair, reset -F312, RESET A15; prime the pump."),
    "p313_trip": dict(
        title="P-313 acid pump tripped", level=1,
        symptoms="A16 trip: P-313 commanded but no running feedback.",
        checks="MCB -F313, pump fault LED; acid-resistant parts (PPE).",
        cause="Overcurrent, pump fault, corroded connector.",
        fix="Repair, reset -F313, RESET A16."),
    "p201_trip": dict(
        title="P-201 irrigation pump overload tripped", level=1,
        symptoms="A04 trip: P-201 commanded but no running feedback; locked out until RESET.",
        checks="Motor-protection breaker -Q201 tripped? Current per phase, insulation resistance, pump turning freely.",
        cause="Mechanical overload, blocked impeller, single phasing, winding fault.",
        fix="Fix the cause before resetting -Q201; never just reset repeatedly."),
    # ------------------------------------------------------------------ climate actuators
    "vent_stuck": dict(
        title="Roof vent jammed", level=2,
        symptoms="A36 lock-out: the vent motor runs but the position and limit switches do not change (travel fault).",
        checks="Look at the vent: rack-and-pinion jammed, broken drive shaft, obstruction, ice/debris. Is the motor "
               "turning? (If not, see the motor overload fault.)",
        cause="Mechanical jam, sheared coupling, broken gear.",
        fix="Repair the drive; stroke the vent in CLIM MANUAL; RESET."),
    "m511_overload": dict(
        title="Vent motor M-511 protection tripped", level=1,
        symptoms="A38 lock-out: motor protection -Q511 tripped; the vent cannot move.",
        checks="-Q511 trip indicator; current per phase; drive mechanically free?",
        cause="Overload from a stiff drive, both contactors pulled in (should be impossible: interlocked), motor fault.",
        fix="Find the cause, reset -Q511, RESET."),
    "net_stuck": dict(
        title="Shade net jammed", level=2,
        symptoms="A37 lock-out: the net motor runs but no limit switch is reached in 150 s.",
        checks="Look at the net: snagged fabric, broken wire rope, drive shaft.",
        cause="Mechanical jam or broken pull wire.",
        fix="Repair; run the net in CLIM MANUAL; RESET."),
    "m521_overload": dict(
        title="Shade net motor M-521 protection tripped", level=1,
        symptoms="A39 lock-out: the net cannot move.",
        checks="-Q521 trip indicator; motor current; net free to move?",
        cause="Overload from a snagged net, motor fault.",
        fix="Find the cause, reset -Q521, RESET."),
    "f601_trip": dict(
        title="Exhaust fan F-601 tripped", level=1,
        symptoms="A40 lock-out: F-601 commanded without running feedback; the next fan takes its place in the stage.",
        checks="-Q601 trip indicator; belt and bearings; current per phase.",
        cause="Overload, broken belt jammed in the pulley, bearing seizure.",
        fix="Repair, reset -Q601, RESET."),
    "f602_trip": dict(
        title="Exhaust fan F-602 tripped", level=1,
        symptoms="A41 lock-out: F-602 commanded without running feedback; replaced by the next fan.",
        checks="-Q602 trip indicator; belt and bearings.",
        cause="Overload or mechanical fault.",
        fix="Repair, reset -Q602, RESET."),
    "f603_trip": dict(
        title="Exhaust fan F-603 tripped", level=1,
        symptoms="A42 lock-out: F-603 commanded without running feedback.",
        checks="-Q603 trip indicator; belt and bearings.",
        cause="Overload or mechanical fault.",
        fix="Repair, reset -Q603, RESET."),
    "p531_trip": dict(
        title="Pad pump P-531 tripped", level=1,
        symptoms="A43 lock-out: the pads stay dry, so pad-and-fan cooling only ventilates.",
        checks="-Q531 trip indicator; pump running dry? sump level; impeller.",
        cause="Overload, dry running, blocked impeller.",
        fix="Repair, reset -Q531, RESET."),
    "pad_sump_low": dict(
        title="Pad sump low", level=1,
        symptoms="A44 warning; P-531 blocked (dry-run protection); pads dry out.",
        checks="Float valve feeding the sump; clean-water supply; leaks.",
        cause="Stuck float valve, closed supply, leak from the sump.",
        fix="Restore the supply; the pump restarts on its own when the level returns."),
    "p541_trip": dict(
        title="Fog pump P-541 tripped", level=1,
        symptoms="A45 lock-out: P-541 commanded without running feedback; no fogging.",
        checks="-Q541 trip indicator; high-pressure pump oil and seals; motor current.",
        cause="Overload or pump fault.",
        fix="Repair, reset -Q541, RESET."),
    "fog_inlet_low": dict(
        title="Fog pump inlet starved", level=2,
        symptoms="A45 lock-out like a pump trip, but -Q541 is not tripped: the pump's low-inlet-pressure switch "
                 "stops it.",
        checks="Inlet pressure gauge; clean-water supply; the fine filter before the pump.",
        cause="Clogged fine filter, closed supply valve, low mains pressure.",
        fix="Clean the filter or restore the supply; RESET. Never run the HP pump without inlet pressure."),
    "tt501_reads_low": dict(
        title="TT-501 reads 3 °C low (calibration drift)", level=3,
        symptoms="No alarm. On a hot day the HMI shows about 30 °C while it is clearly hotter in the house; "
                 "pad-and-fan cooling never starts and the vents open less than expected.",
        checks="Compare TT-501 with a calibrated reference thermometer in the same aspirated box; check the box fan "
               "and that the sensor is not in the sun.",
        cause="Sensor drift, failed aspiration fan (sensor heats unevenly), wrong scaling after replacement.",
        fix="Recalibrate or replace; review the crop for heat stress since the last good calibration."),
}

assert set(FAULT_INFO) == set(FAULTS), set(FAULT_INFO) ^ set(FAULTS)

# The trainer hides one fault at a time. The E-stop is too obvious to be a challenge.
TRAINER_POOL = tuple(f for f in FAULTS if f != "estop")

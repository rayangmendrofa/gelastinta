(* =============================================================================
   GH-1 TROPICAL GREENHOUSE - IRRIGATION, FERTIGATION AND CLIMATE CONTROL
   -----------------------------------------------------------------------------
   Target    : OpenPLC v4 (IEC 61131-3 Structured Text, STruC++ compiler)
   Task      : cyclic, 50 ms (see CONFIGURATION at the end of this file).
               The 1 s time base counts scans: SCANS_PER_S and DT_SCAN must
               change with the task interval (FDS 5.3).
   Field I/O : remote I/O over Modbus TCP, OpenPLC remote device PLANT:
               %IX100.0..%IX103.0, %IW100..%IW115, %QX100.0..%QX102.5,
               %QW100..%QW102 (FDS 4)
   HMI       : Modbus TCP client of this PLC; interface %MW0..%MW139 (FDS 9)
   Reference : docs/FDS.md - Functional Design Specification. Section numbers
               in the comments below refer to it.
   ============================================================================= *)


(* -----------------------------------------------------------------------------
   FB_AnalogIn - scale a 4-20 mA input to engineering units.
   OpenPLC analog inputs read 0..65535 for 0..20 mA, so 4 mA = 13107 counts.
   A signal below 3.6 mA (NAMUR NE 43) means wire break or transmitter
   failure: FAULT is set and VALUE holds its last good value.
   ----------------------------------------------------------------------------- *)
FUNCTION_BLOCK FB_AnalogIn
VAR_INPUT
    RAW   : UINT;     (* 0..65535 = 0..20 mA *)
    LO_EU : REAL;     (* engineering value at 4 mA *)
    HI_EU : REAL;     (* engineering value at 20 mA *)
END_VAR
VAR_OUTPUT
    VALUE : REAL;     (* engineering units, clamped to LO_EU..HI_EU *)
    FAULT : BOOL;     (* loop current below 3.6 mA *)
END_VAR
VAR
    ma    : REAL;
END_VAR
    ma := UINT_TO_REAL(RAW) * 20.0 / 65535.0;
    FAULT := ma < 3.6;
    IF NOT FAULT THEN
        VALUE := LO_EU + (LIMIT(4.0, ma, 20.0) - 4.0) / 16.0 * (HI_EU - LO_EU);
    END_IF;
END_FUNCTION_BLOCK


(* -----------------------------------------------------------------------------
   FB_PIControl - PI controller with feedforward, positional form, executed at
   a fixed sample time DT_S (FDS 7.1).
     OUT = LIMIT(OUT_MIN, FF + KP * (e + integral(e) / TI), OUT_MAX)
     e   = SP - PV (direct) or PV - SP (REVERSE, e.g. acid dosing lowers pH)
   Anti-windup by conditional integration. With I_ZONE > 0 the integral only
   runs while ABS(e) < I_ZONE, so it does not wind up during the dead time
   after start-up; the feedforward does the coarse work. ENABLE = FALSE resets
   the integral and forces OUT to OUT_MIN.
   ----------------------------------------------------------------------------- *)
FUNCTION_BLOCK FB_PIControl
VAR_INPUT
    ENABLE  : BOOL;
    SP      : REAL;
    PV      : REAL;
    FF      : REAL;   (* feedforward, output units *)
    REVERSE : BOOL;
    KP      : REAL;   (* output units per PV unit *)
    TI_S    : REAL;   (* integral time, s (0 = P only) *)
    DT_S    : REAL;   (* sample time, s *)
    I_ZONE  : REAL;   (* integrate only while ABS(e) < I_ZONE (0 = always) *)
    OUT_MIN : REAL;
    OUT_MAX : REAL;
END_VAR
VAR_OUTPUT
    OUT     : REAL;
END_VAR
VAR
    err     : REAL;
    p_term  : REAL;
    i_term  : REAL;
    di      : REAL;
    unsat   : REAL;
END_VAR
    IF ENABLE THEN
        IF REVERSE THEN
            err := PV - SP;
        ELSE
            err := SP - PV;
        END_IF;
        p_term := KP * err;
        di := 0.0;
        IF (TI_S > 0.0) AND ((I_ZONE <= 0.0) OR (ABS(err) < I_ZONE)) THEN
            di := KP * err * DT_S / TI_S;
        END_IF;
        unsat := FF + p_term + i_term + di;
        IF ((unsat < OUT_MAX) OR (di < 0.0)) AND ((unsat > OUT_MIN) OR (di > 0.0)) THEN
            i_term := i_term + di;
        END_IF;
        OUT := LIMIT(OUT_MIN, FF + p_term + i_term, OUT_MAX);
    ELSE
        i_term := 0.0;
        OUT := OUT_MIN;
    END_IF;
END_FUNCTION_BLOCK


(* -----------------------------------------------------------------------------
   FB_Motor - direct-on-line motor with contactor feedback supervision (FDS 10).
     ILK      interlock word: any bit set = not permitted. The bits tell the
              operator WHY (FDS 11.2). Lock-outs are passed in as ILK bits.
     DISCREP  command and feedback disagree for 2 s.
     STATUS   b0 requested  b1 commanded  b2 running  b3 blocked
              b4 discrepancy  b5 manual mode
   ----------------------------------------------------------------------------- *)
FUNCTION_BLOCK FB_Motor
VAR_INPUT
    AUTO_REQ  : BOOL;
    MANUAL    : BOOL;
    MAN_REQ   : BOOL;
    ILK       : WORD;
    FB_RUN    : BOOL;
    SEC_PULSE : BOOL;
END_VAR
VAR_OUTPUT
    CMD       : BOOL;
    RUNNING   : BOOL;
    BLOCKED   : BOOL;
    DISCREP   : BOOL;
    STATUS    : WORD;
    STARTS    : UINT;
    RUN_MIN   : UINT;
END_VAR
VAR
    req       : BOOL;
    run_sec   : UINT;
    tmr_disc  : TON;
    rt_run    : R_TRIG;
END_VAR
    IF MANUAL THEN
        req := MAN_REQ;
    ELSE
        req := AUTO_REQ;
    END_IF;
    CMD := req AND (ILK = 16#0000);
    BLOCKED := req AND (ILK <> 16#0000);
    tmr_disc(IN := CMD XOR FB_RUN, PT := T#2s);
    DISCREP := tmr_disc.Q;
    RUNNING := CMD AND FB_RUN;
    rt_run(CLK := RUNNING);
    IF rt_run.Q THEN
        STARTS := STARTS + 1;
    END_IF;
    IF RUNNING AND SEC_PULSE THEN
        run_sec := run_sec + 1;
        IF run_sec >= 60 THEN
            run_sec := 0;
            RUN_MIN := RUN_MIN + 1;
        END_IF;
    END_IF;
    STATUS := BOOL_TO_WORD(req)
           OR SHL(BOOL_TO_WORD(CMD), 1)
           OR SHL(BOOL_TO_WORD(RUNNING), 2)
           OR SHL(BOOL_TO_WORD(BLOCKED), 3)
           OR SHL(BOOL_TO_WORD(DISCREP), 4)
           OR SHL(BOOL_TO_WORD(MANUAL), 5);
END_FUNCTION_BLOCK


(* -----------------------------------------------------------------------------
   FB_Valve - on/off solenoid valve, spring return (de-energised = closed).
     STATUS   b0 requested  b1 commanded  b3 blocked  b5 manual
   ----------------------------------------------------------------------------- *)
FUNCTION_BLOCK FB_Valve
VAR_INPUT
    AUTO_REQ  : BOOL;
    MANUAL    : BOOL;
    MAN_REQ   : BOOL;
    ILK       : WORD;
END_VAR
VAR_OUTPUT
    CMD       : BOOL;
    BLOCKED   : BOOL;
    STATUS    : WORD;
    CYCLES    : UINT;
END_VAR
VAR
    req       : BOOL;
    rt_open   : R_TRIG;
END_VAR
    IF MANUAL THEN
        req := MAN_REQ;
    ELSE
        req := AUTO_REQ;
    END_IF;
    CMD := req AND (ILK = 16#0000);
    BLOCKED := req AND (ILK <> 16#0000);
    rt_open(CLK := CMD);
    IF rt_open.Q THEN
        CYCLES := CYCLES + 1;
    END_IF;
    STATUS := BOOL_TO_WORD(req)
           OR SHL(BOOL_TO_WORD(CMD), 1)
           OR SHL(BOOL_TO_WORD(BLOCKED), 3)
           OR SHL(BOOL_TO_WORD(MANUAL), 5);
END_FUNCTION_BLOCK


(* -----------------------------------------------------------------------------
   FB_Actuator - reversing motor with end limits and optional position
   feedback: roof vent, shade net (FDS 8.4, 10).
     - open and close are never commanded together;
     - reversing needs the motor stopped for 0.5 s (REV_OPEN / REV_CLOSE tell
       the program that the reversal pause is holding a direction off);
     - travel supervision: with position feedback (USE_POS), less than 1 %
       movement in T_STALL; without it, end limit not reached in T_MAX.
     STATUS   b0 open req  b1 close req  b2 opening  b3 closing  b4 at open
              b5 at closed  b6 blocked  b7 travel fault  b8 motor trip
              b9 manual
   ----------------------------------------------------------------------------- *)
FUNCTION_BLOCK FB_Actuator
VAR_INPUT
    OPEN_REQ   : BOOL;
    CLOSE_REQ  : BOOL;
    MANUAL     : BOOL;
    MAN_OPEN   : BOOL;
    MAN_CLOSE  : BOOL;
    ILK_OPEN   : WORD;    (* interlock words without the reversal bit *)
    ILK_CLOSE  : WORD;
    AT_OPEN    : BOOL;
    AT_CLOSED  : BOOL;
    MOTOR_OK   : BOOL;
    POS        : REAL;    (* %, only used with USE_POS *)
    USE_POS    : BOOL;
    T_STALL    : TIME;
    T_MAX      : TIME;
END_VAR
VAR_OUTPUT
    OPEN_CMD   : BOOL;
    CLOSE_CMD  : BOOL;
    REV_OPEN   : BOOL;
    REV_CLOSE  : BOOL;
    TRAVEL_FLT : BOOL;
    STATUS     : WORD;
    REVERSALS  : UINT;
    STROKES    : UINT;    (* arrivals at the closed limit *)
END_VAR
VAR
    req_open   : BOOL;
    req_close  : BOOL;
    blocked    : BOOL;
    moving     : BOOL;
    progressed : BOOL;
    last_dir   : INT;
    pos_ref    : REAL;
    tmr_idle   : TON;
    tmr_stall  : TON;
    tmr_max    : TON;
    rt_closed  : R_TRIG;
END_VAR
    IF MANUAL THEN
        req_open := MAN_OPEN AND NOT MAN_CLOSE;
        req_close := MAN_CLOSE AND NOT MAN_OPEN;
    ELSE
        req_open := OPEN_REQ AND NOT CLOSE_REQ;
        req_close := CLOSE_REQ AND NOT OPEN_REQ;
    END_IF;
    tmr_idle(IN := NOT OPEN_CMD AND NOT CLOSE_CMD, PT := T#500ms);
    REV_OPEN := CLOSE_CMD OR ((last_dir = -1) AND NOT tmr_idle.Q);
    REV_CLOSE := OPEN_CMD OR ((last_dir = 1) AND NOT tmr_idle.Q);
    OPEN_CMD := req_open AND (ILK_OPEN = 16#0000) AND NOT REV_OPEN;
    CLOSE_CMD := req_close AND (ILK_CLOSE = 16#0000) AND NOT REV_CLOSE AND NOT OPEN_CMD;
    IF OPEN_CMD THEN
        IF last_dir = -1 THEN
            REVERSALS := REVERSALS + 1;
        END_IF;
        last_dir := 1;
    ELSIF CLOSE_CMD THEN
        IF last_dir = 1 THEN
            REVERSALS := REVERSALS + 1;
        END_IF;
        last_dir := -1;
    END_IF;
    blocked := (req_open AND NOT OPEN_CMD) OR (req_close AND NOT CLOSE_CMD);

    moving := OPEN_CMD OR CLOSE_CMD;
    progressed := ABS(POS - pos_ref) >= 1.0;
    IF NOT moving OR progressed THEN
        pos_ref := POS;
    END_IF;
    tmr_stall(IN := moving AND USE_POS AND NOT progressed, PT := T_STALL);
    tmr_max(IN := moving AND NOT USE_POS, PT := T_MAX);
    TRAVEL_FLT := tmr_stall.Q OR tmr_max.Q;

    rt_closed(CLK := AT_CLOSED);
    IF rt_closed.Q THEN
        STROKES := STROKES + 1;
    END_IF;
    STATUS := BOOL_TO_WORD(req_open)
           OR SHL(BOOL_TO_WORD(req_close), 1)
           OR SHL(BOOL_TO_WORD(OPEN_CMD), 2)
           OR SHL(BOOL_TO_WORD(CLOSE_CMD), 3)
           OR SHL(BOOL_TO_WORD(AT_OPEN), 4)
           OR SHL(BOOL_TO_WORD(AT_CLOSED), 5)
           OR SHL(BOOL_TO_WORD(blocked), 6)
           OR SHL(BOOL_TO_WORD(TRAVEL_FLT), 7)
           OR SHL(BOOL_TO_WORD(NOT MOTOR_OK), 8)
           OR SHL(BOOL_TO_WORD(MANUAL), 9);
END_FUNCTION_BLOCK


(* -----------------------------------------------------------------------------
   Greenhouse - main program
   Scan order:
     1 clocks                         8 tank refill                  (6.4)
     2 input conditioning, pH, VPD    9 climate: weather, demands    (8)
     3 time of day                   10 interlocks and devices       (11)
     4 operator commands, setpoints  11 dosing loops                 (7)
     5 alarms                        12 daily counters, drain        (6.5)
     6 modes                         13 lamps and HMI status         (9, 12.3)
     7 irrigation sequence  (6)
   ----------------------------------------------------------------------------- *)
PROGRAM Greenhouse
VAR
    (* ===== Field inputs (FDS 4.1, 4.2) ===== *)
    ESTOP_OK    AT %IX100.0 : BOOL;   (* E-stop safety relay healthy *)
    PB_START    AT %IX100.1 : BOOL;   (* panel START, NO *)
    PB_STOP_OK  AT %IX100.2 : BOOL;   (* panel STOP, NC: TRUE = not pressed *)
    PB_RESET    AT %IX100.3 : BOOL;   (* panel RESET, NO *)
    LSL201_OK   AT %IX100.4 : BOOL;   (* LSL-201 T-201 water present *)
    P201_FB     AT %IX100.5 : BOOL;   (* P-201 running *)
    LSL311_OK   AT %IX100.6 : BOOL;   (* stock A not low *)
    LSL312_OK   AT %IX100.7 : BOOL;   (* stock B not low *)
    LSL313_OK   AT %IX101.0 : BOOL;   (* acid not low *)
    P311_FB     AT %IX101.1 : BOOL;   (* dosing pump A running *)
    P312_FB     AT %IX101.2 : BOOL;   (* dosing pump B running *)
    P313_FB     AT %IX101.3 : BOOL;   (* acid pump running *)
    RAIN_DRY    AT %IX101.4 : BOOL;   (* XS-105 rain detector, NC: TRUE = no rain *)
    ZSO511      AT %IX101.5 : BOOL;   (* vent fully open *)
    ZSC511      AT %IX101.6 : BOOL;   (* vent fully closed *)
    M511_OK     AT %IX101.7 : BOOL;   (* vent motor protection healthy *)
    ZSO521      AT %IX102.0 : BOOL;   (* shade net fully open (retracted) *)
    ZSC521      AT %IX102.1 : BOOL;   (* shade net fully closed (deployed) *)
    M521_OK     AT %IX102.2 : BOOL;   (* shade net motor protection healthy *)
    F601_FB     AT %IX102.3 : BOOL;   (* fans running *)
    F602_FB     AT %IX102.4 : BOOL;
    F603_FB     AT %IX102.5 : BOOL;
    P531_FB     AT %IX102.6 : BOOL;   (* pad pump running *)
    LSL531_OK   AT %IX102.7 : BOOL;   (* pad sump water present *)
    P541_FB     AT %IX103.0 : BOOL;   (* fog pump running *)
    LT201_RAW   AT %IW100 : UINT;     (* 4-20 mA = 0-100 % *)
    FT201_RAW   AT %IW101 : UINT;     (* 0-6000 L/h *)
    PT201_RAW   AT %IW102 : UINT;     (* 0-6 bar *)
    AIT301_RAW  AT %IW103 : UINT;     (* EC 0-5 mS/cm *)
    AIT302_RAW  AT %IW104 : UINT;     (* pH A 0-14 *)
    AIT303_RAW  AT %IW105 : UINT;     (* pH B 0-14 *)
    FT402_RAW   AT %IW106 : UINT;     (* drain Z1 0-200 L/h *)
    RT101_RAW   AT %IW107 : UINT;     (* radiation 0-1500 W/m2 *)
    TT101_RAW   AT %IW108 : UINT;     (* outside 0-50 degC *)
    MT101_RAW   AT %IW109 : UINT;     (* outside RH 0-100 % *)
    ST101_RAW   AT %IW110 : UINT;     (* wind 0-40 m/s *)
    TT501_RAW   AT %IW111 : UINT;     (* greenhouse 0-50 degC *)
    MT501_RAW   AT %IW112 : UINT;     (* greenhouse RH 0-100 % *)
    AT502_RAW   AT %IW113 : UINT;     (* CO2 0-2000 ppm *)
    ZT511_RAW   AT %IW114 : UINT;     (* vent position 0-100 % *)
    CLOCK_MIN   AT %IW115 : UINT;     (* I/O clock: minutes since midnight, not 4-20 mA *)

    (* ===== Field outputs (FDS 4.3, 4.4) ===== *)
    XV201       AT %QX100.0 : BOOL;   (* refill valve *)
    P201        AT %QX100.1 : BOOL;   (* irrigation pump *)
    XV301       AT %QX100.2 : BOOL;   (* return valve *)
    XV401       AT %QX100.3 : BOOL;   (* zone valves *)
    XV402       AT %QX100.4 : BOOL;
    XV403       AT %QX100.5 : BOOL;
    XV404       AT %QX100.6 : BOOL;
    P311        AT %QX100.7 : BOOL;   (* dosing pump A run *)
    P312        AT %QX101.0 : BOOL;   (* dosing pump B run *)
    P313        AT %QX101.1 : BOOL;   (* acid pump run *)
    M511_OPEN   AT %QX101.2 : BOOL;   (* vent open contactor *)
    M511_CLOSE  AT %QX101.3 : BOOL;   (* vent close contactor *)
    M521_OPEN   AT %QX101.4 : BOOL;   (* shade net retract contactor *)
    M521_CLOSE  AT %QX101.5 : BOOL;   (* shade net deploy contactor *)
    F601        AT %QX101.6 : BOOL;   (* exhaust fans *)
    F602        AT %QX101.7 : BOOL;
    F603        AT %QX102.0 : BOOL;
    P531        AT %QX102.1 : BOOL;   (* pad pump *)
    P541        AT %QX102.2 : BOOL;   (* fog pump *)
    LAMP_GREEN  AT %QX102.3 : BOOL;
    LAMP_AMBER  AT %QX102.4 : BOOL;
    LAMP_RED    AT %QX102.5 : BOOL;
    P311_REF    AT %QW100 : UINT;     (* 0..65535 = 0..100 % speed *)
    P312_REF    AT %QW101 : UINT;
    P313_REF    AT %QW102 : UINT;

    (* ===== HMI -> PLC (FDS 9.1). Command bits are cleared by the PLC once read. ===== *)
    HMI_CMD       AT %MW0 : WORD;
    HMI_MAN_IRR   AT %MW1 : WORD;     (* b0 XV201 b1 P201 b2 XV301 b3..b6 XV401..404 *)
    HMI_MAN_DOSE_A AT %MW2 : UINT;    (* 0.1 % *)
    HMI_MAN_DOSE_B AT %MW3 : UINT;
    HMI_MAN_DOSE_ACID AT %MW4 : UINT;
    HMI_MAN_CLIM  AT %MW5 : WORD;     (* b0 net deploy b1 net retract b2..b4 F601..603 b5 P531 b6 P541 *)
    HMI_MAN_VENT  AT %MW6 : UINT;     (* 0.1 % *)
    SP_EC         AT %MW10 : UINT := 250;    (* 0.01 mS/cm *)
    SP_PH         AT %MW11 : UINT := 580;    (* 0.01 pH *)
    SP_EC_BAND    AT %MW12 : UINT := 20;
    SP_PH_BAND    AT %MW13 : UINT := 30;
    SP_DAY_START  AT %MW14 : UINT := 390;    (* min of day *)
    SP_DAY_END    AT %MW15 : UINT := 1020;
    SP_RAD_SUM    AT %MW16 : UINT := 130;    (* J/cm2, outside radiation; shaded house *)
    SP_MIN_INT    AT %MW17 : UINT := 20;     (* min *)
    SP_MAX_INT    AT %MW18 : UINT := 120;    (* min *)
    SP_MAX_CYCLES AT %MW19 : UINT := 30;
    SP_SHOT_Z1    AT %MW20 : UINT := 60;     (* L *)
    SP_SHOT_Z2    AT %MW21 : UINT := 60;
    SP_SHOT_Z3    AT %MW22 : UINT := 60;
    SP_SHOT_Z4    AT %MW23 : UINT := 60;
    SP_FLOW_Z1    AT %MW24 : UINT := 1250;   (* L/h reference flow *)
    SP_FLOW_Z2    AT %MW25 : UINT := 1250;
    SP_FLOW_Z3    AT %MW26 : UINT := 1250;
    SP_FLOW_Z4    AT %MW27 : UINT := 1250;
    SP_ZONE_EN    AT %MW28 : WORD := 16#000F;
    SP_VENT_T     AT %MW30 : UINT := 280;    (* 0.1 degC *)
    SP_COOL_T     AT %MW31 : UINT := 320;
    SP_RH_MAX     AT %MW32 : UINT := 850;    (* 0.1 % *)
    SP_VPD_FOG    AT %MW33 : UINT := 160;    (* 0.01 kPa *)
    SP_SCREEN_RAD AT %MW34 : UINT := 650;    (* W/m2 *)
    SP_WIND_LIM   AT %MW35 : UINT := 100;    (* 0.1 m/s *)
    SP_STORM      AT %MW36 : UINT := 150;
    SP_RAIN_POS   AT %MW37 : UINT := 100;    (* 0.1 % *)

    (* ===== PLC -> HMI status (FDS 9.2) ===== *)
    ST_HEARTBEAT  AT %MW40 : UINT;
    ST_CLOCK      AT %MW41 : UINT;
    ST_IRR_STEP   AT %MW42 : UINT;
    ST_IRR_FLAGS  AT %MW43 : WORD;
    ST_ZONE       AT %MW44 : UINT;
    ST_ZONE_VOL   AT %MW45 : UINT;
    ST_STEP_TIME  AT %MW46 : UINT;
    ST_RAD_SUM    AT %MW47 : UINT;
    ST_MIN_SINCE  AT %MW48 : UINT;
    ST_CYCLES_DAY AT %MW49 : UINT;
    ST_WATER_DAY  AT %MW50 : UINT;
    ST_DRAIN_DAY  AT %MW51 : UINT;
    ST_CYCLES_PREV AT %MW52 : UINT;
    ST_WATER_PREV AT %MW53 : UINT;
    ST_DRAIN_PREV AT %MW54 : UINT;
    ST_ZONE_DIAG  AT %MW55 : WORD;
    ST_LEVEL      AT %MW56 : UINT;
    ST_FLOW       AT %MW57 : UINT;
    ST_PRESS      AT %MW58 : UINT;
    ST_EC         AT %MW59 : UINT;
    ST_PH         AT %MW60 : UINT;
    ST_PH_A       AT %MW61 : UINT;
    ST_PH_B       AT %MW62 : UINT;
    ST_DOSE_A     AT %MW63 : UINT;
    ST_DOSE_B     AT %MW64 : UINT;
    ST_DOSE_ACID  AT %MW65 : UINT;
    ST_DRAIN_FLOW AT %MW66 : UINT;
    ST_RAD        AT %MW67 : UINT;
    ST_T_OUT      AT %MW68 : UINT;
    ST_RH_OUT     AT %MW69 : UINT;
    ST_WIND       AT %MW70 : UINT;
    ST_T_IN       AT %MW71 : UINT;
    ST_RH_IN      AT %MW72 : UINT;
    ST_CO2        AT %MW73 : UINT;
    ST_VPD        AT %MW74 : UINT;
    ST_VENT_POS   AT %MW75 : UINT;
    ST_VENT_SP    AT %MW76 : UINT;
    ST_CLIM_STATE AT %MW77 : UINT;
    ST_CLIM_FLAGS AT %MW78 : WORD;
    ST_FAN_STAGE  AT %MW79 : UINT;
    ST_OUT1       AT %MW80 : WORD;
    ST_OUT2       AT %MW81 : WORD;
    ST_IN1        AT %MW82 : WORD;
    ST_IN2        AT %MW83 : WORD;
    ST_ALM1       AT %MW84 : WORD;
    ST_ALM2       AT %MW85 : WORD;
    ST_ALM3       AT %MW86 : WORD;
    ST_ALM4       AT %MW87 : WORD;
    ST_ACT1       AT %MW88 : WORD;
    ST_ACT2       AT %MW89 : WORD;
    ST_ACT3       AT %MW90 : WORD;
    ST_ACT4       AT %MW91 : WORD;
    ST_ILK_REFILL AT %MW92 : WORD;
    ST_ILK_PUMP   AT %MW93 : WORD;
    ST_ILK_RETURN AT %MW94 : WORD;
    ST_ILK_ZONE   AT %MW95 : WORD;
    ST_ILK_DOSE_AB AT %MW96 : WORD;
    ST_ILK_ACID   AT %MW97 : WORD;
    ST_ILK_VENT_OPEN AT %MW98 : WORD;
    ST_ILK_VENT_CLOSE AT %MW99 : WORD;
    ST_ILK_NET_DEPLOY AT %MW100 : WORD;
    ST_ILK_NET_RETRACT AT %MW101 : WORD;
    ST_ILK_FAN    AT %MW102 : WORD;
    ST_ILK_PAD    AT %MW103 : WORD;
    ST_ILK_FOG    AT %MW104 : WORD;
    ST_DEV_XV201  AT %MW105 : WORD;
    ST_DEV_P201   AT %MW106 : WORD;
    ST_DEV_XV301  AT %MW107 : WORD;
    ST_DEV_XV401  AT %MW108 : WORD;
    ST_DEV_XV402  AT %MW109 : WORD;
    ST_DEV_XV403  AT %MW110 : WORD;
    ST_DEV_XV404  AT %MW111 : WORD;
    ST_DEV_P311   AT %MW112 : WORD;
    ST_DEV_P312   AT %MW113 : WORD;
    ST_DEV_P313   AT %MW114 : WORD;
    ST_DEV_M511   AT %MW115 : WORD;
    ST_DEV_M521   AT %MW116 : WORD;
    ST_DEV_F601   AT %MW117 : WORD;
    ST_DEV_F602   AT %MW118 : WORD;
    ST_DEV_F603   AT %MW119 : WORD;
    ST_DEV_P531   AT %MW120 : WORD;
    ST_DEV_P541   AT %MW121 : WORD;
    ST_P201_STARTS AT %MW122 : UINT;
    ST_P201_RUNMIN AT %MW123 : UINT;
    ST_F601_STARTS AT %MW124 : UINT;
    ST_F601_RUNMIN AT %MW125 : UINT;
    ST_F602_STARTS AT %MW126 : UINT;
    ST_F602_RUNMIN AT %MW127 : UINT;
    ST_F603_STARTS AT %MW128 : UINT;
    ST_F603_RUNMIN AT %MW129 : UINT;
    ST_P531_STARTS AT %MW130 : UINT;
    ST_P531_RUNMIN AT %MW131 : UINT;
    ST_P541_STARTS AT %MW132 : UINT;
    ST_P541_RUNMIN AT %MW133 : UINT;
    ST_XV401_CYC  AT %MW134 : UINT;
    ST_XV402_CYC  AT %MW135 : UINT;
    ST_XV403_CYC  AT %MW136 : UINT;
    ST_XV404_CYC  AT %MW137 : UINT;
    ST_M511_REV   AT %MW138 : UINT;
    ST_M521_CYC   AT %MW139 : UINT;

    (* ===== 1. Clocks ===== *)
    init_done   : BOOL;
    scan_cnt    : INT;
    sec_cnt     : INT;
    vent_cnt    : INT;
    sec_pulse   : BOOL;      (* one scan every second *)
    min_pulse   : BOOL;      (* one scan every minute *)
    pi_tick     : BOOL;      (* every 0.5 s: dosing loops *)
    vent_tick   : BOOL;      (* every 5 s: vent temperature loop *)
    blink       : BOOL;      (* 1 Hz flasher *)

    (* ===== 2. Input conditioning ===== *)
    ai_lt       : FB_AnalogIn;
    ai_ft       : FB_AnalogIn;
    ai_pt       : FB_AnalogIn;
    ai_ec       : FB_AnalogIn;
    ai_pha      : FB_AnalogIn;
    ai_phb      : FB_AnalogIn;
    ai_drn      : FB_AnalogIn;
    ai_rad      : FB_AnalogIn;
    ai_tout     : FB_AnalogIn;
    ai_rhout    : FB_AnalogIn;
    ai_wind     : FB_AnalogIn;
    ai_tin      : FB_AnalogIn;
    ai_rhin     : FB_AnalogIn;
    ai_co2      : FB_AnalogIn;
    ai_zt       : FB_AnalogIn;
    tf_lt       : TON;       (* signal fault debounce, 1 s *)
    tf_ft       : TON;
    tf_pt       : TON;
    tf_ec       : TON;
    tf_pha      : TON;
    tf_phb      : TON;
    tf_drn      : TON;
    tf_rad      : TON;
    tf_tout     : TON;
    tf_rhout    : TON;
    tf_wind     : TON;
    tf_tin      : TON;
    tf_rhin     : TON;
    tf_co2      : TON;
    tf_zt       : TON;
    level       : REAL;      (* % *)
    flow        : REAL;      (* L/h *)
    press       : REAL;      (* bar *)
    ec          : REAL;      (* mS/cm *)
    ph          : REAL;      (* validated pH, FDS 7.4 *)
    ph_valid    : BOOL;
    ph_both     : BOOL;
    tmr_phdev   : TON;
    drain_flow  : REAL;      (* L/h *)
    rad         : REAL;      (* W/m2 *)
    wind        : REAL;      (* m/s *)
    t_in        : REAL;      (* degC *)
    rh_in       : REAL;      (* % *)
    vpd         : REAL;      (* kPa *)
    vent_pos    : REAL;      (* % *)
    tt_ok       : BOOL;
    rh_ok       : BOOL;
    rad_ok      : BOOL;
    wind_ok     : BOOL;
    zt_ok       : BOOL;

    (* ===== 3. Time of day ===== *)
    clk_prev    : UINT;
    clk_changed : BOOL;
    tmr_clk     : TON;
    clock_fault : BOOL;
    midnight    : BOOL;
    tmr_daylight : TON;
    in_window   : BOOL;

    (* ===== 4. Commands and setpoints ===== *)
    rt_start    : R_TRIG;
    rt_stop     : R_TRIG;
    rt_reset    : R_TRIG;
    cmd_start   : BOOL;
    cmd_stop    : BOOL;
    cmd_reset   : BOOL;
    cmd_now     : BOOL;
    cmd_abort   : BOOL;
    cmd_irr_auto : BOOL;
    cmd_irr_man : BOOL;
    cmd_clim_auto : BOOL;
    cmd_clim_man : BOOL;
    x_ec       : REAL;
    x_ph       : REAL;
    x_ec_band  : REAL;
    x_ph_band  : REAL;
    x_vent     : REAL;
    x_cool     : REAL;
    x_rh_max   : REAL;
    x_vpd_fog  : REAL;
    x_screen   : REAL;
    x_wind_lim : REAL;
    x_storm    : REAL;
    x_rain_pos : REAL;

    (* ===== 5. Alarms (FDS 12) ===== *)
    a00 : BOOL; a01 : BOOL; a02 : BOOL; a03 : BOOL; a04 : BOOL; a05 : BOOL; a06 : BOOL;
    a07 : BOOL; a08 : BOOL; a09 : BOOL; a10 : BOOL; a11 : BOOL; a12 : BOOL; a13 : BOOL;
    a14 : BOOL; a15 : BOOL; a16 : BOOL; a17 : BOOL; a18 : BOOL; a19 : BOOL; a20 : BOOL;
    a21 : BOOL; a22 : BOOL; a23 : BOOL; a24 : BOOL; a25 : BOOL; a26 : BOOL; a27 : BOOL;
    a28 : BOOL; a29 : BOOL; a30 : BOOL; a31 : BOOL; a32 : BOOL; a33 : BOOL; a34 : BOOL;
    a35 : BOOL; a36 : BOOL; a37 : BOOL; a38 : BOOL; a39 : BOOL; a40 : BOOL; a41 : BOOL;
    a42 : BOOL; a43 : BOOL; a44 : BOOL; a45 : BOOL; a46 : BOOL; a47 : BOOL; a48 : BOOL;
    tmr_lsl201  : TON;
    tmr_phi     : TON;
    tmr_plo     : TON;
    tmr_echh    : TON;
    tmr_phll    : TON;
    tmr_lsl311  : TON;
    tmr_lsl312  : TON;
    tmr_lsl313  : TON;
    tmr_m511    : TON;
    tmr_m521    : TON;
    tmr_lsl531  : TON;
    tmr_thi     : TON;
    tmr_thh     : TON;
    tmr_co2lo   : TON;
    alm_act1    : WORD;
    alm_act2    : WORD;
    alm_act3    : WORD;
    alm_act4    : WORD;
    alm_latch1  : WORD;
    alm_latch2  : WORD;
    alm_latch3  : WORD;
    alm_latch4  : WORD;
    trip_irr    : BOOL;      (* any irrigation trip alarm latched *)
    red_act     : BOOL;
    red_latched : BOOL;
    warn_act    : BOOL;
    lk_p201     : BOOL;      (* lock-outs: latched alarm blocks the device *)
    lk_p311     : BOOL;
    lk_p312     : BOOL;
    lk_p313     : BOOL;
    lk_vent     : BOOL;
    lk_net      : BOOL;
    lk_f601     : BOOL;
    lk_f602     : BOOL;
    lk_f603     : BOOL;
    lk_p531     : BOOL;
    lk_p541     : BOOL;
    lk_press_hi : BOOL;
    lk_ec_hh    : BOOL;
    lk_ph_ll    : BOOL;
    vent_prot   : BOOL;
    net_prot    : BOOL;

    (* ===== 6. Modes ===== *)
    irr_manual  : BOOL;
    clim_manual : BOOL;
    irr_enabled : BOOL := TRUE;    (* IRR_ENABLE_AT_START, FDS 5.1 *)

    (* ===== 7. Irrigation (FDS 6) ===== *)
    step        : INT := 0;
    last_step   : INT := -1;
    step_scans  : INT;
    step_secs   : UINT;
    resume      : BOOL;      (* paused zone pending *)
    zone        : INT;       (* active zone 1..4, 0 = none *)
    zone_shot   : REAL;      (* L, read at zone start *)
    zone_ref    : REAL;      (* L/h, read at zone start *)
    zone_vol    : REAL;      (* L delivered *)
    zone_secs   : UINT;      (* time in SHOT for this zone *)
    zone_open_secs : UINT;   (* valve open without overlap *)
    zone_timeout : BOOL;
    zone_bit    : WORD;
    en1 : BOOL; en2 : BOOL; en3 : BOOL; en4 : BOOL;
    first_zone  : INT;
    nxt_zone    : INT;
    ovl_cnt     : INT;       (* scans of changeover overlap left *)
    ovl_zone    : INT;       (* zone held open during overlap *)
    ovl_ret     : BOOL;      (* return valve held open during overlap *)
    zr_main     : INT;
    zr_ovl      : INT;
    in_band     : BOOL;
    tmr_inband  : TON;
    tmr_outband : TON;
    flow_chk    : BOOL;
    tmr_fhi     : TON;
    tmr_flo     : TON;
    zone_diag   : WORD;
    rad_sum     : REAL;      (* J/cm2 since last cycle start *)
    min_since   : UINT;      (* min since last cycle start *)
    auto_start  : BOOL;
    cycles_day  : UINT;
    req_p201    : BOOL;
    req_xv301   : BOOL;
    req_z1 : BOOL; req_z2 : BOOL; req_z3 : BOOL; req_z4 : BOOL;
    dose_req    : BOOL;
    drain_eval  : BOOL;

    (* ===== 8. Refill ===== *)
    refill_req  : BOOL;
    refill_ref  : REAL;
    rt_refill   : R_TRIG;
    tmr_refill  : TON;

    (* ===== 9. Climate (FDS 8) ===== *)
    clim_state  : INT := 10;
    clim_last   : INT := -1;
    clim_secs   : UINT;
    rain_act    : BOOL;
    wind_act    : BOOL;
    storm_act   : BOOL;
    tmr_rain_off : TON;
    tmr_wind_off : TON;
    tmr_storm_off : TON;
    weather_max : REAL;
    pid_vent    : FB_PIControl;
    vent_en     : BOOL;
    temp_dem    : REAL;
    hum_dem     : REAL;
    demand      : REAL;
    held        : BOOL;
    tmr_cool    : TON;
    tmr_cool_exit : TON;
    tmr_nofan   : TON;
    fan_stage   : INT;
    tmr_up2     : TON;
    tmr_up3     : TON;
    tmr_dn2     : TON;
    tmr_dn3     : TON;
    n_fans      : INT;
    fan_cnt     : INT;
    req_f601 : BOOL; req_f602 : BOOL; req_f603 : BOOL;
    req_pad     : BOOL;
    fog_dem     : BOOL;
    fog_active  : BOOL;
    fog_sec     : INT;
    req_fog     : BOOL;
    vent_sp     : REAL;
    vent_err    : REAL;
    pos_open    : BOOL;
    pos_close   : BOOL;
    vents_closed : BOOL;
    tmr_net_on  : TON;
    tmr_net_off : TON;
    net_dem     : BOOL;
    t_hi        : BOOL;
    t_ok        : BOOL;
    net_deploy_req : BOOL;
    net_retract_req : BOOL;

    (* ===== 10. Interlocks and devices (FDS 10, 11) ===== *)
    estop_w     : WORD;
    ilk_refill  : WORD;
    ilk_pump    : WORD;
    ilk_return  : WORD;
    ilk_zone    : WORD;
    ilk_dose_ab : WORD;
    ilk_acid    : WORD;
    ilk_vo      : WORD;      (* vent open, without the reversal bit *)
    ilk_vc      : WORD;
    ilk_nd      : WORD;      (* net deploy *)
    ilk_nr      : WORD;      (* net retract *)
    ilk_fan     : WORD;
    ilk_pad     : WORD;
    ilk_fog     : WORD;
    any_zone    : BOOL;
    dev_xv201   : FB_Valve;
    dev_xv301   : FB_Valve;
    dev_xv401   : FB_Valve;
    dev_xv402   : FB_Valve;
    dev_xv403   : FB_Valve;
    dev_xv404   : FB_Valve;
    dev_p201    : FB_Motor;
    dev_p311    : FB_Motor;
    dev_p312    : FB_Motor;
    dev_p313    : FB_Motor;
    dev_f601    : FB_Motor;
    dev_f602    : FB_Motor;
    dev_f603    : FB_Motor;
    dev_p531    : FB_Motor;
    dev_p541    : FB_Motor;
    dev_vent    : FB_Actuator;
    dev_net     : FB_Actuator;

    (* ===== 11. Dosing (FDS 7) ===== *)
    pid_ec      : FB_PIControl;
    pid_ph      : FB_PIControl;
    tmr_flow_ok : TON;       (* flow established for dosing *)
    flow_ok     : BOOL;
    ec_en       : BOOL;
    ph_en       : BOOL;
    dose_ab     : REAL;      (* % *)
    dose_a      : REAL;
    dose_b      : REAL;
    dose_acid   : REAL;

    (* ===== 12. Daily counters (FDS 6.5) ===== *)
    water_day   : REAL;      (* L *)
    z1_supply   : REAL;      (* L into Z1 today *)
    drain_l     : REAL;      (* L drained from Z1 today *)
    drain_pct   : REAL;
    drain_alm   : BOOL;
    cycles_prev : UINT;
    water_prev  : REAL;
    drain_prev  : REAL;
END_VAR
VAR CONSTANT
    SCANS_PER_S   : INT := 20;        (* 50 ms task: 20 scans = 1 s (FDS 5.3) *)
    DT_SCAN       : REAL := 0.05;     (* s *)
    OVERLAP_SCANS : INT := 40;        (* 2 s zone changeover overlap *)
    TRIP_IRR1     : WORD := 16#C7F5;  (* A00 A02 A04..A10 A14 A15 *)
    TRIP_IRR2     : WORD := 16#04E1;  (* A16 A21 A22 A23 A26 *)
    RED1          : WORD := 16#C7F5;  (* trip / lock-out / alarm classes: red lamp *)
    RED2          : WORD := 16#04E1;
    RED3          : WORD := 16#AFF1;  (* A32 A36..A43 A45 A47 *)
    WARN1         : WORD := 16#380A;  (* warning class = NOT REDn *)
    WARN2         : WORD := 16#FB1E;
    WARN3         : WORD := 16#500E;
    REFILL_ON     : REAL := 40.0;     (* % *)
    REFILL_OFF    : REAL := 85.0;
    LEVEL_HI_ILK  : REAL := 95.0;
    PRESS_HI      : REAL := 3.9;      (* bar, A05 *)
    PRESS_LO      : REAL := 0.8;      (* bar, A06 *)
    FLOW_DOSE_MIN : REAL := 500.0;    (* L/h *)
    ZONE_FLOW_HI  : REAL := 1.25;
    ZONE_FLOW_LO  : REAL := 0.75;
    T_BAND_MAX    : UINT := 180;      (* s, A10 *)
    EC_HH_MARGIN  : REAL := 1.0;      (* mS/cm *)
    PH_LL         : REAL := 4.5;
    PH_DEV        : REAL := 0.3;
    EC_BASE       : REAL := 0.3;      (* mS/cm, raw water (feedforward) *)
    FF_EC_DIV     : REAL := 80.0;     (* A+B at s % add 80 * s / Q mS/cm *)
    FF_ACID       : REAL := 13.0;     (* % per m3/h *)
    EC_KP         : REAL := 8.0;     (* % per mS/cm *)
    EC_TI         : REAL := 12.0;     (* s *)
    PH_KP         : REAL := 5.0;     (* % per pH *)
    PH_TI         : REAL := 12.0;     (* s *)
    EC_IZONE      : REAL := 0.5;      (* mS/cm *)
    PH_IZONE      : REAL := 0.5;      (* pH *)
    PI_DT         : REAL := 0.5;      (* s, pi_tick *)
    VENT_KP       : REAL := 15.0;     (* % per degC *)
    VENT_TI       : REAL := 600.0;    (* s *)
    VENT_DT       : REAL := 5.0;      (* s, vent_tick *)
    VENT_DB       : REAL := 2.0;      (* %, positioner start *)
    VENT_STOP     : REAL := 0.5;      (* %, positioner stop *)
    VENT_FALLBACK : REAL := 50.0;
    VENT_WIND_MAX : REAL := 30.0;
    VENT_CLOSED   : REAL := 5.0;
    HUM_GAIN      : REAL := 5.0;      (* % vent per % RH *)
    HUM_MAX       : REAL := 50.0;
    NET_RAD_HYST  : REAL := 150.0;    (* W/m2 *)
    NET_T_ON      : REAL := 4.0;      (* degC above vent SP *)
    NET_T_OFF     : REAL := 2.0;
    FOG_ON        : INT := 10;        (* s *)
    FOG_CYCLE     : INT := 60;        (* s: 10 s on, 50 s off *)
    FOG_VPD_HYST  : REAL := 0.30;     (* kPa *)
    RH_FOG_MAX    : REAL := 90.0;
    COOL_EXIT     : REAL := 3.0;      (* degC below cool SP *)
    T_PREWET      : UINT := 60;       (* s *)
    T_PADDRY      : UINT := 300;      (* s *)
    TEMP_HI       : REAL := 38.0;
    TEMP_HH       : REAL := 42.0;
    CO2_LO        : REAL := 300.0;
    DRAIN_LO      : REAL := 10.0;     (* % *)
    DRAIN_HI      : REAL := 50.0;
    DRAIN_MIN_CYC : UINT := 5;
END_VAR

    (* ===================== 1. Clocks (FDS 5.3) ===================== *)
    scan_cnt := scan_cnt + 1;
    IF scan_cnt >= SCANS_PER_S THEN
        scan_cnt := 0;
    END_IF;
    sec_pulse := scan_cnt = 0;
    pi_tick := (scan_cnt = 0) OR (scan_cnt = SCANS_PER_S / 2);
    IF pi_tick THEN
        blink := NOT blink;
    END_IF;
    min_pulse := FALSE;
    vent_tick := FALSE;
    IF sec_pulse THEN
        sec_cnt := sec_cnt + 1;
        IF sec_cnt >= 60 THEN
            sec_cnt := 0;
            min_pulse := TRUE;
        END_IF;
        vent_cnt := vent_cnt + 1;
        IF vent_cnt >= 5 THEN
            vent_cnt := 0;
            vent_tick := TRUE;
        END_IF;
    END_IF;

    (* ===================== 2. Input conditioning ===================== *)
    ai_lt(RAW := LT201_RAW, LO_EU := 0.0, HI_EU := 100.0);
    ai_ft(RAW := FT201_RAW, LO_EU := 0.0, HI_EU := 6000.0);
    ai_pt(RAW := PT201_RAW, LO_EU := 0.0, HI_EU := 6.0);
    ai_ec(RAW := AIT301_RAW, LO_EU := 0.0, HI_EU := 5.0);
    ai_pha(RAW := AIT302_RAW, LO_EU := 0.0, HI_EU := 14.0);
    ai_phb(RAW := AIT303_RAW, LO_EU := 0.0, HI_EU := 14.0);
    ai_drn(RAW := FT402_RAW, LO_EU := 0.0, HI_EU := 200.0);
    ai_rad(RAW := RT101_RAW, LO_EU := 0.0, HI_EU := 1500.0);
    ai_tout(RAW := TT101_RAW, LO_EU := 0.0, HI_EU := 50.0);
    ai_rhout(RAW := MT101_RAW, LO_EU := 0.0, HI_EU := 100.0);
    ai_wind(RAW := ST101_RAW, LO_EU := 0.0, HI_EU := 40.0);
    ai_tin(RAW := TT501_RAW, LO_EU := 0.0, HI_EU := 50.0);
    ai_rhin(RAW := MT501_RAW, LO_EU := 0.0, HI_EU := 100.0);
    ai_co2(RAW := AT502_RAW, LO_EU := 0.0, HI_EU := 2000.0);
    ai_zt(RAW := ZT511_RAW, LO_EU := 0.0, HI_EU := 100.0);
    tf_lt(IN := ai_lt.FAULT, PT := T#1s);
    tf_ft(IN := ai_ft.FAULT, PT := T#1s);
    tf_pt(IN := ai_pt.FAULT, PT := T#1s);
    tf_ec(IN := ai_ec.FAULT, PT := T#1s);
    tf_pha(IN := ai_pha.FAULT, PT := T#1s);
    tf_phb(IN := ai_phb.FAULT, PT := T#1s);
    tf_drn(IN := ai_drn.FAULT, PT := T#1s);
    tf_rad(IN := ai_rad.FAULT, PT := T#1s);
    tf_tout(IN := ai_tout.FAULT, PT := T#1s);
    tf_rhout(IN := ai_rhout.FAULT, PT := T#1s);
    tf_wind(IN := ai_wind.FAULT, PT := T#1s);
    tf_tin(IN := ai_tin.FAULT, PT := T#1s);
    tf_rhin(IN := ai_rhin.FAULT, PT := T#1s);
    tf_co2(IN := ai_co2.FAULT, PT := T#1s);
    tf_zt(IN := ai_zt.FAULT, PT := T#1s);
    level := ai_lt.VALUE;
    flow := ai_ft.VALUE;
    press := ai_pt.VALUE;
    ec := ai_ec.VALUE;
    drain_flow := ai_drn.VALUE;
    rad := ai_rad.VALUE;
    wind := ai_wind.VALUE;
    t_in := ai_tin.VALUE;
    rh_in := ai_rhin.VALUE;
    vent_pos := ai_zt.VALUE;
    tt_ok := NOT ai_tin.FAULT;
    rh_ok := NOT ai_rhin.FAULT;
    rad_ok := NOT ai_rad.FAULT;
    wind_ok := NOT ai_wind.FAULT;
    zt_ok := NOT ai_zt.FAULT;

    (* pH validation, 1oo2 with fallback (FDS 7.4) *)
    ph_both := NOT ai_pha.FAULT AND NOT ai_phb.FAULT;
    IF ph_both THEN
        ph := (ai_pha.VALUE + ai_phb.VALUE) / 2.0;
    ELSIF NOT ai_pha.FAULT THEN
        ph := ai_pha.VALUE;
    ELSIF NOT ai_phb.FAULT THEN
        ph := ai_phb.VALUE;
    END_IF;
    tmr_phdev(IN := ph_both AND (ABS(ai_pha.VALUE - ai_phb.VALUE) > PH_DEV), PT := T#10s);
    ph_valid := (NOT ai_pha.FAULT OR NOT ai_phb.FAULT) AND NOT tmr_phdev.Q;

    (* VPD (FDS 8.6), FAO-56 saturation vapour pressure *)
    IF tt_ok AND rh_ok THEN
        vpd := 0.6108 * EXP(17.27 * t_in / (t_in + 237.3)) * (1.0 - rh_in / 100.0);
    END_IF;

    (* ===================== 3. Time of day (FDS 5.3) ===================== *)
    clk_changed := CLOCK_MIN <> clk_prev;
    tmr_clk(IN := NOT clk_changed, PT := T#150s);
    clock_fault := tmr_clk.Q OR (CLOCK_MIN > 1439);
    midnight := NOT clock_fault AND clk_changed AND (clk_prev >= 1430) AND (CLOCK_MIN < 10);
    clk_prev := CLOCK_MIN;
    tmr_daylight(IN := rad_ok AND (rad >= 50.0), PT := T#5m);
    IF NOT clock_fault THEN
        in_window := (CLOCK_MIN >= SP_DAY_START) AND (CLOCK_MIN < SP_DAY_END);
    ELSIF rad_ok THEN
        in_window := tmr_daylight.Q;
    ELSE
        in_window := TRUE;   (* no clock, no radiation: watering at night is the smaller risk *)
    END_IF;

    (* ===================== 4. Commands and setpoints (FDS 5.2, 5.4) ===================== *)
    rt_start(CLK := PB_START);
    rt_stop(CLK := NOT PB_STOP_OK);
    rt_reset(CLK := PB_RESET);
    cmd_start := (rt_start.Q OR ((HMI_CMD AND 16#0001) <> 16#0000)) AND PB_STOP_OK;
    cmd_stop := rt_stop.Q OR ((HMI_CMD AND 16#0002) <> 16#0000);
    cmd_reset := rt_reset.Q OR ((HMI_CMD AND 16#0004) <> 16#0000);
    cmd_now := (HMI_CMD AND 16#0008) <> 16#0000;
    cmd_abort := (HMI_CMD AND 16#0010) <> 16#0000;
    cmd_irr_auto := (HMI_CMD AND 16#0020) <> 16#0000;
    cmd_irr_man := (HMI_CMD AND 16#0040) <> 16#0000;
    cmd_clim_auto := (HMI_CMD AND 16#0080) <> 16#0000;
    cmd_clim_man := (HMI_CMD AND 16#0100) <> 16#0000;
    HMI_CMD := 16#0000;    (* acknowledge: commands are one-shot *)

    SP_EC := LIMIT(50, SP_EC, 400);
    SP_PH := LIMIT(500, SP_PH, 680);
    SP_EC_BAND := LIMIT(10, SP_EC_BAND, 50);
    SP_PH_BAND := LIMIT(10, SP_PH_BAND, 50);
    SP_DAY_START := LIMIT(0, SP_DAY_START, 1380);
    SP_DAY_END := LIMIT(SP_DAY_START + 30, SP_DAY_END, 1439);
    SP_RAD_SUM := LIMIT(30, SP_RAD_SUM, 300);
    SP_MIN_INT := LIMIT(5, SP_MIN_INT, 240);
    SP_MAX_INT := LIMIT(SP_MIN_INT, SP_MAX_INT, 480);
    SP_MAX_CYCLES := LIMIT(1, SP_MAX_CYCLES, 60);
    SP_SHOT_Z1 := LIMIT(10, SP_SHOT_Z1, 300);
    SP_SHOT_Z2 := LIMIT(10, SP_SHOT_Z2, 300);
    SP_SHOT_Z3 := LIMIT(10, SP_SHOT_Z3, 300);
    SP_SHOT_Z4 := LIMIT(10, SP_SHOT_Z4, 300);
    SP_FLOW_Z1 := LIMIT(200, SP_FLOW_Z1, 3000);
    SP_FLOW_Z2 := LIMIT(200, SP_FLOW_Z2, 3000);
    SP_FLOW_Z3 := LIMIT(200, SP_FLOW_Z3, 3000);
    SP_FLOW_Z4 := LIMIT(200, SP_FLOW_Z4, 3000);
    SP_ZONE_EN := SP_ZONE_EN AND 16#000F;
    SP_VENT_T := LIMIT(200, SP_VENT_T, 350);
    SP_COOL_T := LIMIT(SP_VENT_T + 10, SP_COOL_T, 400);
    SP_RH_MAX := LIMIT(600, SP_RH_MAX, 950);
    SP_VPD_FOG := LIMIT(80, SP_VPD_FOG, 250);
    SP_SCREEN_RAD := LIMIT(300, SP_SCREEN_RAD, 1000);
    SP_WIND_LIM := LIMIT(50, SP_WIND_LIM, 200);
    SP_STORM := LIMIT(SP_WIND_LIM + 10, SP_STORM, 250);
    SP_RAIN_POS := LIMIT(0, SP_RAIN_POS, 300);
    x_ec := UINT_TO_REAL(SP_EC) / 100.0;
    x_ph := UINT_TO_REAL(SP_PH) / 100.0;
    x_ec_band := UINT_TO_REAL(SP_EC_BAND) / 100.0;
    x_ph_band := UINT_TO_REAL(SP_PH_BAND) / 100.0;
    x_vent := UINT_TO_REAL(SP_VENT_T) / 10.0;
    x_cool := UINT_TO_REAL(SP_COOL_T) / 10.0;
    x_rh_max := UINT_TO_REAL(SP_RH_MAX) / 10.0;
    x_vpd_fog := UINT_TO_REAL(SP_VPD_FOG) / 100.0;
    x_screen := UINT_TO_REAL(SP_SCREEN_RAD);
    x_wind_lim := UINT_TO_REAL(SP_WIND_LIM) / 10.0;
    x_storm := UINT_TO_REAL(SP_STORM) / 10.0;
    x_rain_pos := UINT_TO_REAL(SP_RAIN_POS) / 10.0;

    IF NOT init_done THEN
        min_since := SP_MAX_INT;     (* first cycle in the window starts at once (FDS 6.1) *)
        init_done := TRUE;
    END_IF;

    (* ===================== 5. Alarms (FDS 12) =====================
       Device diagnostics come from the previous scan's device calls. *)
    tmr_lsl201(IN := NOT LSL201_OK, PT := T#2s);
    tmr_phi(IN := NOT ai_pt.FAULT AND (press >= PRESS_HI), PT := T#1s);
    tmr_plo(IN := NOT ai_pt.FAULT AND (press < PRESS_LO) AND dev_p201.RUNNING, PT := T#15s);
    tmr_echh(IN := NOT ai_ec.FAULT AND (ec >= x_ec + EC_HH_MARGIN) AND dev_p201.RUNNING, PT := T#5s);
    tmr_phll(IN := ph_valid AND (ph <= PH_LL) AND dev_p201.RUNNING, PT := T#5s);
    tmr_lsl311(IN := NOT LSL311_OK, PT := T#2s);
    tmr_lsl312(IN := NOT LSL312_OK, PT := T#2s);
    tmr_lsl313(IN := NOT LSL313_OK, PT := T#2s);
    tmr_m511(IN := NOT M511_OK, PT := T#1s);
    tmr_m521(IN := NOT M521_OK, PT := T#1s);
    tmr_lsl531(IN := NOT LSL531_OK, PT := T#5s);
    tmr_thi(IN := tt_ok AND (t_in >= TEMP_HI), PT := T#60s);
    tmr_thh(IN := tt_ok AND (t_in >= TEMP_HH), PT := T#60s);
    tmr_co2lo(IN := NOT ai_co2.FAULT AND (ai_co2.VALUE < CO2_LO), PT := T#10m);

    a00 := NOT ESTOP_OK;
    a01 := clock_fault;
    a02 := tmr_lsl201.Q;
    a04 := dev_p201.DISCREP;
    a05 := tmr_phi.Q;
    a06 := tmr_plo.Q;
    a07 := tmr_echh.Q;
    a08 := tmr_phll.Q;
    a09 := tmr_phdev.Q;
    a10 := ((step = 10) OR (step = 25)) AND (step = last_step) AND (step_secs >= T_BAND_MAX);
    a11 := tmr_lsl311.Q;
    a12 := tmr_lsl312.Q;
    a13 := tmr_lsl313.Q;
    a14 := dev_p311.DISCREP;
    a15 := dev_p312.DISCREP;
    a16 := dev_p313.DISCREP;
    a20 := tf_lt.Q;
    a21 := tf_ft.Q;
    a22 := tf_pt.Q;
    a23 := tf_ec.Q;
    a24 := tf_pha.Q;
    a25 := tf_phb.Q;
    a26 := tf_pha.Q AND tf_phb.Q;
    a27 := tf_drn.Q;
    a28 := drain_alm;
    a29 := tf_rad.Q;
    a30 := tf_wind.Q;
    a31 := tf_tout.Q OR tf_rhout.Q;
    a32 := tf_tin.Q;
    a33 := tf_rhin.Q;
    a34 := tf_co2.Q;
    a35 := tf_zt.Q;
    a36 := dev_vent.TRAVEL_FLT;
    a37 := dev_net.TRAVEL_FLT;
    a38 := tmr_m511.Q;
    a39 := tmr_m521.Q;
    a40 := dev_f601.DISCREP;
    a41 := dev_f602.DISCREP;
    a42 := dev_f603.DISCREP;
    a43 := dev_p531.DISCREP;
    a44 := tmr_lsl531.Q;
    a45 := dev_p541.DISCREP;
    a46 := tmr_thi.Q;
    a47 := tmr_thh.Q;
    a48 := tmr_co2lo.Q;
    (* a03 (refill), a17..a19 (zone diagnostics) are set in sections 7 and 8 of the
       previous scan *)

    alm_act1 := BOOL_TO_WORD(a00) OR SHL(BOOL_TO_WORD(a01), 1) OR SHL(BOOL_TO_WORD(a02), 2)
             OR SHL(BOOL_TO_WORD(a03), 3) OR SHL(BOOL_TO_WORD(a04), 4) OR SHL(BOOL_TO_WORD(a05), 5)
             OR SHL(BOOL_TO_WORD(a06), 6) OR SHL(BOOL_TO_WORD(a07), 7) OR SHL(BOOL_TO_WORD(a08), 8)
             OR SHL(BOOL_TO_WORD(a09), 9) OR SHL(BOOL_TO_WORD(a10), 10) OR SHL(BOOL_TO_WORD(a11), 11)
             OR SHL(BOOL_TO_WORD(a12), 12) OR SHL(BOOL_TO_WORD(a13), 13) OR SHL(BOOL_TO_WORD(a14), 14)
             OR SHL(BOOL_TO_WORD(a15), 15);
    alm_act2 := BOOL_TO_WORD(a16) OR SHL(BOOL_TO_WORD(a17), 1) OR SHL(BOOL_TO_WORD(a18), 2)
             OR SHL(BOOL_TO_WORD(a19), 3) OR SHL(BOOL_TO_WORD(a20), 4) OR SHL(BOOL_TO_WORD(a21), 5)
             OR SHL(BOOL_TO_WORD(a22), 6) OR SHL(BOOL_TO_WORD(a23), 7) OR SHL(BOOL_TO_WORD(a24), 8)
             OR SHL(BOOL_TO_WORD(a25), 9) OR SHL(BOOL_TO_WORD(a26), 10) OR SHL(BOOL_TO_WORD(a27), 11)
             OR SHL(BOOL_TO_WORD(a28), 12) OR SHL(BOOL_TO_WORD(a29), 13) OR SHL(BOOL_TO_WORD(a30), 14)
             OR SHL(BOOL_TO_WORD(a31), 15);
    alm_act3 := BOOL_TO_WORD(a32) OR SHL(BOOL_TO_WORD(a33), 1) OR SHL(BOOL_TO_WORD(a34), 2)
             OR SHL(BOOL_TO_WORD(a35), 3) OR SHL(BOOL_TO_WORD(a36), 4) OR SHL(BOOL_TO_WORD(a37), 5)
             OR SHL(BOOL_TO_WORD(a38), 6) OR SHL(BOOL_TO_WORD(a39), 7) OR SHL(BOOL_TO_WORD(a40), 8)
             OR SHL(BOOL_TO_WORD(a41), 9) OR SHL(BOOL_TO_WORD(a42), 10) OR SHL(BOOL_TO_WORD(a43), 11)
             OR SHL(BOOL_TO_WORD(a44), 12) OR SHL(BOOL_TO_WORD(a45), 13) OR SHL(BOOL_TO_WORD(a46), 14)
             OR SHL(BOOL_TO_WORD(a47), 15);
    alm_act4 := BOOL_TO_WORD(a48);

    alm_latch1 := alm_latch1 OR alm_act1;
    alm_latch2 := alm_latch2 OR alm_act2;
    alm_latch3 := alm_latch3 OR alm_act3;
    alm_latch4 := alm_latch4 OR alm_act4;
    IF cmd_reset THEN
        alm_latch1 := alm_act1;      (* only alarms whose condition has gone are reset *)
        alm_latch2 := alm_act2;
        alm_latch3 := alm_act3;
        alm_latch4 := alm_act4;
        zone_diag := 16#0000;
    END_IF;
    trip_irr := ((alm_latch1 AND TRIP_IRR1) <> 16#0000) OR ((alm_latch2 AND TRIP_IRR2) <> 16#0000);
    red_act := ((alm_act1 AND RED1) <> 16#0000) OR ((alm_act2 AND RED2) <> 16#0000)
            OR ((alm_act3 AND RED3) <> 16#0000);
    red_latched := ((alm_latch1 AND RED1) <> 16#0000) OR ((alm_latch2 AND RED2) <> 16#0000)
                OR ((alm_latch3 AND RED3) <> 16#0000);
    warn_act := ((alm_act1 AND WARN1) <> 16#0000) OR ((alm_act2 AND WARN2) <> 16#0000)
             OR ((alm_act3 AND WARN3) <> 16#0000) OR (alm_act4 <> 16#0000);
    lk_p201 := (alm_latch1 AND 16#0010) <> 16#0000;       (* A04 *)
    lk_press_hi := (alm_latch1 AND 16#0020) <> 16#0000;   (* A05 *)
    lk_ec_hh := (alm_latch1 AND 16#0080) <> 16#0000;      (* A07 *)
    lk_ph_ll := (alm_latch1 AND 16#0100) <> 16#0000;      (* A08 *)
    lk_p311 := (alm_latch1 AND 16#4000) <> 16#0000;       (* A14 *)
    lk_p312 := (alm_latch1 AND 16#8000) <> 16#0000;       (* A15 *)
    lk_p313 := (alm_latch2 AND 16#0001) <> 16#0000;       (* A16 *)
    lk_vent := (alm_latch3 AND 16#0010) <> 16#0000;       (* A36 *)
    lk_net := (alm_latch3 AND 16#0020) <> 16#0000;        (* A37 *)
    vent_prot := NOT M511_OK OR ((alm_latch3 AND 16#0040) <> 16#0000);   (* A38 *)
    net_prot := NOT M521_OK OR ((alm_latch3 AND 16#0080) <> 16#0000);    (* A39 *)
    lk_f601 := (alm_latch3 AND 16#0100) <> 16#0000;       (* A40 *)
    lk_f602 := (alm_latch3 AND 16#0200) <> 16#0000;       (* A41 *)
    lk_f603 := (alm_latch3 AND 16#0400) <> 16#0000;       (* A42 *)
    lk_p531 := (alm_latch3 AND 16#0800) <> 16#0000;       (* A43 *)
    lk_p541 := (alm_latch3 AND 16#2000) <> 16#0000;       (* A45 *)

    (* ===================== 6. Modes (FDS 5.1) ===================== *)
    IF cmd_irr_man AND ((step = 0) OR (step = 99)) THEN
        irr_manual := TRUE;
        step := 0;
        zone := 0;
        resume := FALSE;
    ELSIF cmd_irr_auto AND irr_manual THEN
        irr_manual := FALSE;
    END_IF;
    IF NOT irr_manual THEN
        HMI_MAN_IRR := 16#0000;
        HMI_MAN_DOSE_A := 0;
        HMI_MAN_DOSE_B := 0;
        HMI_MAN_DOSE_ACID := 0;
    END_IF;
    IF cmd_clim_man THEN
        clim_manual := TRUE;
    ELSIF cmd_clim_auto AND clim_manual THEN
        clim_manual := FALSE;
        clim_state := 10;
    END_IF;
    IF NOT clim_manual THEN
        HMI_MAN_CLIM := 16#0000;
        HMI_MAN_VENT := 0;
    END_IF;

    (* ===================== 7. Irrigation (FDS 6) ===================== *)
    IF sec_pulse AND rad_ok AND (rad_sum < 6000.0) THEN
        rad_sum := rad_sum + rad / 10000.0;        (* W/m2 * 1 s -> J/cm2 *)
    END_IF;
    IF min_pulse AND (min_since < 65535) THEN
        min_since := min_since + 1;
    END_IF;
    auto_start := irr_enabled AND in_window AND (cycles_day < SP_MAX_CYCLES)
                  AND (((rad_sum >= UINT_TO_REAL(SP_RAD_SUM)) AND (min_since >= SP_MIN_INT))
                       OR (min_since >= SP_MAX_INT));

    en1 := (SP_ZONE_EN AND 16#0001) <> 16#0000;
    en2 := (SP_ZONE_EN AND 16#0002) <> 16#0000;
    en3 := (SP_ZONE_EN AND 16#0004) <> 16#0000;
    en4 := (SP_ZONE_EN AND 16#0008) <> 16#0000;
    IF en1 THEN
        first_zone := 1;
    ELSIF en2 THEN
        first_zone := 2;
    ELSIF en3 THEN
        first_zone := 3;
    ELSIF en4 THEN
        first_zone := 4;
    ELSE
        first_zone := 0;
    END_IF;
    nxt_zone := 0;
    IF (zone < 2) AND en2 THEN
        nxt_zone := 2;
    ELSIF (zone < 3) AND en3 THEN
        nxt_zone := 3;
    ELSIF (zone < 4) AND en4 THEN
        nxt_zone := 4;
    END_IF;
    CASE zone OF
    1: zone_bit := 16#0001;
    2: zone_bit := 16#0002;
    3: zone_bit := 16#0004;
    4: zone_bit := 16#0008;
    ELSE
        zone_bit := 16#0000;
    END_CASE;

    in_band := NOT ai_ec.FAULT AND ph_valid AND (ABS(ec - x_ec) <= x_ec_band)
               AND (ABS(ph - x_ph) <= x_ph_band);
    tmr_inband(IN := in_band AND ((step = 10) OR (step = 25)), PT := T#10s);
    tmr_outband(IN := NOT in_band AND (step = 20), PT := T#10s);

    IF step <> last_step THEN
        step_scans := 0;
        step_secs := 0;
        last_step := step;
    ELSE
        IF step_scans < 32000 THEN
            step_scans := step_scans + 1;
        END_IF;
        IF sec_pulse AND (step_secs < 65000) THEN
            step_secs := step_secs + 1;
        END_IF;
    END_IF;
    IF ovl_cnt > 0 THEN
        ovl_cnt := ovl_cnt - 1;
    END_IF;
    IF (step = 20) AND sec_pulse THEN
        zone_secs := zone_secs + 1;
        IF ovl_cnt = 0 THEN
            zone_open_secs := zone_open_secs + 1;
        END_IF;
    END_IF;
    zone_timeout := FALSE;      (* IEC AND does not short-circuit: guard the division *)
    IF zone_ref > 0.0 THEN
        zone_timeout := UINT_TO_REAL(zone_secs) >= 2.0 * zone_shot / zone_ref * 3600.0 + 30.0;
    END_IF;

    (* zone flow diagnostics (FDS 6.3) *)
    flow_chk := (step = 20) AND (ovl_cnt = 0) AND (zone_open_secs >= 20) AND NOT ai_ft.FAULT;
    tmr_fhi(IN := flow_chk AND (flow > ZONE_FLOW_HI * zone_ref), PT := T#20s);
    tmr_flo(IN := flow_chk AND (flow < ZONE_FLOW_LO * zone_ref), PT := T#20s);
    a17 := tmr_fhi.Q;
    a18 := tmr_flo.Q;
    a19 := FALSE;
    IF a17 THEN
        zone_diag := zone_diag OR zone_bit;
    END_IF;
    IF a18 THEN
        zone_diag := zone_diag OR SHL(zone_bit, 4);
    END_IF;

    req_p201 := FALSE;
    req_xv301 := FALSE;
    dose_req := FALSE;
    zr_main := 0;
    zr_ovl := 0;
    drain_eval := FALSE;

    IF NOT irr_manual THEN
        IF trip_irr THEN
            step := 99;
        END_IF;
        IF cmd_stop THEN
            IF (step >= 10) AND (step <= 25) THEN
                step := 80;
                resume := TRUE;
            ELSIF step = 40 THEN
                step := 0;               (* all zones done: the run-down is skipped *)
                zone := 0;
            ELSIF step = 0 THEN
                irr_enabled := FALSE;
            END_IF;
        END_IF;

        CASE step OF
        0:  (* IDLE *)
            IF cmd_start THEN
                irr_enabled := TRUE;
            END_IF;
            IF (auto_start OR cmd_now) AND (first_zone > 0) THEN
                rad_sum := 0.0;
                min_since := 0;
                cycles_day := cycles_day + 1;
                zone := first_zone;
                zone_vol := 0.0;
                zone_secs := 0;
                resume := FALSE;
                step := 10;
            END_IF;

        10: (* PRE-MIX: circulate through XV-301 until EC and pH are in band *)
            req_p201 := TRUE;
            req_xv301 := TRUE;
            dose_req := TRUE;
            IF tmr_inband.Q THEN
                ovl_ret := TRUE;
                ovl_zone := 0;
                ovl_cnt := OVERLAP_SCANS;
                zone_open_secs := 0;
                step := 20;
            END_IF;

        20: (* SHOT: zone valve open, metered by FT-201 *)
            req_p201 := TRUE;
            dose_req := TRUE;
            zr_main := zone;
            IF ovl_cnt > 0 THEN
                IF ovl_ret THEN
                    req_xv301 := TRUE;
                ELSE
                    zr_ovl := ovl_zone;
                END_IF;
            END_IF;
            IF (zone_vol >= zone_shot) OR zone_timeout THEN
                IF zone_timeout AND (zone_vol < zone_shot) THEN
                    zone_diag := zone_diag OR SHL(zone_bit, 8);
                    a19 := TRUE;
                END_IF;
                IF nxt_zone > 0 THEN
                    ovl_zone := zone;
                    ovl_ret := FALSE;
                    ovl_cnt := OVERLAP_SCANS;
                    zone := nxt_zone;
                    zone_vol := 0.0;
                    zone_secs := 0;
                    zone_open_secs := 0;
                ELSE
                    step := 40;
                END_IF;
            ELSIF tmr_outband.Q THEN
                ovl_zone := zone;
                ovl_ret := FALSE;
                ovl_cnt := OVERLAP_SCANS;
                step := 25;
            END_IF;

        25: (* HOLD: out of band, back to recirculation; volume kept *)
            req_p201 := TRUE;
            req_xv301 := TRUE;
            dose_req := TRUE;
            IF ovl_cnt > 0 THEN
                zr_ovl := ovl_zone;
            END_IF;
            IF tmr_inband.Q THEN
                ovl_ret := TRUE;
                ovl_zone := 0;
                ovl_cnt := OVERLAP_SCANS;
                zone_open_secs := 0;
                step := 20;
            END_IF;

        40: (* RUN-DOWN: dosing off, return open, zone closed at 2 s, pump off at 5 s *)
            req_xv301 := TRUE;
            IF step_scans < 2 * SCANS_PER_S THEN
                zr_main := zone;
            END_IF;
            IF step_scans < 5 * SCANS_PER_S THEN
                req_p201 := TRUE;
            END_IF;
            IF step_scans >= 6 * SCANS_PER_S THEN
                drain_eval := TRUE;
                zone := 0;
                step := 0;
            END_IF;

        80: (* PAUSED: irrigation outputs off. START resumes via PRE-MIX *)
            IF cmd_start THEN
                step := 10;
            ELSIF cmd_abort THEN
                resume := FALSE;
                zone := 0;
                step := 0;
            END_IF;

        99: (* FAULT: outputs off until the trip alarms are reset; cycle discarded *)
            resume := FALSE;
            zone := 0;
            IF NOT trip_irr THEN
                step := 0;
            END_IF;

        ELSE
            step := 99;
        END_CASE;
    END_IF;

    (* shot and reference flow of the active zone, read when its shot starts *)
    IF (zone_secs = 0) AND (zone_vol = 0.0) THEN
        CASE zone OF
        1:  zone_shot := UINT_TO_REAL(SP_SHOT_Z1);
            zone_ref := UINT_TO_REAL(SP_FLOW_Z1);
        2:  zone_shot := UINT_TO_REAL(SP_SHOT_Z2);
            zone_ref := UINT_TO_REAL(SP_FLOW_Z2);
        3:  zone_shot := UINT_TO_REAL(SP_SHOT_Z3);
            zone_ref := UINT_TO_REAL(SP_FLOW_Z3);
        4:  zone_shot := UINT_TO_REAL(SP_SHOT_Z4);
            zone_ref := UINT_TO_REAL(SP_FLOW_Z4);
        ELSE
            zone_shot := 0.0;
            zone_ref := 0.0;
        END_CASE;
    END_IF;
    req_z1 := (zr_main = 1) OR (zr_ovl = 1);
    req_z2 := (zr_main = 2) OR (zr_ovl = 2);
    req_z3 := (zr_main = 3) OR (zr_ovl = 3);
    req_z4 := (zr_main = 4) OR (zr_ovl = 4);

    (* ===================== 8. Tank refill (FDS 6.4) ===================== *)
    IF ai_lt.FAULT THEN
        refill_req := FALSE;
    ELSIF level < REFILL_ON THEN
        refill_req := TRUE;
    ELSIF level >= REFILL_OFF THEN
        refill_req := FALSE;
    END_IF;
    rt_refill(CLK := dev_xv201.CMD);
    IF rt_refill.Q THEN
        refill_ref := level;
    END_IF;
    tmr_refill(IN := dev_xv201.CMD, PT := T#600s);
    a03 := tmr_refill.Q AND (level < refill_ref + 2.0);

    (* ===================== 9. Climate (FDS 8) ===================== *)
    (* weather limits, FDS 8.3: apply at once, release after 5 min *)
    tmr_rain_off(IN := RAIN_DRY, PT := T#5m);
    IF NOT RAIN_DRY THEN
        rain_act := TRUE;
    ELSIF tmr_rain_off.Q THEN
        rain_act := FALSE;
    END_IF;
    tmr_wind_off(IN := wind_ok AND (wind < x_wind_lim - 1.0), PT := T#5m);
    IF wind_ok AND (wind >= x_wind_lim) THEN
        wind_act := TRUE;
    ELSIF tmr_wind_off.Q THEN
        wind_act := FALSE;
    END_IF;
    tmr_storm_off(IN := wind_ok AND (wind < x_storm - 1.0), PT := T#5m);
    IF NOT wind_ok OR (wind >= x_storm) THEN
        storm_act := TRUE;
    ELSIF tmr_storm_off.Q THEN
        storm_act := FALSE;
    END_IF;
    weather_max := 100.0;
    IF rain_act THEN
        weather_max := MIN(weather_max, x_rain_pos);
    END_IF;
    IF wind_act THEN
        weather_max := MIN(weather_max, VENT_WIND_MAX);
    END_IF;
    IF storm_act THEN
        weather_max := 0.0;
    END_IF;

    (* vent demand, FDS 8.2 *)
    vent_en := (clim_state = 10) AND NOT clim_manual AND tt_ok AND ESTOP_OK;
    IF vent_tick OR NOT vent_en THEN
        pid_vent(ENABLE := vent_en, SP := x_vent, PV := t_in, FF := 0.0, REVERSE := TRUE,
                 KP := VENT_KP, TI_S := VENT_TI, DT_S := VENT_DT, I_ZONE := 0.0, OUT_MIN := 0.0, OUT_MAX := 100.0);
    END_IF;
    IF tt_ok THEN
        temp_dem := pid_vent.OUT;
    ELSE
        temp_dem := VENT_FALLBACK;
    END_IF;
    IF rh_ok THEN
        hum_dem := LIMIT(0.0, (rh_in - x_rh_max) * HUM_GAIN, HUM_MAX);
    ELSE
        hum_dem := 0.0;
    END_IF;
    demand := MAX(temp_dem, hum_dem);
    held := (rain_act OR wind_act OR storm_act) AND (demand > weather_max);

    (* climate state machine, FDS 8.1 *)
    tmr_cool(IN := (clim_state = 10) AND NOT clim_manual AND tt_ok AND (t_in >= x_cool)
                   AND ((demand >= 90.0) OR held), PT := T#5m);
    tmr_cool_exit(IN := (clim_state = 30) AND (t_in < x_cool - COOL_EXIT), PT := T#10m);
    tmr_nofan(IN := (clim_state = 30) AND NOT (dev_f601.RUNNING OR dev_f602.RUNNING OR dev_f603.RUNNING),
              PT := T#60s);
    IF clim_manual THEN
        clim_state := 90;
    ELSIF NOT ESTOP_OK THEN
        clim_state := 10;
    ELSE
        CASE clim_state OF
        10: (* VENT *)
            IF tmr_cool.Q THEN
                clim_state := 20;
            END_IF;
        20: (* COOL-START: close the vents before pad-and-fan *)
            IF NOT tt_ok THEN
                clim_state := 40;
            ELSIF lk_vent OR vent_prot THEN
                clim_state := 10;        (* vent can't close: pad-and-fan not possible *)
            ELSIF vents_closed THEN
                clim_state := 25;
            END_IF;
        25: (* PRE-WET the pads *)
            IF NOT tt_ok THEN
                clim_state := 40;
            ELSIF clim_secs >= T_PREWET THEN
                fan_stage := 1;
                clim_state := 30;
            END_IF;
        30: (* COOL: pad-and-fan, fans staged on temperature *)
            IF NOT tt_ok OR tmr_cool_exit.Q OR tmr_nofan.Q THEN
                clim_state := 40;
            END_IF;
        40: (* PAD-DRY: one fan dries the pads *)
            IF clim_secs >= T_PADDRY THEN
                clim_state := 10;
            END_IF;
        ELSE
            clim_state := 10;
        END_CASE;
    END_IF;
    IF clim_state <> clim_last THEN
        clim_secs := 0;
        clim_last := clim_state;
    ELSIF sec_pulse AND (clim_secs < 65000) THEN
        clim_secs := clim_secs + 1;
    END_IF;

    (* fan staging, FDS 8.7 *)
    tmr_up2(IN := (clim_state = 30) AND (fan_stage = 1) AND (t_in >= x_cool - 1.0), PT := T#60s);
    tmr_up3(IN := (clim_state = 30) AND (fan_stage = 2) AND (t_in >= x_cool + 1.0), PT := T#60s);
    tmr_dn3(IN := (clim_state = 30) AND (fan_stage = 3) AND (t_in < x_cool + 0.5), PT := T#120s);
    tmr_dn2(IN := (clim_state = 30) AND (fan_stage = 2) AND (t_in < x_cool - 1.5), PT := T#120s);
    IF clim_state <> 30 THEN
        fan_stage := 0;
    ELSIF tmr_up2.Q THEN
        fan_stage := 2;
    ELSIF tmr_up3.Q THEN
        fan_stage := 3;
    ELSIF tmr_dn3.Q THEN
        fan_stage := 2;
    ELSIF tmr_dn2.Q THEN
        fan_stage := 1;
    END_IF;
    IF clim_state = 30 THEN
        n_fans := fan_stage;
    ELSIF clim_state = 40 THEN
        n_fans := 1;
    ELSE
        n_fans := 0;
    END_IF;
    (* a locked-out fan is replaced by the next available one *)
    fan_cnt := 0;
    req_f601 := FALSE;
    req_f602 := FALSE;
    req_f603 := FALSE;
    IF (fan_cnt < n_fans) AND NOT lk_f601 THEN
        req_f601 := TRUE;
        fan_cnt := fan_cnt + 1;
    END_IF;
    IF (fan_cnt < n_fans) AND NOT lk_f602 THEN
        req_f602 := TRUE;
        fan_cnt := fan_cnt + 1;
    END_IF;
    IF (fan_cnt < n_fans) AND NOT lk_f603 THEN
        req_f603 := TRUE;
        fan_cnt := fan_cnt + 1;
    END_IF;
    req_pad := (clim_state = 25) OR (clim_state = 30);

    (* fogging, FDS 8.6 *)
    IF tt_ok AND rh_ok AND (vpd > x_vpd_fog) AND (t_in > x_vent) THEN
        fog_dem := TRUE;
    ELSIF NOT tt_ok OR NOT rh_ok OR (vpd < x_vpd_fog - FOG_VPD_HYST) THEN
        fog_dem := FALSE;
    END_IF;
    fog_active := fog_dem AND (clim_state = 10) AND NOT clim_manual AND NOT rain_act;
    IF NOT fog_active THEN
        fog_sec := 0;
    ELSIF sec_pulse THEN
        fog_sec := fog_sec + 1;
        IF fog_sec >= FOG_CYCLE THEN
            fog_sec := 0;
        END_IF;
    END_IF;
    req_fog := fog_active AND (fog_sec < FOG_ON);

    (* vent position setpoint and 3-point positioner, FDS 8.4.
       Weather limits also cap the manual vent position. *)
    IF clim_manual THEN
        vent_sp := MIN(UINT_TO_REAL(HMI_MAN_VENT) / 10.0, weather_max);
    ELSIF clim_state = 10 THEN
        vent_sp := MIN(demand, weather_max);
    ELSE
        vent_sp := 0.0;
    END_IF;
    vent_sp := LIMIT(0.0, vent_sp, 100.0);
    IF zt_ok THEN
        vent_err := vent_sp - vent_pos;
        IF (vent_err > VENT_DB) OR (vent_sp >= 99.5) THEN
            pos_open := TRUE;
        ELSIF vent_err <= VENT_STOP THEN
            pos_open := FALSE;
        END_IF;
        IF (vent_err < -VENT_DB) OR (vent_sp <= 0.5) THEN
            pos_close := TRUE;
        ELSIF vent_err >= -VENT_STOP THEN
            pos_close := FALSE;
        END_IF;
    ELSE
        pos_open := vent_sp >= 50.0;
        pos_close := vent_sp < 50.0;
    END_IF;
    pos_open := pos_open AND NOT ZSO511 AND NOT pos_close;
    pos_close := pos_close AND NOT ZSC511;
    vents_closed := ZSC511 OR (zt_ok AND (vent_pos <= VENT_CLOSED));

    (* shade net, FDS 8.5 *)
    tmr_net_on(IN := rad_ok AND (rad >= x_screen), PT := T#10m);
    tmr_net_off(IN := rad_ok AND (rad < x_screen - NET_RAD_HYST), PT := T#15m);
    t_hi := tt_ok AND (t_in >= x_vent + NET_T_ON);
    t_ok := NOT tt_ok OR (t_in < x_vent + NET_T_OFF);
    IF tmr_net_on.Q OR t_hi THEN
        net_dem := TRUE;
    ELSIF (tmr_net_off.Q OR NOT rad_ok) AND t_ok THEN
        net_dem := FALSE;
    END_IF;
    IF storm_act THEN
        net_dem := FALSE;     (* external net retracted in a storm *)
    END_IF;
    net_deploy_req := net_dem AND NOT ZSC521;
    net_retract_req := NOT net_dem AND NOT ZSO521;

    (* ===================== 10. Interlocks and devices (FDS 10, 11) =====================
       An output is energised only when its request AND its permissive are TRUE, in every
       mode. Each interlock word has one bit per missing permissive (FDS 11.2); bit 0 is
       always E-stop. *)
    estop_w := BOOL_TO_WORD(NOT ESTOP_OK);

    ilk_refill := estop_w
               OR SHL(BOOL_TO_WORD(ai_lt.FAULT), 1)
               OR SHL(BOOL_TO_WORD(level >= LEVEL_HI_ILK), 2);
    dev_xv201(AUTO_REQ := refill_req, MANUAL := irr_manual,
              MAN_REQ := (HMI_MAN_IRR AND 16#0001) <> 16#0000, ILK := ilk_refill);

    ilk_return := estop_w;
    dev_xv301(AUTO_REQ := req_xv301, MANUAL := irr_manual,
              MAN_REQ := (HMI_MAN_IRR AND 16#0004) <> 16#0000, ILK := ilk_return);

    ilk_zone := estop_w
             OR SHL(BOOL_TO_WORD(lk_ec_hh), 1)
             OR SHL(BOOL_TO_WORD(lk_ph_ll), 2);
    dev_xv401(AUTO_REQ := req_z1, MANUAL := irr_manual,
              MAN_REQ := (HMI_MAN_IRR AND 16#0008) <> 16#0000, ILK := ilk_zone);
    dev_xv402(AUTO_REQ := req_z2, MANUAL := irr_manual,
              MAN_REQ := (HMI_MAN_IRR AND 16#0010) <> 16#0000, ILK := ilk_zone);
    dev_xv403(AUTO_REQ := req_z3, MANUAL := irr_manual,
              MAN_REQ := (HMI_MAN_IRR AND 16#0020) <> 16#0000, ILK := ilk_zone);
    dev_xv404(AUTO_REQ := req_z4, MANUAL := irr_manual,
              MAN_REQ := (HMI_MAN_IRR AND 16#0040) <> 16#0000, ILK := ilk_zone);
    any_zone := dev_xv401.CMD OR dev_xv402.CMD OR dev_xv403.CMD OR dev_xv404.CMD;

    ilk_pump := estop_w
             OR SHL(BOOL_TO_WORD(NOT LSL201_OK), 1)                       (* dry-run *)
             OR SHL(BOOL_TO_WORD(NOT (dev_xv301.CMD OR any_zone)), 2)     (* dead-head *)
             OR SHL(BOOL_TO_WORD(lk_press_hi), 3)
             OR SHL(BOOL_TO_WORD(ai_pt.FAULT), 4)
             OR SHL(BOOL_TO_WORD(lk_p201), 5);
    dev_p201(AUTO_REQ := req_p201, MANUAL := irr_manual,
             MAN_REQ := (HMI_MAN_IRR AND 16#0002) <> 16#0000, ILK := ilk_pump,
             FB_RUN := P201_FB, SEC_PULSE := sec_pulse);

    (* dosing needs P-201 running with flow >= 500 L/h for 3 s, so the flow
       measurement used by the feedforward has settled (FDS 7.2) *)
    tmr_flow_ok(IN := dev_p201.RUNNING AND NOT ai_ft.FAULT AND (flow >= FLOW_DOSE_MIN), PT := T#3s);
    flow_ok := tmr_flow_ok.Q;
    (* stock A and B share one word: either failing stops both (1 : 1 ratio) *)
    ilk_dose_ab := estop_w
                OR SHL(BOOL_TO_WORD(NOT dev_p201.RUNNING), 1)
                OR SHL(BOOL_TO_WORD(NOT flow_ok), 2)
                OR SHL(BOOL_TO_WORD(ai_ft.FAULT), 3)
                OR SHL(BOOL_TO_WORD(NOT LSL311_OK), 4)
                OR SHL(BOOL_TO_WORD(NOT LSL312_OK), 5)
                OR SHL(BOOL_TO_WORD(ai_ec.FAULT OR lk_ec_hh), 6)
                OR SHL(BOOL_TO_WORD(lk_p311), 7)
                OR SHL(BOOL_TO_WORD(lk_p312), 8);
    dev_p311(AUTO_REQ := dose_req, MANUAL := irr_manual, MAN_REQ := HMI_MAN_DOSE_A > 0,
             ILK := ilk_dose_ab, FB_RUN := P311_FB, SEC_PULSE := sec_pulse);
    dev_p312(AUTO_REQ := dose_req, MANUAL := irr_manual, MAN_REQ := HMI_MAN_DOSE_B > 0,
             ILK := ilk_dose_ab, FB_RUN := P312_FB, SEC_PULSE := sec_pulse);

    ilk_acid := estop_w
             OR SHL(BOOL_TO_WORD(NOT dev_p201.RUNNING), 1)
             OR SHL(BOOL_TO_WORD(NOT flow_ok), 2)
             OR SHL(BOOL_TO_WORD(ai_ft.FAULT), 3)
             OR SHL(BOOL_TO_WORD(NOT LSL313_OK), 4)
             OR SHL(BOOL_TO_WORD(NOT ph_valid OR lk_ph_ll), 5)
             OR SHL(BOOL_TO_WORD(lk_p313), 6);
    dev_p313(AUTO_REQ := dose_req, MANUAL := irr_manual, MAN_REQ := HMI_MAN_DOSE_ACID > 0,
             ILK := ilk_acid, FB_RUN := P313_FB, SEC_PULSE := sec_pulse);

    (* pad-and-fan: fans only with the vents closed; the vents can't open while a fan is
       commanded (FDS 11.1). Fan lock-outs are private bit 15, not in the shared word. *)
    ilk_fan := estop_w OR SHL(BOOL_TO_WORD(NOT vents_closed), 1);
    dev_f601(AUTO_REQ := req_f601, MANUAL := clim_manual,
             MAN_REQ := (HMI_MAN_CLIM AND 16#0004) <> 16#0000,
             ILK := ilk_fan OR SHL(BOOL_TO_WORD(lk_f601), 15), FB_RUN := F601_FB, SEC_PULSE := sec_pulse);
    dev_f602(AUTO_REQ := req_f602, MANUAL := clim_manual,
             MAN_REQ := (HMI_MAN_CLIM AND 16#0008) <> 16#0000,
             ILK := ilk_fan OR SHL(BOOL_TO_WORD(lk_f602), 15), FB_RUN := F602_FB, SEC_PULSE := sec_pulse);
    dev_f603(AUTO_REQ := req_f603, MANUAL := clim_manual,
             MAN_REQ := (HMI_MAN_CLIM AND 16#0010) <> 16#0000,
             ILK := ilk_fan OR SHL(BOOL_TO_WORD(lk_f603), 15), FB_RUN := F603_FB, SEC_PULSE := sec_pulse);

    ilk_vo := estop_w
           OR SHL(BOOL_TO_WORD(vent_prot), 1)
           OR SHL(BOOL_TO_WORD(lk_vent), 2)
           OR SHL(BOOL_TO_WORD(ZSO511), 3)
           OR SHL(BOOL_TO_WORD(dev_f601.CMD OR dev_f602.CMD OR dev_f603.CMD), 4);
    ilk_vc := estop_w
           OR SHL(BOOL_TO_WORD(vent_prot), 1)
           OR SHL(BOOL_TO_WORD(lk_vent), 2)
           OR SHL(BOOL_TO_WORD(ZSC511), 3);
    dev_vent(OPEN_REQ := pos_open, CLOSE_REQ := pos_close, MANUAL := clim_manual,
             MAN_OPEN := pos_open, MAN_CLOSE := pos_close, ILK_OPEN := ilk_vo, ILK_CLOSE := ilk_vc,
             AT_OPEN := ZSO511, AT_CLOSED := ZSC511, MOTOR_OK := M511_OK,
             POS := vent_pos, USE_POS := zt_ok, T_STALL := T#15s, T_MAX := T#180s);

    ilk_nd := estop_w
           OR SHL(BOOL_TO_WORD(net_prot), 1)
           OR SHL(BOOL_TO_WORD(lk_net), 2)
           OR SHL(BOOL_TO_WORD(ZSC521), 3)
           OR SHL(BOOL_TO_WORD(storm_act OR NOT wind_ok), 4);
    ilk_nr := estop_w
           OR SHL(BOOL_TO_WORD(net_prot), 1)
           OR SHL(BOOL_TO_WORD(lk_net), 2)
           OR SHL(BOOL_TO_WORD(ZSO521), 3);
    (* net: "open" = retract (M521_OPEN), "close" = deploy (M521_CLOSE) *)
    dev_net(OPEN_REQ := net_retract_req, CLOSE_REQ := net_deploy_req, MANUAL := clim_manual,
            MAN_OPEN := (HMI_MAN_CLIM AND 16#0002) <> 16#0000,
            MAN_CLOSE := (HMI_MAN_CLIM AND 16#0001) <> 16#0000,
            ILK_OPEN := ilk_nr, ILK_CLOSE := ilk_nd, AT_OPEN := ZSO521, AT_CLOSED := ZSC521,
            MOTOR_OK := M521_OK, POS := 0.0, USE_POS := FALSE, T_STALL := T#15s, T_MAX := T#150s);

    ilk_pad := estop_w
            OR SHL(BOOL_TO_WORD(NOT LSL531_OK), 1)
            OR SHL(BOOL_TO_WORD(lk_p531), 2);
    dev_p531(AUTO_REQ := req_pad, MANUAL := clim_manual,
             MAN_REQ := (HMI_MAN_CLIM AND 16#0020) <> 16#0000, ILK := ilk_pad,
             FB_RUN := P531_FB, SEC_PULSE := sec_pulse);

    ilk_fog := estop_w
            OR SHL(BOOL_TO_WORD(rh_ok AND (rh_in >= RH_FOG_MAX)), 1)
            OR SHL(BOOL_TO_WORD(NOT rh_ok), 2)
            OR SHL(BOOL_TO_WORD(lk_p541), 3);
    dev_p541(AUTO_REQ := req_fog, MANUAL := clim_manual,
             MAN_REQ := (HMI_MAN_CLIM AND 16#0040) <> 16#0000, ILK := ilk_fog,
             FB_RUN := P541_FB, SEC_PULSE := sec_pulse);

    XV201 := dev_xv201.CMD;
    P201 := dev_p201.CMD;
    XV301 := dev_xv301.CMD;
    XV401 := dev_xv401.CMD;
    XV402 := dev_xv402.CMD;
    XV403 := dev_xv403.CMD;
    XV404 := dev_xv404.CMD;
    P311 := dev_p311.CMD;
    P312 := dev_p312.CMD;
    P313 := dev_p313.CMD;
    M511_OPEN := dev_vent.OPEN_CMD;
    M511_CLOSE := dev_vent.CLOSE_CMD;
    M521_OPEN := dev_net.OPEN_CMD;
    M521_CLOSE := dev_net.CLOSE_CMD;
    F601 := dev_f601.CMD;
    F602 := dev_f602.CMD;
    F603 := dev_f603.CMD;
    P531 := dev_p531.CMD;
    P541 := dev_p541.CMD;

    (* ===================== 11. Dosing loops (FDS 7) ===================== *)
    ec_en := dose_req AND NOT irr_manual AND dev_p311.CMD AND dev_p312.CMD;
    IF pi_tick OR NOT ec_en THEN
        pid_ec(ENABLE := ec_en, SP := x_ec, PV := ec,
               FF := (x_ec - EC_BASE) * flow / FF_EC_DIV, REVERSE := FALSE,
               KP := EC_KP, TI_S := EC_TI, DT_S := PI_DT, I_ZONE := EC_IZONE, OUT_MIN := 0.0, OUT_MAX := 100.0);
    END_IF;
    ph_en := dose_req AND NOT irr_manual AND dev_p313.CMD;
    IF pi_tick OR NOT ph_en THEN
        pid_ph(ENABLE := ph_en, SP := x_ph, PV := ph,
               FF := FF_ACID * flow / 1000.0, REVERSE := TRUE,
               KP := PH_KP, TI_S := PH_TI, DT_S := PI_DT, I_ZONE := PH_IZONE, OUT_MIN := 0.0, OUT_MAX := 100.0);
    END_IF;
    IF irr_manual THEN
        dose_a := LIMIT(0.0, UINT_TO_REAL(HMI_MAN_DOSE_A) / 10.0, 100.0);
        dose_b := LIMIT(0.0, UINT_TO_REAL(HMI_MAN_DOSE_B) / 10.0, 100.0);
        dose_acid := LIMIT(0.0, UINT_TO_REAL(HMI_MAN_DOSE_ACID) / 10.0, 100.0);
    ELSE
        dose_a := pid_ec.OUT;
        dose_b := pid_ec.OUT;
        dose_acid := pid_ph.OUT;
    END_IF;
    IF NOT dev_p311.CMD THEN
        dose_a := 0.0;
    END_IF;
    IF NOT dev_p312.CMD THEN
        dose_b := 0.0;
    END_IF;
    IF NOT dev_p313.CMD THEN
        dose_acid := 0.0;
    END_IF;
    P311_REF := REAL_TO_UINT(dose_a * 655.35);
    P312_REF := REAL_TO_UINT(dose_b * 655.35);
    P313_REF := REAL_TO_UINT(dose_acid * 655.35);

    (* ===================== 12. Volumes, daily counters, drain (FDS 6.3, 6.5) ===================== *)
    IF dev_xv401.CMD OR dev_xv402.CMD OR dev_xv403.CMD OR dev_xv404.CMD THEN
        IF NOT ai_ft.FAULT THEN
            water_day := water_day + flow * DT_SCAN / 3600.0;
        END_IF;
    END_IF;
    (* zone volume: only while the zone's valve is the only open path (no overlap) *)
    IF (step = 20) AND (ovl_cnt = 0) AND NOT dev_xv301.CMD AND NOT ai_ft.FAULT THEN
        zone_vol := zone_vol + flow * DT_SCAN / 3600.0;
    END_IF;
    IF dev_xv401.CMD AND NOT (dev_xv402.CMD OR dev_xv403.CMD OR dev_xv404.CMD OR dev_xv301.CMD)
       AND NOT ai_ft.FAULT THEN
        z1_supply := z1_supply + flow * DT_SCAN / 3600.0;
    END_IF;
    IF NOT ai_drn.FAULT THEN
        drain_l := drain_l + drain_flow * DT_SCAN / 3600.0;
    END_IF;
    IF z1_supply > 1.0 THEN
        drain_pct := drain_l / z1_supply * 100.0;
    ELSE
        drain_pct := 0.0;
    END_IF;
    IF drain_eval THEN
        drain_alm := (cycles_day >= DRAIN_MIN_CYC) AND NOT ai_drn.FAULT
                     AND ((drain_pct < DRAIN_LO) OR (drain_pct > DRAIN_HI));
    END_IF;
    IF midnight THEN
        cycles_prev := cycles_day;
        water_prev := water_day;
        drain_prev := drain_pct;
        cycles_day := 0;
        water_day := 0.0;
        z1_supply := 0.0;
        drain_l := 0.0;
        drain_pct := 0.0;
        drain_alm := FALSE;
    END_IF;

    (* ===================== 13. Lamps and HMI status (FDS 9, 12.3) ===================== *)
    LAMP_GREEN := NOT irr_manual AND irr_enabled AND (step <> 99) AND NOT trip_irr;
    LAMP_AMBER := (step = 80) OR irr_manual OR clim_manual OR NOT irr_enabled OR warn_act;
    LAMP_RED := red_act OR (red_latched AND blink);

    ST_HEARTBEAT := ST_HEARTBEAT + 1;
    ST_CLOCK := CLOCK_MIN;
    ST_IRR_STEP := INT_TO_UINT(step);
    ST_IRR_FLAGS := BOOL_TO_WORD(NOT irr_manual)
                 OR SHL(BOOL_TO_WORD(irr_manual), 1)
                 OR SHL(BOOL_TO_WORD(irr_enabled), 2)
                 OR SHL(BOOL_TO_WORD(in_window), 3)
                 OR SHL(BOOL_TO_WORD(cycles_day >= SP_MAX_CYCLES), 4)
                 OR SHL(BOOL_TO_WORD(clock_fault), 5)
                 OR SHL(BOOL_TO_WORD(resume), 6);
    ST_ZONE := INT_TO_UINT(zone);
    ST_ZONE_VOL := REAL_TO_UINT(LIMIT(0.0, zone_vol * 10.0, 65535.0));
    ST_STEP_TIME := step_secs;
    ST_RAD_SUM := REAL_TO_UINT(LIMIT(0.0, rad_sum * 10.0, 65535.0));
    ST_MIN_SINCE := min_since;
    ST_CYCLES_DAY := cycles_day;
    ST_WATER_DAY := REAL_TO_UINT(LIMIT(0.0, water_day, 65535.0));
    ST_DRAIN_DAY := REAL_TO_UINT(LIMIT(0.0, drain_pct * 10.0, 65535.0));
    ST_CYCLES_PREV := cycles_prev;
    ST_WATER_PREV := REAL_TO_UINT(LIMIT(0.0, water_prev, 65535.0));
    ST_DRAIN_PREV := REAL_TO_UINT(LIMIT(0.0, drain_prev * 10.0, 65535.0));
    ST_ZONE_DIAG := zone_diag;
    ST_LEVEL := REAL_TO_UINT(level * 10.0);
    ST_FLOW := REAL_TO_UINT(flow);
    ST_PRESS := REAL_TO_UINT(press * 100.0);
    ST_EC := REAL_TO_UINT(ec * 100.0);
    ST_PH := REAL_TO_UINT(ph * 100.0);
    ST_PH_A := REAL_TO_UINT(ai_pha.VALUE * 100.0);
    ST_PH_B := REAL_TO_UINT(ai_phb.VALUE * 100.0);
    ST_DOSE_A := REAL_TO_UINT(dose_a * 10.0);
    ST_DOSE_B := REAL_TO_UINT(dose_b * 10.0);
    ST_DOSE_ACID := REAL_TO_UINT(dose_acid * 10.0);
    ST_DRAIN_FLOW := REAL_TO_UINT(drain_flow * 10.0);
    ST_RAD := REAL_TO_UINT(rad);
    ST_T_OUT := REAL_TO_UINT(ai_tout.VALUE * 10.0);
    ST_RH_OUT := REAL_TO_UINT(ai_rhout.VALUE * 10.0);
    ST_WIND := REAL_TO_UINT(wind * 10.0);
    ST_T_IN := REAL_TO_UINT(t_in * 10.0);
    ST_RH_IN := REAL_TO_UINT(rh_in * 10.0);
    ST_CO2 := REAL_TO_UINT(ai_co2.VALUE);
    ST_VPD := REAL_TO_UINT(LIMIT(0.0, vpd * 100.0, 65535.0));
    ST_VENT_POS := REAL_TO_UINT(vent_pos * 10.0);
    ST_VENT_SP := REAL_TO_UINT(vent_sp * 10.0);
    ST_CLIM_STATE := INT_TO_UINT(clim_state);
    ST_CLIM_FLAGS := BOOL_TO_WORD(NOT clim_manual)
                  OR SHL(BOOL_TO_WORD(clim_manual), 1)
                  OR SHL(BOOL_TO_WORD(rain_act), 2)
                  OR SHL(BOOL_TO_WORD(wind_act), 3)
                  OR SHL(BOOL_TO_WORD(storm_act), 4)
                  OR SHL(BOOL_TO_WORD(net_dem), 5)
                  OR SHL(BOOL_TO_WORD(fog_dem), 6)
                  OR SHL(BOOL_TO_WORD((hum_dem > 0.0) AND (hum_dem >= temp_dem)), 7)
                  OR SHL(BOOL_TO_WORD(NOT tt_ok), 8)
                  OR SHL(BOOL_TO_WORD((clim_state = 10) AND NOT tmr_cool.Q AND (tmr_cool.ET > T#0s)), 9);
    ST_FAN_STAGE := INT_TO_UINT(fan_stage);
    ST_OUT1 := BOOL_TO_WORD(XV201) OR SHL(BOOL_TO_WORD(P201), 1) OR SHL(BOOL_TO_WORD(XV301), 2)
            OR SHL(BOOL_TO_WORD(XV401), 3) OR SHL(BOOL_TO_WORD(XV402), 4) OR SHL(BOOL_TO_WORD(XV403), 5)
            OR SHL(BOOL_TO_WORD(XV404), 6) OR SHL(BOOL_TO_WORD(P311), 7) OR SHL(BOOL_TO_WORD(P312), 8)
            OR SHL(BOOL_TO_WORD(P313), 9) OR SHL(BOOL_TO_WORD(M511_OPEN), 10)
            OR SHL(BOOL_TO_WORD(M511_CLOSE), 11) OR SHL(BOOL_TO_WORD(M521_OPEN), 12)
            OR SHL(BOOL_TO_WORD(M521_CLOSE), 13) OR SHL(BOOL_TO_WORD(F601), 14)
            OR SHL(BOOL_TO_WORD(F602), 15);
    ST_OUT2 := BOOL_TO_WORD(F603) OR SHL(BOOL_TO_WORD(P531), 1) OR SHL(BOOL_TO_WORD(P541), 2)
            OR SHL(BOOL_TO_WORD(LAMP_GREEN), 3) OR SHL(BOOL_TO_WORD(LAMP_AMBER), 4)
            OR SHL(BOOL_TO_WORD(LAMP_RED), 5);
    ST_IN1 := BOOL_TO_WORD(ESTOP_OK) OR SHL(BOOL_TO_WORD(PB_START), 1) OR SHL(BOOL_TO_WORD(PB_STOP_OK), 2)
           OR SHL(BOOL_TO_WORD(PB_RESET), 3) OR SHL(BOOL_TO_WORD(LSL201_OK), 4)
           OR SHL(BOOL_TO_WORD(P201_FB), 5) OR SHL(BOOL_TO_WORD(LSL311_OK), 6)
           OR SHL(BOOL_TO_WORD(LSL312_OK), 7) OR SHL(BOOL_TO_WORD(LSL313_OK), 8)
           OR SHL(BOOL_TO_WORD(P311_FB), 9) OR SHL(BOOL_TO_WORD(P312_FB), 10)
           OR SHL(BOOL_TO_WORD(P313_FB), 11) OR SHL(BOOL_TO_WORD(RAIN_DRY), 12)
           OR SHL(BOOL_TO_WORD(ZSO511), 13) OR SHL(BOOL_TO_WORD(ZSC511), 14)
           OR SHL(BOOL_TO_WORD(M511_OK), 15);
    ST_IN2 := BOOL_TO_WORD(ZSO521) OR SHL(BOOL_TO_WORD(ZSC521), 1) OR SHL(BOOL_TO_WORD(M521_OK), 2)
           OR SHL(BOOL_TO_WORD(F601_FB), 3) OR SHL(BOOL_TO_WORD(F602_FB), 4)
           OR SHL(BOOL_TO_WORD(F603_FB), 5) OR SHL(BOOL_TO_WORD(P531_FB), 6)
           OR SHL(BOOL_TO_WORD(LSL531_OK), 7) OR SHL(BOOL_TO_WORD(P541_FB), 8);
    ST_ALM1 := alm_latch1;
    ST_ALM2 := alm_latch2;
    ST_ALM3 := alm_latch3;
    ST_ALM4 := alm_latch4;
    ST_ACT1 := alm_act1;
    ST_ACT2 := alm_act2;
    ST_ACT3 := alm_act3;
    ST_ACT4 := alm_act4;
    ST_ILK_REFILL := ilk_refill;
    ST_ILK_PUMP := ilk_pump;
    ST_ILK_RETURN := ilk_return;
    ST_ILK_ZONE := ilk_zone;
    ST_ILK_DOSE_AB := ilk_dose_ab;
    ST_ILK_ACID := ilk_acid;
    ST_ILK_VENT_OPEN := ilk_vo OR SHL(BOOL_TO_WORD(dev_vent.REV_OPEN), 5);
    ST_ILK_VENT_CLOSE := ilk_vc OR SHL(BOOL_TO_WORD(dev_vent.REV_CLOSE), 4);
    ST_ILK_NET_DEPLOY := ilk_nd OR SHL(BOOL_TO_WORD(dev_net.REV_CLOSE), 5);
    ST_ILK_NET_RETRACT := ilk_nr OR SHL(BOOL_TO_WORD(dev_net.REV_OPEN), 4);
    ST_ILK_FAN := ilk_fan;
    ST_ILK_PAD := ilk_pad;
    ST_ILK_FOG := ilk_fog;
    ST_DEV_XV201 := dev_xv201.STATUS;
    ST_DEV_P201 := dev_p201.STATUS;
    ST_DEV_XV301 := dev_xv301.STATUS;
    ST_DEV_XV401 := dev_xv401.STATUS;
    ST_DEV_XV402 := dev_xv402.STATUS;
    ST_DEV_XV403 := dev_xv403.STATUS;
    ST_DEV_XV404 := dev_xv404.STATUS;
    ST_DEV_P311 := dev_p311.STATUS;
    ST_DEV_P312 := dev_p312.STATUS;
    ST_DEV_P313 := dev_p313.STATUS;
    ST_DEV_M511 := dev_vent.STATUS;
    ST_DEV_M521 := dev_net.STATUS;
    ST_DEV_F601 := dev_f601.STATUS;
    ST_DEV_F602 := dev_f602.STATUS;
    ST_DEV_F603 := dev_f603.STATUS;
    ST_DEV_P531 := dev_p531.STATUS;
    ST_DEV_P541 := dev_p541.STATUS;
    ST_P201_STARTS := dev_p201.STARTS;
    ST_P201_RUNMIN := dev_p201.RUN_MIN;
    ST_F601_STARTS := dev_f601.STARTS;
    ST_F601_RUNMIN := dev_f601.RUN_MIN;
    ST_F602_STARTS := dev_f602.STARTS;
    ST_F602_RUNMIN := dev_f602.RUN_MIN;
    ST_F603_STARTS := dev_f603.STARTS;
    ST_F603_RUNMIN := dev_f603.RUN_MIN;
    ST_P531_STARTS := dev_p531.STARTS;
    ST_P531_RUNMIN := dev_p531.RUN_MIN;
    ST_P541_STARTS := dev_p541.STARTS;
    ST_P541_RUNMIN := dev_p541.RUN_MIN;
    ST_XV401_CYC := dev_xv401.CYCLES;
    ST_XV402_CYC := dev_xv402.CYCLES;
    ST_XV403_CYC := dev_xv403.CYCLES;
    ST_XV404_CYC := dev_xv404.CYCLES;
    ST_M511_REV := dev_vent.REVERSALS;
    ST_M521_CYC := dev_net.STROKES;
END_PROGRAM


CONFIGURATION Config0
    RESOURCE Res0 ON PLC
        TASK MainTask(INTERVAL := T#50ms, PRIORITY := 0);
        PROGRAM Inst0 WITH MainTask : Greenhouse;
    END_RESOURCE
END_CONFIGURATION

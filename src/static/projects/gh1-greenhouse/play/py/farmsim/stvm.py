"""stvm - a compact IEC 61131-3 Structured Text virtual machine.

Purpose
-------
Execute the *same* ``.st`` file that is downloaded to the OpenPLC runtime, so
the control logic can be simulated and unit-tested on a PC (and in CI) without
PLC hardware.

The VM is deliberately strict: it rejects implicit REAL/integer mixing and
implicit BOOL/integer conversion, the same way a strict IEC 61131-3 compiler
(MatIEC, used by OpenPLC) does. Code that runs here should therefore also
compile there.

Supported subset
----------------
* POUs: PROGRAM, FUNCTION_BLOCK, CONFIGURATION (task interval + program instance)
* Variables: VAR, VAR_INPUT, VAR_OUTPUT, VAR CONSTANT, located ``AT %IX/%QX/%IW/%QW/%MW``
* Types: BOOL, SINT..LINT, USINT..ULINT, BYTE/WORD/DWORD/LWORD, REAL/LREAL, TIME
* Statements: assignment, FB call, IF/ELSIF/ELSE, CASE (values, lists, ranges),
  FOR, WHILE, REPEAT, EXIT, RETURN
* Standard FBs: TON, TOF, TP, R_TRIG, F_TRIG, CTU, CTD, RS, SR
* Standard functions: ABS, SQRT, EXP, LN, MIN, MAX, LIMIT, SEL, MOVE, SHL, SHR, TRUNC,
  and the ``<type>_TO_<type>`` conversions between numeric and BOOL types
"""
from __future__ import annotations

import math
import re
from collections import namedtuple

__all__ = ["STError", "STMachine"]


class STError(Exception):
    """Compile- or run-time error in the Structured Text program."""

    def __init__(self, msg: str, located: bool = False):
        super().__init__(msg)
        self.located = located


def _locate(ex: STError, pou: str, line: int) -> STError:
    if ex.located:
        return ex
    return STError(f"{pou}, line {line}: {ex}", located=True)


# =============================================================================
# Lexer
# =============================================================================
KEYWORDS = {
    "PROGRAM", "END_PROGRAM", "FUNCTION_BLOCK", "END_FUNCTION_BLOCK",
    "FUNCTION", "END_FUNCTION", "CONFIGURATION", "END_CONFIGURATION", "TYPE",
    "VAR", "VAR_INPUT", "VAR_OUTPUT", "VAR_IN_OUT", "VAR_TEMP", "VAR_GLOBAL",
    "VAR_EXTERNAL", "END_VAR", "CONSTANT", "RETAIN", "AT",
    "IF", "THEN", "ELSIF", "ELSE", "END_IF", "CASE", "OF", "END_CASE",
    "FOR", "TO", "BY", "DO", "END_FOR", "WHILE", "END_WHILE",
    "REPEAT", "UNTIL", "END_REPEAT", "EXIT", "RETURN",
    "NOT", "AND", "OR", "XOR", "MOD", "TRUE", "FALSE",
}

_TOKEN_RE = re.compile(
    r"""
      (?P<ws>\s+)
    | (?P<comment>\(\*.*?\*\)|//[^\n]*)
    | (?P<time>(?:TIME|T)\#-?[0-9][0-9A-Za-z_.]*)
    | (?P<based>(?:2|8|16)\#[0-9A-Fa-f_]+)
    | (?P<real>\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d+)?)
    | (?P<int>\d[\d_]*)
    | (?P<addr>%[IQM][XBWDL]?\d+(?:\.\d+)?)
    | (?P<ident>[A-Za-z_]\w*)
    | (?P<op>:=|=>|<=|>=|<>|\*\*|\.\.|[-+*/=<>(),;:.&\[\]])
    """,
    re.VERBOSE | re.DOTALL | re.IGNORECASE,
)

_TIME_PART = re.compile(r"(\d+(?:\.\d+)?)(ms|d|h|m|s)")
_TIME_UNIT_MS = {"d": 86_400_000, "h": 3_600_000, "m": 60_000, "s": 1_000, "ms": 1}

Tok = namedtuple("Tok", "kind val line")


def parse_time(text: str) -> int:
    """``T#1m30s`` -> 90000 (milliseconds)."""
    body = text.split("#", 1)[1].replace("_", "").lower()
    neg = body.startswith("-")
    body = body.lstrip("-")
    total, pos = 0.0, 0
    for m in _TIME_PART.finditer(body):
        if m.start() != pos:
            break
        total += float(m.group(1)) * _TIME_UNIT_MS[m.group(2)]
        pos = m.end()
    if pos == 0 or pos != len(body):
        raise STError(f"invalid TIME literal {text!r}")
    return int(round(-total if neg else total))


def tokenize(src: str) -> list[Tok]:
    out: list[Tok] = []
    pos, line = 0, 1
    while pos < len(src):
        m = _TOKEN_RE.match(src, pos)
        if not m:
            raise STError(f"line {line}: unexpected character {src[pos]!r}")
        kind, text = m.lastgroup, m.group()
        if kind == "ident":
            up = text.upper()
            out.append(Tok("kw" if up in KEYWORDS else "id", up, line))
        elif kind == "int":
            out.append(Tok("num", int(text.replace("_", "")), line))
        elif kind == "real":
            out.append(Tok("num", float(text.replace("_", "")), line))
        elif kind == "based":
            base, digits = text.split("#")
            out.append(Tok("num", int(digits.replace("_", ""), int(base)), line))
        elif kind == "time":
            out.append(Tok("time", parse_time(text), line))
        elif kind == "addr":
            out.append(Tok("addr", text.upper(), line))
        elif kind == "op":
            out.append(Tok("op", text, line))
        line += text.count("\n")
        pos = m.end()
    out.append(Tok("eof", None, line))
    return out


# =============================================================================
# Parser  ->  plain-tuple AST
# =============================================================================
Decl = namedtuple("Decl", "name type init section addr constant line")
POUDef = namedtuple("POUDef", "kind name decls body line")
ConfigDef = namedtuple("ConfigDef", "name interval_ms instance program")

_VAR_SECTIONS = ("VAR", "VAR_INPUT", "VAR_OUTPUT", "VAR_IN_OUT", "VAR_TEMP",
                 "VAR_GLOBAL", "VAR_EXTERNAL")
_BIN_LEVELS = (("OR",), ("XOR",), ("AND", "&"), ("=", "<>"),
               ("<", ">", "<=", ">="), ("+", "-"), ("*", "/", "MOD"), ("**",))


class Parser:
    def __init__(self, toks: list[Tok]):
        self.toks = toks
        self.i = 0

    # -- token helpers --------------------------------------------------------
    @property
    def tok(self) -> Tok:
        return self.toks[self.i]

    def peek(self, k: int = 1) -> Tok:
        return self.toks[min(self.i + k, len(self.toks) - 1)]

    def advance(self) -> Tok:
        t = self.toks[self.i]
        self.i += 1
        return t

    def at(self, *vals) -> bool:
        t = self.tok
        return t.kind in ("kw", "op") and t.val in vals

    def accept(self, *vals):
        return self.advance() if self.at(*vals) else None

    def expect(self, val):
        t = self.accept(val)
        if t is None:
            self.error(f"expected {val!r}")
        return t

    def expect_id(self) -> str:
        if self.tok.kind != "id":
            self.error("expected identifier")
        return self.advance().val

    def error(self, msg):
        t = self.tok
        raise STError(f"line {t.line}: {msg} (found {t.val!r})", located=True)

    # -- top level ------------------------------------------------------------
    def parse_unit(self):
        pous, config = [], None
        while self.tok.kind != "eof":
            if self.accept("FUNCTION_BLOCK"):
                pous.append(self.parse_pou("FUNCTION_BLOCK", "END_FUNCTION_BLOCK"))
            elif self.accept("PROGRAM"):
                pous.append(self.parse_pou("PROGRAM", "END_PROGRAM"))
            elif self.accept("CONFIGURATION"):
                config = self.parse_config()
            elif self.at("FUNCTION", "TYPE"):
                self.error("FUNCTION and TYPE declarations are not supported by stvm")
            else:
                self.error("expected PROGRAM, FUNCTION_BLOCK or CONFIGURATION")
        return pous, config

    def parse_pou(self, kind, end):
        line = self.tok.line
        name = self.expect_id()
        decls = self.parse_var_blocks()
        body = self.parse_stmts(end)
        self.expect(end)
        return POUDef(kind, name, decls, body, line)

    def parse_config(self):
        name = self.expect_id()
        interval = instance = program = None
        while not self.accept("END_CONFIGURATION"):
            t = self.tok
            if t.kind == "eof":
                self.error("expected END_CONFIGURATION")
            if t.kind == "id" and t.val == "INTERVAL":
                self.advance()
                self.expect(":=")
                if self.tok.kind != "time":
                    self.error("expected TIME literal")
                interval = self.advance().val
            elif self.accept("PROGRAM"):
                instance = self.expect_id()
                if self.tok.kind == "id" and self.tok.val == "WITH":
                    self.advance()
                    self.expect_id()
                self.expect(":")
                program = self.expect_id()
            else:
                self.advance()
        return ConfigDef(name, interval, instance, program)

    def parse_var_blocks(self):
        decls = []
        while self.at(*_VAR_SECTIONS):
            section = self.advance().val
            if section in ("VAR_IN_OUT", "VAR_GLOBAL", "VAR_EXTERNAL"):
                self.error(f"{section} is not supported by stvm")
            if section == "VAR_TEMP":
                section = "VAR"
            constant = False
            while self.at("CONSTANT", "RETAIN"):
                constant |= self.advance().val == "CONSTANT"
            while not self.accept("END_VAR"):
                line = self.tok.line
                names = [self.expect_id()]
                while self.accept(","):
                    names.append(self.expect_id())
                addr = None
                if self.accept("AT"):
                    if self.tok.kind != "addr":
                        self.error("expected direct address after AT")
                    addr = self.advance().val
                self.expect(":")
                typ = self.expect_id()
                init = self.parse_expr() if self.accept(":=") else None
                self.expect(";")
                for n in names:
                    decls.append(Decl(n, typ, init, section, addr, constant, line))
        return decls

    # -- statements -------------------------------------------------------------
    def parse_stmts(self, *terms):
        out = []
        while not self.at(*terms):
            if self.tok.kind == "eof":
                self.error(f"expected one of {terms}")
            s = self.parse_stmt()
            if s is not None:
                out.append(s)
        return out

    def parse_stmt(self):
        line = self.tok.line
        if self.accept(";"):
            return None
        if self.accept("IF"):
            cond = self.parse_expr()
            self.expect("THEN")
            branches = [(cond, self.parse_stmts("ELSIF", "ELSE", "END_IF"))]
            while self.accept("ELSIF"):
                c = self.parse_expr()
                self.expect("THEN")
                branches.append((c, self.parse_stmts("ELSIF", "ELSE", "END_IF")))
            els = self.parse_stmts("END_IF") if self.accept("ELSE") else None
            self.expect("END_IF")
            self.accept(";")
            return ("if", line, branches, els)
        if self.accept("CASE"):
            sel = self.parse_expr()
            self.expect("OF")
            clauses = []
            while not self.at("ELSE", "END_CASE"):
                if self.tok.kind == "eof":
                    self.error("expected END_CASE")
                labels = self.parse_case_labels()
                self.expect(":")
                body = []
                while not (self.at("ELSE", "END_CASE") or self._is_label_start()):
                    if self.tok.kind == "eof":
                        self.error("expected END_CASE")
                    s = self.parse_stmt()
                    if s is not None:
                        body.append(s)
                clauses.append((labels, body))
            els = self.parse_stmts("END_CASE") if self.accept("ELSE") else None
            self.expect("END_CASE")
            self.accept(";")
            return ("case", line, sel, clauses, els)
        if self.accept("FOR"):
            var = self.expect_id()
            self.expect(":=")
            start = self.parse_expr()
            self.expect("TO")
            end = self.parse_expr()
            step = self.parse_expr() if self.accept("BY") else None
            self.expect("DO")
            body = self.parse_stmts("END_FOR")
            self.expect("END_FOR")
            self.accept(";")
            return ("for", line, var, start, end, step, body)
        if self.accept("WHILE"):
            cond = self.parse_expr()
            self.expect("DO")
            body = self.parse_stmts("END_WHILE")
            self.expect("END_WHILE")
            self.accept(";")
            return ("while", line, cond, body)
        if self.accept("REPEAT"):
            body = self.parse_stmts("UNTIL")
            self.expect("UNTIL")
            cond = self.parse_expr()
            self.expect("END_REPEAT")
            self.accept(";")
            return ("repeat", line, body, cond)
        if self.accept("EXIT"):
            self.expect(";")
            return ("exit", line)
        if self.accept("RETURN"):
            self.expect(";")
            return ("return", line)
        if self.tok.kind == "id":
            return self.parse_assign_or_call(line)
        self.error("expected statement")

    def _is_label_start(self) -> bool:
        t, j = self.tok, 1
        if t.kind == "op" and t.val == "-":
            t, j = self.peek(1), 2
        if t.kind in ("num", "id"):
            n = self.peek(j)
            return n.kind == "op" and n.val in (":", ",", "..")
        return False

    def parse_case_labels(self):
        labels = []
        while True:
            lo = self._label_value()
            hi = self._label_value() if self.accept("..") else lo
            labels.append((lo, hi))
            if not self.accept(","):
                return labels

    def _label_value(self):
        neg = bool(self.accept("-"))
        t = self.tok
        if t.kind == "num" and isinstance(t.val, int):
            self.advance()
            return ("lit", -t.val if neg else t.val)
        if t.kind == "id" and not neg:
            self.advance()
            return ("var", t.val)
        self.error("CASE labels must be integer literals or constants")

    def parse_target(self):
        name = self.expect_id()
        if self.accept("."):
            return ("member", name, self.expect_id())
        return ("var", name)

    def parse_assign_or_call(self, line):
        target = self.parse_target()
        if self.accept(":="):
            expr = self.parse_expr()
            self.expect(";")
            return ("assign", line, target, expr)
        if target[0] == "var" and self.accept("("):
            ins, outs = [], []
            if not self.accept(")"):
                while True:
                    p = self.expect_id()
                    if self.accept(":="):
                        ins.append((p, self.parse_expr()))
                    elif self.accept("=>"):
                        outs.append((p, self.parse_target()))
                    else:
                        self.error("FB call parameters must be named (P := value or P => var)")
                    if self.accept(")"):
                        break
                    self.expect(",")
            self.expect(";")
            return ("fbcall", line, target[1], ins, outs)
        self.error("expected ':=' or '('")

    # -- expressions -------------------------------------------------------------
    def parse_expr(self):
        return self._binary(0)

    def _binary(self, level):
        if level == len(_BIN_LEVELS):
            return self.parse_unary()
        left = self._binary(level + 1)
        while self.at(*_BIN_LEVELS[level]):
            op = self.advance().val
            if op == "&":
                op = "AND"
            left = ("bin", op, left, self._binary(level + 1))
        return left

    def parse_unary(self):
        if self.accept("-"):
            e = self.parse_unary()
            if e[0] == "lit" and not isinstance(e[1], bool):
                return ("lit", -e[1])
            return ("un", "-", e)
        if self.accept("+"):
            return self.parse_unary()
        if self.accept("NOT"):
            return ("un", "NOT", self.parse_unary())
        return self.parse_primary()

    def parse_primary(self):
        t = self.tok
        if t.kind in ("num", "time"):
            self.advance()
            return ("lit", t.val)
        if self.accept("TRUE"):
            return ("lit", True)
        if self.accept("FALSE"):
            return ("lit", False)
        if self.accept("("):
            e = self.parse_expr()
            self.expect(")")
            return e
        if t.kind == "addr":
            self.error("direct addresses in expressions are not supported - declare a located variable")
        if t.kind == "id":
            name = self.advance().val
            if self.accept("("):
                args = []
                if not self.accept(")"):
                    while True:
                        if self.tok.kind == "id" and self.peek().kind == "op" and self.peek().val == ":=":
                            p = self.advance().val
                            self.advance()
                            args.append((p, self.parse_expr()))
                        else:
                            args.append((None, self.parse_expr()))
                        if self.accept(")"):
                            break
                        self.expect(",")
                return ("call", name, args)
            if self.accept("."):
                return ("member", name, self.expect_id())
            return ("var", name)
        self.error("expected expression")


# =============================================================================
# Types and value coercion
# =============================================================================
_INT_TYPES = {
    "SINT": (8, True), "INT": (16, True), "DINT": (32, True), "LINT": (64, True),
    "USINT": (8, False), "UINT": (16, False), "UDINT": (32, False), "ULINT": (64, False),
    "BYTE": (8, False), "WORD": (16, False), "DWORD": (32, False), "LWORD": (64, False),
}
_REAL_TYPES = {"REAL", "LREAL"}
ELEMENTARY = set(_INT_TYPES) | _REAL_TYPES | {"BOOL", "TIME"}


def _kind(v) -> str:
    if isinstance(v, bool):
        return "BOOL"
    if isinstance(v, float):
        return "REAL"
    return "INT"


def _wrap(v: int, bits: int, signed: bool) -> int:
    v &= (1 << bits) - 1
    if signed and v >= 1 << (bits - 1):
        v -= 1 << bits
    return v


def default_value(typ: str):
    if typ == "BOOL":
        return False
    if typ in _REAL_TYPES:
        return 0.0
    return 0


def coercer(typ: str):
    """Assignment check: strict IEC typing, integer wrap-around to the type width."""
    if typ == "BOOL":
        def co(v):
            if not isinstance(v, bool):
                raise STError(f"cannot assign {_kind(v)} value {v!r} to BOOL")
            return v
        return co
    if typ in _REAL_TYPES:
        def co(v):
            if not isinstance(v, float):
                raise STError(f"cannot assign {_kind(v)} value {v!r} to {typ} "
                              "(use a REAL literal like 1.0 or an explicit conversion)")
            return v
        return co
    if typ == "TIME":
        def co(v):
            if isinstance(v, (bool, float)):
                raise STError(f"cannot assign {_kind(v)} value {v!r} to TIME")
            return v
        return co
    if typ in _INT_TYPES:
        bits, signed = _INT_TYPES[typ]

        def co(v):
            if isinstance(v, (bool, float)):
                raise STError(f"cannot assign {_kind(v)} value {v!r} to {typ} "
                              "(use an explicit conversion)")
            return _wrap(v, bits, signed)
        return co
    raise STError(f"unknown type {typ}")


def lean_coercer(typ: str):
    """Assignment in lean mode: no type checks, integer wrap-around kept."""
    if typ in _INT_TYPES:
        bits, signed = _INT_TYPES[typ]
        mask, top = (1 << bits) - 1, 1 << (bits - 1)
        if signed:
            return lambda v: ((v & mask) - (1 << bits)) if (v & mask) >= top else (v & mask)
        return lambda v: v & mask
    return lambda v: v


def external_coercer(typ: str):
    """Lenient conversion for values coming from outside (Modbus, test bench)."""
    strict = coercer(typ)
    if typ == "BOOL":
        return lambda v: bool(v)
    if typ in _REAL_TYPES:
        return lambda v: float(v)
    return lambda v: strict(int(v))


def _round_half_away(x: float) -> int:
    return int(math.floor(abs(x) + 0.5)) * (1 if x >= 0 else -1)


def _make_conversion(src: str, dst: str):
    if src not in ELEMENTARY or dst not in ELEMENTARY:
        raise STError(f"unknown conversion {src}_TO_{dst}")
    if "TIME" in (src, dst):
        raise STError(f"{src}_TO_{dst}: TIME conversions are implementation-defined "
                      "and not supported - use TIME literals")
    src_kind = "BOOL" if src == "BOOL" else ("REAL" if src in _REAL_TYPES else "INT")
    dst_co = coercer(dst)

    def conv(v):
        if _kind(v) != src_kind:
            raise STError(f"{src}_TO_{dst} called with a {_kind(v)} argument")
        if dst == "BOOL":
            return bool(v)
        if dst in _REAL_TYPES:
            return float(v)
        if src_kind == "REAL":
            return dst_co(_round_half_away(v))
        return dst_co(int(v))
    return conv


def _lean_conversion(src: str, dst: str):
    """<src>_TO_<dst> without argument checks (lean mode)."""
    _make_conversion(src, dst)                 # still rejects unknown / TIME conversions
    if dst in _REAL_TYPES:
        return float
    if dst == "BOOL":
        return bool
    co = lean_coercer(dst)
    if src in _REAL_TYPES:
        return lambda v: co(_round_half_away(v))
    return lambda v: co(int(v))


def _num_pair(a, b, op):
    if isinstance(a, bool) or isinstance(b, bool):
        raise STError(f"operator {op} does not accept BOOL operands")
    fa, fb = isinstance(a, float), isinstance(b, float)
    if fa != fb:
        raise STError(f"operator {op}: mixing REAL and integer operands "
                      "(use an explicit conversion)")
    return fa


def _idiv(a: int, b: int) -> int:
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q


def _same_kind(args, fname):
    kinds = {_kind(a) for a in args}
    if len(kinds) > 1:
        raise STError(f"{fname}: arguments must all have the same type")
    return kinds.pop()


def _f_limit(mn, x, mx):
    _same_kind((mn, x, mx), "LIMIT")
    return min(max(x, mn), mx)


def _f_sel(g, a, b):
    if not isinstance(g, bool):
        raise STError("SEL: selector must be BOOL")
    return b if g else a


def _f_shift(left):
    def f(v, n):
        if _kind(v) != "INT" or _kind(n) != "INT":
            raise STError("SHL/SHR need integer/bit-string arguments")
        return v << n if left else v >> n
    return f


def _f_real(fn, name):
    def f(x):
        if not isinstance(x, float):
            raise STError(f"{name} needs a REAL argument")
        return fn(x)
    return f


def _f_abs(x):
    if isinstance(x, bool):
        raise STError("ABS needs a numeric argument")
    return abs(x)


def _f_trunc(x):
    if not isinstance(x, float):
        raise STError("TRUNC needs a REAL argument")
    return int(x)


def _f_minmax(fn, name):
    def f(*args):
        _same_kind(args, name)
        return fn(args)
    return f


BUILTIN_FUNCTIONS = {
    # name: (callable, min_args, max_args)
    "ABS": (_f_abs, 1, 1),
    "SQRT": (_f_real(math.sqrt, "SQRT"), 1, 1),
    "EXP": (_f_real(math.exp, "EXP"), 1, 1),
    "LN": (_f_real(math.log, "LN"), 1, 1),
    "TRUNC": (_f_trunc, 1, 1),
    "MOVE": (lambda x: x, 1, 1),
    "LIMIT": (_f_limit, 3, 3),
    "SEL": (_f_sel, 3, 3),
    "MIN": (_f_minmax(min, "MIN"), 2, 16),
    "MAX": (_f_minmax(max, "MAX"), 2, 16),
    "SHL": (_f_shift(True), 2, 2),
    "SHR": (_f_shift(False), 2, 2),
}


# =============================================================================
# Standard function blocks
# =============================================================================
class _BuiltinFB:
    TYPES: dict = {}
    INPUTS: tuple = ()
    OUTPUTS: tuple = ()

    def __init__(self, vm: "STMachine"):
        self.vm = vm
        self.vars = {k: default_value(t) for k, t in self.TYPES.items()}

    def execute(self):  # pragma: no cover - overridden
        raise NotImplementedError


class TON(_BuiltinFB):
    """On-delay timer."""
    TYPES = {"IN": "BOOL", "PT": "TIME", "Q": "BOOL", "ET": "TIME"}
    INPUTS, OUTPUTS = ("IN", "PT"), ("Q", "ET")

    def __init__(self, vm):
        super().__init__(vm)
        self._start = None

    def execute(self):
        v, now = self.vars, self.vm.now
        if v["IN"]:
            if self._start is None:
                self._start = now
            et = now - self._start
            if et >= v["PT"]:
                v["Q"], v["ET"] = True, v["PT"]
            else:
                v["Q"], v["ET"] = False, et
        else:
            self._start = None
            v["Q"], v["ET"] = False, 0


class TOF(_BuiltinFB):
    """Off-delay timer."""
    TYPES = {"IN": "BOOL", "PT": "TIME", "Q": "BOOL", "ET": "TIME"}
    INPUTS, OUTPUTS = ("IN", "PT"), ("Q", "ET")

    def __init__(self, vm):
        super().__init__(vm)
        self._start = None

    def execute(self):
        v, now = self.vars, self.vm.now
        if v["IN"]:
            self._start = None
            v["Q"], v["ET"] = True, 0
        elif v["Q"]:
            if self._start is None:
                self._start = now
            et = now - self._start
            if et >= v["PT"]:
                v["Q"], v["ET"] = False, v["PT"]
            else:
                v["ET"] = et


class TP(_BuiltinFB):
    """Pulse timer."""
    TYPES = {"IN": "BOOL", "PT": "TIME", "Q": "BOOL", "ET": "TIME"}
    INPUTS, OUTPUTS = ("IN", "PT"), ("Q", "ET")

    def __init__(self, vm):
        super().__init__(vm)
        self._start = None
        self._prev = False

    def execute(self):
        v, now = self.vars, self.vm.now
        if self._start is None and v["IN"] and not self._prev:
            self._start = now
        if self._start is not None:
            et = now - self._start
            if et >= v["PT"]:
                v["Q"], v["ET"] = False, v["PT"]
                if not v["IN"]:
                    self._start = None
                    v["ET"] = 0
            else:
                v["Q"], v["ET"] = True, et
        elif not v["IN"]:
            v["ET"] = 0
        self._prev = v["IN"]


class R_TRIG(_BuiltinFB):
    TYPES = {"CLK": "BOOL", "Q": "BOOL"}
    INPUTS, OUTPUTS = ("CLK",), ("Q",)

    def __init__(self, vm):
        super().__init__(vm)
        self._m = False

    def execute(self):
        clk = self.vars["CLK"]
        self.vars["Q"] = clk and not self._m
        self._m = clk


class F_TRIG(_BuiltinFB):
    """IEC definition: Q := NOT CLK AND NOT M; M := NOT CLK (fires on first call if CLK=FALSE)."""
    TYPES = {"CLK": "BOOL", "Q": "BOOL"}
    INPUTS, OUTPUTS = ("CLK",), ("Q",)

    def __init__(self, vm):
        super().__init__(vm)
        self._m = False

    def execute(self):
        clk = self.vars["CLK"]
        self.vars["Q"] = (not clk) and (not self._m)
        self._m = not clk


class CTU(_BuiltinFB):
    TYPES = {"CU": "BOOL", "R": "BOOL", "PV": "INT", "Q": "BOOL", "CV": "INT"}
    INPUTS, OUTPUTS = ("CU", "R", "PV"), ("Q", "CV")

    def __init__(self, vm):
        super().__init__(vm)
        self._prev = False

    def execute(self):
        v = self.vars
        if v["R"]:
            v["CV"] = 0
        elif v["CU"] and not self._prev and v["CV"] < 32767:
            v["CV"] += 1
        self._prev = v["CU"]
        v["Q"] = v["CV"] >= v["PV"]


class CTD(_BuiltinFB):
    TYPES = {"CD": "BOOL", "LD": "BOOL", "PV": "INT", "Q": "BOOL", "CV": "INT"}
    INPUTS, OUTPUTS = ("CD", "LD", "PV"), ("Q", "CV")

    def __init__(self, vm):
        super().__init__(vm)
        self._prev = False

    def execute(self):
        v = self.vars
        if v["LD"]:
            v["CV"] = v["PV"]
        elif v["CD"] and not self._prev and v["CV"] > -32768:
            v["CV"] -= 1
        self._prev = v["CD"]
        v["Q"] = v["CV"] <= 0


class RS(_BuiltinFB):
    """Reset-dominant bistable."""
    TYPES = {"S": "BOOL", "R1": "BOOL", "Q1": "BOOL"}
    INPUTS, OUTPUTS = ("S", "R1"), ("Q1",)

    def execute(self):
        v = self.vars
        v["Q1"] = (not v["R1"]) and (v["S"] or v["Q1"])


class SR(_BuiltinFB):
    """Set-dominant bistable."""
    TYPES = {"S1": "BOOL", "R": "BOOL", "Q1": "BOOL"}
    INPUTS, OUTPUTS = ("S1", "R"), ("Q1",)

    def execute(self):
        v = self.vars
        v["Q1"] = v["S1"] or ((not v["R"]) and v["Q1"])


BUILTIN_FBS = {c.__name__: c for c in (TON, TOF, TP, R_TRIG, F_TRIG, CTU, CTD, RS, SR)}


# =============================================================================
# Compiler: AST -> Python closures
# =============================================================================
class _Exit(Exception):
    pass


class _Return(Exception):
    pass


LOOP_LIMIT = 100_000


def _block(fns):
    fns = tuple(fns)
    if not fns:
        return lambda inst: None
    if len(fns) == 1:
        return fns[0]

    def run(inst):
        for f in fns:
            f(inst)
    return run


def _lean_unary(op, f):
    if op == "-":
        return lambda inst: -f(inst)
    return lambda inst: not f(inst)


def _lean_binary(op, fa, fb):
    """Operators without run-time type checks (lean mode). The program must already
    have passed the strict VM; Python's & | ^ give the IEC result for BOOL and bit strings."""
    ops = {
        "+": lambda inst: fa(inst) + fb(inst),
        "-": lambda inst: fa(inst) - fb(inst),
        "*": lambda inst: fa(inst) * fb(inst),
        "=": lambda inst: fa(inst) == fb(inst),
        "<>": lambda inst: fa(inst) != fb(inst),
        "<": lambda inst: fa(inst) < fb(inst),
        ">": lambda inst: fa(inst) > fb(inst),
        "<=": lambda inst: fa(inst) <= fb(inst),
        ">=": lambda inst: fa(inst) >= fb(inst),
        "AND": lambda inst: fa(inst) & fb(inst),
        "OR": lambda inst: fa(inst) | fb(inst),
        "XOR": lambda inst: fa(inst) ^ fb(inst),
    }
    return ops.get(op)      # "/", "MOD", "**" keep their strict versions


class POUType:
    """A compiled PROGRAM or FUNCTION_BLOCK type."""

    def __init__(self, vm: "STMachine", d: POUDef):
        self.vm, self.kind, self.name, self._def = vm, d.kind, d.name, d
        self.decls = d.decls
        self.TYPES, self.sections, self.constants = {}, {}, set()
        for x in d.decls:
            if x.name in self.TYPES:
                raise STError(f"{self.name}, line {x.line}: duplicate variable {x.name}", True)
            if x.addr and self.kind != "PROGRAM":
                raise STError(f"{self.name}, line {x.line}: located variables are only "
                              "allowed in a PROGRAM", True)
            self.TYPES[x.name] = x.type
            self.sections[x.name] = x.section
            if x.constant:
                self.constants.add(x.name)
        self.INPUTS = tuple(n for n, s in self.sections.items() if s == "VAR_INPUT")
        self.OUTPUTS = tuple(n for n, s in self.sections.items() if s == "VAR_OUTPUT")
        self.inits = {}
        self.body = None

    # -- helpers ----------------------------------------------------------------
    def _fb_type(self, name):
        if name not in self.TYPES:
            raise STError(f"undeclared variable {name}")
        t = self.vm.fb_types.get(self.TYPES[name])
        if t is None:
            raise STError(f"{name} is not a function block instance")
        return t

    def _check_var(self, name):
        if name not in self.TYPES:
            raise STError(f"undeclared variable {name}")
        if self.TYPES[name] in self.vm.fb_types:
            raise STError(f"function block instance {name} used as a value")

    def compile(self):
        for x in self.decls:
            if x.type not in ELEMENTARY and x.type not in self.vm.fb_types:
                raise STError(f"{self.name}, line {x.line}: unknown type {x.type}", True)
            if x.type in self.vm.fb_types and (x.init is not None or x.addr):
                raise STError(f"{self.name}, line {x.line}: FB instance {x.name} cannot "
                              "have an initial value or address", True)
            if x.constant and x.init is None:
                raise STError(f"{self.name}, line {x.line}: constant {x.name} needs a value", True)
            if x.init is not None:
                try:
                    self.inits[x.name] = (self.compile_expr(x.init), coercer(x.type))
                except STError as ex:
                    raise _locate(ex, self.name, x.line) from None
        self.body = self.compile_block(self._def.body)

    def const_value(self, name):
        if name not in self.constants:
            raise STError(f"CASE label {name} is not a constant")
        f, co = self.inits[name]
        return co(f(None))

    # -- statements -----------------------------------------------------------------
    def compile_block(self, stmts):
        return _block(self.compile_stmt(s) for s in stmts)

    def compile_stmt(self, s):
        kind, line = s[0], s[1]
        try:
            fn = getattr(self, "_st_" + kind)(*s[2:])
        except STError as ex:
            raise _locate(ex, self.name, line) from None
        if not self.vm.strict:
            return fn
        pou = self.name

        def located(inst):
            try:
                fn(inst)
            except STError as ex:
                raise _locate(ex, pou, line) from None
        return located

    def _setter(self, target):
        if target[0] == "var":
            name = target[1]
            self._check_var(name)
            if name in self.constants:
                raise STError(f"cannot assign to constant {name}")
            co = self._co(self.TYPES[name])

            def set_var(inst, value):
                inst.vars[name] = co(value)
            return set_var
        _, name, member = target
        fbt = self._fb_type(name)
        if member not in fbt.TYPES:
            raise STError(f"{name} ({self.TYPES[name]}) has no member {member}")
        co = self._co(fbt.TYPES[member])

        def set_member(inst, value):
            inst.vars[name].vars[member] = co(value)
        return set_member

    def _co(self, typ):
        return coercer(typ) if self.vm.strict else lean_coercer(typ)

    def _st_assign(self, target, expr):
        setter, f = self._setter(target), self.compile_expr(expr)
        return lambda inst: setter(inst, f(inst))

    def _st_fbcall(self, name, ins, outs):
        fbt = self._fb_type(name)
        cin = []
        for p, e in ins:
            if p not in fbt.INPUTS:
                raise STError(f"{self.TYPES[name]} has no input {p}")
            cin.append((p, self.compile_expr(e), self._co(fbt.TYPES[p])))
        cout = []
        for p, target in outs:
            if p not in fbt.OUTPUTS:
                raise STError(f"{self.TYPES[name]} has no output {p}")
            cout.append((p, self._setter(target)))
        cin, cout = tuple(cin), tuple(cout)

        def call(inst):
            fb = inst.vars[name]
            v = fb.vars
            for p, f, co in cin:
                v[p] = co(f(inst))
            fb.execute()
            for p, setter in cout:
                setter(inst, v[p])
        return call

    def _cond(self, f, what):
        if not self.vm.strict:
            return f

        def c(inst):
            v = f(inst)
            if not isinstance(v, bool):
                raise STError(f"{what} condition is not BOOL")
            return v
        return c

    def _st_if(self, branches, els):
        cb = tuple((self._cond(self.compile_expr(c), "IF"), self.compile_block(b))
                   for c, b in branches)
        eb = self.compile_block(els) if els is not None else None

        def run(inst):
            for c, b in cb:
                if c(inst):
                    b(inst)
                    return
            if eb is not None:
                eb(inst)
        return run

    def _label(self, node):
        if node[0] == "lit":
            return node[1]
        return self.const_value(node[1])

    def _st_case(self, sel, clauses, els):
        fsel = self.compile_expr(sel)
        table, ranges = {}, []
        for labels, body in clauses:
            b = self.compile_block(body)
            for lo, hi in labels:
                lo, hi = self._label(lo), self._label(hi)
                if lo == hi:
                    if lo in table:
                        raise STError(f"duplicate CASE label {lo}")
                    table[lo] = b
                else:
                    ranges.append((lo, hi, b))
        eb = self.compile_block(els) if els is not None else None
        ranges = tuple(ranges)

        def run(inst):
            v = fsel(inst)
            if _kind(v) != "INT":
                raise STError("CASE selector must be an integer")
            b = table.get(v)
            if b is None:
                for lo, hi, rb in ranges:
                    if lo <= v <= hi:
                        b = rb
                        break
                else:
                    b = eb
            if b is not None:
                b(inst)
        return run

    def _st_for(self, var, start, end, step, body):
        set_var = self._setter(("var", var))
        fs, fe = self.compile_expr(start), self.compile_expr(end)
        fst = self.compile_expr(step) if step is not None else (lambda inst: 1)
        fb = self.compile_block(body)

        def run(inst):
            st = fst(inst)
            if st == 0:
                raise STError("FOR step is zero")
            set_var(inst, fs(inst))
            stop = fe(inst)
            for _ in range(LOOP_LIMIT):
                cur = inst.vars[var]
                if (st > 0 and cur > stop) or (st < 0 and cur < stop):
                    return
                try:
                    fb(inst)
                except _Exit:
                    return
                set_var(inst, inst.vars[var] + st)
            raise STError("FOR loop iteration limit exceeded")
        return run

    def _st_while(self, cond, body):
        fc, fb = self._cond(self.compile_expr(cond), "WHILE"), self.compile_block(body)

        def run(inst):
            for _ in range(LOOP_LIMIT):
                if not fc(inst):
                    return
                try:
                    fb(inst)
                except _Exit:
                    return
            raise STError("WHILE loop iteration limit exceeded")
        return run

    def _st_repeat(self, body, cond):
        fc, fb = self._cond(self.compile_expr(cond), "UNTIL"), self.compile_block(body)

        def run(inst):
            for _ in range(LOOP_LIMIT):
                try:
                    fb(inst)
                except _Exit:
                    return
                if fc(inst):
                    return
            raise STError("REPEAT loop iteration limit exceeded")
        return run

    def _st_exit(self):
        def run(inst):
            raise _Exit()
        return run

    def _st_return(self):
        def run(inst):
            raise _Return()
        return run

    # -- expressions -------------------------------------------------------------
    def compile_expr(self, e):
        k = e[0]
        if k == "lit":
            v = e[1]
            return lambda inst: v
        if k == "var":
            name = e[1]
            self._check_var(name)
            return lambda inst: inst.vars[name]
        if k == "member":
            name, member = e[1], e[2]
            fbt = self._fb_type(name)
            if member not in fbt.TYPES:
                raise STError(f"{name} ({self.TYPES[name]}) has no member {member}")
            return lambda inst: inst.vars[name].vars[member]
        if k == "call":
            return self._compile_call(e[1], e[2])
        if k == "un":
            if not self.vm.strict:
                return _lean_unary(e[1], self.compile_expr(e[2]))
            return self._compile_unary(e[1], self.compile_expr(e[2]))
        if k == "bin":
            fa, fb = self.compile_expr(e[2]), self.compile_expr(e[3])
            if not self.vm.strict:
                lean = _lean_binary(e[1], fa, fb)
                if lean is not None:
                    return lean
            return self._compile_binary(e[1], fa, fb)
        raise STError(f"internal: unknown expression {k}")  # pragma: no cover

    @staticmethod
    def _compile_unary(op, f):
        if op == "-":
            def neg(inst):
                v = f(inst)
                if isinstance(v, bool):
                    raise STError("unary minus on BOOL")
                return -v
            return neg

        def not_(inst):
            v = f(inst)
            if not isinstance(v, bool):
                raise STError("NOT is only supported on BOOL in stvm")
            return not v
        return not_

    @staticmethod
    def _compile_binary(op, fa, fb):
        if op in ("+", "-", "*"):
            pyop = {"+": lambda a, b: a + b, "-": lambda a, b: a - b, "*": lambda a, b: a * b}[op]

            def arith(inst):
                a, b = fa(inst), fb(inst)
                _num_pair(a, b, op)
                return pyop(a, b)
            return arith
        if op == "/":
            def div(inst):
                a, b = fa(inst), fb(inst)
                is_real = _num_pair(a, b, "/")
                if b == 0:
                    raise STError("division by zero")
                return a / b if is_real else _idiv(a, b)
            return div
        if op == "MOD":
            def mod(inst):
                a, b = fa(inst), fb(inst)
                if _num_pair(a, b, "MOD"):
                    raise STError("MOD needs integer operands")
                if b == 0:
                    return 0
                return a - b * _idiv(a, b)
            return mod
        if op == "**":
            def expt(inst):
                a, b = fa(inst), fb(inst)
                if not isinstance(a, float) or isinstance(b, bool):
                    raise STError("** needs a REAL base")
                return float(a ** b)
            return expt
        if op in ("=", "<>"):
            eq = op == "="

            def equal(inst):
                a, b = fa(inst), fb(inst)
                if isinstance(a, bool) != isinstance(b, bool):
                    raise STError(f"operator {op}: comparing BOOL with a number")
                if not isinstance(a, bool):
                    _num_pair(a, b, op)
                return (a == b) == eq
            return equal
        if op in ("<", ">", "<=", ">="):
            pyop = {"<": lambda a, b: a < b, ">": lambda a, b: a > b,
                    "<=": lambda a, b: a <= b, ">=": lambda a, b: a >= b}[op]

            def compare(inst):
                a, b = fa(inst), fb(inst)
                _num_pair(a, b, op)
                return pyop(a, b)
            return compare
        if op in ("AND", "OR", "XOR"):
            if op == "AND":
                lg, bw = (lambda a, b: a and b), (lambda a, b: a & b)
            elif op == "OR":
                lg, bw = (lambda a, b: a or b), (lambda a, b: a | b)
            else:
                lg, bw = (lambda a, b: a != b), (lambda a, b: a ^ b)

            def logic(inst):
                a, b = fa(inst), fb(inst)
                ba, bb = isinstance(a, bool), isinstance(b, bool)
                if ba and bb:
                    return lg(a, b)
                if not ba and not bb and not isinstance(a, float) and not isinstance(b, float):
                    return bw(a, b)
                raise STError(f"operator {op}: operands must both be BOOL or both bit strings")
            return logic
        raise STError(f"unsupported operator {op}")  # pragma: no cover

    def _compile_call(self, name, args):
        if any(p is not None for p, _ in args):
            raise STError(f"{name}: named arguments are only supported for FB calls")
        fargs = tuple(self.compile_expr(a) for _, a in args)
        if "_TO_" in name:
            src, dst = name.split("_TO_", 1)
            if len(fargs) != 1:
                raise STError(f"{name} takes one argument")
            conv, f0 = _make_conversion(src, dst), fargs[0]
            if not self.vm.strict:
                conv = _lean_conversion(src, dst)
                if dst == "BOOL":
                    return lambda inst: bool(f0(inst))
                if src == "BOOL" and dst in _INT_TYPES:
                    return lambda inst: 1 if f0(inst) else 0
            return lambda inst: conv(f0(inst))
        if name in BUILTIN_FUNCTIONS:
            fn, lo, hi = BUILTIN_FUNCTIONS[name]
            if not self.vm.strict and name in ("SHL", "SHR") and len(fargs) == 2:
                f0, f1 = fargs
                if name == "SHL":
                    return lambda inst: f0(inst) << f1(inst)
                return lambda inst: f0(inst) >> f1(inst)
            if not lo <= len(fargs) <= hi:
                raise STError(f"{name} takes {lo}..{hi} arguments, got {len(fargs)}")
            if len(fargs) == 1:
                f0 = fargs[0]
                return lambda inst: fn(f0(inst))
            if len(fargs) == 2:
                f0, f1 = fargs
                return lambda inst: fn(f0(inst), f1(inst))
            if len(fargs) == 3:
                f0, f1, f2 = fargs
                return lambda inst: fn(f0(inst), f1(inst), f2(inst))
            return lambda inst: fn(*[f(inst) for f in fargs])
        if name in self.vm.fb_types:
            raise STError(f"{name} is a function block type - declare an instance and call it")
        raise STError(f"unknown function {name}")


class Instance:
    """An instance of a PROGRAM or user FUNCTION_BLOCK."""

    __slots__ = ("type", "vars")

    def __init__(self, ptype: POUType, vm: "STMachine"):
        self.type = ptype
        self.vars = {}
        for x in ptype.decls:
            if x.type in vm.fb_types:
                self.vars[x.name] = vm.new_fb(x.type)
            elif x.name in ptype.inits:
                f, co = ptype.inits[x.name]
                self.vars[x.name] = co(f(self))
            else:
                self.vars[x.name] = default_value(x.type)

    def execute(self):
        try:
            self.type.body(self)
        except _Return:
            pass


# =============================================================================
# Machine
# =============================================================================
class STMachine:
    """Loads an ST source file and executes its PROGRAM scan by scan.

    >>> vm = STMachine(open("plc/batch_station.st").read())
    >>> vm["%IX100.0"] = True     # write an input by address ...
    >>> vm.scan()                 # ... run one PLC cycle (advances vm.now by cycle_ms)
    >>> vm["step"]                # read any variable by name or address
    """

    def __init__(self, source: str, program: str | None = None, cycle_ms: int | None = None,
                 strict: bool = True):
        self.strict = strict     # False: lean mode, no run-time type checks (much faster)
        pous, config = Parser(tokenize(source)).parse_unit()
        self.now = 0
        self.scan_count = 0
        self.fb_types: dict = dict(BUILTIN_FBS)
        programs = {}
        for d in pous:
            if d.name in self.fb_types or d.name in programs:
                raise STError(f"duplicate POU name {d.name}")
            t = POUType(self, d)
            (programs if d.kind == "PROGRAM" else self.fb_types)[d.name] = t
        for t in list(self.fb_types.values()) + list(programs.values()):
            if isinstance(t, POUType):
                t.compile()

        if program is None and config is not None and config.program:
            program = config.program.upper()
        if program is None:
            if len(programs) != 1:
                raise STError("source has several PROGRAMs - name the one to run")
            program = next(iter(programs))
        if program.upper() not in programs:
            raise STError(f"PROGRAM {program} not found")
        self.program_type = programs[program.upper()]
        self.config = config
        self.cycle_ms = cycle_ms or (config.interval_ms if config and config.interval_ms else 100)
        self.program = Instance(self.program_type, self)
        self.located = {x.addr: x.name for x in self.program_type.decls if x.addr}
        if len(self.located) != sum(1 for x in self.program_type.decls if x.addr):
            raise STError("two variables are located at the same address")
        self._ext = {n: external_coercer(t) for n, t in self.program_type.TYPES.items()
                     if t in ELEMENTARY}

    def new_fb(self, typename: str):
        t = self.fb_types[typename]
        return t(self) if isinstance(t, type) else Instance(t, self)

    def scan(self, n: int = 1):
        """Run ``n`` PLC cycles. Time advances by ``cycle_ms`` before each cycle."""
        for _ in range(n):
            self.now += self.cycle_ms
            self.program.execute()
            self.scan_count += 1

    # -- variable access -----------------------------------------------------------
    def _name(self, key: str) -> str:
        if key.startswith("%"):
            try:
                return self.located[key.upper()]
            except KeyError:
                raise KeyError(f"no variable located at {key}") from None
        name = key.upper()
        if name not in self.program.vars:
            raise KeyError(f"no variable {key}")
        return name

    def __getitem__(self, key: str):
        return self.program.vars[self._name(key)]

    def __setitem__(self, key: str, value):
        name = self._name(key)
        if name not in self._ext:
            raise KeyError(f"{key} is not an elementary variable")
        self.program.vars[name] = self._ext[name](value)

    def fb(self, name: str):
        """Return the variables dict of an FB instance, e.g. ``vm.fb('tmr_dry')['Q']``."""
        return self.program.vars[self._name(name)].vars

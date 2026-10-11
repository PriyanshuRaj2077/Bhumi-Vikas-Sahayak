"""Rule tables encoded as data, plus the calculators that read them.

Every row carries the rule, sub-rule, PDF page and a `source` snippet that appears
verbatim (whitespace-normalised) in the cleaned rule text; tests/test_calculators.py
checks that every snippet exists, so a typo here fails the build.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from datetime import date

# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------


@dataclass
class Fact:
    key: str
    label: str
    label_hi: str
    display: str
    rule: str
    sub_rule: str
    page: int
    value: float | str | None = None
    unit: str = ""
    row_label: str = ""
    source: str = ""  # verbatim snippet from the rule text
    notes: list[str] = field(default_factory=list)
    edge_case: bool = False
    status: str = "ok"  # ok | not_applicable | not_eligible | info

    def to_dict(self) -> dict:
        from .. import corpus  # local import: calculators stay usable without the corpus

        d = asdict(self)
        d["citation"] = f"Rule {self.rule}{self.sub_rule}"
        d["quote"] = ""
        rule = corpus.rules_by_id().get(self.rule)
        span = rule.find(self.source) if (rule and self.source) else None
        if span:
            d["quote"] = rule.passage_around(*span)
            d["page"] = rule.page_at(span[0])
        d["pdf_url"] = f"/pdf/en#page={d['page']}"
        return d


class InputError(ValueError):
    pass


def _positive(name: str, value: float | None, allow_zero: bool = False) -> float:
    if value is None:
        raise InputError(f"{name} is required")
    try:
        value = float(value)
    except (TypeError, ValueError) as exc:
        raise InputError(f"{name} must be a number") from exc
    if value < 0 or (value == 0 and not allow_zero):
        raise InputError(f"{name} must be greater than zero")
    return value


def _m(x: float) -> str:
    return f"{x:.1f} m"


def _rs(x: float) -> str:
    """Indian digit grouping: 150000 -> Rs 1,50,000."""
    neg = x < 0
    x = abs(x)
    whole = int(round(x))
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return ("-" if neg else "") + "Rs " + s


RESIDENTIAL_HEIGHT_LIMIT = 12.5

# ---------------------------------------------------------------------------
# Rule 56(1)(a): front open space, residential buildings up to 12.5 m
# ---------------------------------------------------------------------------
FRONT_ROWS = [
    # (greater_than, up_to_inclusive, metres, row label, verbatim snippet)
    (None, 9.0, 3.0, "Up to 9.0 meters", "Up to 9.0 meters 3.0 meters"),
    (9.0, 12.0, 3.6, "More than 9.0 meters and up to 12 meters", "More than 9.0 meters and up to 12 meters 3.6 meters"),
    (12.0, 18.0, 4.5, "More than 12.0 meters and up to 18 meters", "More than 12.0 meters and up to 18 meters 4.5 meters"),
    (18.0, None, 6.0, "Above 18 meters", "Above 18 meters 6.0 meters"),
]


def _pick(rows, x):
    for row in rows:
        gt, lte = row[0], row[1]
        if (gt is None or x > gt) and (lte is None or x <= lte):
            return row
    raise AssertionError("table rows must cover the whole range")


def front_open_space(street_width_m: float, height_m: float | None = None) -> Fact:
    w = _positive("street_width_m", street_width_m)
    if height_m is not None and _positive("height_m", height_m) > RESIDENTIAL_HEIGHT_LIMIT:
        return Fact(
            key="front_open_space", label="Front open space", label_hi="सामने खुला स्थान",
            display="See Rule 42 (height above 12.5 m)", rule="56", sub_rule="(5)", page=78,
            status="not_applicable",
            source="For building of height above 12.5 meters the open spaces around building shall be as given in Table 4 and 5 of Rule 42",
            notes=["Rule 56(1) covers residential buildings up to 12.5 m. Taller buildings follow Rule 42 Tables 4 and 5."],
        )
    gt, lte, metres, label, snippet = _pick(FRONT_ROWS, w)
    notes = []
    if w in (9.0, 12.0, 18.0):
        notes.append(f"A street of exactly {w:g} m falls in the row \"{label}\" (the limit is inclusive).")
    if w < 6.0:
        notes.append(
            "In existing developed areas with streets narrower than 6.0 m, the building line is at 6.0 m "
            "from the centre line of the street (Rule 56(1)(b))."
        )
    return Fact(
        key="front_open_space", label="Front open space", label_hi="सामने खुला स्थान (फ्रंट एमओएस)",
        value=metres, unit="m", display=_m(metres), rule="56", sub_rule="(1)(a)", page=77,
        row_label=label, source=snippet, notes=notes,
    )


# ---------------------------------------------------------------------------
# Rule 56(2)(a): rear open space, residential buildings up to 12.5 m
# ---------------------------------------------------------------------------
REAR_ROWS = [
    (None, 40.0, 0.0, "Up to 40.00 sq m", "Up to 40.00 Nil"),
    (40.0, 150.0, 1.5, "Above 40.00 and up to 150.00 sq m", "Above 40.00 and up to 150.00 1.50"),
    (150.0, 225.0, 2.5, "Above 150 and up to 225.00 sq m", "Above 150 and up to 225.00 2.50"),
    (225.0, None, 3.0, "Above 225.00 sq m", "Above 225.00 3.00"),
]


def rear_open_space(plot_area_sqm: float, height_m: float | None = None) -> Fact:
    a = _positive("plot_area_sqm", plot_area_sqm)
    if height_m is not None and _positive("height_m", height_m) > RESIDENTIAL_HEIGHT_LIMIT:
        return Fact(
            key="rear_open_space", label="Rear open space", label_hi="पीछे खुला स्थान",
            display="See Rule 42 (height above 12.5 m)", rule="56", sub_rule="(5)", page=78,
            status="not_applicable",
            source="For building of height above 12.5 meters the open spaces around building shall be as given in Table 4 and 5 of Rule 42",
        )
    gt, lte, metres, label, snippet = _pick(REAR_ROWS, a)
    notes = []
    if a in (40.0, 150.0, 225.0):
        notes.append(f"A plot of exactly {a:g} sq m falls in the row \"{label}\" (the limit is inclusive).")
    notes.append("The rear open space must run along the entire face of the rear wall (Rule 56(2)(b)).")
    return Fact(
        key="rear_open_space", label="Rear open space", label_hi="पीछे खुला स्थान (रियर एमओएस)",
        value=metres, unit="m", display="Nil" if metres == 0 else _m(metres),
        rule="56", sub_rule="(2)(a)", page=78, row_label=label, source=snippet, notes=notes,
    )


# ---------------------------------------------------------------------------
# Rule 53(1): building type by plot size and frontage
# ---------------------------------------------------------------------------
BUILDING_TYPES = {
    "detached": {"label": "Detached", "label_hi": "पृथक (डिटैच्ड)", "area": (225.0, None, False), "frontage": (12.0, None, False),
                 "source": "Detached building above 225 above 12"},
    "semi_detached": {"label": "Semi-detached", "label_hi": "अर्ध-पृथक (सेमी-डिटैच्ड)", "area": (125.0, 225.0, True), "frontage": (8.0, 12.0, True),
                      "source": "Semi-detached building 125-225 8 to 12"},
    "row": {"label": "Row type", "label_hi": "पंक्ति (रो-टाइप)", "area": (50.0, 225.0, True), "frontage": (4.5, 12.0, True),
            "source": "Row type building 50-225 4.5 to 12"},
}


def _in_range(x: float, lo: float, hi: float | None, lo_inclusive: bool) -> bool:
    ok_lo = x >= lo if lo_inclusive else x > lo
    return ok_lo and (hi is None or x <= hi)


def building_type_options(plot_area_sqm: float, frontage_m: float | None = None) -> Fact:
    a = _positive("plot_area_sqm", plot_area_sqm)
    f = _positive("frontage_m", frontage_m) if frontage_m is not None else None
    allowed = []
    for key, t in BUILDING_TYPES.items():
        ok = _in_range(a, *t["area"])
        if f is not None:
            ok = ok and _in_range(f, *t["frontage"])
        if ok:
            allowed.append(key)
    labels = [BUILDING_TYPES[k]["label"] for k in allowed]
    notes = [
        "Rule 53(1) table: detached above 225 sq m and above 12 m frontage; semi-detached 125-225 sq m and 8-12 m; "
        "row type 50-225 sq m and 4.5-12 m."
    ]
    if not allowed:
        notes.append("No type in the Rule 53(1) table matches these inputs. For EWS/LIG plots see Appendix-J (Rule 53(1)(ii)).")
    return Fact(
        key="building_type", label="Building type allowed", label_hi="अनुमत भवन प्रकार",
        value=",".join(allowed), display=" or ".join(labels) if labels else "None in Rule 53(1) table",
        rule="53", sub_rule="(1)(i)", page=70, source="Detached building above 225 above 12",
        notes=notes, status="ok" if allowed else "info",
    )


# ---------------------------------------------------------------------------
# Rule 56(3): side open space
# ---------------------------------------------------------------------------


def side_open_space(building_type: str, height_m: float | None = None, frontage_m: float | None = None) -> Fact:
    bt = (building_type or "").lower().replace("-", "_").replace(" ", "_")
    bt = {"semi": "semi_detached", "semidetached": "semi_detached", "row_type": "row"}.get(bt, bt)
    h = _positive("height_m", height_m) if height_m is not None else None
    f = _positive("frontage_m", frontage_m) if frontage_m is not None else None
    if h is not None and h > RESIDENTIAL_HEIGHT_LIMIT:
        return Fact(
            key="side_open_space", label="Side open space", label_hi="बगल का खुला स्थान",
            display="See Rule 42 (height above 12.5 m)", rule="56", sub_rule="(5)", page=78, status="not_applicable",
            source="For building of height above 12.5 meters the open spaces around building shall be as given in Table 4 and 5 of Rule 42",
        )
    if bt == "detached":
        notes = ["Proviso: detached residential building up to 7 m high on a plot with frontage under 12 m may reduce one side to 1.5 m."]
        if h is not None and f is not None and h <= 7 and f < 12:
            return Fact(
                key="side_open_space", label="Side open space", label_hi="बगल का खुला स्थान",
                value=3.0, unit="m", display="3.0 m one side + 1.5 m other side",
                rule="56", sub_rule="(3)(i)", page=78, row_label="Detached, proviso (height ≤ 7 m, frontage < 12 m)",
                source="one of the sides open space may be reduced to 1.5 meters", notes=notes,
            )
        return Fact(
            key="side_open_space", label="Side open space", label_hi="बगल का खुला स्थान",
            value=3.0, unit="m", display="3.0 m on both sides", rule="56", sub_rule="(3)(i)", page=78,
            row_label="Detached", source="For detached buildings there shall be minimum side open spaces of 3 meters on both the sides",
            notes=notes if (h is None or f is None) else [],
        )
    if bt == "semi_detached":
        notes = ["Semi-detached up to 10 m high on a plot with frontage up to 10 m may reduce the side space to 2.5 m."]
        if h is not None and f is not None and h <= 10 and f <= 10:
            return Fact(
                key="side_open_space", label="Side open space", label_hi="बगल का खुला स्थान",
                value=2.5, unit="m", display="2.5 m on one side", rule="56", sub_rule="(3)(ii)", page=78,
                row_label="Semi-detached, height ≤ 10 m and frontage ≤ 10 m",
                source="the side open space may be reduced to 2.5 meters", notes=[],
            )
        return Fact(
            key="side_open_space", label="Side open space", label_hi="बगल का खुला स्थान",
            value=3.0, unit="m", display="3.0 m on one side", rule="56", sub_rule="(3)(ii)", page=78,
            row_label="Semi-detached", source="For semi-detached building there shall be a minimum side open space of 3.0 meters on one side",
            notes=notes if (h is None or f is None) else [],
        )
    if bt == "row":
        return Fact(
            key="side_open_space", label="Side open space", label_hi="बगल का खुला स्थान",
            value=0.0, unit="m", display="Not required", rule="56", sub_rule="(3)(iii)", page=78,
            row_label="Row type", source="For row-type buildings, no side open space is required",
        )
    raise InputError("building_type must be one of: detached, semi_detached, row")


# ---------------------------------------------------------------------------
# Rule 42 Tables 4 and 5: buildings above 12.5 m
# ---------------------------------------------------------------------------
TABLE4 = [  # road, plot, frontage, FAR, max height, front MOS, side/rear MOS, ground coverage
    dict(row=1, road=12.0, plot=1000, frontage=18, far=1.50, height=18, front=7.5, side=6.0, gc=None),
    dict(row=2, road=18.0, plot=1500, frontage=21, far=1.75, height=24, front=9.0, side=6.0, gc=None),
    dict(row=3, road=24.0, plot=2000, frontage=30, far=2.00, height=30, front=12.0, side=7.5, gc=None),
]
TABLE5 = [
    dict(row=1, road=30.0, plot=2500, frontage=30, far=2.25, height=45, front=15.0, side=7.5, gc=30),
    dict(row=2, road=36.0, plot=3000, frontage=40, far=2.50, height=60, front=18.0, side=9.0, gc=30),
    dict(row=3, road=45.0, plot=3500, frontage=45, far=2.75, height=75, front=21.0, side=9.0, gc=30),
    dict(row=4, road=60.0, plot=4000, frontage=50, far=3.00, height=90, front=24.0, side=10.0, gc=30),
    dict(row=5, road=75.0, plot=4500, frontage=60, far=3.00, height=None, front=30.0, side=12.0, gc=30),
]


def _qualifies(r, road, plot, frontage):
    return road >= r["road"] and plot >= r["plot"] and (frontage is None or frontage >= r["frontage"])


def high_building_norms(road_width_m: float, plot_area_sqm: float, frontage_m: float | None = None,
                        height_m: float | None = None) -> Fact:
    road = _positive("road_width_m", road_width_m)
    plot = _positive("plot_area_sqm", plot_area_sqm)
    front = _positive("frontage_m", frontage_m) if frontage_m is not None else None
    h = _positive("height_m", height_m) if height_m is not None else None
    rows = [("4", 59 - 1, r) for r in TABLE4] + [("5", 59, r) for r in TABLE5]

    if h is not None and h <= RESIDENTIAL_HEIGHT_LIMIT:
        return Fact(
            key="height_regime", label="Height regime", label_hi="ऊँचाई श्रेणी", display="Up to 12.5 m: Rule 56 open spaces apply",
            value=RESIDENTIAL_HEIGHT_LIMIT, unit="m", rule="56", sub_rule="(1)", page=77,
            source="Every Residential Building having height up to 12.5 meters", status="info",
        )

    qualifying = [(t, p, r) for t, p, r in rows if _qualifies(r, road, plot, front)]
    if h is not None:
        candidates = [(t, p, r) for t, p, r in qualifying if r["height"] is None or h <= r["height"]]
        if candidates:
            t, p, r = candidates[0]
            return _high_fact(t, p, r, f"Height {h:g} m is allowed under Table {t} row {r['row']}")
        # explain the nearest row that would cover this height
        need = next(((t, p, r) for t, p, r in rows if r["height"] is None or h <= r["height"]), None)
        t, p, r = need
        missing = []
        if road < r["road"]:
            missing.append(f"road width {r['road']:g} m (you have {road:g} m)")
        if plot < r["plot"]:
            missing.append(f"plot {r['plot']:g} sq m (you have {plot:g} sq m)")
        if front is not None and front < r["frontage"]:
            missing.append(f"frontage {r['frontage']:g} m (you have {front:g} m)")
        return Fact(
            key="height_regime", label="Height above 12.5 m", label_hi="12.5 मी. से अधिक ऊँचाई",
            display="Not eligible", status="not_eligible", rule="42", sub_rule=f" Table {t}", page=p,
            row_label=f"Table {t} row {r['row']}",
            source=_t_source(t, r),
            notes=[f"A {h:g} m building needs at least: " + "; ".join(missing) + "."],
        )
    if qualifying:
        t, p, r = qualifying[-1]
        return _high_fact(t, p, r, "Highest row this plot qualifies for")
    r = TABLE4[0]
    return Fact(
        key="max_height", label="Maximum height", label_hi="अधिकतम ऊँचाई", value=RESIDENTIAL_HEIGHT_LIMIT, unit="m",
        display="12.5 m (Rule 56 regime)", rule="42", sub_rule="(1) Table 4", page=58, row_label="Table 4 row 1 not met",
        source="12.0 m. 1000 sq. 18 m. 1:1.50",
        notes=[
            "Going above 12.5 m needs at least a 12 m road, a 1,000 sq m plot and 18 m frontage (Table 4 row 1). "
            "This plot does not meet that, so plan within 12.5 m and the Rule 56 open spaces."
        ],
    )


def _t_source(t, r):
    if t == "4":
        return {1: "12.0 m. 1000 sq. 18 m. 1:1.50", 2: "18 m. & 1500 sq. 21 m. 1:1.75", 3: "24 m. & 2000 sq. 30 m. 1:2.0"}[r["row"]]
    return {1: "30 m. 2500 30 m. 1:2.25", 2: "36 m. 3000 40 m. 1:2.50", 3: "45 m. 3500 45 m. 1:2.75",
            4: "60 m. 4000 50 m. 1:3.0", 5: "75 m. 4500 60 m. 1:3.0"}[r["row"]]


def _high_fact(t, p, r, why):
    height = "above 90 m" if r["height"] is None else f"up to {r['height']} m"
    gc = f", ground coverage {r['gc']}%" if r["gc"] else ""
    return Fact(
        key="height_regime", label="Height and open spaces (Rule 42)", label_hi="ऊँचाई व खुले स्थान (नियम 42)",
        value=r["height"], unit="m",
        display=f"Height {height}; front MOS {r['front']:g} m; sides/rear {r['side']:g} m; FAR 1:{r['far']:.2f}{gc}",
        rule="42", sub_rule=f"({'1' if t == '4' else '2'}) Table {t}", page=p, row_label=f"Table {t} row {r['row']}",
        source=_t_source(t, r), notes=[why, "Fire-fighting measures per NBC Part IV are required above 12.5 m (Rule 42(3))."],
    )


# ---------------------------------------------------------------------------
# Rule 61 Table 8: FAR
# ---------------------------------------------------------------------------
FAR_TABLE = {
    ("residential", None): (1.25, "Resdential 1.25"),
    ("commercial", "city_centre"): (2.50, "2.50 City Centre"),
    ("commercial", "sub_city_centre"): (2.00, "2.00 Sub-city center"),
    ("commercial", "community_centre"): (1.75, "1.75 Community Center"),
    ("commercial", "local_shopping_centre"): (1.50, "1.50 Local Shopping Centre"),
    ("commercial", "convenience_shopping_centre"): (1.25, "1.25 Convenience Shopping Centre"),
    ("public_semi_public", None): (1.00, "1.00 Administrative Areas"),
}


def far_limit(use: str = "residential", plot_area_sqm: float | None = None, commercial_category: str | None = None) -> Fact:
    use = (use or "residential").lower()
    if use in ("public", "semi_public", "institutional"):
        use = "public_semi_public"
    if use == "industrial":
        return Fact(
            key="far", label="FAR", label_hi="एफएआर (तल क्षेत्र अनुपात)", display="As per Rule 48", rule="61", sub_rule=" Table 8",
            page=83, status="info", source="as per rule 48", notes=["Industrial FAR is set in Rule 48 (Industrial Zones)."],
        )
    if use == "commercial":
        key = ("commercial", commercial_category or "local_shopping_centre")
        if key not in FAR_TABLE:
            raise InputError("commercial_category must be one of city_centre, sub_city_centre, community_centre, "
                             "local_shopping_centre, convenience_shopping_centre")
    elif use == "shop_cum_residence":
        key = ("residential", None)
    else:
        key = (use, None)
    if key not in FAR_TABLE:
        raise InputError("use must be residential, commercial, public_semi_public or industrial")
    far, snippet = FAR_TABLE[key]
    notes = [
        "Bhopal's Development Plan may set a different FAR and density; the Development Plan prevails (Rule 61 Table 8 footnote, Rule 103).",
        "Premium FAR of up to 25% of base FAR may be allowed at a rate decided by the State Government (Rule 61(7)).",
    ]
    display = f"{far:.2f}"
    value: float = far
    if plot_area_sqm is not None:
        a = _positive("plot_area_sqm", plot_area_sqm)
        built = round(far * a, 2)
        display = f"{far:.2f} → max {built:g} sq m total floor area"
        notes.insert(0, f"Max total built-up (all floors) = FAR {far:.2f} × plot {a:g} sq m = {built:g} sq m.")
    return Fact(
        key="far", label="FAR / max floor area", label_hi="एफएआर / अधिकतम निर्मित क्षेत्र", value=value, display=display,
        rule="61", sub_rule=" Table 8", page=83, row_label=" ".join(k for k in key if k).replace("_", " ").title(),
        source=snippet, notes=notes,
    )


# ---------------------------------------------------------------------------
# Rule 21: fees
# ---------------------------------------------------------------------------
FEE_SLABS = [  # (from, to, fee) as printed in Rule 21(3)(b) item 1
    (0, 75, 750), (76, 125, 1250), (126, 200, 2000), (201, 300, 3000), (301, 400, 4000),
    (401, 600, 6000), (601, 750, 7500), (751, 1000, 10000), (1001, 1250, 12500), (1251, 1500, 15000),
    (1501, 2000, 20000), (2001, 2500, 25000),
]
FEE_ABOVE_2500 = 50000
FEE_USES = {
    "residential": (1.0, "item 1", "exclusively as residence"),
    "commercial": (1.5, "item 2", "store house, factory or carrying on trade"),
    "factory_admin": (1.0, "item 3", "administrative block in a factory"),
    "shop_cum_residence": (1.5, "item 4", "cum residence purpose"),
    "social": (1.0, "item 6", "Social, Charitable, culture, Educational"),
}
HIGH_RISE_USES = {
    "residential": (1.0, "item 1"),
    "commercial": (2.0, "item 2"),
    "factory_admin": (1.0, "item 3"),
    "shop_cum_residence": (1.5, "item 4"),
    "social": (1.0, "item 5"),
}


def building_permission_fee(built_up_sqm: float, use: str = "residential", high_rise: bool = False,
                            seats: int | None = None) -> list[Fact]:
    """Permission fee (Rule 21(3)(b) or (c)) plus application fee (Rule 21(2)(ii))."""
    area = _positive("built_up_sqm", built_up_sqm)
    use = (use or "residential").lower()
    facts: list[Fact] = []
    notes: list[str] = []
    edge = False
    if use == "cinema":
        if seats is None:
            raise InputError("seats is required for cinema")
        fee = 15000 if seats <= 800 else 25000
        permission = Fact(
            key="permission_fee", label="Permission fee", label_hi="अनुज्ञा शुल्क", value=fee, unit="Rs", display=_rs(fee),
            rule="21", sub_rule="(3)(b)", page=36, row_label="Item 5, cinema, " + ("up to 800 seats" if seats <= 800 else "above 800 seats"),
            source="Upto 800 seating capacity Rs. 15,000.00 above 800 seating capacity Rs. 25,000.00",
        )
    elif high_rise:
        if use not in HIGH_RISE_USES:
            raise InputError("use must be residential, commercial, factory_admin, shop_cum_residence or social")
        mult, item = HIGH_RISE_USES[use]
        fee = round(10.0 * area * mult, 2)
        permission = Fact(
            key="permission_fee", label="Permission fee (high-rise)", label_hi="अनुज्ञा शुल्क (बहुमंजिला)", value=fee, unit="Rs",
            display=_rs(fee), rule="21", sub_rule="(3)(c)", page=37,
            row_label=f"{item}: Rs 10 per sq m × {area:g} sq m" + (f" × {mult:g}" if mult != 1 else ""),
            source="Rs. 10.00 per square meter of the",
        )
    else:
        if use not in FEE_USES:
            raise InputError("use must be residential, commercial, factory_admin, shop_cum_residence, social or cinema")
        mult, item, use_snippet = FEE_USES[use]
        base, label = None, ""
        prev_to = None
        for lo, hi, fee in FEE_SLABS:
            if area <= hi:
                if prev_to is not None and prev_to < area < lo:
                    edge = True
                    notes.append(
                        f"{area:g} sq m falls between printed slabs ({prev_to} and {lo}). Applied the higher slab; "
                        "please confirm with the officer."
                    )
                base, label = fee, f"{lo:,}–{hi:,} sq m"
                break
            prev_to = hi
        if base is None:
            base, label = FEE_ABOVE_2500, "above 2,500 sq m"
        fee = base * mult
        row_label = f"Item 1 slab {label}: {_rs(base)}"
        if mult != 1:
            row_label += f" + 50% ({item})"
        permission = Fact(
            key="permission_fee", label="Permission fee", label_hi="अनुज्ञा शुल्क", value=fee, unit="Rs", display=_rs(fee),
            rule="21", sub_rule="(3)(b)", page=36, row_label=row_label, source=use_snippet, notes=notes, edge_case=edge,
        )
        notes.append("The slab is chosen by proposed built-up area (all floors), not plot area.")
    facts.append(permission)
    app_fee = round(1.0 * area, 2)
    facts.append(Fact(
        key="application_fee", label="Application fee", label_hi="आवेदन शुल्क", value=app_fee, unit="Rs", display=_rs(app_fee),
        rule="21", sub_rule="(2)(ii)", page=35, row_label=f"Rs 1.00 × {area:g} sq m built-up",
        source="for the Building Permission Rs 1.00 per Square meter of the proposed built- up area",
        notes=["Application fee is not refunded in any case (Rule 21(2)(iii))."],
    ))
    total = permission.value + app_fee
    facts.append(Fact(
        key="total_fee", label="Total under these rules", label_hi="कुल शुल्क (इन नियमों के अनुसार)", value=total, unit="Rs",
        display=_rs(total), rule="21", sub_rule="", page=35, row_label="Permission fee + application fee", status="info",
        source="Application Fee: Application shall be accompanied by the fees",
        notes=["Other municipal charges (if any) are outside the Bhumi Vikas Rules."], edge_case=edge,
    ))
    return facts


DEV_FEE_RATES = {  # Rule 21(3)(a), Rs per hectare by planning-area population
    "residential": ((75000, 50000, 25000), "Residential or Public and,"),
    "commercial": ((150000, 125000, 100000), "Commercial 1,50,000 1,25,000 1,00,000"),
    "recreational_agriculture": ((30000, 20000, 10000), "Recreational or agriculture 30,000 20,000 10,000"),
}


def development_permission_fee(area_ha: float, landuse: str = "residential", population_lakh: float = 23.0) -> list[Fact]:
    """Bhopal planning area population is above 10 lakh (default 23 lakh)."""
    ha = _positive("area_ha", area_ha)
    pop = _positive("population_lakh", population_lakh)
    key = landuse.lower()
    if key in ("public", "semi_public", "industrial", "transportation", "public_semi_public"):
        key = "residential"  # same row in the table
    if key in ("recreational", "agriculture", "other"):
        key = "recreational_agriculture"
    if key not in DEV_FEE_RATES:
        raise InputError("landuse must be residential, commercial, public_semi_public, industrial, recreational or agriculture")
    rates, snippet = DEV_FEE_RATES[key]
    col = 0 if pop > 10 else (1 if pop >= 5 else 2)
    rate = rates[col]
    band = ["more than 10 lakh", "5 to 10 lakh", "less than 5 lakh"][col]
    fee = round(rate * ha, 2)
    app = 5000 * math.ceil(ha)
    return [
        Fact(key="dev_permission_fee", label="Development permission fee", label_hi="विकास अनुज्ञा शुल्क", value=fee, unit="Rs",
             display=_rs(fee), rule="21", sub_rule="(3)(a)", page=35, row_label=f"{_rs(rate)}/ha, population {band}",
             source=snippet, notes=["Rate is per hectare; the rules do not say how part-hectares are charged. Pro-rata shown, so confirm."],
             edge_case=ha != int(ha)),
        Fact(key="dev_application_fee", label="Application fee (development)", label_hi="आवेदन शुल्क (विकास)", value=app, unit="Rs",
             display=_rs(app), rule="21", sub_rule="(2)(i)", page=35, row_label=f"Rs 5,000 per hectare or part × {math.ceil(ha)}",
             source="for the Development Permission Rs. 5000 per hectare or part thereof"),
    ]


# ---------------------------------------------------------------------------
# Rule 52: distance from overhead electric lines
# ---------------------------------------------------------------------------
ELECTRIC = {
    "low_medium": (2.5, 1.2, "Low and medium voltage lines and service lines", "Low and Medium voltage 2.5 1.2"),
    "high_upto_33kv": (3.7, 1.2, "High voltage lines up to and including 33,000 volts", "High voltage lines up to and 3.7 1.2"),
}


def electric_clearance(line_type: str = "low_medium") -> Fact:
    lt = (line_type or "").lower()
    if lt in ("extra_high", "ehv", "above_33kv"):
        return Fact(
            key="electric_clearance", label="Clearance from electric line", label_hi="बिजली लाइन से दूरी", display="15 m corridor (7.5 m each side of centre line)",
            value=15.0, unit="m", rule="52", sub_rule="(1) Note", page=69, row_label="Extra high voltage beyond 33,000 volts",
            source="clear horizontal corridor of 15 meters (7.5 meter open both side of centre line)",
            notes=["Or as specified in the applicable Electricity Rules, whichever is more."],
        )
    if lt not in ELECTRIC:
        raise InputError("line_type must be low_medium, high_upto_33kv or extra_high")
    v, h, label, snippet = ELECTRIC[lt]
    return Fact(
        key="electric_clearance", label="Clearance from electric line", label_hi="बिजली लाइन से न्यूनतम दूरी", value=v, unit="m",
        display=f"{v:g} m vertically, {h:g} m horizontally", rule="52", sub_rule="(1)", page=69, row_label=label, source=snippet,
        notes=[
            "Or the distance in the applicable Electricity Rules, whichever is more. No verandah or balcony may violate this.",
            "Vertical clearance is measured from maximum sag, horizontal from maximum wind deflection (Rule 52(2)).",
        ],
    )


# ---------------------------------------------------------------------------
# Rule 23: duration of development permission
# ---------------------------------------------------------------------------


def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:  # 29 Feb
        return d.replace(year=d.year + years, day=28)


def permission_validity(grant_date: str, today: str | None = None) -> Fact:
    try:
        g = date.fromisoformat(grant_date)
        t = date.fromisoformat(today) if today else date.today()
    except (TypeError, ValueError) as exc:
        raise InputError("grant_date must be YYYY-MM-DD") from exc
    e1, e2, e3 = _add_years(g, 3), _add_years(g, 4), _add_years(g, 5)
    if t <= e1:
        status = f"Valid until {e1:%d-%m-%Y}."
    elif t <= e3:
        status = f"Initial 3 years ended {e1:%d-%m-%Y}; revalidation possible up to {e3:%d-%m-%Y}."
    else:
        status = f"The 5-year limit ended {e3:%d-%m-%Y}; a fresh proposal is needed."
    return Fact(
        key="validity", label="Permission validity", label_hi="अनुज्ञा की वैधता", value=e1.isoformat(),
        display=f"3 years (to {e1:%d-%m-%Y}) + 2 renewals of 1 year (to {e2:%d-%m-%Y}, {e3:%d-%m-%Y})",
        rule="23", sub_rule="(1)-(2)", page=41, row_label=status,
        source="Such revalidation may be permitted for two consecutive terms of one year each",
        notes=[
            status,
            "No fee if revalidation is applied for before expiry; after expiry the Rule 21(3)(a) fee applies. The 5-year limit is not relaxed.",
            "If execution begins within validity, the permission does not lapse later (Rule 23(3)).",
        ],
    )


# ---------------------------------------------------------------------------
# Rule 17 / 17-a: farm house and agricultural tourist facility
# ---------------------------------------------------------------------------


def farmhouse_norms(kind: str = "farm_house", plot_ha: float | None = None) -> Fact:
    if kind == "agri_tourism":
        min_ha, src, label = 1.00, "Minimum Size of the plot shall be 1.00 hectare", "Agricultural tourist facility (17-a)"
    else:
        min_ha, src, label = 0.40, "Minimum size of the plot shall be 0.40 hectare", "Farm house"
    notes = [
        f"Minimum plot {min_ha:.2f} ha; maximum FAR 0.10; height up to 7.5 m with sloping roof; "
        "access road at least 7.5 m wide; at least 7.5 m open space on all sides.",
    ]
    if kind != "agri_tourism":
        notes.append("At least 100 live trees per hectare before applying for building construction (Rule 17(d)).")
    status = "ok"
    if plot_ha is not None:
        ha = _positive("plot_ha", plot_ha)
        if ha < min_ha:
            status = "not_eligible"
            notes.insert(0, f"Plot of {ha:g} ha is below the minimum {min_ha:.2f} ha.")
        else:
            notes.insert(0, f"Plot of {ha:g} ha meets the minimum; max floor area = 0.10 × {ha * 10000:g} sq m = {ha * 1000:g} sq m.")
    return Fact(
        key="farmhouse", label=label, label_hi="फार्म हाउस", value=min_ha, unit="ha", display=f"Min plot {min_ha:.2f} ha · FAR 0.10",
        rule="17", sub_rule="-a" if kind == "agri_tourism" else "(a)-(f)", page=34, row_label=label, source=src, notes=notes,
        status=status,
    )


# ---------------------------------------------------------------------------
# Rule 2(5)(c) as amended on 28-08-2026 (not in the consolidated copy)
# ---------------------------------------------------------------------------


def development_permission_note(plot_area_sqm: float, conforms_to_dp: bool | None = None) -> Fact:
    plot = _positive("plot_area_sqm", plot_area_sqm)
    if plot > 500:
        return Fact(
            key="development_permission", label="Separate development permission", label_hi="अलग विकास अनुज्ञा",
            display="Needed (plot above 500 sq m)", rule="2", sub_rule="(5)", page=2, status="info",
            row_label="Plots above 500 sq m",
            notes=["The 28 Aug 2026 exemption covers plots up to 500 sq m only; Rule 2(5)(a) development permission applies."],
        )
    return Fact(
        key="development_permission", label="Separate development permission", label_hi="अलग विकास अनुज्ञा",
        display="Not needed if the plan conforms to the Development Plan land use" if conforms_to_dp is not False
        else "Needed (does not conform to Development Plan)",
        rule="2", sub_rule="(5)(c) as amended 28-08-2026", page=3, status="info",
        row_label="Plots up to 500 sq m", source="", notes=[
            "Amendment of 28 Aug 2026 (later than the 6 Mar 2025 consolidated copy): plots up to 500 sq m that conform to the "
            "approved Development Plan land use and norms need no separate development permission under Rule 2(5)(a). "
            "Building permission is still required.",
        ],
    )


def fee_overview() -> str:
    first, last = FEE_SLABS[0], FEE_SLABS[-1]
    return (f"Application fee Rs 1.00 per sq m of proposed built-up area (Rule 21(2)(ii)). Permission fee for a residential "
            f"building goes by built-up slab, from {_rs(first[2])} (up to {first[1]} sq m) to {_rs(last[2])} "
            f"({last[0]:,}-{last[1]:,} sq m) and {_rs(FEE_ABOVE_2500)} above 2,500 sq m (Rule 21(3)(b)); commercial adds 50%; "
            f"high-rise residential is Rs 10 per sq m (Rule 21(3)(c)).")


# ---------------------------------------------------------------------------
# Plot Check: everything for the common counter question
# ---------------------------------------------------------------------------
SQFT_PER_SQM = 10.7639


def plot_check(plot_area_sqm: float, street_width_m: float, frontage_m: float | None = None,
               height_m: float | None = None, use: str = "residential", building_type: str | None = None,
               built_up_sqm: float | None = None, commercial_category: str | None = None,
               conforms_to_dp: bool | None = None) -> dict:
    plot = _positive("plot_area_sqm", plot_area_sqm)
    road = _positive("street_width_m", street_width_m)
    facts: list[Fact] = []
    hints: list[str] = []
    tall = height_m is not None and float(height_m) > RESIDENTIAL_HEIGHT_LIMIT

    if use in ("residential", "shop_cum_residence"):
        facts.append(front_open_space(road, height_m))
        facts.append(rear_open_space(plot, height_m))
        types = building_type_options(plot, frontage_m)
        facts.append(types)
        allowed = types.value.split(",") if types.value else []
        bt = building_type or (allowed[0] if len(allowed) == 1 else None)
        if bt:
            if allowed and bt not in allowed:
                hints.append(
                    f"{BUILDING_TYPES[bt]['label']} is not in the Rule 53(1) range for this plot "
                    f"(allowed: {types.display})."
                )
            facts.append(side_open_space(bt, height_m, frontage_m))
        else:
            hints.append("Choose the building type to see side open space (Rule 56(3)).")
    else:
        hints.append("Open spaces for non-residential occupancies are in Rule 57; ask a question for details.")

    facts.append(high_building_norms(road, plot, frontage_m, height_m if tall else None))
    far = far_limit(use, plot, commercial_category)
    facts.append(far)

    if built_up_sqm is None and isinstance(far.value, float):
        built_up_sqm = round(far.value * plot, 2)
        hints.append(f"Fee shown for the maximum floor area ({built_up_sqm:g} sq m). Enter the proposed built-up area for an exact fee.")
    fee_use = use if use in FEE_USES else "residential"
    facts.extend(building_permission_fee(built_up_sqm, fee_use, high_rise=bool(height_m and float(height_m) > 30)))

    if plot <= 500:
        facts.append(development_permission_note(plot, conforms_to_dp))
    return {"facts": [f.to_dict() for f in facts], "hints": hints}

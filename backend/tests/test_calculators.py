import re

import pytest

from app import corpus
from app.calculators import core as c


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


RULE_TEXT = {r.rule: norm(r.text) for r in corpus.rules()}


def assert_source(fact):
    if not fact.source:
        return
    assert norm(fact.source) in RULE_TEXT[fact.rule], f"snippet not in rule {fact.rule}: {fact.source!r}"


# --- every snippet in every table exists verbatim in the rule text -------------------

ALL_SNIPPETS = (
    [("56", r[4]) for r in c.FRONT_ROWS]
    + [("56", r[4]) for r in c.REAR_ROWS]
    + [("53", t["source"]) for t in c.BUILDING_TYPES.values()]
    + [("61", s) for _, s in c.FAR_TABLE.values()]
    + [("21", s) for _, _, s in c.FEE_USES.values()]
    + [("21", s) for _, s in c.DEV_FEE_RATES.values()]
    + [("52", v[3]) for v in c.ELECTRIC.values()]
    + [("42", c._t_source("4", r)) for r in c.TABLE4]
    + [("42", c._t_source("5", r)) for r in c.TABLE5]
)


@pytest.mark.parametrize("rule,snippet", ALL_SNIPPETS)
def test_snippet_exists(rule, snippet):
    assert norm(snippet) in RULE_TEXT[rule]


def test_fee_slab_numbers_match_rule_text():
    text = RULE_TEXT["21"]
    for lo, hi, fee in c.FEE_SLABS:
        row = f"{lo:,} {hi:,} {fee:,}"
        assert row in text, row
    assert "above 2500 50,000" in text


# --- front open space (Rule 56(1)(a)) -------------------------------------------------

@pytest.mark.parametrize("width,expected", [
    (3, 3.0), (6, 3.0), (9.0, 3.0), (9.01, 3.6), (10, 3.6), (12, 3.6), (12.5, 4.5), (18, 4.5), (18.1, 6.0), (30, 6.0),
])
def test_front(width, expected):
    f = c.front_open_space(width, 9)
    assert f.value == expected
    assert (f.rule, f.sub_rule, f.page) == ("56", "(1)(a)", 77)
    assert_source(f)


def test_front_tall_building_redirects_to_rule_42():
    f = c.front_open_space(12, 15)
    assert f.status == "not_applicable" and f.sub_rule == "(5)"
    assert_source(f)


def test_front_narrow_street_note():
    assert any("56(1)(b)" in n for n in c.front_open_space(5).notes)


# --- rear open space (Rule 56(2)(a)) --------------------------------------------------

@pytest.mark.parametrize("area,expected", [
    (30, 0.0), (40, 0.0), (40.5, 1.5), (100, 1.5), (150, 1.5), (150.01, 2.5), (200, 2.5), (225, 2.5), (226, 3.0), (1000, 3.0),
])
def test_rear(area, expected):
    f = c.rear_open_space(area)
    assert f.value == expected
    assert f.page == 78
    assert_source(f)


# --- building type and side open space -----------------------------------------------

def test_building_types_200sqm():
    f = c.building_type_options(200, 10)
    assert set(f.value.split(",")) == {"semi_detached", "row"}


def test_building_types_detached():
    assert c.building_type_options(300, 15).value == "detached"


@pytest.mark.parametrize("bt,h,fr,display", [
    ("detached", 9, 15, "3.0 m on both sides"),
    ("detached", 7, 11, "3.0 m one side + 1.5 m other side"),
    ("semi_detached", 12, 11, "3.0 m on one side"),
    ("semi_detached", 10, 10, "2.5 m on one side"),
    ("row", 10, 6, "Not required"),
])
def test_side(bt, h, fr, display):
    f = c.side_open_space(bt, h, fr)
    assert f.display == display
    assert_source(f)


# --- Rule 42 ------------------------------------------------------------------------

def test_small_plot_not_eligible_for_tall():
    f = c.high_building_norms(9, 200, 10, 15)
    assert f.status == "not_eligible"
    assert "12 m" in f.notes[0] and "1000 sq m" in f.notes[0]


def test_table4_row1():
    f = c.high_building_norms(12, 1200, 20, 16)
    assert f.row_label == "Table 4 row 1" and "front MOS 7.5 m" in f.display


def test_table5_high_rise():
    f = c.high_building_norms(36, 3200, 45, 50)
    assert f.row_label == "Table 5 row 2"


def test_max_height_for_small_plot():
    f = c.high_building_norms(9, 200, 10)
    assert f.value == 12.5


# --- FAR ---------------------------------------------------------------------------

def test_far_residential():
    f = c.far_limit("residential", 200)
    assert f.value == 1.25 and "250 sq m" in f.display
    assert any("Rule 103" in n for n in f.notes)


def test_far_commercial():
    assert c.far_limit("commercial", 1000, "city_centre").value == 2.5


# --- fees (Rule 21) ------------------------------------------------------------------

@pytest.mark.parametrize("area,fee", [
    (50, 750), (75, 750), (76, 1250), (125, 1250), (200, 2000), (201, 3000), (250, 3000), (300, 3000),
    (1000, 10000), (2500, 25000), (2600, 50000),
])
def test_residential_fee(area, fee):
    facts = c.building_permission_fee(area)
    assert facts[0].value == fee
    assert facts[1].value == area  # application fee Rs 1/sq m
    assert facts[2].value == fee + area


def test_fee_slab_gap_is_flagged():
    facts = c.building_permission_fee(75.5)
    assert facts[0].value == 1250 and facts[0].edge_case


def test_commercial_fee_plus_50():
    assert c.building_permission_fee(250, "commercial")[0].value == 4500


def test_high_rise_fee():
    assert c.building_permission_fee(5000, "residential", high_rise=True)[0].value == 50000
    assert c.building_permission_fee(5000, "commercial", high_rise=True)[0].value == 100000


def test_cinema_fee():
    assert c.building_permission_fee(3000, "cinema", seats=900)[0].value == 25000


def test_dev_fee_bhopal():
    facts = c.development_permission_fee(2, "residential")
    assert facts[0].value == 150000 and facts[1].value == 10000
    assert c.development_permission_fee(1.2, "commercial")[1].value == 10000  # part hectare counts as one


def test_indian_grouping():
    assert c._rs(150000) == "Rs 1,50,000"
    assert c._rs(3250) == "Rs 3,250"


# --- electric, validity, farmhouse -----------------------------------------------

def test_electric():
    f = c.electric_clearance("low_medium")
    assert f.display == "2.5 m vertically, 1.2 m horizontally"
    assert c.electric_clearance("high_upto_33kv").value == 3.7


def test_validity():
    f = c.permission_validity("2023-05-10", today="2026-10-11")
    assert "10-05-2026" in f.display and "10-05-2028" in f.display
    assert "revalidation possible" in f.row_label


def test_farmhouse():
    assert c.farmhouse_norms("farm_house", 0.3).status == "not_eligible"
    assert c.farmhouse_norms("farm_house").value == 0.40
    assert_source(c.farmhouse_norms("agri_tourism"))


# --- the headline counter case ----------------------------------------------------

def test_plot_check_headline_case():
    out = c.plot_check(plot_area_sqm=200, street_width_m=9, frontage_m=10, height_m=10, building_type="semi_detached")
    facts = {f["key"]: f for f in out["facts"]}
    assert facts["front_open_space"]["value"] == 3.0
    assert facts["rear_open_space"]["value"] == 2.5
    assert facts["side_open_space"]["value"] == 2.5
    assert facts["far"]["value"] == 1.25
    assert facts["permission_fee"]["value"] == 3000
    assert facts["application_fee"]["value"] == 250
    assert facts["total_fee"]["value"] == 3250
    assert "development_permission" in facts


def test_bad_inputs():
    with pytest.raises(c.InputError):
        c.front_open_space(0)
    with pytest.raises(c.InputError):
        c.rear_open_space(-5)
    with pytest.raises(c.InputError):
        c.side_open_space("tower")


def test_every_fact_has_exact_quote_and_matching_page():
    facts = [
        c.front_open_space(10), c.rear_open_space(200), c.side_open_space("detached", 9, 15),
        c.side_open_space("detached", 7, 11), c.side_open_space("semi_detached", 10, 10), c.side_open_space("semi_detached", 12, 12),
        c.side_open_space("row"), c.building_type_options(200, 10), c.high_building_norms(9, 200, 10),
        c.high_building_norms(36, 3200, 45, 50), c.high_building_norms(12, 1200, 20, 16), c.far_limit("residential", 200),
        *c.building_permission_fee(250), *c.building_permission_fee(5000, high_rise=True), *c.building_permission_fee(250, "commercial"),
        *c.development_permission_fee(2), c.electric_clearance(), c.electric_clearance("high_upto_33kv"),
        c.electric_clearance("extra_high"), c.permission_validity("2023-01-01"), c.farmhouse_norms(), c.farmhouse_norms("agri_tourism"),
        c.front_open_space(12, 15),
    ]
    for f in facts:
        d = f.to_dict()
        assert d["quote"], f"no quote for {d['citation']} {f.source!r}"
        assert d["page"] == f.page, f"{d['citation']}: typed page {f.page}, text says {d['page']}"

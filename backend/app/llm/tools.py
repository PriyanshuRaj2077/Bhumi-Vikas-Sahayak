"""Calculator tools exposed to Claude. Schemas are strict; dispatch returns facts as JSON."""
from __future__ import annotations

import json

from ..calculators import core as c

NUM_OR_NULL = {"type": ["number", "null"]}


def _tool(name: str, description: str, props: dict) -> dict:
    return {
        "name": name,
        "description": description,
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": props,
            "required": list(props),
            "additionalProperties": False,
        },
    }


TOOLS = [
    _tool("front_open_space",
          "Minimum front open space for a residential building (Rule 56(1)(a)) from the width of the street the plot faces. "
          "Pass height_m if known; above 12.5 m the tool redirects to Rule 42.",
          {"street_width_m": {"type": "number", "description": "Width of the street facing the plot, metres"},
           "height_m": {**NUM_OR_NULL, "description": "Building height in metres, or null if not given"}}),
    _tool("rear_open_space",
          "Minimum rear open space for a residential building up to 12.5 m (Rule 56(2)(a)) from plot area.",
          {"plot_area_sqm": {"type": "number", "description": "Plot area in square metres"},
           "height_m": {**NUM_OR_NULL, "description": "Building height in metres, or null"}}),
    _tool("building_type_options",
          "Which building types (detached, semi-detached, row) Rule 53(1) allows for a plot area and frontage.",
          {"plot_area_sqm": {"type": "number"}, "frontage_m": {**NUM_OR_NULL, "description": "Plot frontage in metres, or null"}}),
    _tool("side_open_space",
          "Side open space for a residential building (Rule 56(3)) by building type, with the height/frontage provisos.",
          {"building_type": {"type": "string", "enum": ["detached", "semi_detached", "row"]},
           "height_m": NUM_OR_NULL, "frontage_m": NUM_OR_NULL}),
    _tool("high_building_norms",
          "Rule 42 Tables 4 and 5: whether a plot can have a building above 12.5 m, and the FAR, height and open spaces for it. "
          "With height_m null it returns the highest row the plot qualifies for (or that it must stay within 12.5 m).",
          {"road_width_m": {"type": "number"}, "plot_area_sqm": {"type": "number"},
           "frontage_m": NUM_OR_NULL, "height_m": NUM_OR_NULL}),
    _tool("far_limit",
          "Floor Area Ratio from Rule 61 Table 8 and the maximum total built-up area for a plot.",
          {"use": {"type": "string", "enum": ["residential", "commercial", "public_semi_public", "industrial", "shop_cum_residence"]},
           "plot_area_sqm": NUM_OR_NULL,
           "commercial_category": {"type": "string", "enum": ["not_commercial", "city_centre", "sub_city_centre", "community_centre",
                                                               "local_shopping_centre", "convenience_shopping_centre"]}}),
    _tool("building_permission_fee",
          "Building permission fee (Rule 21(3)(b) slabs, or 21(3)(c) for high-rise) plus application fee (Rule 21(2)(ii)). "
          "The slab depends on proposed built-up area of all floors, not plot area.",
          {"built_up_sqm": {"type": "number"},
           "use": {"type": "string", "enum": ["residential", "commercial", "factory_admin", "shop_cum_residence", "social", "cinema"]},
           "high_rise": {"type": "boolean", "description": "True for high-rise buildings (above 30 m or more than 10 storeys)"},
           "seats": {"type": ["integer", "null"], "description": "Seats, only for cinema"}}),
    _tool("development_permission_fee",
          "Development permission fee (Rule 21(3)(a)) and its application fee (Rule 21(2)(i)) by area in hectares. "
          "Bhopal's planning-area population is above 10 lakh.",
          {"area_ha": {"type": "number"},
           "landuse": {"type": "string", "enum": ["residential", "public_semi_public", "industrial", "commercial", "recreational", "agriculture"]}}),
    _tool("electric_clearance",
          "Minimum distance between a building (incl. balcony/verandah) and an overhead electric line (Rule 52).",
          {"line_type": {"type": "string", "enum": ["low_medium", "high_upto_33kv", "extra_high"]}}),
    _tool("permission_validity",
          "Validity and revalidation dates of a development permission (Rule 23) from the grant date.",
          {"grant_date": {"type": "string", "description": "YYYY-MM-DD; use 07-01 of the year if only a year is given"},
           "today": {"type": ["string", "null"], "description": "YYYY-MM-DD or null for today"}}),
    _tool("farmhouse_norms",
          "Norms for a farm house (Rule 17) or agricultural tourist facility (Rule 17-a), optionally checking a plot size.",
          {"kind": {"type": "string", "enum": ["farm_house", "agri_tourism"]}, "plot_ha": NUM_OR_NULL}),
]

_FUNCS = {
    "front_open_space": c.front_open_space,
    "rear_open_space": c.rear_open_space,
    "building_type_options": c.building_type_options,
    "side_open_space": c.side_open_space,
    "high_building_norms": c.high_building_norms,
    "far_limit": c.far_limit,
    "building_permission_fee": c.building_permission_fee,
    "development_permission_fee": c.development_permission_fee,
    "electric_clearance": c.electric_clearance,
    "permission_validity": c.permission_validity,
    "farmhouse_norms": c.farmhouse_norms,
}


def run_tool(name: str, args: dict) -> tuple[list[dict], str, bool]:
    """Returns (facts, json text for the tool_result, is_error)."""
    func = _FUNCS.get(name)
    if func is None:
        return [], json.dumps({"error": f"unknown tool {name}"}), True
    if not isinstance(args, dict):
        return [], json.dumps({"error": "input must be an object"}), True
    clean = {k: v for k, v in args.items() if v is not None and v != "not_commercial"}
    try:
        result = func(**clean)
    except (c.InputError, TypeError) as exc:
        return [], json.dumps({"error": str(exc)}), True
    facts = [f.to_dict() for f in (result if isinstance(result, list) else [result])]
    slim = [{k: f[k] for k in ("label", "display", "value", "unit", "citation", "page", "row_label", "notes", "status", "edge_case")}
            for f in facts]
    return facts, json.dumps(slim, ensure_ascii=False), False

"""Deterministic, unit-tested calculators for every number that comes from a rule table.

The language model never reads table numbers itself: it calls these functions as tools,
and the UI shows each result with the rule, sub-rule, PDF page and the table row used.
"""
from .core import (  # noqa: F401
    building_permission_fee,
    building_type_options,
    development_permission_fee,
    electric_clearance,
    far_limit,
    farmhouse_norms,
    front_open_space,
    high_building_norms,
    permission_validity,
    plot_check,
    rear_open_space,
    side_open_space,
)

"""The rules the card shares with the integration, on the cases of tests/shared/cases.json.

tests/js/shared-cases.test.mjs runs the same cases on the card.
"""

import json
from pathlib import Path

import pytest
from homeassistant.core import State

from custom_components.chauffage import engine, model
from custom_components.chauffage.runtime import thermostat

CASES = json.loads((Path(__file__).parents[1] / "shared" / "cases.json").read_text(encoding="utf-8"))


def cases(rule: str) -> list:
    return [pytest.param(case, id=case["name"]) for case in CASES[rule]["cases"]]


@pytest.mark.parametrize("case", cases("fit_temperature"))
def test_a_temperature_is_fitted_to_the_thermostat(case: dict):
    on = thermostat(State("climate.salon", "heat", case["attributes"]))
    assert engine.fit_temperature(case["value"], on) == case["expected"]


@pytest.mark.parametrize("case", cases("normalize_day"))
def test_a_day_is_stored_in_order(case: dict):
    assert model.normalize_day(case["slots"]) == case["expected"]

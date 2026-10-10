"""Tests of the Chauffage integration (custom_components/chauffage).

A separate suite from tests/ha/ (the package): run with `scripts/test.sh integration`.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Let Home Assistant load the integrations found in custom_components/."""
    return

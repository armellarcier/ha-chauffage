"""Supported Home Assistant versions (CONTRIBUTING.md, "Supported Home Assistant versions"): the
CI tests the minimum, one version per quarter since, and the latest release (the one these tests
run on in the main job, moved forward by Dependabot)."""

import json
from pathlib import Path

import yaml
from homeassistant.const import MAJOR_VERSION, MINOR_VERSION

ROOT = Path(__file__).parents[2]
QUARTERS = (1, 4, 7, 10)  # Home Assistant releases a minor version every month


def version(text: str) -> tuple[int, int]:
    major, minor = text.split(".")[:2]
    return int(major), int(minor)


def minimum() -> tuple[int, int]:
    return version(json.loads((ROOT / "hacs.json").read_text(encoding="utf-8"))["homeassistant"])


def tested_versions() -> list[tuple[int, int]]:
    """The fixed Home Assistant versions of the CI matrix (the latest one has no `ha`)."""
    workflow = yaml.safe_load((ROOT / ".github/workflows/tests.yml").read_text(encoding="utf-8"))
    entries = workflow["jobs"]["python"]["strategy"]["matrix"]["include"]
    return [version(entry["ha"]) for entry in entries if "ha" in entry]


def test_every_quarter_since_the_minimum_is_tested():
    # Each quarter older than this Home Assistant's own quarter has its job: when the latest
    # release enters a new quarter, the previous one is added to the matrix
    first, current = minimum(), (MAJOR_VERSION, MINOR_VERSION)
    current_quarter = (current[0], max(q for q in QUARTERS if q <= current[1]))
    expected = [
        (year, month)
        for year in range(first[0], current[0] + 1)
        for month in QUARTERS
        if first <= (year, month) < current_quarter
    ]
    missing = sorted(set(expected) - set(tested_versions()))
    assert not missing, f"add these Home Assistant versions to the CI matrix: {missing}"


def test_no_version_older_than_the_minimum_is_tested():
    assert min(tested_versions()) == minimum()

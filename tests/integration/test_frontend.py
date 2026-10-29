"""The card is served by the integration and loaded on every page."""

import json
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote

import pytest
from homeassistant.setup import async_setup_component

from conftest import Bench

MANIFEST = Path(__file__).parents[2] / "custom_components" / "chauffage" / "manifest.json"
VERSION = json.loads(MANIFEST.read_text(encoding="utf-8"))["version"]
CARD_URL = f"/chauffage_frontend/chauffage-programme-card.js?v={VERSION}"
LOADER = "data:text/javascript,"


async def test_the_card_is_served_and_added_to_every_page(bench: Bench, hass_client):
    bench.hass.config.components.add("frontend")  # the real frontend needs the built UI
    with patch("custom_components.chauffage.frontend.add_extra_js_url") as add_extra_js_url:
        await bench.setup()
    url = add_extra_js_url.call_args.args[1]
    assert url == CARD_URL

    client = await hass_client()
    response = await client.get(url)
    assert response.status == 200
    assert "customElements.define('chauffage-programme-card'" in await response.text()


# A page that Home Assistant serves while it starts, before Chauffage is set up, does not load
# the card (issue #59). The dashboards load their resources themselves: a resource loads the card
# once Chauffage serves it.

async def setup_lovelace(bench: Bench, config: dict | None = None):
    """Lovelace, as Home Assistant sets it up before Chauffage; returns its resources, not read
    from the storage yet."""
    bench.hass.config.components.add("frontend")
    assert await async_setup_component(bench.hass, "lovelace", {"lovelace": config or {}})
    data = bench.hass.data["lovelace"]
    # A dict up to Home Assistant 2025.1, a dataclass after
    return data["resources"] if isinstance(data, dict) else data.resources


async def setup_chauffage(bench: Bench):
    with patch("custom_components.chauffage.frontend.add_extra_js_url"):
        await bench.setup()


def loaders(resources) -> list[dict]:
    return [r for r in resources.async_items() if r["url"].startswith(LOADER)]


async def test_a_dashboard_opened_while_home_assistant_starts_loads_the_card(bench: Bench):
    resources = await setup_lovelace(bench)
    await setup_chauffage(bench)

    [loader] = loaders(resources)
    assert loader["type"] == "module"
    code = unquote(loader["url"].removeprefix(LOADER))
    assert CARD_URL in code
    # One statement per line, as in the file: a trailing comment or a missing semicolon in the
    # file cannot break the code once its lines are joined
    assert code.count("\n") > 5
    assert "//" not in code.replace("://", "")


async def test_the_card_loader_follows_the_new_version_without_duplicates(bench: Bench):
    resources = await setup_lovelace(bench)
    await resources.async_load()
    resources.loaded = True
    other = await resources.async_create_item({"res_type": "module", "url": "/local/other-card.js"})
    await resources.async_create_item(
        {"res_type": "module", "url": LOADER + "/chauffage_frontend/chauffage-programme-card.js?v=0.6.0"})
    await setup_chauffage(bench)

    [loader] = loaders(resources)
    assert CARD_URL in unquote(loader["url"])
    assert other in resources.async_items()


async def test_chauffage_starts_even_if_the_card_loader_cannot_be_saved(bench: Bench, caplog):
    resources = await setup_lovelace(bench)
    with patch.object(type(resources), "async_create_item", side_effect=OSError("disk full")):
        await setup_chauffage(bench)

    assert bench.hass.states.get(bench.schedule_entity) is not None
    assert "card loader" in caplog.text


async def test_dashboards_with_resources_in_yaml_get_no_card_loader(bench: Bench):
    resources = await setup_lovelace(bench, {"mode": "yaml"})
    await setup_chauffage(bench)

    assert loaders(resources) == []


async def test_removing_chauffage_removes_the_card_loader(bench: Bench):
    resources = await setup_lovelace(bench)
    await setup_chauffage(bench)

    await bench.hass.config_entries.async_remove(bench.entry.entry_id)
    await bench.hass.async_block_till_done()

    assert loaders(resources) == []

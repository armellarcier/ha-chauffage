"""The card is served by the integration and loaded on every page."""

import json
from pathlib import Path
from unittest.mock import patch

from conftest import Bench


async def test_the_card_is_served_and_added_to_every_page(bench: Bench, hass_client):
    bench.hass.config.components.add("frontend")  # the real frontend needs the built UI
    with patch("custom_components.chauffage.frontend.add_extra_js_url") as add_extra_js_url:
        await bench.setup()
    url = add_extra_js_url.call_args.args[1]
    manifest = Path(__file__).parents[2] / "custom_components" / "chauffage" / "manifest.json"
    version = json.loads(manifest.read_text(encoding="utf-8"))["version"]
    assert url == f"/chauffage_frontend/chauffage-programme-card.js?v={version}"

    client = await hass_client()
    response = await client.get(url)
    assert response.status == 200
    assert "customElements.define('chauffage-programme-card'" in await response.text()


async def test_the_chauffage_panel_is_registered_for_admins_with_its_own_icon(bench: Bench):
    """The panel holds the configuration (#57): admins only, as every change of the websocket API
    but activating a schedule. Its icon is the integration's own (`chauffage:logo`, drawn by the
    card), not one tied to a name that may change."""
    bench.hass.config.components.add("frontend")
    with patch("custom_components.chauffage.frontend.add_extra_js_url") as add_extra_js_url, \
            patch("custom_components.chauffage.frontend.async_register_built_in_panel") as register:
        await bench.setup()
    kwargs = register.call_args.kwargs
    assert kwargs["frontend_url_path"] == "chauffage"
    assert kwargs["require_admin"] is True
    assert kwargs["sidebar_icon"] == "chauffage:logo"
    assert kwargs["sidebar_title"] == "Chauffage"
    custom = kwargs["config"]["_panel_custom"]
    assert custom["name"] == "chauffage-panel"
    assert custom["module_url"] == add_extra_js_url.call_args.args[1]  # the card's module

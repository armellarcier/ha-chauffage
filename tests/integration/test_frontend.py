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

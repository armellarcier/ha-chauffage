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


async def setup_with_the_panel(bench: Bench, options: dict | None = None) -> None:
    bench.hass.config.components.add("frontend")
    with patch("custom_components.chauffage.frontend.add_extra_js_url"):
        await bench.setup(options)


def sidebar_entry(bench: Bench) -> tuple[str | None, str | None]:
    """The panel's title and icon in the sidebar: a panel without a title is not shown there."""
    panel = bench.hass.data["frontend_panels"]["chauffage"]
    return panel.sidebar_title, panel.sidebar_icon


async def test_the_panel_is_in_the_sidebar_by_default(bench: Bench):
    await setup_with_the_panel(bench)
    assert sidebar_entry(bench) == ("Chauffage", "chauffage:logo")


async def test_an_admin_can_take_the_panel_out_of_the_sidebar(bench: Bench):
    """The panel keeps its addresses, so the cards' links and the devices' *Visit* button still
    open it."""
    await setup_with_the_panel(bench, {"show_in_sidebar": False})
    assert sidebar_entry(bench) == (None, None)
    panel = bench.hass.data["frontend_panels"]["chauffage"]
    assert panel.require_admin is True
    assert panel.config["_panel_custom"]["name"] == "chauffage-panel"


async def test_the_sidebar_follows_the_option_without_a_restart(bench: Bench):
    await setup_with_the_panel(bench)
    options = bench.hass.config_entries.options
    for shown, expected in ((False, (None, None)), (True, ("Chauffage", "chauffage:logo"))):
        flow = await options.async_init(bench.entry.entry_id)
        await options.async_configure(flow["flow_id"], {"override_duration": 120, "use_presets": True,
                                                        "show_in_sidebar": shown})
        await bench.hass.async_block_till_done()
        assert sidebar_entry(bench) == expected

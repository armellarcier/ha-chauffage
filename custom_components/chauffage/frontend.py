"""Serves the card and loads it on every page (card registration + more-info block).

No Lovelace resource and no `extra_module_url` to configure: the integration registers its
`frontend/` folder and adds the card to the modules loaded by the frontend. The URL carries the
integration version, so browsers fetch the card again after an update.

The card lives in `frontend/` (the package release, until v0.2.0, copies it next to its loader).
"""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url, async_register_built_in_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN, TITLE

URL_BASE = "/chauffage_frontend"
CARD = "chauffage-programme-card.js"
FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_register(hass: HomeAssistant) -> None:
    if "frontend" not in hass.config.components:
        return  # no UI (tests, headless setups)
    integration = await async_get_integration(hass, DOMAIN)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(FRONTEND_DIR), cache_headers=False)]
    )
    url = f"{URL_BASE}/{CARD}?v={integration.version}"
    add_extra_js_url(hass, url)
    # The Chauffage panel, where an admin configures Chauffage: a page per thing, for example
    # /chauffage/thermostats/<climate>, the weeks of one thermostat (its device's "Visit" link).
    # Admins only, as every change of the websocket API but activating a schedule.
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=TITLE,
        sidebar_icon="chauffage:logo",  # defined by the card (window.customIcons)
        frontend_url_path=DOMAIN,
        config={"_panel_custom": {"name": "chauffage-panel", "module_url": url,
                                  "embed_iframe": False, "trust_external": False}},
        require_admin=True,
    )

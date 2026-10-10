"""Serves the card and loads it on every page (card registration + more-info block).

No Lovelace resource and no `extra_module_url` to configure: the integration registers its
`frontend/` folder and adds the card to the modules loaded by the frontend. The URL carries the
integration version, so browsers fetch the card again after an update.

The card lives in `frontend/` (the package release, until v0.2.0, copies it next to its loader).
"""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN

URL_BASE = "/chauffage_frontend"
CARD = "chauffage-programme-card.js"
FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_register(hass: HomeAssistant) -> None:
    if "frontend" not in hass.config.components or not (FRONTEND_DIR / CARD).is_file():
        return  # no UI (tests, headless setups)
    integration = await async_get_integration(hass, DOMAIN)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(FRONTEND_DIR), cache_headers=False)]
    )
    add_extra_js_url(hass, f"{URL_BASE}/{CARD}?v={integration.version}")

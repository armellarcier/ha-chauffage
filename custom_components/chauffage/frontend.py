"""Serves the card and loads it on every page (card registration + more-info block).

No Lovelace resource and no `extra_module_url` to configure: the integration registers its
`frontend/` folder and adds the card to the modules loaded by the frontend. The URL carries the
integration version, so browsers fetch the card again after an update. A dashboard resource of its
own loads the card on the pages served before Chauffage was set up.

The card lives in `frontend/` (the package release, until v0.2.0, copies it next to its loader).
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote, unquote

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN

URL_BASE = "/chauffage_frontend"
CARD = "chauffage-programme-card.js"
FRONTEND_DIR = Path(__file__).parent / "frontend"
LOADER_FILE = FRONTEND_DIR / "card-loader.js"
LOADER = "data:text/javascript,"


async def async_register(hass: HomeAssistant) -> None:
    if "frontend" not in hass.config.components:
        return  # no UI (tests, headless setups)
    integration = await async_get_integration(hass, DOMAIN)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(FRONTEND_DIR), cache_headers=False)]
    )
    card_url = f"{URL_BASE}/{CARD}?v={integration.version}"
    add_extra_js_url(hass, card_url)
    await _async_save_card_loader(hass, card_url)


async def _async_save_card_loader(hass: HomeAssistant, card_url: str) -> None:
    """Saves `frontend/card-loader.js` as a dashboard resource (issue #59).

    A page served while Home Assistant starts, before Chauffage is set up, does not load the card.
    The dashboards load their resources themselves, and the resources are saved: the loader loads
    the card once Chauffage serves it. Dashboards with resources in YAML get no loader.
    """
    if (resources := await _async_resources(hass)) is None:
        return
    code = await hass.async_add_executor_job(LOADER_FILE.read_text, "utf-8")
    # Without the comments: the URL is shown in the dashboard resources
    lines = [line.strip() for line in code.splitlines() if not line.strip().startswith("//")]
    url = LOADER + quote("".join(lines).replace("CARD_URL", card_url))
    if not (loaders := _loaders(resources)):
        await resources.async_create_item({"res_type": "module", "url": url})
    elif loaders[0]["url"] != url:
        await resources.async_update_item(loaders[0]["id"], {"res_type": "module", "url": url})


async def async_remove_card_loader(hass: HomeAssistant) -> None:
    """Removes the dashboard resource of the card loader, when Chauffage is removed."""
    if (resources := await _async_resources(hass)) is None:
        return
    for loader in _loaders(resources):
        await resources.async_delete_item(loader["id"])


async def _async_resources(hass: HomeAssistant) -> ResourceStorageCollection | None:
    """The dashboard resources, when the UI can change them (not in YAML)."""
    if (data := hass.data.get("lovelace")) is None:
        return None
    # A dict up to Home Assistant 2025.1, a dataclass after
    resources = data.get("resources") if isinstance(data, dict) else getattr(data, "resources", None)
    if not isinstance(resources, ResourceStorageCollection):
        return None
    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True
    return resources


def _loaders(resources: ResourceStorageCollection) -> list[dict]:
    return [r for r in resources.async_items()
            if r["url"].startswith(LOADER) and URL_BASE in unquote(r["url"])]

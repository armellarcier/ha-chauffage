"""The installation: the only owner of the stored data (storage/schema.py). It saves it, tells the
listeners (the entities, the cards) when it changed, and answers the queries on it."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from homeassistant.core import callback

from ..const import DATA
from ..store import SAVE_DELAY, ChauffageStore
from .schema import new_thermostat


def _key(name: str) -> property:
    """A top-level key of the stored data, read and written as an attribute."""

    def get(self: Installation) -> Any:
        return self._data[name]

    def set_(self: Installation, value: Any) -> None:
        self._data[name] = value

    return property(get, set_)


class Installation:
    """Each attribute below is a key of the stored data, described in storage/schema.py."""

    schedules = _key("schedules")
    active_schedule = _key("active_schedule")
    presets = _key("presets")
    thermostats = _key("thermostats")
    renamed = _key("renamed")
    overrides = _key("overrides")
    pending = _key("pending")
    revision = _key("revision")
    rules = _key("rules")
    default_schedule = _key("default_schedule")
    rules_choice = _key("rules_choice")

    def __init__(self, store: ChauffageStore, data: dict[str, Any]) -> None:
        self._store = store
        self._data = data
        self._listeners: set[Callable[[str], None]] = set()

    @property
    def stored(self) -> dict[str, Any]:
        """The stored data, for the diagnostics and the last save."""
        return self._data

    # ----- queries -----

    @property
    def schedule_ids(self) -> set[str]:
        return {schedule["id"] for schedule in self.schedules}

    def schedule_name(self, schedule_id: str) -> str | None:
        return next((schedule["name"] for schedule in self.schedules if schedule["id"] == schedule_id), None)

    @property
    def preset_ids(self) -> set[str]:
        return {preset["id"] for preset in self.presets}

    @property
    def presets_by_id(self) -> dict[str, dict[str, Any]]:
        """The presets by id, in their order."""
        return {preset["id"]: preset for preset in self.presets}

    @property
    def scheduled(self) -> dict[str, dict[str, Any]]:
        """The scheduled thermostats, those with weeks, paused ones included. `thermostats` also
        holds the thermostats with only values of the presets, set before their weeks."""
        return {entity_id: t for entity_id, t in self.thermostats.items() if t["weeks"]}

    @property
    def active(self) -> list[str]:
        """The scheduled thermostats Chauffage controls (not paused)."""
        return [entity_id for entity_id, t in self.scheduled.items() if not t["paused"]]

    def is_paused(self, entity_id: str) -> bool:
        return self.thermostats.get(entity_id, {}).get("paused", False)

    def own_hvac_mode_control(self, entity_id: str) -> bool | None:
        """A thermostat's own setting *Control the HVAC mode* (#159): None, it follows the house."""
        return self.thermostats.get(entity_id, {}).get("hvac_mode_control")

    def set_own_hvac_mode_control(self, entity_id: str, value: bool | None) -> None:
        """None: the thermostat follows the house again."""
        if value is None:
            self.thermostats[entity_id].pop("hvac_mode_control", None)
        else:
            self.thermostats[entity_id]["hvac_mode_control"] = value

    @property
    def weeks(self) -> dict[str, dict[str, Any]]:
        """{thermostat: {schedule id: week}}, the thermostats' own dictionaries."""
        return {entity_id: t["weeks"] for entity_id, t in self.scheduled.items()}

    @property
    def mappings(self) -> dict[str, dict[str, Any]]:
        return {entity_id: t["mapping"] for entity_id, t in self.thermostats.items() if t["mapping"]}

    # ----- changes -----

    def thermostat(self, entity_id: str) -> dict[str, Any]:
        """The thermostat's data, made for a thermostat the card brings: scheduled, active, once
        it has weeks."""
        return self.thermostats.setdefault(entity_id, new_thermostat())

    def weeks_changed(self, entity_ids: Iterable[str]) -> None:
        """New revisions for these thermostats: a copy of their weeks made before is outdated."""
        for entity_id in entity_ids:
            self.thermostats[entity_id]["revision"] += 1

    @callback
    def add_listener(self, listener: Callable[[str], None]) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    @callback
    def notify(self, reason: str = DATA) -> None:
        """Tells the listeners: DATA (something the cards show changed), TICK (every minute) or
        ENTITIES (the ids of the entities the cards open changed)."""
        for listener in list(self._listeners):
            listener(reason)

    @callback
    def save(self) -> None:
        """Saved, nothing the cards show changed."""
        self._store.async_delay_save(lambda: self._data, SAVE_DELAY)

    @callback
    def changed(self) -> None:
        self.save()
        self.notify(DATA)

    async def save_now(self) -> None:
        """A delayed save still pending, written now (the entry unloads)."""
        await self._store.async_save(self._data)

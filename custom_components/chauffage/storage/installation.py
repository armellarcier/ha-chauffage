"""The installation: the only owner of the stored data (model.py). It saves it, and tells the
listeners (the entities, the cards) when it changed."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.core import callback

from ..const import DATA
from ..store import SAVE_DELAY, ChauffageStore


def _key(name: str) -> property:
    """A top-level key of the stored data, read and written as an attribute."""

    def get(self: Installation) -> Any:
        return self._data[name]

    def set_(self: Installation, value: Any) -> None:
        self._data[name] = value

    return property(get, set_)


class Installation:
    """Each attribute below is a key of the stored data, described in model.py."""

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

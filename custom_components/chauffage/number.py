"""Number entity: *Override duration*, on the Chauffage device (#83). It holds no state of its
own: it reads and writes the integration's options, so that the options flow, the panel and the
entity always agree."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ChauffageConfigEntry
from .const import DOMAIN, OVERRIDE_DURATION_MAX, OVERRIDE_DURATION_MIN, OVERRIDE_DURATION_STEP
from .entity import ChauffageEntity, service_device


async def async_setup_entry(
    hass: HomeAssistant, entry: ChauffageConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([OverrideDurationNumber(entry.runtime_data)])


class OverrideDurationNumber(ChauffageEntity, NumberEntity):
    _attr_translation_key = "override_duration"
    _attr_entity_category = EntityCategory.CONFIG
    _attr_native_min_value = OVERRIDE_DURATION_MIN
    _attr_native_max_value = OVERRIDE_DURATION_MAX
    _attr_native_step = OVERRIDE_DURATION_STEP
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_mode = NumberMode.BOX

    def __init__(self, runtime) -> None:
        super().__init__(runtime)
        self._attr_unique_id = f"{runtime.entry.entry_id}_override_duration"
        # Same id whatever the language (automations refer to it)
        self.entity_id = f"number.{DOMAIN}_override_duration"
        self._attr_device_info = service_device(runtime)

    @property
    def native_value(self) -> int:
        return self.runtime.override_duration

    async def async_set_native_value(self, value: float) -> None:
        self.runtime.set_override_settings(override_duration=int(value))

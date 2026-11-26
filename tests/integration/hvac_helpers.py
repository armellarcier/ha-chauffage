"""Thermostats and helpers shared by the HVAC-mode tests (#91): the salon alone, an air
conditioner next to a heater, and an air conditioner that lists every HVAC mode."""

from conftest import CTX_USER, MANUAL_PRESET, WEEKDAY, Bench

from custom_components.chauffage import model
from custom_components.chauffage.domain.thermostat import Thermostat


OFF = {"hvac_mode": "off"}
COOL = {"hvac_mode": "cool"}
HEAT = {"hvac_mode": "heat"}
FAN = {"hvac_mode": "fan_only"}

# Comfort, then eco at 14:00, in cooling slots
ECO_IN_COOL = [["00:00", "comfort", COOL], ["14:00", "eco", COOL]]
SALON, BUREAU = "climate.salon", "climate.bureau"

# A reversible air conditioner that lists every HVAC mode
REVERSIBLE = ["off", "heat", "cool", "heat_cool", "dry", "auto", "fan_only"]
SINGLE, RANGE = 1, 1 | 2  # ClimateEntityFeature.TARGET_TEMPERATURE, and with TARGET_TEMPERATURE_RANGE

# An air conditioner that heats and cools
AC_MODES = ["off", "heat", "cool", "fan_only"]

# Comfort from 06:30, eco from 08:30, comfort from 17:30, off from 22:30 (an off slot has no preset)
NIGHT_OFF = [["00:00", None, OFF], ["06:30", "comfort"], ["08:30", "eco"], ["17:30", "comfort"], ["22:30", None, OFF]]

# The same day, in cooling slots
COOL_WEEKDAY = [[*slot, {"hvac_mode": "cool"}] for slot in WEEKDAY]
PRESETS = {p["id"]: p for p in model.default_presets("en")}
COOLING_ONLY = ["off", "cool", "fan_only"]
COOLING = {"preset": "comfort", "state": "cool", "hvac_modes": AC_MODES}


async def start_salon(bench: Bench, hhmm: str = "10:00", day: list | None = None, preset: str = "eco", **attributes) -> None:
    """The salon alone, a thermostat of the kind under test."""
    await bench.go_to(hhmm)
    bench.thermostat("climate.salon", preset, **attributes)
    await bench.setup()
    await bench.save_weeks({"climate.salon": {"normal": [day or WEEKDAY] * 7}})
    bench.applied()
    bench.powered()
    bench.temperature_calls.clear()


def clear(bench: Bench) -> None:
    """Forget the commands sent so far."""
    bench.applied()
    bench.powered()
    bench.settings()
    bench.temperature_calls.clear()
    bench.range_calls.clear()


async def start_ac(bench: Bench, hhmm: str = "10:00", day: list | None = None, state: str = "heat", preset: str = "eco",
                   options: dict | None = None, modes: list[str] | None = None, **attributes) -> None:
    """The salon is an air conditioner (off, heat, cool and fan only by default), the bureau a
    heater; both follow `day`."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, preset, state=state, **({"hvac_modes": modes or AC_MODES} | attributes))
    bench.thermostat(BUREAU, preset)
    await bench.setup(options)
    await bench.save_weeks({entity: {"normal": [day or WEEKDAY] * 7} for entity in (SALON, BUREAU)})
    clear(bench)


async def start_ac_with_range(bench: Bench, day: list, hhmm: str = "10:00", state: str = "heat", features: int = RANGE,
                              modes: list[str] | None = None, **attributes) -> None:
    """The salon is an air conditioner that lists every HVAC mode and takes a range, the bureau a
    heater; both follow `day`."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, "eco", state=state, hvac_modes=modes or REVERSIBLE, supported_features=features, **attributes)
    bench.thermostat(BUREAU, "eco")
    await bench.setup()
    await bench.save_weeks({entity: {"normal": [day] * 7} for entity in (SALON, BUREAU)})
    clear(bench)


async def start_ac_alone(bench: Bench, day: list, hhmm: str = "10:00", state: str = "heat", **attributes) -> None:
    """The salon alone, a reversible air conditioner that takes a range in heat/cool."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, "eco", state=state, hvac_modes=REVERSIBLE, supported_features=RANGE, **attributes)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [day] * 7}})
    clear(bench)


async def override(bench: Bench, entity_id: str = SALON, **data) -> None:
    await bench.hass.services.async_call("chauffage", "set_override", {"entity_id": entity_id, **data}, blocking=True)
    await bench.hass.async_block_till_done()


def by_hand(bench: Bench, state: str, temperature: float | None = None, features: int = RANGE, preset: str = "eco",
            **attributes) -> None:
    """The salon switched to `state` on the thermostat, on `preset` or on `temperature`."""
    if temperature is not None:
        preset = MANUAL_PRESET[bench.kind]
    bench.thermostat(SALON, preset, temperature, state=state, hvac_modes=REVERSIBLE, supported_features=features,
                     context=CTX_USER, **attributes)


def salon(bench: Bench) -> str:
    return bench.hass.states.get("climate.salon").state


def state(bench: Bench, entity_id: str = SALON) -> str:
    return bench.hass.states.get(entity_id).state


def sent_to(bench: Bench, entity_id: str = SALON) -> list[float]:
    return [temperature for entity, temperature in bench.temperature_calls if entity == entity_id]


def ac(state: str = "cool", modes: tuple = tuple(AC_MODES)) -> Thermostat:
    return Thermostat(state, "comfort", 20.0, ("eco", "comfort"), 16.0, 30.0, 0.5, hvac_modes=modes)


def unit(state: str = "heat", modes: list[str] | None = None, presets: tuple[str, ...] = (), **more) -> Thermostat:
    return Thermostat(state, None, 20.0, presets=presets, hvac_modes=tuple(modes or REVERSIBLE),
                             supports_range=True, **more)


def presets_without(preset_id: str, key: str) -> list[dict]:
    return [{**p, key: None} if p["id"] == preset_id else dict(p) for p in PRESETS.values()]

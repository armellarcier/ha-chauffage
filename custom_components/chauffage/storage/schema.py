"""Validates the data the card and the services send, and builds the domain objects from it.

The stored format is described in model.py. Nothing here imports Home Assistant.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from ..const import (
    AIR_KEYS,
    DEFAULT_PRESET_COLOR,
    DEFAULT_PRESET_TEMPERATURE,
    DURATION,
    NEXT_SLOT,
    NO_NEXT_SLOT,
    NO_PRESET_MODES,
    OFF,
    SLOT_HVAC_MODES,
)
from ..domain.override import Override
from ..domain.preset import Preset
from ..domain.slot import Day, Slot, Week
from ..domain.target import Target

OVERRIDE_ENDS = (DURATION, NEXT_SLOT, NO_NEXT_SLOT)  # why a change by hand ends then
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DEFAULT_DAY = [["00:00", "eco"]]
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

# How each attribute the card or a service sends is read. A slot's settings: everything but the
# setpoint, which its preset gives (its HVAC mode, the fan and the vanes, #91)
SETTING_KEYS = {"hvac_mode": str, **dict.fromkeys(AIR_KEYS, str)}
# A preset's value on a thermostat: "preset_mode" or "temperature" when the thermostat heats,
# "cool_temperature" when it cools (sent as the temperature in cool), the fan and the vanes
VALUE_KEYS = {"preset_mode": str, "temperature": float, "cool_temperature": float, **dict.fromkeys(AIR_KEYS, str)}
# The target of an override or of a command: it also sets the HVAC mode (a thermostat turned off
# by hand, chauffage.set_override), and holds what its preset means in each HVAC mode: its climate
# preset when cooling, its range in heat/cool
TARGET_KEYS = {**VALUE_KEYS, "cool_preset_mode": str, "target_temp_low": float, "target_temp_high": float,
               "hvac_mode": str}


class InvalidData(ValueError):
    """Data that does not follow the format of model.py."""


def slug(name: str) -> str:
    """Id from a name: "Vacances d'été" → "vacances_d_ete"."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_") or "schedule"


def unique_id(name: str, taken: set[str]) -> str:
    """An id from a name, not in `taken`: "Away" → "away", or "away_2" if taken."""
    base = new_id = slug(name)
    n = 2
    while new_id in taken:
        new_id = f"{base}_{n}"
        n += 1
    return new_id


def attributes(raw: Any, keys: dict[str, type], what: str) -> dict[str, Any]:
    """The known attributes (`keys`: how each one is read), read, in the order of `keys`."""
    if not isinstance(raw, dict):
        raise InvalidData(f"{what} must be a dictionary")
    unknown = set(raw) - set(keys)
    if unknown:
        raise InvalidData(f"unknown attributes in {what}: {sorted(unknown)}")
    out: dict[str, Any] = {}
    for key, read in keys.items():
        if key not in raw:
            continue
        try:
            value = read(raw[key])
        except (TypeError, ValueError) as err:
            raise InvalidData(f"invalid {key}") from err
        if read is str and not value:
            raise InvalidData(f"invalid {key}")
        out[key] = value
    return out


def target(raw: Any) -> Target:
    """A target of an override or a command: a partial state of the thermostat with at least one
    known attribute (TARGET_KEYS). No rule between the attributes: a change by hand may write a
    preset and a temperature at once, and the thermostat decides what to do with both
    (docs/decisions.md, "Presets")."""
    out = attributes(raw, TARGET_KEYS, "a target")
    if not out:
        raise InvalidData("a target needs a climate preset, a temperature or an HVAC mode")
    return Target(out)


def settings(raw: Any) -> dict[str, Any]:
    """A slot's settings (SETTING_KEYS), possibly empty. Its HVAC mode is one of
    SLOT_HVAC_MODES. An off slot sets nothing else: the fan and the vanes mean nothing while the
    thermostat is off."""
    out = attributes(raw, SETTING_KEYS, "the settings of a slot")
    mode = out.get("hvac_mode")
    if mode is not None and mode not in SLOT_HVAC_MODES:
        raise InvalidData(f"a slot's HVAC mode is one of {', '.join(SLOT_HVAC_MODES)}: {mode!r}")
    return {"hvac_mode": OFF} if mode == OFF else out


def value(raw: Any) -> dict[str, Any]:
    """A value of a preset on one thermostat, set by hand (VALUE_KEYS): one of its climate
    presets or a temperature, not both (when it heats), with an optional cooling setpoint (when
    it cools), fan and vanes. No HVAC mode: the slot chooses it."""
    out = attributes(raw, VALUE_KEYS, "the value of a preset")
    if not out:
        raise InvalidData("the value of a preset needs a climate preset or a temperature")
    if "preset_mode" in out and "temperature" in out:
        raise InvalidData("the value of a preset is a climate preset or a temperature, not both")
    return out


def mapping(raw: Any, preset_ids: set[str]) -> dict[str, dict[str, Any]]:
    """The mapping of one thermostat: {preset id: value} set by hand."""
    if not isinstance(raw, dict):
        raise InvalidData("a mapping must be a dictionary")
    out: dict[str, dict[str, Any]] = {}
    for preset_id, raw_value in raw.items():
        if preset_id not in preset_ids:
            raise InvalidData(f"unknown preset: {preset_id}")
        try:
            out[preset_id] = value(raw_value)
        except InvalidData as err:
            raise InvalidData(f"{preset_id}: {err}") from err
    return out


def preset(raw: Any, taken_ids: set[str]) -> Preset:
    """A preset; a new preset (no id) gets a unique id from its name."""
    if not isinstance(raw, dict):
        raise InvalidData("a preset must be a dictionary")
    name = str(raw.get("name", "")).strip()
    if not name:
        raise InvalidData("a preset needs a name")
    color = str(raw.get("color", DEFAULT_PRESET_COLOR))
    if not COLOR.match(color):
        raise InvalidData(f"invalid color: {color}")
    # Its default temperature when heating and when cooling: either can be empty, not both (#91)
    try:
        temperature = raw.get("temperature", DEFAULT_PRESET_TEMPERATURE)
        temperature = None if temperature is None else float(temperature)
        cool_temperature = None if raw.get("cool_temperature") is None else float(raw["cool_temperature"])
    except (TypeError, ValueError) as err:
        raise InvalidData("invalid temperature") from err
    if temperature is None and cool_temperature is None:
        raise InvalidData("a preset needs a temperature when heating or when cooling")
    # The color of its cooling slots, when the user chose one (else the card derives it, #91)
    cool_color = raw.get("cool_color")
    if cool_color is not None and not COLOR.match(str(cool_color)):
        raise InvalidData(f"invalid color: {cool_color}")
    return Preset(str(raw.get("id") or unique_id(name, taken_ids)), name, color.lower(), temperature,
                  cool_temperature, None if cool_color is None else str(cool_color).lower())


def day(raw: Any) -> Day:
    """Sorted slots, first one at 00:00, one slot per start time (same rules as the card). Two
    slots in a row that are the same stay two slots: the user cut them, and the second one
    changes nothing on the thermostat (engine.targets). A slot is [start, preset] or
    [start, preset, settings] (#91); empty settings are left out. An off, a fan-only, a dry and
    an auto slot have no preset (None). Invalid slots are dropped, invalid settings refused; an
    empty day is eco all day."""
    if not isinstance(raw, list):
        return Day.from_stored(DEFAULT_DAY)
    by_start: dict[str, Slot] = {}
    for slot in raw:
        if isinstance(slot, str):  # package format: "HH:MM preset"
            slot = slot.split()
        if not isinstance(slot, (list, tuple)) or len(slot) not in (2, 3):
            continue
        start = str(slot[0])
        slot_settings = settings(slot[2]) if len(slot) == 3 else {}
        if slot_settings.get("hvac_mode") in NO_PRESET_MODES:
            slot_preset = None  # the user does not choose one: nothing to send
        else:
            slot_preset = str(slot[1]).strip() if slot[1] is not None else ""
            if not slot_preset:
                continue
        if len(start) == 4:  # "6:30"
            start = "0" + start
        if HHMM.match(start):
            by_start[start] = Slot(slot_preset, slot_settings)  # the last one wins
    if not by_start:
        return Day.from_stored(DEFAULT_DAY)
    starts = sorted(by_start)
    return Day(tuple(("00:00" if i == 0 else start, by_start[start]) for i, start in enumerate(starts)))


def week(raw: Any) -> Week:
    if not isinstance(raw, list) or len(raw) != 7:
        raise InvalidData("a week must have 7 days")
    return Week(tuple(day(d) for d in raw))


def override(raw: Any) -> Override:
    if not isinstance(raw, dict):
        raise InvalidData("an override must be a dictionary")
    # An override sets no fan and no vanes: they stay as the thermostat has them (an override
    # that holds only what was changed would carry them, docs/decisions.md)
    override_target = target(raw.get("target")).without(AIR_KEYS)
    if override_target.get("hvac_mode") == OFF:
        override_target = Target({"hvac_mode": OFF})  # an off override sets nothing else: no setpoint is sent
    start, end = raw.get("start"), raw.get("end")
    if not isinstance(start, str) or not isinstance(end, str):
        raise InvalidData("start and end must be ISO datetimes")
    override_preset, ends_at = raw.get("preset"), raw.get("ends_at")
    return Override(override_target, start, end,
                    override_preset if isinstance(override_preset, str) and override_preset else None,
                    ends_at if ends_at in OVERRIDE_ENDS else None)

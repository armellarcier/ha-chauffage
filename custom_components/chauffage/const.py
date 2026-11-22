"""Constants of the Chauffage integration (vocabulary: docs/glossary.md)."""

from collections.abc import Mapping
from typing import Any

DOMAIN = "chauffage"
TITLE = "Chauffage"

# Options (options flow)
CONF_OVERRIDE_DURATION = "override_duration"
DEFAULT_OVERRIDE_DURATION = 120  # minutes
# When a change by hand ends (#83): after the override duration, at the next slot that changes the
# thermostat's target but at the latest after the duration, or at the next slot however far
CONF_MANUAL_OVERRIDE_END = "manual_override_end"
DURATION, NEXT_SLOT_WITHIN_DURATION, NEXT_SLOT = "duration", "next_slot_within_duration", "next_slot"
MANUAL_OVERRIDE_ENDS = (DURATION, NEXT_SLOT_WITHIN_DURATION, NEXT_SLOT)
DEFAULT_MANUAL_OVERRIDE_END = DURATION
# When an off override ends (#91): a thermostat turned off by hand. The same choices; by default
# until the next slot, however far: off for two hours is rarely what was meant
CONF_OFF_OVERRIDE_END = "off_override_end"
DEFAULT_OFF_OVERRIDE_END = NEXT_SLOT
# Why an override from a change by hand ends then, stored with it: DURATION, NEXT_SLOT, or no slot
# changes the target for a week (with NEXT_SLOT)
NO_NEXT_SLOT = "no_next_slot"
# A slot starting sooner after a change by hand does not end it: the change would last minutes
MIN_MANUAL_OVERRIDE = 15  # minutes
# With NEXT_SLOT and no slot changing the target, a change by hand ends after this time: every
# override keeps an end (docs/decisions.md)
MAX_MANUAL_OVERRIDE = 7 * 24 * 60  # minutes
# The override duration, as the options flow and the number entity accept it: any whole number of
# minutes in the range. The arrows of the panel move it by 15 minutes, a step that is not a rule.
OVERRIDE_DURATION_MIN, OVERRIDE_DURATION_MAX, OVERRIDE_DURATION_STEP = 15, 1440, 1  # minutes
CONF_USE_PRESETS = "use_presets"  # a preset uses the thermostat's climate preset with the same name
DEFAULT_USE_PRESETS = True
CONF_SHOW_IN_SIDEBAR = "show_in_sidebar"  # the Chauffage panel's entry in the sidebar
DEFAULT_SHOW_IN_SIDEBAR = True
CONF_SIDEBAR_TITLE = "sidebar_title"  # the panel's name in the sidebar (#104), TITLE when blank
SIDEBAR_TITLE_MAX = 40  # characters


def sidebar_title(options: Mapping[str, Any]) -> str:
    """The panel's name (#104): Chauffage, unless the admin chose another one."""
    return (options.get(CONF_SIDEBAR_TITLE) or "").strip() or TITLE

# What users who are not admins may change (#99): one access level for all of them, each including
# the one before. An admin can always do everything (docs/decisions.md, "Who may do what")
CONF_ACCESS_LEVEL = "access_level"
USE, PLAN, SET_UP = "use", "plan", "set_up"
ACCESS_LEVELS = (USE, PLAN, SET_UP)
DEFAULT_ACCESS_LEVEL = USE

# preset_mode values meaning "manual setpoint" (Versatile Thermostat: "none")
MANUAL_PRESETS = frozenset({"", "none", "manual", "manuel"})

# HVAC modes (#91)
OFF = "off"
FAN_ONLY = "fan_only"
DRY, AUTO, HEAT_COOL = "dry", "auto", "heat_cool"
# The HVAC modes of a slot without a preset: Chauffage sends them no setpoint
NO_PRESET_MODES = (OFF, FAN_ONLY, DRY, AUTO)
# The HVAC modes of a slot on a preset: the preset says how warm, for each of them
SETPOINT_MODES = ("heat", "cool", HEAT_COOL)
# The HVAC modes a slot may choose
SLOT_HVAC_MODES = (*SETPOINT_MODES, *NO_PRESET_MODES)
# The fan and the vanes of an air conditioner (#91)
AIR_KEYS = ("fan_mode", "swing_mode", "swing_horizontal_mode")

# Default presets: (id, color, default temperature when heating, when cooling). Their ids are
# Versatile Thermostat's preset names, so a thermostat with those climate presets uses them (see
# engine.value_on). Frost protection has no temperature when cooling: it never cools (#91).
DEFAULT_PRESETS = (
    ("comfort", "#f57c00", 20.0, 25.0),
    ("eco", "#43a047", 17.0, 27.0),
    # A darker red than its former #e53935: white text reads on it (5.0:1). Only for a new
    # installation too
    ("boost", "#d32f2f", 22.0, 23.0),
    # A blue grey: its former light blue (#29b6f6) looked like Home Assistant's cyan of fan only.
    # Only for a new installation: the stored presets keep their colors
    ("frost", "#78909c", 7.0, None),
)
PRESET_NAMES = {
    "en": {"comfort": "Comfort", "eco": "Eco", "boost": "Boost", "frost": "Frost protection"},
    "fr": {"comfort": "Confort", "eco": "Éco", "boost": "Boost", "frost": "Hors-gel"},
}
DEFAULT_PRESET_COLOR = "#9e9e9e"
DEFAULT_PRESET_TEMPERATURE = 19.0

# The schedule of a new installation, by language (names can be anything)
DEFAULT_SCHEDULES = {
    "en": ["Normal"],
    "fr": ["Normal"],
}

# The model of a scheduled thermostat's device, by language (Home Assistant does not translate
# device models)
SCHEDULED_THERMOSTAT_MODEL = {
    "en": "Scheduled thermostat",
    "fr": "Thermostat programmé",
}

# Events, for automations (their data: docs/automations.md, "Events")
EVENT_OVERRIDE_STARTED = f"{DOMAIN}_override_started"
EVENT_OVERRIDE_ENDED = f"{DOMAIN}_override_ended"
# An override that only got a new end: the logbook tells it; "started" stays for a new value
EVENT_OVERRIDE_END_CHANGED = f"{DOMAIN}_override_end_changed"
EVENT_SCHEDULE_ACTIVATED = f"{DOMAIN}_schedule_activated"

# The active-schedule select entity (same id whatever the language: automations refer to it)
SCHEDULE_ENTITY = "select.chauffage_schedule"

# The package (packages/chauffage/, v0.1): entities read by the import
PACKAGE_SCHEDULES = "sensor.programmes_chauffage"
PACKAGE_OVERRIDES = "sensor.derogations_chauffage"
PACKAGE_MODE = "input_select.mode_chauffage"
PACKAGE_AUTOMATIONS = ("chauffage_programmes_hebdo", "chauffage_derogation_manuelle")  # unique ids
PACKAGE_DATA_VERSION = 1  # newest package data version the import understands

# Keys of the entities of each scheduled thermostat, and their platforms. The planned preset
# sensor keeps its former key, "schedule": its unique id, so existing entity ids do not change
PLANNED_PRESET_KEY, OVERRIDE_KEY, OVERRIDE_END_KEY, CONTROL_KEY = "schedule", "override", "override_end", "control"
THERMOSTAT_ENTITIES = {
    PLANNED_PRESET_KEY: "sensor", OVERRIDE_KEY: "binary_sensor", OVERRIDE_END_KEY: "sensor", CONTROL_KEY: "switch",
}


def thermostat_unique_id(entry_id: str, climate: str, key: str) -> str:
    """The unique id of a scheduled thermostat's entity."""
    return f"{entry_id}_{climate}_{key}"


def schedule_unique_id(entry_id: str, schedule_id: str) -> str:
    """The unique id of a schedule's switch."""
    return f"{entry_id}_schedule_{schedule_id}"

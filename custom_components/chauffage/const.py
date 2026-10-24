"""Constants of the Chauffage integration (vocabulary: docs/glossary.md)."""

DOMAIN = "chauffage"
TITLE = "Chauffage"

# Options (options flow)
CONF_OVERRIDE_DURATION = "override_duration"
DEFAULT_OVERRIDE_DURATION = 120  # minutes
CONF_USE_PRESETS = "use_presets"  # a preset uses the thermostat's climate preset with the same name
DEFAULT_USE_PRESETS = True

# preset_mode values meaning "manual setpoint" (Versatile Thermostat: "none")
MANUAL_PRESETS = frozenset({"", "none", "manual", "manuel"})

# Default presets: (id, color, default temperature). Their ids are Versatile Thermostat's
# preset names, so a thermostat with those climate presets uses them (see engine.default_target).
DEFAULT_PRESETS = (
    ("comfort", "#f57c00", 20.0),
    ("eco", "#43a047", 17.0),
    ("boost", "#e53935", 21.0),
    ("frost", "#29b6f6", 7.0),
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

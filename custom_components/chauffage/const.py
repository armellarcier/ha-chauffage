"""Constants of the Chauffage integration."""

DOMAIN = "chauffage"
TITLE = "Chauffage"

# Options (options flow)
CONF_OVERRIDE_DURATION = "override_duration"
DEFAULT_OVERRIDE_DURATION = 120  # minutes

# preset_mode values meaning "manual setpoint" (Versatile Thermostat: "none")
MANUAL_PRESETS = frozenset({"", "none", "manual", "manuel"})

# Default heating levels: (id, color, default temperature). Their ids are Versatile Thermostat's
# preset names, so a thermostat with those presets uses them (see engine.default_target).
DEFAULT_LEVELS = (
    ("comfort", "#f57c00", 20.0),
    ("eco", "#43a047", 17.0),
    ("boost", "#e53935", 21.0),
    ("frost", "#29b6f6", 7.0),
)
LEVEL_NAMES = {
    "en": {"comfort": "Comfort", "eco": "Eco", "boost": "Boost", "frost": "Frost protection"},
    "fr": {"comfort": "Confort", "eco": "Éco", "boost": "Boost", "frost": "Hors-gel"},
}
DEFAULT_LEVEL_COLOR = "#9e9e9e"
DEFAULT_LEVEL_TEMPERATURE = 19.0

# Default modes of a new installation, by language (names can be anything)
DEFAULT_MODES = {
    "en": ["Normal", "Away", "Holiday"],
    "fr": ["Normal", "Absent", "Vacances"],
}

# The package (packages/chauffage/, v0.1): entities read by the import
PACKAGE_SCHEDULES = "sensor.programmes_chauffage"
PACKAGE_OVERRIDES = "sensor.derogations_chauffage"
PACKAGE_MODE = "input_select.mode_chauffage"
PACKAGE_AUTOMATIONS = ("chauffage_programmes_hebdo", "chauffage_derogation_manuelle")  # unique ids
PACKAGE_DATA_VERSION = 1  # newest package data version the import understands

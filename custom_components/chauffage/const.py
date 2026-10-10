"""Constants of the Chauffage integration."""

DOMAIN = "chauffage"
TITLE = "Chauffage"

# Options (options flow)
CONF_OVERRIDE_DURATION = "override_duration"
DEFAULT_OVERRIDE_DURATION = 120  # minutes

# preset_mode values meaning "manual setpoint" (Versatile Thermostat: "none")
MANUAL_PRESETS = frozenset({"", "none", "manual", "manuel"})

# Presets a schedule can apply (Versatile Thermostat); heating levels replace them in phase 2
PRESETS = ("comfort", "eco", "boost", "frost")

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

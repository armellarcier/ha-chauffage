"""The second review of "the slot chooses the HVAC mode first" (#91): a single temperature
refused in heat/cool from the card, a preset's temperature a heat/cool slot uses, the fan and
the vanes given back, and a device preset that would fight a setpoint."""

import pytest

from conftest import CTX_USER, KINDS, Bench

from custom_components.chauffage import engine, model

SALON = "climate.salon"
REVERSIBLE = ["off", "heat", "cool", "heat_cool", "dry", "auto", "fan_only"]
RANGE = 1 | 2  # ClimateEntityFeature.TARGET_TEMPERATURE and TARGET_TEMPERATURE_RANGE
PRESETS = {p["id"]: p for p in model.default_presets("en")}
FANS = {"fan_modes": ["auto", "1", "2", "3"], "fan_mode": "auto"}


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


async def start(bench: Bench, day: list, hhmm: str = "10:00", state: str = "heat", **attributes) -> None:
    """The salon is a reversible air conditioner that takes a range in heat/cool."""
    await bench.go_to(hhmm)
    bench.thermostat(SALON, "eco", state=state, hvac_modes=REVERSIBLE, supported_features=RANGE, **attributes)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [day] * 7}})
    clear(bench)


def clear(bench: Bench) -> None:
    bench.applied()
    bench.powered()
    bench.settings()
    bench.temperature_calls.clear()
    bench.range_calls.clear()


async def from_the_card(bench: Bench, client, override: dict | None) -> dict:
    await client.send_json_auto_id({"type": "chauffage/override/set", "entity_id": SALON, "override": override})
    reply = await client.receive_json()
    await bench.hass.async_block_till_done()
    return reply


def presets_without(preset_id: str, key: str) -> list[dict]:
    return [{**p, key: None} if p["id"] == preset_id else dict(p) for p in PRESETS.values()]


# ----- a single temperature in heat/cool, from the card -----

async def test_the_card_cannot_set_a_single_temperature_in_heat_cool(bench: Bench, ws_client):
    """A thermostat that takes a range in heat/cool refuses a single temperature. The service
    refuses such an override, and the websocket API recorded it: an override that did nothing."""
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    client = await ws_client(bench.hass)
    for target in ({"temperature": 22}, {"temperature": 22, "hvac_mode": "heat_cool"}):
        reply = await from_the_card(bench, client, bench.runtime.new_override(target))
        assert not reply["success"] and reply["error"]["code"] == "invalid_format"
    assert bench.overrides() == {} and bench.temperature_calls == []
    # In an HVAC mode that takes one setpoint, the temperature is sent
    reply = await from_the_card(bench, client, bench.runtime.new_override({"temperature": 22, "hvac_mode": "cool"}))
    assert reply["success"] and bench.temperature_calls == [(SALON, 22.0)]


async def test_the_card_changes_the_end_of_an_override_recorded_in_heat_cool(bench: Bench, ws_client):
    """An override recorded before the refusal, or set by hand on the device, keeps its value:
    the card may still change its end, and remove it."""
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]], state="heat_cool",
                target_temp_low=17.0, target_temp_high=27.0)
    override = bench.runtime.new_override({"temperature": 22.0})
    await bench.set_override(SALON, override)
    client = await ws_client(bench.hass)
    reply = await from_the_card(bench, client, {**override, "end": "2026-10-12T15:00:00+02:00"})
    assert reply["success"] and bench.overrides()[SALON]["end"] == "2026-10-12T15:00:00+02:00"


async def test_a_single_temperature_is_taken_in_heat_cool_without_a_range(bench: Bench, ws_client):
    """A thermostat that takes one setpoint in heat/cool, as a Daikin."""
    await bench.go_to("10:00")
    bench.thermostat(SALON, "eco", state="heat_cool", hvac_modes=REVERSIBLE)
    await bench.setup()
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"]]] * 7}})
    client = await ws_client(bench.hass)
    reply = await from_the_card(bench, client, bench.runtime.new_override({"temperature": 22}))
    assert reply["success"] and bench.overrides()[SALON]["target"] == {"temperature": 22.0}


# ----- a preset's temperature a heat/cool slot uses -----

@pytest.mark.parametrize("key", ["temperature", "cool_temperature"])
async def test_a_temperature_a_heat_cool_slot_uses_cannot_be_cleared_with_a_device_preset(bench: Bench, key: str):
    """The salon uses its own preset for Eco. A heat/cool slot needs two numbers: the heating
    and the cooling temperature of Eco. A device preset gives none, so neither can be cleared."""
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]])
    await bench.runtime.set_mapping(SALON, {"eco": {"preset_mode": "eco"}})
    with pytest.raises(model.InvalidData, match="eco"):
        await bench.runtime.set_presets(presets_without("eco", key))
    assert bench.runtime.presets_by_id["eco"][key] is not None


async def test_a_temperature_set_on_the_thermostat_serves_its_heat_cool_slots(bench: Bench):
    """The salon has its own cooling temperature for Eco: Eco's default when cooling is not
    used by its heat/cool slots."""
    await start(bench, [["00:00", "eco", {"hvac_mode": "heat_cool"}]])
    await bench.runtime.set_mapping(SALON, {"eco": {"cool_temperature": 26}})
    await bench.runtime.set_presets(presets_without("eco", "cool_temperature"))
    assert "cool_temperature" not in bench.runtime.presets_by_id["eco"]


# ----- two slots alike stay two slots -----

async def test_two_slots_alike_are_stored_as_two_and_the_second_one_sends_nothing(bench: Bench):
    """The user set a slot to the preset of the slot before it, and kept the cut. The week is
    stored as it was sent. The second slot changes nothing on the thermostat."""
    day = [["00:00", "eco"], ["14:00", "eco"], ["20:00", "comfort"]]
    await start(bench, day, "13:00")
    assert bench.runtime.weeks[SALON]["normal"][0] == day
    await bench.go_to("14:00")
    assert bench.applied() == {} and bench.powered() == {}
    # The next slot of the planned preset is the next different one
    assert bench.runtime.planned_info(SALON)["next_start"] == "2026-10-12T20:00:00+02:00"


# ----- the fan and the vanes are given back -----

FAN_DAY = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "3"}], ["16:00", "comfort"], ["20:00", "eco"]]


def fan(bench: Bench) -> dict:
    return {attr: value for (_, attr), value in bench.settings().items()}


async def test_a_slot_that_chooses_no_fan_gives_back_the_fan_the_thermostat_had(bench: Bench):
    """The afternoon slot blows hard. The evening slot chooses no fan: the air conditioner gets
    back the fan it had before the afternoon, not the afternoon's."""
    await start(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:00")
    assert fan(bench) == {"fan_mode": "3"}
    await bench.go_to("16:00")
    assert fan(bench) == {"fan_mode": "auto"}
    assert bench.hass.states.get(SALON).attributes["fan_mode"] == "auto"
    # Given back once: the fan is the user's again
    await bench.go_to("20:00")
    assert fan(bench) == {}


async def test_a_fan_set_by_hand_is_kept_by_the_slots_that_choose_none(bench: Bench):
    await start(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:00")
    current = bench.hass.states.get(SALON)
    bench.hass.states.async_set(SALON, current.state, {**current.attributes, "fan_mode": "1"}, context=CTX_USER)
    await bench.hass.async_block_till_done()
    clear(bench)
    await bench.go_to("16:00")
    assert fan(bench) == {} and bench.hass.states.get(SALON).attributes["fan_mode"] == "1"


async def test_an_override_that_chooses_no_fan_gives_back_the_fan_the_thermostat_had(bench: Bench):
    """An override from the card, during the slot that blows hard: it says no fan, so the fan
    goes back to what the thermostat had. At its end, the slot blows hard again."""
    await start(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:10")
    clear(bench)
    await bench.set_override(SALON, bench.runtime.new_override({"temperature": 23.0}, 30))
    assert fan(bench) == {"fan_mode": "auto"}
    await bench.advance(31)
    assert bench.overrides() == {} and fan(bench) == {"fan_mode": "3"}


async def test_an_off_slot_gives_no_fan_back(bench: Bench):
    """An off slot sends off, and nothing else. The next slot that chooses no fan gives the fan
    back."""
    day = [["00:00", "eco"], ["14:00", "comfort", {"fan_mode": "3"}], ["16:00", None, {"hvac_mode": "off"}], ["18:00", "eco"]]
    await start(bench, day, "13:00", **FANS)
    await bench.go_to("14:00")
    clear(bench)
    await bench.go_to("16:00")
    assert fan(bench) == {} and bench.powered() == {SALON: "off"}
    await bench.go_to("18:00")
    assert fan(bench) == {"fan_mode": "auto"}


async def test_a_fan_the_thermostat_no_longer_lists_is_not_given_back(bench: Bench):
    await start(bench, FAN_DAY, "13:00", **FANS)
    await bench.go_to("14:00")
    current = bench.hass.states.get(SALON)
    bench.hass.states.async_set(SALON, current.state, {**current.attributes, "fan_modes": ["1", "2", "3"]},
                                context=current.context)
    await bench.hass.async_block_till_done()
    clear(bench)
    await bench.go_to("16:00")
    assert fan(bench) == {}


def test_the_fan_given_back_never_replaces_the_one_a_target_chooses():
    own = {"fan_mode": "auto", "swing_mode": "off"}
    assert engine.restored({"temperature": 20.0, "fan_mode": "3"}, own) == {"temperature": 20.0, "fan_mode": "3", "swing_mode": "off"}
    assert engine.restored({"hvac_mode": "off"}, own) == {"hvac_mode": "off"}
    assert engine.restored(None, own) is None


# ----- a device preset that would fight a setpoint -----

DAIKIN_PRESETS = ["none", "away", "eco", "boost"]


def daikin(preset: str | None = "eco", **more) -> engine.Thermostat:
    return engine.Thermostat("heat", preset, 24.0, presets=tuple(DAIKIN_PRESETS), hvac_modes=tuple(REVERSIBLE), **more)


def test_a_thermostat_leaves_its_preset_before_a_setpoint():
    """A Daikin keeps its preset when it gets a setpoint: left on eco, it would go on saving
    energy against the temperature the slot asks for."""
    assert engine.preset_to_leave({"temperature": 21.0}, daikin()) == "none"
    assert engine.preset_to_leave({"target_temp_low": 20.0, "target_temp_high": 25.0}, daikin("boost")) == "none"


def test_a_thermostat_keeps_its_preset_without_a_setpoint_or_without_the_preset_none():
    assert engine.preset_to_leave({"preset_mode": "eco", "temperature": 21.0}, daikin("away")) is None
    assert engine.preset_to_leave({"fan_mode": "auto"}, daikin()) is None
    assert engine.preset_to_leave({"temperature": 21.0}, daikin("none")) is None
    assert engine.preset_to_leave({"temperature": 21.0}, daikin(None)) is None
    assert engine.preset_to_leave({"temperature": 21.0}, None) is None
    plain = engine.Thermostat("heat", "eco", 17.0, presets=("eco", "comfort"), hvac_modes=("off", "heat"))
    assert engine.preset_to_leave({"temperature": 21.0}, plain) is None
    # A Versatile Thermostat goes to its manual preset by itself when it gets a setpoint
    vtherm = engine.Thermostat("heat", "eco", 17.0, presets=("none", "eco"), hvac_modes=("off", "heat"), vtherm=True)
    assert engine.preset_to_leave({"temperature": 21.0}, vtherm) is None


async def test_a_slot_on_a_temperature_takes_a_daikin_off_its_preset(bench: Bench):
    """The preset is left first, then the setpoint is sent: a thermostat may give back an older
    setpoint when it leaves a preset."""
    bench.needs("standard")
    await bench.go_to("13:00")
    bench.thermostat(SALON, "eco", preset_modes=DAIKIN_PRESETS)
    await bench.setup()
    await bench.runtime.set_mapping(SALON, {"comfort": {"temperature": 21}})
    await bench.save_weeks({SALON: {"normal": [[["00:00", "eco"], ["14:00", "comfort"]]] * 7}})
    bench.thermostat(SALON, "eco", preset_modes=DAIKIN_PRESETS)
    await bench.hass.async_block_till_done()
    clear(bench)
    await bench.go_to("14:00")
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")]
    assert bench.overrides() == {}
    await bench.advance(3)
    assert bench.calls == [(SALON, "none"), (SALON, "21.0")] and bench.runtime.pending(SALON) == []

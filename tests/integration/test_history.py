"""History of the measured temperature for the card (`chauffage/history`): only the measured and
target temperatures, read from the recorder, the days already read kept in memory."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from homeassistant.components.recorder import history as recorder_history
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

from conftest import KINDS, MONDAY, Bench


@pytest.fixture
def mock_recorder_before_hass(async_test_recorder) -> None:
    """The recorder's database is prepared before Home Assistant starts (`recorder_mock`)."""


@pytest.fixture(params=KINDS)
def thermostat_kind(request) -> str:
    return request.param


def ts(hhmm: str, day: int = 0) -> float:
    h, m = (int(x) for x in hhmm.split(":"))
    return (MONDAY + timedelta(days=day, hours=h, minutes=m)).timestamp()


async def record(bench: Bench, hhmm: str, current: float | None, day: int = 0, preset: str = "eco",
                 state: str = "heat", **attributes) -> None:
    """The thermostat reports a measured temperature at a time (and any other attribute)."""
    await bench.go_to(hhmm, day)
    if state == "unavailable":
        bench.hass.states.async_set("climate.salon", "unavailable", {})
    else:
        bench.thermostat("climate.salon", preset, state=state, current_temperature=current, **attributes)
    await bench.hass.async_block_till_done()


async def history(bench: Bench, ws_client, start: float, admin: bool = True) -> dict:
    await async_wait_recording_done(bench.hass)
    client = await ws_client(bench.hass, admin=admin)
    await client.send_json_auto_id({
        "type": "chauffage/history",
        "entity_ids": ["climate.salon", "climate.bureau"],
        "start_time": dt_util.utc_from_timestamp(start).isoformat(),
    })
    return await client.receive_json()


async def test_the_card_gets_the_measured_and_target_temperatures_only(recorder_mock, bench: Bench, ws_client):
    await record(bench, "06:00", 17.5)
    await bench.setup()
    await record(bench, "06:30", 17.5, preset="comfort")
    await record(bench, "06:40", 18.0, preset="comfort")
    # Attributes changing without the temperatures (VTherm's power, heating or not…): not sent
    await record(bench, "06:45", 18.0, preset="comfort", power_percent=40)
    await record(bench, "06:50", 18.0, preset="comfort", power_percent=60)
    await record(bench, "06:55", 18.0, preset="comfort", hvac_action="idle")
    await bench.go_to("07:00")
    reply = await history(bench, ws_client, ts("06:00"))
    assert reply["success"]
    assert reply["result"] == {
        "climate.salon": [
            [ts("06:00"), 17.5, 17.0], [ts("06:30"), 17.5, 20.0], [ts("06:40"), 18.0, 20.0],
        ],
        "climate.bureau": [],
    }


async def test_the_state_at_the_start_of_the_period_comes_first(recorder_mock, bench: Bench, ws_client):
    await record(bench, "22:00", 18.5, day=-1)
    await bench.setup()
    await record(bench, "06:30", 19.0)
    await bench.go_to("07:00")
    reply = await history(bench, ws_client, ts("00:00"))
    assert reply["result"]["climate.salon"] == [[ts("00:00"), 18.5, 17.0], [ts("06:30"), 19.0, 17.0]]


async def test_an_unavailable_thermostat_is_a_gap(recorder_mock, bench: Bench, ws_client):
    await record(bench, "01:00", 18.0)
    await bench.setup()
    await record(bench, "02:00", None, state="unavailable")
    await record(bench, "03:00", 17.5)
    await bench.go_to("04:00")
    reply = await history(bench, ws_client, ts("01:00"))
    assert reply["result"]["climate.salon"] == [[ts("01:00"), 18.0, 17.0], [ts("02:00"), None, None], [ts("03:00"), 17.5, 17.0]]


async def test_what_was_already_read_is_not_read_again_from_the_recorder(recorder_mock, bench: Bench, ws_client):
    await record(bench, "06:00", 17.5)
    await bench.setup()
    await bench.go_to("12:00")
    reads = []
    original = recorder_history.get_significant_states

    def spy(hass, start_time, *args, **kwargs):
        reads.append(start_time)
        return original(hass, start_time, *args, **kwargs)

    with patch.object(recorder_history, "get_significant_states", spy):
        first = await history(bench, ws_client, ts("06:00"))
        await record(bench, "12:30", 18.0)
        await bench.go_to("13:00")
        second = await history(bench, ws_client, ts("06:00"))
    # The second call only reads the last minutes from the recorder, and still answers everything
    assert reads[0] <= dt_util.utc_from_timestamp(ts("06:00"))
    assert reads[1] >= dt_util.utc_from_timestamp(ts("11:00"))
    assert first["result"]["climate.salon"] == [[ts("06:00"), 17.5, 17.0]]
    assert second["result"]["climate.salon"] == [[ts("06:00"), 17.5, 17.0], [ts("12:30"), 18.0, 17.0]]


async def test_a_card_reading_only_the_last_minutes_keeps_the_week_in_memory(recorder_mock, bench: Bench, ws_client):
    """Every 5 minutes the card asks for the last minutes only: the next card opened (another page,
    another browser) still gets the whole week from memory."""
    await record(bench, "06:00", 17.5)
    await bench.setup()
    await bench.go_to("12:00")
    reads = []
    original = recorder_history.get_significant_states

    def spy(hass, start_time, *args, **kwargs):
        reads.append(start_time)
        return original(hass, start_time, *args, **kwargs)

    with patch.object(recorder_history, "get_significant_states", spy):
        await history(bench, ws_client, ts("06:00"))
        await bench.go_to("12:05")
        await history(bench, ws_client, ts("11:59"))
        await record(bench, "12:07", 18.0)
        await bench.go_to("12:10")
        week = await history(bench, ws_client, ts("06:00"))
    assert all(start >= dt_util.utc_from_timestamp(ts("11:00")) for start in reads[1:])
    assert week["result"]["climate.salon"] == [[ts("06:00"), 17.5, 17.0], [ts("12:07"), 18.0, 17.0]]


async def test_after_more_than_a_week_the_value_at_the_start_is_still_known(recorder_mock, bench: Bench, ws_client):
    """Rows older than 8 days are forgotten, but the value they give at the start of the week stays."""
    await record(bench, "06:00", 17.5)
    await bench.setup()
    await bench.go_to("07:00")
    await history(bench, ws_client, ts("06:00"))
    await record(bench, "10:00", 18.0, day=9)
    await bench.go_to("11:00", day=9)
    await history(bench, ws_client, ts("06:00"))  # the card already open asks for its week
    reply = await history(bench, ws_client, ts("00:00", day=3))
    assert reply["result"]["climate.salon"] == [[ts("00:00", day=3), 17.5, 17.0], [ts("10:00", day=9), 18.0, 17.0]]



async def test_any_user_can_read_the_history(recorder_mock, bench: Bench, ws_client):
    await record(bench, "06:00", 17.5)
    await bench.setup()
    await bench.go_to("07:00")
    reply = await history(bench, ws_client, ts("06:00"), admin=False)
    assert reply["success"]


async def test_without_the_recorder_the_card_is_told(bench: Bench, ws_client):
    bench.needs("vtherm")  # nothing about thermostats here
    await bench.go_to("07:00")
    await bench.setup()
    client = await ws_client(bench.hass)
    await client.send_json_auto_id({"type": "chauffage/history", "entity_ids": ["climate.salon"],
                                    "start_time": dt_util.utc_from_timestamp(ts("06:00")).isoformat()})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "no_recorder"

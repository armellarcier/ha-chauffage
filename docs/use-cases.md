# Use cases and the tests that prove them

The tests are the specification (see CONTRIBUTING.md, "Tests first"). This page lists what a
user can do or expect, and the test that proves it. A use case without a test is a bug waiting
to happen: add the test first. Vocabulary: [glossary.md](glossary.md).

Files: `I/` = `tests/integration/`, `C/` = `tests/js/` (card). Behavior tests marked **×3** run on
the three kinds of thermostats (Versatile Thermostat, standard presets, no presets).

## Installing and upgrading

| Use case | Test |
|---|---|
| Add the integration in one step; only one instance | `I/test_config_flow.py` |
| A new installation gets one schedule (*Normal*) and the default presets in HA's language | `I/test_schedule_list.py::a_new_installation_*`, `I/test_presets.py::a_new_installation_has_the_four_default_presets` |
| Upgrade from the package: weeks, overrides, active schedule imported; package automations turned off; repair until the package is removed | `I/test_import.py` |
| Package data newer than the integration, unreadable parts, added during HA startup | `I/test_import.py`, `I/test_edge_cases.py::a_package_too_new_*`, `::unreadable_package_parts_are_skipped` |
| Upgrade of the integration: stored data migrated (v1 → v2 → v3 → v4), nothing changes | `I/test_store.py`, `I/test_presets.py::storage_from_v0_2_is_migrated_without_changing_anything` |
| Upgrade from v0.3: `select.chauffage_mode` becomes `select.chauffage_schedule` (an entity id chosen by the user is kept) | `I/test_entities.py::the_select_of_an_older_version_*`, `::an_entity_id_chosen_by_the_user_is_kept` |
| Remove the integration: its data is deleted | `I/test_edge_cases.py::deleting_the_integration_deletes_its_data` |
| The card is served by the integration and loaded on every page | `I/test_frontend.py` |
| The card is found after a reload, even when it loads before HA's frontend (scoped registry) | `C/registration.test.mjs` |

## Schedules

| Use case | Test |
|---|---|
| Existing schedules are kept on upgrade | `I/test_schedule_list.py::an_existing_installation_keeps_its_schedules` |
| Create a schedule empty (eco, or the first preset, all week) or as a copy of another one; the card opens it | `I/test_schedule_list.py::duplicating_*`, `::an_empty_schedule_*`, `::creating_a_schedule_does_not_touch_the_thermostats`, `C/schedules.test.mjs` (the "+" menu) |
| Rename (stable id shown, active schedule kept), move, delete (with a confirmation; not the active one or the last one) | `I/test_schedule_list.py` (renaming, moving, deleting), `C/schedules.test.mjs` (the "⋮" menu) |
| Names required and unique; unknown ids refused; only admins manage schedules; unsaved weeks saved first | `I/test_schedule_list.py::a_name_must_be_set_and_not_taken`, `::unknown_ids_*`, `::only_admins_manage_schedules`, `C/schedules.test.mjs::unsaved edits *`, `::a name is needed *` |
| Activating a schedule (card, select, automation) realigns every thermostat | `I/test_schedules.py::activating_a_schedule_applies_its_weeks`, `C/card.test.mjs` (activating a schedule), `C/card-integration.test.mjs::activating a schedule sends its id` |
| An automation activates a schedule by its stable id, even once renamed; the select's `schedule_id` attribute | `I/test_schedule_list.py::an_automation_activates_a_schedule_by_its_id_*`, `::activating_an_unknown_schedule_says_so` |

## Activation rules

| Use case | Test |
|---|---|
| The first true rule activates its schedule; the default one when none is true; without a default, the active schedule stays | `I/test_rules.py::the_first_true_rule_*`, `::the_default_schedule_*`, `::without_a_default_*` |
| The schedule follows the entities of the rules (EDF Tempo color, #1) and the time (`now()`) | `I/test_rules.py::the_schedule_follows_the_entities_of_the_rules`, `::a_rule_on_the_time_*` |
| A template can give the schedule itself, by its id or its name; a text that names no schedule lets the next rule decide; a schedule only named in a template can be deleted | `I/test_rules.py::a_template_can_give_the_schedule_*`, `::a_template_giving_no_known_schedule_*`, `::a_schedule_named_only_inside_a_template_*`, `C/rules.test.mjs` (a template that gives the schedule) |
| Rules are tried as they are typed, as the integration reads them (true / false, the schedule named, the text, the error), again when their entities change; not saved; admins only; the try stops when leaving the view | `I/test_rules.py::rules_being_typed_*`, `::a_rule_being_typed_*`, `::only_admins_try_rules`, `C/rules.test.mjs` (trying the rules while typing them) |
| A template that fails counts as false, and is shown as an error | `I/test_rules.py::a_template_that_fails_counts_as_false`, `C/rules.test.mjs::a template that fails says so` |
| A schedule chosen by hand stays until the outcome of the rules changes, even after a restart; an outcome changed during a restart applies at start | `I/test_rules.py::a_schedule_chosen_by_hand_*`, `::rules_whose_outcome_changed_during_a_restart_*`, `C/rules.test.mjs::a schedule chosen by hand *` |
| Saving the rules applies them at once and keeps them; no rules: the schedule is only chosen by hand | `I/test_rules.py::saving_the_rules_*`, `::without_rules_*` |
| Invalid rules refused (not a template, empty, unknown schedule) with HA's message; only admins set them | `I/test_rules.py::invalid_rules_are_refused`, `::an_invalid_template_is_explained_to_the_card`, `::only_admins_set_the_rules`, `C/rules.test.mjs::a rule refused *`, `::users who are not admins *` |
| A schedule used by the rules cannot be deleted | `I/test_rules.py::a_schedule_used_by_the_rules_cannot_be_deleted`, `C/schedules.test.mjs::a schedule used by the activation rules *` |
| The *Rules* view: the rules in order, whether each one is true now, what they give; add, move, remove, default schedule, save, cancel; a template being typed survives an update (text, focus and caret, also once HA's ha-card renders asynchronously); link to try a template | `C/rules.test.mjs`, `I/test_rules.py::the_card_gets_the_rules_*` |
| Upgrade: no rules, the schedule stays chosen by hand (stored data v3 → v4) | `I/test_store.py::version_4_adds_activation_rules_*` |

## Weeks applied (scheduler) — ×3

| Use case | Test |
|---|---|
| A preset applied exactly at its slot start, nothing between slots | `I/test_schedules.py::the_preset_changes_exactly_at_the_slot_start`, `::between_two_slots_nothing_is_sent` |
| Weekdays / weekend; Sunday night → Monday morning | `I/test_schedules.py::the_day_of_the_week_is_respected`, `I/test_use_cases.py::sunday_to_monday` |
| A slot starting during a missed minute (HA busy) or in the hour skipped by summer time is applied late, not never | `I/test_use_cases.py::a_slot_starting_during_a_missed_minute_is_applied`, `::spring_forward_*` |
| The repeated hour of winter time changes nothing | `I/test_use_cases.py::fall_back_the_repeated_hour_changes_nothing` |
| Saving the weeks realigns; an already right thermostat gets nothing | `I/test_schedules.py::saving_the_weeks_realigns_every_thermostat`, `::a_preset_already_active_is_not_sent_again` |
| HA restart: thermostats realigned once HA has started; weeks and overrides kept | `I/test_edge_cases.py::thermostats_are_realigned_once_home_assistant_has_started`, `I/test_schedules.py::the_weeks_survive_a_restart`, `I/test_use_cases.py::overrides_survive_a_restart` |
| A thermostat turned off (summer) is left alone; turned back on, it gets its preset at once | `I/test_schedules.py::a_thermostat_turned_off_is_ignored`, `I/test_use_cases.py::a_thermostat_turned_back_on_*` |
| An unavailable valve catches up as soon as it is back online | `I/test_use_cases.py::a_thermostat_back_online_*` |
| An unreachable valve does not block the others; its command is retried every minute until delivered | `I/test_schedules.py::an_unreachable_thermostat_does_not_block_the_others`, `I/test_use_cases.py::a_failed_command_is_retried_the_next_minutes` |
| Commands are spaced out (Zigbee network) | `I/test_edge_cases.py::thermostats_are_sent_one_after_the_other` |
| A thermostat without a week in the active schedule is left alone | `I/test_schedules.py::a_thermostat_without_a_week_in_the_schedule_is_left_alone` |
| ZHA Enum presets | `I/test_schedules.py::an_enum_preset_is_compared_correctly`, `I/test_overrides.py::an_enum_preset_does_not_break_detection` |

## Overrides — ×3

| Use case | Test |
|---|---|
| A setpoint changed by hand, in HA or on the device itself, becomes a 2 h override (duration in the options) | `I/test_overrides.py::a_setpoint_changed_by_hand_*`, `::the_override_duration_is_an_option`, `I/test_use_cases.py::a_change_on_the_thermostat_itself_is_an_override` |
| A preset picked by a user is an override (thermostats with presets) | `I/test_overrides.py::a_preset_picked_by_a_user_creates_an_override` |
| Changes made by an automation, or by the integration itself (and the thermostat's answer), are not overrides | `I/test_overrides.py::a_change_made_by_an_automation_*`, `::a_change_made_by_the_integration_itself_*`, `::the_thermostat_answering_the_schedule_*` |
| VTherm safety mode in and out is not an override; a user's choice during it is | `I/test_overrides.py::safety_mode_*`, `::slot_changes_are_still_sent_during_safety_mode`, `::a_preset_picked_by_a_user_during_safety_mode_*` |
| Only scheduled thermostats are watched, added or removed without configuration | `I/test_overrides.py::a_thermostat_without_a_schedule_is_not_watched`, `::a_thermostat_added_*`, `I/test_use_cases.py::a_thermostat_removed_from_the_schedules_*` |
| During an override: slot changes and realignments leave it alone; a new manual change restarts it | `I/test_overrides.py::a_slot_change_does_not_overwrite_an_override`, `::a_forced_realignment_*`, `::a_new_manual_change_restarts_the_2_hours` |
| End of an override: the schedule resumes, without a new override; ended while HA was stopped | `I/test_overrides.py::when_the_override_ends_*`, `::resuming_the_schedule_*`, `I/test_use_cases.py::an_override_that_ended_while_home_assistant_was_stopped` |
| Extend, shorten (not before now + 15 min), remove an override from the card (drag, buttons, time field) or the more-info dialog | `I/test_overrides.py::extending_*`, `::removing_the_override_*`, `C/card.test.mjs` (overrides), `C/interactions.test.mjs` (dragging the end, popover), `C/more-info.test.mjs` |
| Services for automations: set (temperature / preset, duration / end), clear; errors | `I/test_api.py::set_override_*`, `I/test_edge_cases.py::set_override_*`, `::services_without_the_integration` |

## Presets

| Use case | Test |
|---|---|
| A preset is the thermostat's own preset with the same name, else the preset's temperature (fitted to the thermostat) | `I/test_engine.py` (presets → climate presets or temperatures) |
| Option "use the thermostats' presets" off: everything driven by temperature | `I/test_options.py::without_presets_*`, `C/interactions.test.mjs` (option off) |
| Per thermostat: automatic, one of its own presets, or its own temperature; back to automatic | `I/test_presets.py::a_mapping_set_by_hand_is_applied`, `C/card-integration.test.mjs` (Presets view) |
| Default temperature of a preset, followed by the thermostats left in automatic | `I/test_presets.py::the_preset_s_default_temperature_follows_its_changes`, `C/card-integration.test.mjs::a preset's default temperature` |
| Rename, recolor, add, remove a preset (a used one is replaced) | `I/test_presets.py`, `I/test_options.py::the_card_edits_the_presets`, `C/card-integration.test.mjs::renaming, adding and removing presets` |
| Temperatures of the thermostats' own presets shown: learned while active; read from VTherm attributes | `I/test_options.py::the_temperature_of_each_preset_is_learned_*`, `C/card-integration.test.mjs::Versatile Thermostat preset temperatures *` |
| Only admins change presets; others see them | `I/test_options.py::preset_and_mapping_changes_need_an_admin`, `C/card-integration.test.mjs::read only for non-admins` |

## Editing the weeks in the card

| Use case | Test |
|---|---|
| Show the weeks per schedule, one or several thermostats, selection kept for the next visit | `C/card.test.mjs` (configuration, choosing thermostats), `C/interactions.test.mjs` (thermostats shown) |
| Add a cut (double click), insert, delete, change a slot's preset, move times (drag or fields), close the editor | `C/card.test.mjs` (editing a day), `C/interactions.test.mjs` (slot editor buttons, double click, dragging, editing a slot) |
| Move a whole slot by dragging it (same length, within its neighbors; by touch, the selected slot only) | `C/interactions.test.mjs` (dragging a whole slot) |
| Copy / paste a day, fill weekdays / weekend / all / other thermostats, copy a week | `C/card.test.mjs` (copy / paste), `C/interactions.test.mjs` (row menu, copying a week) |
| Save, cancel; a save from an outdated copy is refused; edits in progress are not replaced by changes saved elsewhere | `C/card.test.mjs` (saving), `C/card-integration.test.mjs::a save refused *`, `C/interactions.test.mjs` (edits in progress), `I/test_api.py::saving_from_an_outdated_copy_is_refused` |
| Open a thermostat's more-info dialog from the card | `C/card.test.mjs` (thermostat more-info dialog) |
| Error messages (save, override, schedule, presets) | `C/interactions.test.mjs` (error messages) |
| English / French, 12 / 24 h, decimal separator, first day of the week | `C/i18n.test.mjs` |
| Card added but the integration is not set up: says so | `C/card-integration.test.mjs` (without the integration) |
| Updated from HACS, Home Assistant not restarted yet (the card is newer than the running integration): asks for a restart | `C/card-integration.test.mjs` (an integration older than the card) |
| See the temperature measured over the last 7 days over each day, with the setpoint applied and the range per slot; choice kept; then only what is new every 5 minutes; recorder unavailable: says so; HA not restarted after an update: HA's own history | `C/history.test.mjs` |
| Show a day larger (row menu, or the name of the day with one thermostat shown): its own scale in degrees, the time, measured temperature and setpoint under the mouse or along a finger, a tap still selects a slot; hidden with the history | `C/history.test.mjs` (a day shown larger) |
| An ended override is no longer shown, even before the integration removes it | `C/card.test.mjs::an override that has ended *` |

## More-info dialog of a thermostat

| Use case | Test |
|---|---|
| Schedule and override block injected in a scheduled thermostat's dialog only | `C/interactions.test.mjs` (the more-info dialog) |
| The active schedule's name, current and next slot, override, +30 min, drag its end, end time field, resume | `C/more-info.test.mjs`, `C/interactions.test.mjs` (dragging the end) |

## Entities and API

| Use case | Test |
|---|---|
| Active-schedule select (`select.chauffage_schedule`), schedule and override-end sensors (disabled by default, on the thermostat's device; attributes `preset_name`, `next_preset`…) | `I/test_entities.py` |
| History of the measured and target temperatures for the card: only these two, the state at the start first, gaps while unavailable, what was read kept in memory, any user, no recorder | `I/test_history.py` ×3 |
| Websocket API for the card: subscribe, save the weeks with a revision, overrides, schedules, presets, mappings; admins only for writes; errors | `I/test_api.py`, `I/test_options.py`, `I/test_schedule_list.py`, `I/test_edge_cases.py` |

## Not covered by automated tests

- Exact placement of the menus and popovers on screen (needs a real browser layout): checked on
  the development HA.
- Two copies of the card loaded at once (a copy left in `www/` by the v0.1 package, and the
  integration's): the second one does not register again (guarded), checked on the development HA.

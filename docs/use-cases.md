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
| Upgrade of the integration: stored data migrated (v1 → v2 → v3 → v4 → v5, each thermostat's data kept together, the ones with weeks active, one with only values of the presets kept and not scheduled; a scheduled thermostat gets the week of a new schedule in those it had none in), nothing changes | `I/test_store.py`, `I/test_presets.py::storage_from_v0_2_is_migrated_without_changing_anything` |
| Upgrade from v0.3: `select.chauffage_mode` becomes `select.chauffage_schedule` (an entity id chosen by the user is kept) | `I/test_entities.py::the_select_of_an_older_version_*`, `::an_entity_id_chosen_by_the_user_is_kept` |
| Remove the integration: its data is deleted | `I/test_edge_cases.py::deleting_the_integration_deletes_its_data` |
| Reloaded after Home Assistant has started (options, a thermostat renamed): no error logged | `I/test_edge_cases.py::reloading_after_home_assistant_has_started_logs_no_error` |
| The card is served by the integration and loaded on every page | `I/test_frontend.py` |
| The card is found after a reload, even when it loads before HA's frontend (scoped registry) | `C/registration.test.mjs` |
| Set up the card from the dashboard's visual editor, laid out like HA's own cards: thermostats added, replaced, removed, reordered; an optional name on each thermostat's page (HA's name field from 2025.11, text before), shown under its row when it changes the name; showing them all, time step; options written in YAML kept (`language`), defaults left out; resized in a sections view (#10) | `C/editor.test.mjs` |
| Add the card from HA's *Add card* dialog: live preview, every thermostat but only the first one shown (not the selection of this device), documentation link, name in HA's language; suggested for a thermostat (*By entity*); starts with the thermostats that have a schedule, or all of them | `C/card-picker.test.mjs` |

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
| The *Rules* view: the rules in order, whether each one is true now, what they give; add, move, remove, default schedule, save, cancel; Save only enabled while the rules differ from the saved ones (#16); a template being typed survives an update (text, focus and caret, also once HA's ha-card renders asynchronously); link to try a template | `C/rules.test.mjs`, `I/test_rules.py::the_card_gets_the_rules_*` |
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
| A scheduled thermostat has a week in every schedule: one the card sent no week in is eco all week (as a new schedule); saving some schedules keeps the others; deleting a schedule never unschedules a thermostat; a thermostat not scheduled has no planned preset | `I/test_thermostats.py::a_scheduled_thermostat_has_a_week_in_every_schedule`, `::saving_some_schedules_*`, `::deleting_a_schedule_*`, `I/test_schedules.py::a_schedule_the_card_sent_no_week_in_is_eco_all_week`, `I/test_edge_cases.py::a_thermostat_not_scheduled_has_no_planned_preset` |
| ZHA Enum presets | `I/test_schedules.py::an_enum_preset_is_compared_correctly`, `I/test_overrides.py::an_enum_preset_does_not_break_detection` |

## Scheduled thermostats: pausing, forgetting — ×3

| Use case | Test |
|---|---|
| Pause a scheduled thermostat (card, *Control* switch, automation): still scheduled, kept (weeks, values of the presets), not controlled, its changes by hand are not overrides, its override is dropped and the thermostat left as it is; still paused after a restart (#27); paused or forgotten during a realignment, it is sent nothing more | `I/test_pause.py::a_paused_thermostat_*`, `::a_thermostat_paused_during_a_realignment_*`, `I/test_thermostats.py::a_thermostat_forgotten_during_a_realignment_*`, `::a_change_by_hand_on_a_paused_thermostat_*`, `::pausing_drops_the_current_override`, `I/test_entities.py::turning_the_control_switch_off_*` |
| A thermostat a card does not send keeps its schedule: removed from a card, or shown by another one (#27) | `I/test_thermostats.py::a_thermostat_a_card_does_not_send_keeps_its_schedule` |
| Forget a thermostat (card): its weeks, values of the presets, learned temperatures, override, entities and former ids are dropped; a copy of the weeks made before cannot bring it back; admins only | `I/test_thermostats.py`, `I/test_entities.py::entities_follow_the_scheduled_thermostats`, `I/test_options.py::what_was_learned_on_a_forgotten_thermostat_*` |
| The card shows a paused thermostat: "Paused" on its chip, a notice with *Resume*, its rows dimmed without the current time; in the *Now* view, paused with *Resume* and no temporary setpoint, a controlled one with *Pause* (admins); the row menu is about the day only; its weeks stay editable; a pause or resume made elsewhere is shown at once; the more-info block says it is paused, with *Resume* (and why, if it is refused) | `C/paused.test.mjs` |
| The card's *Now* view (#39), first of the views: the active schedule; per thermostat of the card, the measured temperature, what it does (preset, setpoint), why and until when ("Normal · Eco until 17:30, then Comfort", "Temporary setpoint until 11:30, then Eco"), today with the current time and the override; its name opens the more-info dialog; a temporary setpoint, pause, resume from its line; then the scheduled thermostats not in this card: pause, resume, forget, after a confirmation (cancellable); read only for non-admins (a temporary setpoint still); the last of *Now* / *Schedule* kept for the next visit | `C/now-view.test.mjs` |
| The card editor says when a thermostat removed from the card is still scheduled (not one Chauffage does not schedule, not once added back), and where to pause or forget it; the configuration holds nothing hidden | `C/editor.test.mjs::a scheduled thermostat removed *`, `::the configuration holds *` |
| A repair proposes to forget a thermostat whose entity is gone (at start, or removed while running; not one only unavailable), or to keep it; it closes when an entity is made again with that id | `I/test_repairs.py::a_thermostat_whose_entity_is_gone_*`, `::an_entity_made_again_*`, `::an_entity_removed_while_running_*`, `::an_entity_without_state_*`, `::the_missing_repair_*`, `::a_forgotten_thermostat_s_repairs_*` |
| A thermostat renamed in Home Assistant keeps its schedule, override and pause; still controlled and watched; its entities keep their ids and settings (not those of a thermostat whose id starts the same; nor removed by a change made before the entry is reloaded); renamed twice, or back; renamed to the id of a thermostat whose entity is gone, it wins (the data and entities held there are dropped); survives a restart; not taken for an entity gone. A card still holding the former id sets it aside with a notice giving the new id (the notice alone if it is the only one), saves nothing under it; its editor offers the new id; an id given to another entity is that entity, never the renamed one, shown again; a copy of the weeks made before, or weeks under a former id, must be reloaded | `I/test_renames.py` ×3, `C/card-integration.test.mjs` (a thermostat renamed), `C/editor.test.mjs::a thermostat renamed *`, `::no notice for an id *` |
| Several cards editing the weeks: the card sends only the thermostats it changed, each against its revision (a thermostat added to the card is scheduled with its default week); two cards editing different thermostats do not get in each other's way; two copies of the same one cannot overwrite each other; a schedule created or deleted changes every thermostat's revision, a schedule renamed or moved none; a replaced preset only changes the revision of the thermostats that used it; a thermostat scheduled meanwhile by another card is not overwritten; an older integration gets every week and the global revision | `I/test_thermostats.py` (revisions), `C/card-integration.test.mjs` (writing to the integration) |
| Resume it: realigned at once, watched again | `I/test_pause.py::resuming_realigns_the_thermostat_at_once` |
| No override on a paused thermostat (card, service); its weeks can still be saved, which does not resume it; only a scheduled thermostat can be paused | `I/test_pause.py::no_override_*`, `::the_weeks_of_a_paused_thermostat_*`, `::only_a_scheduled_thermostat_*`, `::the_card_pauses_and_resumes_a_thermostat` |

## Overrides — ×3

| Use case | Test |
|---|---|
| A setpoint changed by hand, in HA or on the device itself, becomes a 2 h override (duration in the options) | `I/test_overrides.py::a_setpoint_changed_by_hand_*`, `::the_override_duration_is_an_option`, `I/test_use_cases.py::a_change_on_the_thermostat_itself_is_an_override` |
| A preset picked by a user is an override (thermostats with presets) | `I/test_overrides.py::a_preset_picked_by_a_user_creates_an_override` |
| Changes made by an automation, or by the integration itself (and the thermostat's answer), are not overrides | `I/test_overrides.py::a_change_made_by_an_automation_*`, `::a_change_made_by_the_integration_itself_*`, `::the_thermostat_answering_the_schedule_*` |
| VTherm safety mode in and out is not an override; a user's choice during it is | `I/test_overrides.py::safety_mode_*`, `::slot_changes_are_still_sent_during_safety_mode`, `::a_preset_picked_by_a_user_during_safety_mode_*` |
| Only scheduled thermostats are watched, added without configuration (put in a card), no longer watched once forgotten; one without weeks yet (values of the presets set first) is not scheduled (no switch, nothing to pause; nothing kept once they are cleared) and turns no change by hand into an override | `I/test_overrides.py::a_thermostat_without_a_schedule_is_not_watched`, `::a_thermostat_added_*`, `I/test_thermostats.py::a_forgotten_thermostat_*`, `::a_thermostat_without_weeks_*`, `::values_of_the_presets_set_before_*` |
| During an override: slot changes and realignments leave it alone; a new manual change restarts it | `I/test_overrides.py::a_slot_change_does_not_overwrite_an_override`, `::a_forced_realignment_*`, `::a_new_manual_change_restarts_the_2_hours` |
| Going back to what the slot gives ends the override (issue #19), only that thermostat's, and creates none: a preset picked by a user, or a setpoint changed by a user or on the device (knob), at the temperature of the slot's preset on this thermostat; a preset set by the thermostat itself does not; nor a thermostat coming back by itself to an override that holds the slot's value; an override set to the slot's preset lasts until its end, through later slots with the same preset and the thermostat reporting again | `I/test_overrides.py::going_back_to_the_scheduled_preset_*`, `::the_knob_turned_back_*`, `::the_thermostat_switching_back_*_by_itself_*`, `::a_thermostat_coming_back_by_itself_to_a_held_slot_value_*`, `::picking_the_scheduled_preset_by_hand_is_not_an_override`, `::a_slot_with_the_override_s_preset_does_not_end_it`, `I/test_engine.py::going_back_to_what_the_schedule_expects_resumes_it`, `::a_manual_setpoint_at_the_temperature_of_the_slot_s_preset_*`, `::an_override_already_at_what_the_slot_gives_is_kept`, `::the_temperature_of_a_thermostat_s_own_preset` |
| End of an override: the schedule resumes, without a new override; ended while HA was stopped | `I/test_overrides.py::when_the_override_ends_*`, `::resuming_the_schedule_*`, `I/test_use_cases.py::an_override_that_ended_while_home_assistant_was_stopped` |
| Change an override's value from the card or the thermostat's more-info dialog (a preset, or a temperature) until the same end: the thermostat follows, within its limits and step (error if it does not answer); changing only the end sends nothing | `I/test_overrides.py::changing_the_override_s_value_*`, `::changing_only_the_end_*`, `::an_override_changed_to_the_slot_s_preset_from_the_card_*`, `::an_override_s_temperature_is_fitted_to_the_thermostat`, `::the_override_of_a_change_by_hand_is_only_recorded`, `I/test_api.py::an_override_s_new_value_on_a_thermostat_that_does_not_answer`, `C/interactions.test.mjs` (the override popover, typing survives a redraw), `C/more-info.test.mjs` (a preset / a temperature picked in the block, typing survives a redraw, an ended override is not shown) |
| Set a temporary setpoint from the card (the thermostat's line in the *Now* view, "Temporary setpoint…") or the thermostat's more-info dialog, with no override yet: a preset or a temperature, for the override duration; what the thermostat goes back to at the end is shown ("then Eco (schedule)") | `I/test_api.py::an_override_created_from_the_card`, `C/now-view.test.mjs` (a temporary setpoint is set from the line), `C/interactions.test.mjs` (the override popover: what the thermostat goes back to), `C/more-info.test.mjs` (without an override, a preset or a temperature creates one; what the thermostat goes back to) |
| An override set to a preset (card, more-info dialog, service) shows that preset on every kind of thermostat, not its temperature; an override at a preset's temperature does not show that preset; a temperature or a change by hand replaces it; a preset deleted since is no longer highlighted; the service's preset is what that preset means on the thermostat (its mapping, its temperature), another value one of the thermostat's own presets (#23) | `I/test_overrides.py::an_override_set_to_a_preset_*`, `::an_override_set_to_a_temperature_has_no_preset`, `::a_change_by_hand_during_an_override_set_to_a_preset_*`, `::set_override_with_a_*`, `C/interactions.test.mjs` (an override set to a preset), `C/more-info.test.mjs` (an override set to a preset) |
| Extend, shorten (not before now + 15 min), remove an override from the card (drag, buttons, time field) or the more-info dialog | `I/test_overrides.py::extending_*`, `::removing_the_override_*`, `C/card.test.mjs` (overrides), `C/interactions.test.mjs` (dragging the end, popover), `C/more-info.test.mjs` |
| Services for automations: set (temperature / preset, duration / end), clear; errors; the value sent again to a thermostat that lost it, never what it already has | `I/test_api.py::set_override_*`, `I/test_edge_cases.py::set_override_*`, `::services_without_the_integration` |

## Presets

| Use case | Test |
|---|---|
| A preset is the thermostat's own preset with the same name, else the preset's temperature (fitted to the thermostat) | `I/test_engine.py` (presets → climate presets or temperatures) |
| Option "use the thermostats' presets" off: everything driven by temperature | `I/test_options.py::without_presets_*`, `C/interactions.test.mjs` (option off) |
| Per thermostat: automatic (the first choice of its own presets when it means one of them), one of its own presets, or its own temperature; back to automatic | `I/test_presets.py::a_mapping_set_by_hand_is_applied`, `C/card-integration.test.mjs` (Presets view) |
| Presets shown from the coldest to the warmest; a cell edited in a popover, closed by a click elsewhere or Escape | `C/card-integration.test.mjs::a table of what each thermostat does *`, `::a cell is edited in a popover *` |
| Default temperature of a preset, followed by the thermostats left in automatic | `I/test_presets.py::the_preset_s_default_temperature_follows_its_changes`, `C/card-integration.test.mjs::a preset's default temperature` |
| Rename, recolor, add, remove a preset (a used one is replaced) | `I/test_presets.py`, `I/test_options.py::the_card_edits_the_presets`, `C/card-integration.test.mjs::renaming, adding and removing presets` |
| Temperatures of the thermostats' own presets shown: learned while active; read from VTherm attributes; computed by the integration (the ones a manual setpoint is compared with), sent again when the thermostat publishes new ones (paused too); thermostats not scheduled yet included | `I/test_options.py::the_temperature_of_each_preset_is_learned_*`, `I/test_options.py::the_card_gets_the_temperatures_versatile_thermostat_publishes`, `I/test_options.py::a_preset_temperature_changed_on_the_thermostat_reaches_the_card`, `I/test_options.py::a_paused_thermostat_still_sends_*`, `I/test_options.py::the_card_gets_the_preset_temperatures_of_a_thermostat_not_scheduled_yet`, `C/card-integration.test.mjs::a preset's temperature on a thermostat is the one the integration *` |
| Only admins change presets; others see them | `I/test_options.py::preset_and_mapping_changes_need_an_admin`, `C/card-integration.test.mjs::read only for non-admins` |

## Editing the weeks in the card

| Use case | Test |
|---|---|
| Show the weeks per schedule, one or several thermostats, selection kept for the next visit (not by a preview: Add card dialog, card editor, where the config's `show` is seen) | `C/card.test.mjs` (configuration, choosing thermostats), `C/interactions.test.mjs` (thermostats shown) |
| Find today at a glance among the days and thermostats: its whole row is tinted, with a border on each side, thicker on the left | `C/card.test.mjs` (today) |
| See the current time as one line across today's thermostats, whatever their number, with a triangle at each end | `C/card.test.mjs` (today) |
| Names of the days and of the thermostats aligned against their bars, the names column as wide as the longest name shown (up to a maximum) | `C/card.test.mjs` (today) |
| Add a slot (double click, never merged with the next slot), insert, delete, change a slot's preset, move times (drag or fields), close the editor | `C/card.test.mjs` (editing a day), `C/interactions.test.mjs` (slot editor buttons, double click, dragging, editing a slot) |
| Move a whole slot by dragging it (same length, within its neighbors; by touch, the selected slot only) | `C/interactions.test.mjs` (dragging a whole slot) |
| Copy / paste a day, fill weekdays / weekend / all / other thermostats, copy a week; the row menu holds the day's actions only, and opens upwards when there is no room below it | `C/card.test.mjs` (copy / paste), `C/interactions.test.mjs` (row menu, copying a week) |
| Save, cancel; an edit undone saves nothing; a save from an outdated copy is refused; edits in progress are not replaced by changes saved elsewhere; unsaved edits shown by a bar with *Cancel* and *Save*, kept at the bottom of the window (#39), no buttons otherwise | `C/card.test.mjs` (saving), `C/card-integration.test.mjs::a save refused *`, `C/interactions.test.mjs` (edits in progress), `I/test_api.py::saving_from_an_outdated_copy_is_refused` |
| Chips choose the thermostats shown: a name, with a mark when it is paused, off, missing or on a temporary setpoint (#39); a thermostat listed twice in the configuration is shown once | `C/card.test.mjs` (choosing the displayed thermostats, configuration) |
| The hint speaks of the mouse, or of the finger on a touch screen | `C/interactions.test.mjs` (the hint under the weeks) |
| Open a thermostat's more-info dialog from the card (the names of the rows, the *Now* view, the popovers) | `C/card.test.mjs` (thermostat more-info dialog), `C/now-view.test.mjs` |
| A thermostat shown with its own name or the card's; a name made of pieces (area, device) as HA makes it (2025.10+), its own name before | `C/card.test.mjs` (names of the thermostats) |
| Error messages (save, override, schedule, presets) | `C/interactions.test.mjs` (error messages) |
| English / French, 12 / 24 h, decimal separator, first day of the week | `C/i18n.test.mjs` |
| Card added but the integration is not set up: says so | `C/card-integration.test.mjs` (without the integration) |
| Updated from HACS, Home Assistant not restarted yet (the card is newer than the running integration): asks for a restart | `C/card-integration.test.mjs` (an integration older than the card) |
| A page left open across an update, or an older copy of the card loaded first (the card is older than the integration): asks to reload the page, with a button (#36) | `C/card-integration.test.mjs` (a card left open across an update), `I/test_api.py::the_card_is_told_the_version_of_the_integration` |
| See the temperature measured over the last 7 days over each day, with the setpoint applied and the range per slot; choice kept; then only what is new every 5 minutes; recorder unavailable: says so; HA not restarted after an update: HA's own history | `C/history.test.mjs` |
| Show a day larger (row menu, or the name of the day with one thermostat shown): its own scale in degrees, the time, measured temperature and setpoint under the mouse or along a finger, a tap still selects a slot; hidden with the history | `C/history.test.mjs` (a day shown larger) |
| An ended override is no longer shown, even before the integration removes it | `C/card.test.mjs::an override that has ended *` |

## More-info dialog of a thermostat

| Use case | Test |
|---|---|
| Schedule and override block injected in a scheduled thermostat's dialog only | `C/interactions.test.mjs` (the more-info dialog) |
| The active schedule's name, current and next slot, override, +30 min, drag its end, end time field, resume | `C/more-info.test.mjs`, `C/interactions.test.mjs` (dragging the end) |
| Until when the planned preset really lasts and what comes next, as the planned preset sensor says: the next different preset, even on another day ("Eco until 06:30 (tomorrow), then Comfort", a weekend, "Eco all week"); sent again to the cards when it changes | `I/test_api.py::the_card_is_told_*`, `C/more-info.test.mjs` (until when the preset lasts, the next day, a weekend, all week), `C/i18n.test.mjs` (the more-info block in English) |

## Entities and API

| Use case | Test |
|---|---|
| Active-schedule select (`select.chauffage_schedule`): lists the schedules, shows and changes the active one; attribute `rules_choice`, the schedule the activation rules give | `I/test_entities.py::the_active_schedule_select_*`, `I/test_rules.py::the_select_says_which_schedule_the_rules_give` |
| Per thermostat, on its device (else named after it), enabled by default: *Planned preset* sensor (the preset now, the next one and its start, `temperatures`: each preset's temperature on this thermostat, published by VTherm or learned) and *Override* binary sensor (on while it has one; kind, value, preset, end in local time whoever set it); *Override end* sensor disabled by default; sensors unavailable while paused; created and removed with the scheduled thermostats, following a rename — ×3 | `I/test_entities.py::the_planned_preset_*`, `::the_override_*`, `::entities_follow_*`, `::sensors_are_attached_*`, `::the_sensors_of_a_paused_thermostat_*`, `I/test_renames.py::its_entities_*` |
| Upgrade from before 0.6: the *Schedule* sensor keeps its entity id as *Planned preset*, and is enabled once unless the user disabled it — ×3 | `I/test_entities.py::the_planned_preset_sensor_of_an_existing_installation_*` |
| *Control* switch per thermostat, a plain entity (main entities of the device in the automation editor, Assist); off: paused — ×3 | `I/test_entities.py::each_scheduled_thermostat_has_a_control_switch_*`, `::turning_the_control_switch_off_*`, `::the_control_switch_shows_*` |
| A switch per schedule on the *Chauffage* device (`switch.chauffage_schedule_<id>`), on for the active one: turning one on activates it, the active one cannot be turned off (a message says to turn another one on); created, renamed and removed with the schedules — ×3 | `I/test_schedule_switches.py` |
| The card shows on a schedule's tab the icon chosen for its switch in Home Assistant, none otherwise | `C/card-integration.test.mjs::a schedule shows the icon *` |
| Events: an override started (by a change on the thermostat, the card, a service; not when only its end changes) or ended (expired, put back on the thermostat, card, service, paused, forgotten), a schedule activated (card, select or switch, service, rules; not when already active) — ×3 | `I/test_events.py` |
| Scripts read the schedules (`chauffage.get_schedules`) and the week of thermostats in a schedule (`chauffage.get_week`, as `schedule.get_schedule`); unknown thermostat or schedule refused | `I/test_api.py::a_script_reads_*`, `::reading_the_week_of_an_unknown_*` |
| History of the measured and target temperatures for the card: only these two, the state at the start first, gaps while unavailable, what was read kept in memory, any user, no recorder | `I/test_history.py` ×3 |
| A card's subscription goes on after the integration is reloaded (options changed, a thermostat renamed): the data sent again at once, then every change | `I/test_api.py::a_subscription_goes_on_after_the_integration_is_reloaded` |
| Websocket API for the card: subscribe, save the weeks with a revision, overrides, schedules, presets, mappings, pause, forget; admins only for writes; errors | `I/test_api.py`, `I/test_options.py`, `I/test_schedule_list.py`, `I/test_edge_cases.py` |

## Not covered by automated tests

- Exact placement of the menus and popovers on screen (needs a real browser layout): checked on
  the development HA.
- A schedule's icon on its tab stays on the line of its name at 360 px: checked on the
  development HA.
- Layout at 360 px (#39): with several thermostats, the day's name above its rows and the scale
  every 6 h; labels of slots too short for them hidden (CSS container queries); the save bar kept
  at the bottom of the window (`position: sticky`); the hint for a touch screen (`hover: none`):
  checked on the development HA.
- Two copies of the card loaded at once (a copy left in `www/` by the v0.1 package, and the
  integration's): the second one does not register again (guarded), checked on the development HA.

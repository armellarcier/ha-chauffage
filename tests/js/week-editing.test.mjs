// Editing the week (#91): what a slot holds, the slots a copy, a cut or a paste makes, the slots
// that stay apart, and the menus that set every slot to heat or to cool.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKEND, cleanup, typeTime } from './helpers.mjs';
import { joined, parseDay, serializeDay } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { $, $$, click, copyDay, day, doubleTap, icons, openMenu, rgb, save, selected, settle, text, unsaved } from './driver.mjs';
import { pasteDay, rows, slotPreset, weekHvac } from './driver.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';
import * as weeksBefore91 from './houses/weeks-before-91.mjs';
import * as suiteAndValve from './houses/suite-and-valve.mjs';
import * as suiteAndCombles from './houses/suite-and-combles.mjs';
import * as atelierAndCombles from './houses/atelier-and-combles.mjs';

afterEach(() => cleanup());

// The salon, a heater (off and heat), and the atelier, a reversible air conditioner with a fan. The
// salon is off at night, and the atelier has a slot that sets the fan and the vanes.
{
  const { COOL, FAN, NIGHT, OFF, OFF_SLOT, SUMMER, cardOf, lastCall, select, setup } = heaterAndAtelier;

  describe('a slot is a preset, off, or fan only', () => {
    test('a slot is parsed from the integration with its settings, and serialized back', () => {
      const segs = parseDay([['00:00', 'eco'], ['14:00', 'comfort', COOL], ['22:30', null, OFF]]);
      assert.deepEqual(segs, [{ start: 0, preset: 'eco' }, { start: 840, preset: 'comfort', settings: COOL }, { start: 22 * 60 + 30, preset: null, settings: OFF }]);
      assert.deepEqual(serializeDay(segs), ['00:00 eco', '14:00 comfort {"hvac_mode":"cool"}', '22:30 - {"hvac_mode":"off"}']);
      assert.deepEqual(parseDay(serializeDay(segs)), segs);
    });

    test('a slot\'s HVAC mode is one of Home Assistant\'s; off, fan only, dry and auto have no preset, and off sets nothing else', () => {
      assert.deepEqual(parseDay([['00:00', 'eco'], ['14:00', 'comfort', { fan_mode: '2', hvac_mode: 'cool' }]]),
        [{ start: 0, preset: 'eco' }, { start: 840, preset: 'comfort', settings: { hvac_mode: 'cool', fan_mode: '2' } }]);
      assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'defrost', fan_mode: '2' }]]), [{ start: 0, preset: 'eco', settings: { fan_mode: '2' } }]);
      assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'auto', fan_mode: '2' }]]), [{ start: 0, preset: null, settings: { hvac_mode: 'auto', fan_mode: '2' } }]);
      assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'off', fan_mode: '2' }]]), [{ start: 0, preset: null, settings: OFF }]);
      assert.deepEqual(parseDay([['00:00', 'eco', { hvac_mode: 'fan_only', fan_mode: '2' }]]), [{ start: 0, preset: null, settings: { hvac_mode: 'fan_only', fan_mode: '2' } }]);
      // A slot without a preset whose HVAC mode needs one is not a slot
      assert.deepEqual(parseDay([['00:00', 'eco'], ['12:00', null, COOL]]), [{ start: 0, preset: 'eco' }]);
    });

    test('slots a copy made the same are joined: two off slots in a row, two fan-only slots too when their settings are equal', () => {
      const quiet = { hvac_mode: 'fan_only', fan_mode: '1' };
      const merged = joined([{ start: 0, preset: 'eco' }, { start: 600, preset: null, settings: OFF }, { start: 700, preset: null, settings: OFF },
        { start: 800, preset: null, settings: FAN }, { start: 850, preset: null, settings: FAN }, { start: 900, preset: null, settings: quiet },
        { start: 1000, preset: 'eco' }, { start: 1100, preset: 'eco', settings: COOL }]);
      assert.deepEqual(merged, [{ start: 0, preset: 'eco' }, { start: 600, preset: null, settings: OFF }, { start: 800, preset: null, settings: FAN },
        { start: 900, preset: null, settings: quiet }, { start: 1000, preset: 'eco' }, { start: 1100, preset: 'eco', settings: COOL }]);
    });

    test('days are grouped on one row only when their slots match in full, settings included', () => {
      const plain = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '21:00 eco'];
      const card = cardOf(setup({ weeks: { 'climate.salon': { Normal: [NIGHT, plain, NIGHT, NIGHT, NIGHT, WEEKEND, WEEKEND] } } }), { show: ['climate.salon'] });
      assert.deepEqual(rows(card), ['Lun, Mer–Ven', 'Mar', 'Sam, Dim']);
    });

    test('Save sends a slot with its settings as a third element, and no preset for an off slot', async () => {
      const hass = setup();
      const card = cardOf(hass, { show: ['climate.salon'] });
      select(card, 'climate.salon', 0, 1);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      await save(card);
      const sent = hass.events.find((e) => e.type === 'chauffage/weeks/save');
      assert.deepEqual(sent.weeks['climate.salon'].normal[0], [['00:00', 'eco'], ['06:30', 'boost'], ['08:30', 'eco'], ['17:30', 'comfort'], ['21:00', null, OFF]]);
    });

    test('a piece cut out of a slot is like it; given a preset, a piece cut out of an off slot or of a fan-only slot takes the HVAC mode of the slot before it', () => {
      const card = cardOf(setup({ atelier: SUMMER }));
      doubleTap(card, 'climate.salon', 23 * 60); // in 21:00, off
      assert.deepEqual(day(card, 'climate.salon', 0).slice(4), [`21:00${OFF_SLOT}`, `23:00${OFF_SLOT}`]);
      click(card, '.editor [data-act="preset"][data-preset="comfort"]');
      assert.deepEqual(day(card, 'climate.salon', 0).slice(4), [`21:00${OFF_SLOT}`, '23:00 comfort']);
      doubleTap(card, 'climate.atelier', 16 * 60); // in 14:00 comfort, cool
      assert.deepEqual(day(card, 'climate.atelier', 0).slice(1, 3), ['14:00 comfort {"hvac_mode":"cool"}', '16:00 comfort {"hvac_mode":"cool"}']);
      click(card, '.editor [data-act="preset"][data-preset="eco"]');
      doubleTap(card, 'climate.atelier', 21 * 60); // in 20:00 fan only, fan 3
      assert.deepEqual(day(card, 'climate.atelier', 0).slice(3, 5), ['20:00 - {"hvac_mode":"fan_only","fan_mode":"3"}', '21:00 - {"hvac_mode":"fan_only","fan_mode":"3"}']);
      slotPreset(card, 'comfort');
      assert.deepEqual(day(card, 'climate.atelier', 0).slice(3, 5), ['20:00 - {"hvac_mode":"fan_only","fan_mode":"3"}', '21:00 comfort {"hvac_mode":"cool","fan_mode":"3"}'],
        'on a preset, in the HVAC mode of the slot before it');
    });

    test('a day copied to a thermostat that cannot be turned off loses its off slot, and the message says so', () => {
      const hass = setup();
      hass.states['climate.atelier'].attributes.hvac_modes = ['heat', 'cool'];
      const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
      copyDay(card, 'climate.salon', 0, 'others');
      assert.deepEqual(day(card, 'climate.atelier', 0).at(-1), '17:30 comfort {"hvac_mode":"heat"}', 'the slot before it goes on');
      assert.match(text($(card, '.msg')), /non repris : Éteint$/);
    });

    test('a day copied to a heater loses its cool and its fan-only slots', () => {
      const card = cardOf(setup({ atelier: SUMMER }), { show: ['climate.salon', 'climate.atelier'] });
      copyDay(card, 'climate.atelier', 0, 'others');
      assert.deepEqual(day(card, 'climate.salon', 0), ['00:00 eco', '14:00 comfort', `23:00${OFF_SLOT}`]);
    });
  });

  describe('a schedule has no HVAC mode', () => {
    test('no choice in its menu, no icon on its tab, nothing sent with it', async () => {
      const hass = setup();
      hass.data.schedules[0].hvac_mode = 'cool'; // what a development version stored
      const card = cardOf(hass);
      assert.equal($(card, '.tab .tab-hvac'), null);
      click(card, '.tab-tool[data-act="schedule-menu"]');
      assert.equal($(card, '.sched-menu [data-act="schedule-hvac"]'), null);
      assert.doesNotMatch(text($(card, '.sched-menu')), /Clims|Celui du thermostat/);
      click(card, '.sched-menu [data-act="schedule-move"][data-dir="1"]');
      await settle();
      assert.deepEqual(lastCall(hass).schedules, [{ id: 'away' }, { id: 'normal' }, { id: 'holiday' }]);
    });
  });
}

// Weeks stored before #91, whose slots say no HVAC mode: the salon, a heater, the atelier, which
// heats and cools, and the combles, which only cool. The card shows the atelier.
{
  const { ATELIER, COMBLES, COOL, FAN, HEAT, OFF, OLD, SALON, cardOf, hvacRow, seg, select, setup } = weeksBefore91;

  describe('on an air conditioner, every slot says heat or cool', () => {
    test('the popover\'s Heat · Cool row always has one chosen: a slot stored without an HVAC mode heats', () => {
      const card = cardOf(setup());
      select(card, ATELIER, 1);
      assert.deepEqual(hvacRow(card), ['Chauffe ✓', 'Clim']);
      assert.equal($(card, '.editor .mode-row').getAttribute('aria-label'), 'Mode HVAC');
    });

    test('tapping the chosen HVAC mode again does not clear it', () => {
      const card = cardOf(setup({ atelier: ['00:00 eco', ['14:00', 'comfort', COOL]] }));
      select(card, ATELIER, 1);
      assert.deepEqual(hvacRow(card), ['Chauffe', 'Clim ✓']);
      click(card, '.editor [data-act="slot-mode"][data-mode="cool"]');
      assert.deepEqual(hvacRow(card), ['Chauffe', 'Clim ✓']);
      assert.equal(unsaved(card), false);
      click(card, '.editor [data-act="slot-mode"][data-mode="heat"]');
      assert.deepEqual(hvacRow(card), ['Chauffe ✓', 'Clim']);
      assert.equal(day(card, ATELIER)[1], '14:00 comfort {"hvac_mode":"heat"}');
    });

    test('the week draws a slot stored without an HVAC mode as a heating slot, with its flame', () => {
      const card = cardOf(setup());
      assert.equal(seg(card, ATELIER, 1).style.background, rgb('#f57c00'));
      assert.deepEqual(icons(seg(card, ATELIER, 1)), ['mdi:fire']);
      assert.match(seg(card, ATELIER, 1).getAttribute('aria-label'), /Confort · Chauffe$/);
    });

    test('an air conditioner that only cools has Cool chosen, and its slots are cooling slots', () => {
      const card = cardOf(setup(), { show: [COMBLES] });
      assert.deepEqual(icons(seg(card, COMBLES, 1)), ['mdi:snowflake']);
      assert.notEqual(seg(card, COMBLES, 1).style.background, rgb('#f57c00'));
      assert.match(seg(card, COMBLES, 1).getAttribute('aria-label'), /Confort · Clim$/);
      select(card, COMBLES, 1);
      assert.deepEqual(hvacRow(card), ['Clim ✓']);
    });

    test('a heater never carries an HVAC mode: a slot pasted with cool is a plain slot', () => {
      const card = cardOf(setup({ salon: ['00:00 eco', ['14:00', 'comfort', COOL]] }), { show: [SALON] });
      assert.equal(seg(card, SALON, 1).style.background, rgb('#f57c00'));
      assert.deepEqual(icons(seg(card, SALON, 1)), []);
      select(card, SALON, 1);
      assert.equal($(card, '.editor .mode-row'), null);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      assert.equal(day(card, SALON)[1], '14:00 boost');
    });

    test('days that only differ by an HVAC mode left unsaid are one row', () => {
      const mixed = [OLD, ['00:00 eco', ['14:00', 'comfort', HEAT], '20:00 eco'], ...Array(5).fill(OLD)];
      const hass = setup();
      hass.data.weeks[ATELIER].normal = mixed.map((d) => d.map((s) => (Array.isArray(s) ? s : s.split(' '))));
      const card = cardOf(hass, { group_days: true });
      assert.deepEqual(rows(card), ['Lun–Dim']);
    });

    test('an edit writes no HVAC mode on a slot that says none: the slot keeps the one it runs in', () => {
      const card = cardOf(setup(), { show: [ATELIER, COMBLES] });
      select(card, ATELIER, 1);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      assert.deepEqual(day(card, ATELIER), ['00:00 eco', '14:00 boost', '20:00 eco']);
      assert.deepEqual(icons(seg(card, ATELIER, 1)), ['mdi:fire']);
      select(card, COMBLES, 1);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      assert.deepEqual(day(card, COMBLES), ['00:00 eco', '14:00 boost', '20:00 eco']);
      assert.deepEqual(icons(seg(card, COMBLES, 1)), ['mdi:snowflake']);
    });
  });

  describe('a new slot is like the slot it comes from', () => {
    const SUMMER = ['00:00 eco', ['12:00', 'comfort', COOL], ['20:00', null, OFF]];

    test('a slot inserted in a cooling slot cools', () => {
      const card = cardOf(setup({ atelier: SUMMER }));
      select(card, ATELIER, 1);
      click(card, '.editor [data-act="insert"]');
      assert.deepEqual(day(card, ATELIER).slice(1, 4), ['12:00 comfort {"hvac_mode":"cool"}', '14:45 comfort {"hvac_mode":"cool"}', '17:15 comfort {"hvac_mode":"cool"}']);
    });

    test('a cut made in a cooling slot gives two cooling slots', () => {
      const card = cardOf(setup({ atelier: SUMMER }));
      doubleTap(card, ATELIER, 15 * 60);
      assert.deepEqual(day(card, ATELIER).slice(1, 3), ['12:00 comfort {"hvac_mode":"cool"}', '15:00 comfort {"hvac_mode":"cool"}']);
    });

    test('a slot inserted in an off slot is off; given a preset, it takes the HVAC mode of the slot before it', () => {
      const card = cardOf(setup({ atelier: SUMMER }));
      select(card, ATELIER, 2);
      click(card, '.editor [data-act="insert"]');
      assert.equal(day(card, ATELIER)[3], '21:15 - {"hvac_mode":"off"}');
      slotPreset(card, 'comfort');
      assert.equal(day(card, ATELIER)[3], '21:15 comfort {"hvac_mode":"cool"}');
    });

    test('without a slot on a preset before it, the new slot given a preset heats', () => {
      const card = cardOf(setup({ atelier: [['00:00', null, OFF], ['12:00', null, FAN]] }));
      select(card, ATELIER, 0);
      click(card, '.editor [data-act="insert"]');
      slotPreset(card, 'eco');
      assert.equal(day(card, ATELIER)[1], '04:00 eco');
      assert.deepEqual(icons(seg(card, ATELIER, 1)), ['mdi:fire']);
    });

    test('Clim tapped on an off slot gives it a preset: not the one of the slot before it, which would take it in', () => {
      const card = cardOf(setup({ atelier: SUMMER }));
      select(card, ATELIER, 2);
      click(card, '.editor [data-act="slot-mode"][data-mode="cool"]');
      assert.equal(day(card, ATELIER)[2], '20:00 eco {"hvac_mode":"cool"}');
    });
  });

  describe('the week menu sets every slot of a week to heat or to cool', () => {
    const MIXED = ['00:00 eco', ['12:00', 'comfort', COOL], ['18:00', null, FAN], ['20:00', null, OFF]];

    test('All cool sets every slot on a preset of the thermostat\'s week, in the schedule shown, and waits for Save', () => {
      const hass = setup({ atelier: MIXED });
      const card = cardOf(hass);
      openMenu(card, ATELIER, 0);
      assert.deepEqual($$(card, '.menu [data-act^="week-hvac"]').map(text), ['Tout en chauffe', 'Tout en clim']);
      click(card, '.menu [data-act="week-hvac"][data-mode="cool"]');
      for (let d = 0; d < 7; d += 1) {
        assert.deepEqual(day(card, ATELIER, d), ['00:00 eco {"hvac_mode":"cool"}', '12:00 comfort {"hvac_mode":"cool"}',
          '18:00 - {"hvac_mode":"fan_only"}', '20:00 - {"hvac_mode":"off"}']);
      }
      assert.equal(unsaved(card), true);
      assert.equal(hass.events.some((e) => e.type === 'chauffage/weeks/save'), false);
      assert.equal(day(card, SALON)[1], '14:00 comfort');
    });

    test('All heat does the opposite', () => {
      const card = cardOf(setup({ atelier: MIXED }));
      weekHvac(card, ATELIER, 'heat');
      assert.equal(day(card, ATELIER, 3)[1], '12:00 comfort {"hvac_mode":"heat"}');
    });

    test('the menu of a heater, and of a unit that only cools, has no such item', () => {
      const card = cardOf(setup(), { show: [SALON, COMBLES] });
      for (const climate of [SALON, COMBLES]) {
        openMenu(card, climate, 0);
        assert.ok($(card, `.menu [data-act="copy-day"][data-climate="${climate}"]`), 'the menu of this thermostat is open');
        assert.equal($$(card, '.menu [data-act="week-hvac"]').length, 0);
      }
    });

    test('in English: All heat, All cool, and the row reads Heat · Cool', () => {
      const hass = setup();
      hass.locale = { ...hass.locale, language: 'en' };
      hass.language = 'en';
      const card = cardOf(hass);
      openMenu(card, ATELIER, 0);
      assert.deepEqual($$(card, '.menu [data-act="week-hvac"]').map(text), ['All heat', 'All cool']);
      select(card, ATELIER, 1);
      assert.deepEqual(hvacRow(card), ['Heat ✓', 'Cool']);
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and a valve that lists heat and auto. The card shows the suite. It is Monday, 10:00.
{
  const { SALON, SUITE, cardOf, mode, onMondayAtTen, select, setup } = suiteAndValve;

  describe('a slot stays apart from its neighbors, while its popover is open and after', () => {
    onMondayAtTen();
    // Thursday: fan only from 17:00, then Cool on Comfort from 20:30
    const THU = ['00:00 eco', ['17:00', null, { hvac_mode: 'fan_only' }], ['20:30', 'comfort', { hvac_mode: 'cool' }]];
    const FAN = '- {"hvac_mode":"fan_only"}';

    test('trying Fan only next to a fan-only slot keeps the two slots, and Cool gives the slot back its preset', () => {
      const card = cardOf(setup({ suite: THU }));
      select(card, SUITE, 2, 3);
      mode(card, 'fan_only');
      assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, `20:30 ${FAN}`]);
      assert.deepEqual(selected(card), { climate: SUITE, day: 3, idx: 2 });
      assert.equal($$(card, `.bar[data-climate="${SUITE}"][data-day="3"] .seg`).length, 3);
      mode(card, 'cool');
      assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, '20:30 comfort {"hvac_mode":"cool"}']);
    });

    test('the two slots stay two when the popover closes', () => {
      const card = cardOf(setup({ suite: THU }));
      select(card, SUITE, 2, 3);
      mode(card, 'fan_only');
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, `20:30 ${FAN}`]);
    });

    test('the two slots stay two when another slot is opened, and the slot forgets the preset it had', () => {
      const card = cardOf(setup({ suite: THU }));
      select(card, SUITE, 2, 3);
      mode(card, 'fan_only');
      select(card, SUITE, 0, 3);
      assert.deepEqual(day(card, SUITE, 3).slice(1), [`17:00 ${FAN}`, `20:30 ${FAN}`]);
      assert.deepEqual(selected(card), { climate: SUITE, day: 3, idx: 0 });
      // Opened again, the slot set to Cool takes the preset of a slot near it, not Comfort
      select(card, SUITE, 2, 3);
      mode(card, 'cool');
      assert.equal(day(card, SUITE, 3)[2], '20:30 eco {"hvac_mode":"cool"}');
    });

    test('the two slots are saved as two', async () => {
      const hass = setup({ suite: THU });
      const card = cardOf(hass);
      select(card, SUITE, 2, 3);
      mode(card, 'fan_only');
      await save(card);
      assert.equal(hass.events.at(-1).weeks[SUITE].normal[3].length, 3);
      assert.equal(day(card, SUITE, 3).length, 3);
    });

    test('a preset tapped that is the neighbor\'s keeps the slot until the popover closes', () => {
      const card = cardOf(setup(), { show: [SALON] });
      select(card, SALON, 1);
      click(card, '.editor [data-act="preset"][data-preset="eco"]');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 eco', '20:00 frost']);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 boost', '20:00 frost']);
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The card shows the salon. It is Monday, 10:00.
{
  const { DAY, SALON, SUITE, bar, cardOf, doubleTap, onMondayAtTen, select, setup } = suiteAndCombles;

  describe('two slots that become the same stay two slots', () => {
    onMondayAtTen();
    test('a slot set to the preset of the slot before it is still there once its popover is closed', () => {
      const card = cardOf(setup());
      select(card, SALON, 1);
      click(card, '.editor [data-act="preset"][data-preset="eco"]');
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 eco', '20:00 frost']);
      assert.equal($$(card, `.bar[data-climate="${SALON}"][data-day="0"] .seg`).length, 3);
    });

    test('the two slots are saved as two slots', async () => {
      const hass = setup();
      const card = cardOf(hass);
      select(card, SALON, 1);
      click(card, '.editor [data-act="preset"][data-preset="eco"]');
      await save(card);
      assert.deepEqual(hass.events.at(-1).weeks[SALON].normal[0], [['00:00', 'eco'], ['14:00', 'eco'], ['20:00', 'frost']]);
      assert.equal(day(card, SALON).length, 3);
    });

    test('a week stored with two slots alike shows both', () => {
      const card = cardOf(setup({ salon: ['00:00 eco', '14:00 eco', '20:00 frost'] }));
      assert.deepEqual(day(card, SALON), ['00:00 eco', '14:00 eco', '20:00 frost']);
    });

    test('a slot deleted between two slots alike leaves one slot', () => {
      const card = cardOf(setup({ salon: ['00:00 eco', '14:00 comfort', '20:00 eco'] }));
      select(card, SALON, 1);
      click(card, '.editor [data-act="delete"]');
      assert.deepEqual(day(card, SALON), ['00:00 eco']);
    });

    test('an HVAC mode tried next to a slot in that HVAC mode keeps both slots', () => {
      const fan = ['17:00', null, { hvac_mode: 'fan_only' }];
      const card = cardOf(setup({ suite: ['00:00 eco', fan, ['20:30', 'comfort', { hvac_mode: 'cool' }]] }), { show: [SUITE] });
      select(card, SUITE, 2);
      click(card, '.editor .mode-row [data-mode="fan_only"]');
      click(card, '.editor [data-act="close"]');
      assert.equal(day(card, SUITE).length, 3);
    });

    test('a day copied to a thermostat that cannot follow its slots joins the slots that end up alike', () => {
      const card = cardOf(setup({ suite: ['00:00 eco', ['14:00', 'eco', { hvac_mode: 'cool' }]] }), { show: [SALON, SUITE] });
      copyDay(card, SUITE, 0, 'others');
      assert.deepEqual(day(card, SALON), ['00:00 eco']);
    });
  });

  describe('a double tap cuts a piece like the slot it is cut from', () => {
    onMondayAtTen();
    test('the piece has the slot\'s preset, and its popover is open', () => {
      const card = cardOf(setup());
      doubleTap(card, SALON, 6 * 60);
      assert.deepEqual(day(card, SALON), ['00:00 eco', '06:00 eco', '14:00 comfort', '20:00 frost']);
      assert.deepEqual(selected(card), { climate: SALON, day: 0, idx: 1 });
      assert.ok($(card, '.editor [data-act="preset"][data-preset="eco"].on'));
    });

    test('a piece cut out of an off slot is off', () => {
      const card = cardOf(setup({ salon: [['00:00', null, { hvac_mode: 'off' }], '14:00 comfort'] }));
      doubleTap(card, SALON, 6 * 60);
      assert.deepEqual(day(card, SALON), ['00:00 - {"hvac_mode":"off"}', '06:00 - {"hvac_mode":"off"}', '14:00 comfort']);
    });

    test('the piece left as it was cut joins its slot again when the popover closes', () => {
      const card = cardOf(setup());
      doubleTap(card, SALON, 6 * 60);
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SALON), DAY);
      assert.equal($(card, '.savebar'), null, 'nothing to save');
    });

    test('the piece left as it was cut joins its slot again when another slot is opened', () => {
      const card = cardOf(setup());
      doubleTap(card, SALON, 6 * 60);
      select(card, SALON, 3);
      assert.deepEqual(day(card, SALON), DAY);
      assert.deepEqual(selected(card), { climate: SALON, day: 0, idx: 2 });
    });

    test('the piece given a preset stays', () => {
      const card = cardOf(setup());
      doubleTap(card, SALON, 6 * 60);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '06:00 boost', '14:00 comfort', '20:00 frost']);
    });

    test('the piece is not saved while it is like its slot', async () => {
      const hass = setup();
      const card = cardOf(hass);
      doubleTap(card, SALON, 6 * 60);
      const before = hass.events.length;
      await save(card);
      assert.equal(hass.events.length, before, 'nothing changed: nothing is sent');
      assert.deepEqual(day(card, SALON), DAY);
    });

    test('Insert a slot makes a piece like the slot, in its middle', () => {
      const card = cardOf(setup());
      select(card, SALON, 0); // 00:00 → 14:00 eco
      click(card, '.editor [data-act="insert"]');
      assert.deepEqual(day(card, SALON).slice(0, 4), ['00:00 eco', '04:45 eco', '09:15 eco', '14:00 comfort']);
      assert.equal(selected(card).idx, 1);
      click(card, '.editor [data-act="preset"][data-preset="comfort"]');
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SALON).slice(0, 4), ['00:00 eco', '04:45 comfort', '09:15 eco', '14:00 comfort']);
    });

    test('a piece cut out of a piece: both join the slot again when left as they were cut', () => {
      const card = cardOf(setup());
      doubleTap(card, SALON, 6 * 60);
      click(card, '.editor [data-act="insert"]'); // in the piece from 06:00 to 14:00
      assert.equal(day(card, SALON).length, 6);
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SALON), DAY);
    });

    test('Insert a slot left as it is leaves the slot whole', () => {
      const card = cardOf(setup());
      select(card, SALON, 0);
      click(card, '.editor [data-act="insert"]');
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SALON), DAY);
    });
  });

  describe('a piece cut on a row of days', () => {
    onMondayAtTen();
    const grouped = (hass) => cardOf(hass, { group_days: true });

    test('joins its slot again on every day of the row', () => {
      const card = grouped(setup());
      doubleTap(card, SALON, 6 * 60);
      assert.equal(day(card, SALON, 4).length, 4, 'the cut is on every day of the row');
      click(card, '.editor [data-act="close"]');
      for (let d = 0; d < 7; d += 1) assert.deepEqual(day(card, SALON, d), DAY);
    });

    test('joins its slot again when another schedule is shown, on every day', async () => {
      const hass = setup();
      const card = grouped(hass);
      doubleTap(card, SALON, 6 * 60);
      click(card, '.tab[data-schedule="away"]');
      for (let d = 0; d < 7; d += 1) assert.deepEqual(day(card, SALON, d, 'normal'), DAY);
      assert.equal(unsaved(card), false, 'no day was left cut: nothing to save');
    });

    test('a slot tried in another schedule keeps its change on every day of its row', async () => {
      const hass = setup();
      const card = grouped(hass);
      select(card, SALON, 1);
      click(card, '.editor [data-act="preset"][data-preset="eco"]');
      click(card, '.tab[data-schedule="away"]');
      await save(card);
      const saved = hass.events.at(-1).weeks[SALON].normal;
      for (let d = 0; d < 7; d += 1) assert.deepEqual(saved[d], [['00:00', 'eco'], ['14:00', 'eco'], ['20:00', 'frost']]);
    });
  });

  describe('an edit changes its slot, and no other slot', () => {
    onMondayAtTen();
    test('Insert a slot left as it is leaves nothing to save on an air conditioner', () => {
      const card = cardOf(setup(), { show: [SUITE] });
      select(card, SUITE, 0);
      click(card, '.editor [data-act="insert"]');
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SUITE), DAY);
      assert.equal($(card, '.savebar'), null, 'nothing to save');
    });

    test('a double tap left as it is too', () => {
      const card = cardOf(setup(), { show: [SUITE] });
      doubleTap(card, SUITE, 6 * 60);
      assert.deepEqual(day(card, SUITE), ['00:00 eco', '06:00 eco', '14:00 comfort', '20:00 frost']);
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SUITE), DAY);
      assert.equal($(card, '.savebar'), null, 'nothing to save');
    });

    test('an HVAC mode tapped on a slot leaves the other slots as they were stored', () => {
      const card = cardOf(setup(), { show: [SUITE] });
      select(card, SUITE, 1);
      click(card, '.editor .mode-row [data-mode="cool"]');
      assert.deepEqual(day(card, SUITE), ['00:00 eco', '14:00 comfort {"hvac_mode":"cool"}', '20:00 frost']);
    });

    test('a preset tapped on a slot too', () => {
      const card = cardOf(setup(), { show: [SUITE] });
      select(card, SUITE, 1);
      click(card, '.editor [data-act="preset"][data-preset="boost"]');
      assert.deepEqual(day(card, SUITE), ['00:00 eco', '14:00 boost', '20:00 frost']);
    });

    test('the HVAC mode a slot already runs in changes nothing', () => {
      const card = cardOf(setup(), { show: [SUITE] });
      select(card, SUITE, 1);
      assert.ok($(card, '.editor .mode-row [data-mode="heat"].on'), 'a slot without an HVAC mode heats');
      click(card, '.editor .mode-row [data-mode="heat"]');
      assert.deepEqual(day(card, SUITE), DAY);
      assert.equal($(card, '.savebar'), null, 'nothing to save');
    });
  });

  describe('a piece the card cut, whose start the user moves', () => {
    onMondayAtTen();
    test('joins its slot again when it is left like its slot: a start typed', () => {
      const card = cardOf(setup());
      doubleTap(card, SALON, 6 * 60);
      typeTime($(card, '.editor input.time[data-edge="start"]'), '07:00');
      assert.deepEqual(day(card, SALON), ['00:00 eco', '07:00 eco', '14:00 comfort', '20:00 frost']);
      click(card, '.editor [data-act="close"]');
      assert.deepEqual(day(card, SALON), DAY);
      assert.equal($(card, '.savebar'), null, 'nothing to save');
    });

    test('a start dragged', () => {
      const card = cardOf(setup());
      doubleTap(card, SALON, 6 * 60);
      const handle = bar(card, SALON).querySelector('.handle[data-idx="1"]');
      handle.setPointerCapture = () => {};
      const pointer = (el, type, clientX) => el.dispatchEvent(Object.assign(new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX }), { pointerId: 1, pointerType: 'mouse' }));
      pointer(handle, 'pointerdown', 6 * 60);
      pointer(handle, 'pointermove', 8 * 60);
      pointer(handle, 'pointerup', 8 * 60);
      assert.deepEqual(day(card, SALON), ['00:00 eco', '08:00 eco', '14:00 comfort', '20:00 frost']);
      select(card, SALON, 3);
      assert.deepEqual(day(card, SALON), DAY);
    });
  });

  describe('All cool and All heat', () => {
    onMondayAtTen();
    const MIXED = ['00:00 eco', ['06:00', 'comfort', { hvac_mode: 'heat_cool' }], ['09:00', null, { hvac_mode: 'dry' }],
      ['12:00', 'comfort', { hvac_mode: 'cool' }], ['18:00', null, { hvac_mode: 'auto' }], ['20:00', null, { hvac_mode: 'fan_only' }], ['22:00', null, { hvac_mode: 'off' }]];

    test('switch the heating and the cooling slots, and leave the others as they are', () => {
      const card = cardOf(setup({ suite: MIXED }), { show: [SUITE] });
      weekHvac(card, SUITE, 'cool');
      assert.deepEqual(day(card, SUITE), ['00:00 eco {"hvac_mode":"cool"}', '06:00 comfort {"hvac_mode":"heat_cool"}', '09:00 - {"hvac_mode":"dry"}',
        '12:00 comfort {"hvac_mode":"cool"}', '18:00 - {"hvac_mode":"auto"}', '20:00 - {"hvac_mode":"fan_only"}', '22:00 - {"hvac_mode":"off"}']);
      weekHvac(card, SUITE, 'heat');
      assert.equal(day(card, SUITE)[1], '06:00 comfort {"hvac_mode":"heat_cool"}');
      assert.equal(day(card, SUITE)[3], '12:00 comfort {"hvac_mode":"heat"}');
    });
  });
}

// The salon, a heater, the atelier, which heats and cools, and the combles, which only cool, with
// values of their own when cooling. The card shows the atelier.
{
  const { ALL, ATELIER, COMBLES, FAN, OFF, SALON, cardOf, setup } = atelierAndCombles;

  describe('a day pasted to a thermostat that cannot follow every slot', () => {
    const SUMMER = ['00:00 eco', ['12:00', 'comfort', { hvac_mode: 'cool', fan_mode: 'low' }], ['18:00', null, FAN], ['22:00', null, OFF]];

    test('the message names what was left out', () => {
      const card = cardOf(setup({ atelier: SUMMER }), { show: [ATELIER, SALON] });
      copyDay(card, ATELIER, 0);
      pasteDay(card, SALON, 0);
      assert.deepEqual(day(card, SALON), ['00:00 eco', '12:00 comfort', '22:00 - {"hvac_mode":"off"}']);
      assert.match(text($(card, '.msg')), / · non repris : Clim, Ventilation, Ventilateur$/);
    });

    test('a heating slot pasted to a unit that only cools cools, and the message says so', () => {
      const card = cardOf(setup({ atelier: ['00:00 eco', ['12:00', 'comfort', { hvac_mode: 'heat' }]] }), { show: [ATELIER, COMBLES] });
      copyDay(card, ATELIER, 0, 'others');
      assert.deepEqual(day(card, COMBLES), ['00:00 eco {"hvac_mode":"cool"}', '12:00 comfort {"hvac_mode":"cool"}']);
      assert.match(text($(card, '.msg')), / · non repris : Chauffe$/);
    });

    test('nothing left out: nothing said', () => {
      const card = cardOf(setup(), { show: [ATELIER, SALON] });
      copyDay(card, SALON, 0, 'others');
      assert.doesNotMatch(text($(card, '.msg')), /non repris/);
    });
  });

  describe('choosing several rooms', () => {
    const shown = (card) => $$(card, '.chip.on[data-climate]').map((c) => c.dataset.climate);

    test('Plusieurs pressed while every room is shown starts from the room tapped, then adds rooms', () => {
      const card = cardOf(setup(), { show: 'all' });
      assert.deepEqual(shown(card), ALL);
      click(card, '[data-act="multi-sel"]');
      click(card, `.chip[data-climate="${ATELIER}"]`);
      assert.deepEqual(shown(card), [ATELIER], 'the room tapped, not every room but it');
      click(card, `.chip[data-climate="${COMBLES}"]`);
      assert.deepEqual(shown(card), [ATELIER, COMBLES]);
      click(card, `.chip[data-climate="${ATELIER}"]`); // tapped again: removed, as before
      assert.deepEqual(shown(card), [COMBLES]);
    });

    test('Plusieurs pressed with some rooms shown adds to them, as before', () => {
      const card = cardOf(setup(), { show: [SALON] });
      click(card, '[data-act="multi-sel"]');
      click(card, `.chip[data-climate="${ATELIER}"]`);
      assert.deepEqual(shown(card), [SALON, ATELIER]);
    });
  });
}

// The week as the card draws it (#91): off, fan-only and cooling slots, the legend, an override
// on the week, the chips, and the messages of the schedule card.
import { afterEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, createCard, fakeHass, integrationData } from './helpers.mjs';
import { CHIP_STYLE, STYLE as STYLE_TEXT, coolColor, derivedCoolColor, makeLocale, overrideLabel, planText } from '../../custom_components/chauffage/frontend/chauffage-programme-card.js';
import { $, $$, icons, rgb, text } from './houses/dom.mjs';
import * as heaterAndAtelier from './houses/heater-and-atelier.mjs';
import * as everyHvacMode from './houses/every-hvac-mode.mjs';
import * as suiteAndValve from './houses/suite-and-valve.mjs';
import * as suiteAndCombles from './houses/suite-and-combles.mjs';
import * as atelierAndCombles from './houses/atelier-and-combles.mjs';

afterEach(() => cleanup());

// The salon, a heater (off and heat), and the atelier, a reversible air conditioner with a fan. The
// salon is off at night, and the atelier has a slot that sets the fan and the vanes.
{
  const { FAN, OFF, PRESET_COLORS, SUMMER, cardOf, setup, thermostatCard } = heaterAndAtelier;

  describe('the week view', () => {
    test('an off slot is grey, named Éteint, with the power icon', () => {
      const card = cardOf(setup(), { show: ['climate.salon'] });
      const seg = $(card, '.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="4"]');
      assert.ok(seg.classList.contains('off'));
      assert.equal(seg.style.background, 'rgb(97, 97, 97)');
      assert.equal(seg.querySelector('.l').textContent, 'Éteint');
      assert.equal(seg.querySelector('.t ha-icon').getAttribute('icon'), 'mdi:power');
      assert.match(seg.title, /21:00 → 24:00 · Éteint$/);
    });

    test('a cooling slot is drawn in its preset\'s cool color, with a snowflake; its title says Clim', () => {
      const card = cardOf(setup({ atelier: SUMMER }), { show: ['climate.atelier'] });
      const seg = (idx) => $(card, `.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="${idx}"]`);
      const comfort = { id: 'comfort', color: PRESET_COLORS.comfort };
      assert.equal(seg(1).style.background, rgb(coolColor(comfort)));
      assert.notEqual(seg(1).style.background, rgb(PRESET_COLORS.comfort));
      assert.equal(seg(1).querySelector('.t ha-icon').getAttribute('icon'), 'mdi:snowflake');
      assert.match(seg(1).title, /14:00 → 20:00 · Confort · Clim$/);
      // A slot with a marker hides its time sooner in a narrow segment, so the marker is never cut
      assert.ok(seg(1).classList.contains('marked'));
      assert.equal(seg(0).style.background, rgb(PRESET_COLORS.eco), 'a slot without an HVAC mode heats: its heat color');
      assert.equal(seg(0).querySelector('ha-icon').getAttribute('icon'), 'mdi:fire');
    });

    test('a preset\'s own cool color wins over the derived one', () => {
      const hass = setup({ atelier: SUMMER });
      hass.data.presets = hass.data.presets.map((p) => (p.id === 'comfort' ? { ...p, cool_color: '#123456' } : p));
      const card = cardOf(hass, { show: ['climate.atelier'] });
      assert.equal($(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="1"]').style.background, rgb('#123456'));
    });

    test('the derived cool colors are cool shades (a blue, a teal, a navy, an indigo), dark enough for white text, one per preset', () => {
      const cool = Object.values(PRESET_COLORS).map(derivedCoolColor);
      assert.equal(new Set(cool).size, 4);
      for (const hex of cool) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        assert.ok(b > r && g > r, `${hex} is a cool shade`);
        assert.ok((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5, `${hex} is dark enough for white text`);
      }
      assert.equal(derivedCoolColor('not a color'), derivedCoolColor('#9e9e9e'));
    });

    test('a fan-only slot has Home Assistant\'s color of fan only, a fan, and the word Ventilation', () => {
      const card = cardOf(setup({ atelier: SUMMER }), { show: ['climate.atelier'] });
      const seg = $(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg[data-idx="2"]');
      assert.ok(seg.classList.contains('fan'));
      assert.equal(seg.style.background, '', 'its color is its class\'s: var(--state-climate-fan_only-color), cyan by default');
      assert.match($(card, 'style').textContent, /\.seg\.fan[^}]*background:var\(--state-climate-fan_only-color, rgb\(0, 188, 212\)\)/);
      assert.match($(card, 'style').textContent, /\.seg\.fan[^}]*color:rgba\(0,0,0,\.87\)/, 'dark text: white is not legible on cyan');
      assert.equal(seg.querySelector('.l').textContent, 'Ventilation');
      assert.deepEqual([...seg.querySelectorAll('.t ha-icon')].map((i) => i.getAttribute('icon')), ['mdi:fan', 'mdi:tune-variant']);
      assert.match(seg.title, /20:00 → 23:00 · Ventilation · Ventilateur 3$/);
    });

    test('a slot that sets the fan or the vanes shows a mark, and its title says the values', () => {
      const card = cardOf(setup(), { show: ['climate.atelier'] });
      const segs = $$(card, '.bar[data-climate="climate.atelier"][data-day="0"] .seg');
      assert.deepEqual(segs.map((s) => (s.querySelector('.t ha-icon.air') || { getAttribute: () => null }).getAttribute('icon')), [null, 'mdi:tune-variant', null]);
      assert.match(segs[1].title, /Confort · Chauffe · Ventilateur 3 · Volets Oscillation$/);
      assert.equal(segs[1].getAttribute('aria-label'), segs[1].title);
      assert.equal(segs[0].title, 'Atelier · 00:00 → 14:00 · Éco · Chauffe');
    });

    test('the legend lists the presets; Éteint and Ventilation only when a shown week has such a slot', () => {
      assert.match(text($(cardOf(setup(), { show: ['climate.salon'] }), '.legend')), /^Hors-gel.*Éco.*Confort.*Boost.*Éteint/);
      assert.doesNotMatch(text($(cardOf(setup(), { show: ['climate.atelier'] }), '.legend')), /Éteint|Ventilation|Clim/);
      const summer = cardOf(setup({ atelier: SUMMER }), { show: ['climate.atelier'] });
      assert.match(text($(summer, '.legend')), /Boost.*Éteint.*Ventilation/);
      assert.ok($(summer, '.legend .legend-fan i.fan'));
    });

    test('the legend shows each preset\'s cool color next to its heat color when a shown thermostat cools', () => {
      const heater = cardOf(setup(), { show: ['climate.salon'] });
      assert.equal($$(heater, '.legend i.cool').length, 0);
      const ac = cardOf(setup(), { show: ['climate.atelier'] });
      assert.deepEqual($$(ac, '.legend i.cool').map((i) => i.style.background),
        ['eco', 'comfort', 'boost'].map((id) => rgb(derivedCoolColor(PRESET_COLORS[id]))), 'frost protection never cools');
    });

    test('a thermostat\'s page (week_only) keeps Éteint in its legend', () => {
      assert.equal(text($(cardOf(setup(), { show: ['climate.salon'], week_only: true }), '.legend')), 'Éteint');
      assert.equal($(cardOf(setup(), { show: ['climate.atelier'], week_only: true }), '.legend'), null);
    });

    test('on an off slot, "Éteint" wins over the time; too narrow for both, the icon alone, larger', () => {
      // A 2 h off slot and a 30 min off slot
      const short = ['00:00 eco', '06:30 comfort', ['08:30', null, OFF], '10:30 comfort', ['17:30', null, OFF], '18:00 comfort'];
      const hass = setup({ weeks: { 'climate.salon': { Normal: Array(7).fill(short) }, 'climate.atelier': { Normal: Array(7).fill(['00:00 eco']) } } });
      const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] }); // two thermostats: compact thresholds
      const seg = (idx) => $(card, `.bar[data-climate="climate.salon"][data-day="0"] .seg[data-idx="${idx}"]`);
      assert.equal(seg(2).querySelector('.l').textContent, 'Éteint');
      assert.equal(seg(2).querySelector('.t').textContent, '', 'the time gives way to the word');
      assert.ok(seg(2).querySelector('.t ha-icon'));
      assert.equal(seg(4).querySelector('.l').textContent, '');
      assert.ok(seg(4).querySelector('.t.alone ha-icon'), 'the icon alone, at 14 px');
      // An "on" slot of two hours keeps its time
      assert.equal(seg(1).querySelector('.t').textContent, '06:30');
    });
  });

  describe('texts that name a slot', () => {
    const loc = makeLocale(null, 'fr');
    const name = (id) => ({ eco: 'Éco', comfort: 'Confort' })[id] || id;

    test('"Follows the schedule" says Éteint for an off slot, Ventilation for a fan-only slot, also for the next slot', () => {
      mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T23:00:00+02:00') });
      try {
        assert.equal(planText({ preset: null, hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
          'Éteint jusqu\'à 06:30 (demain), puis Confort');
        assert.equal(planText({ preset: 'comfort', hvac_mode: 'cool', next_preset: null, next_hvac_mode: 'off', next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
          'Confort jusqu\'à 06:30 (demain), puis Éteint');
        assert.equal(planText({ preset: null, hvac_mode: 'fan_only', next_preset: null, next_hvac_mode: 'off', next_start: '2026-10-13T06:30:00+02:00' }, name, loc),
          'Ventilation jusqu\'à 06:30 (demain), puis Éteint');
        assert.equal(planText({ preset: null, hvac_mode: null }, name, loc), '');
      } finally { mock.timers.reset(); }
    });

    test('an override\'s label: Éteint, or the HVAC mode it was switched to by hand', () => {
      assert.equal(overrideLabel({ target: OFF }, loc), 'Éteint');
      assert.equal(overrideLabel({ target: { hvac_mode: 'cool' } }, loc), 'Clim');
      assert.equal(overrideLabel({ target: { hvac_mode: 'dry' } }, loc), 'Déshum.');
      assert.equal(overrideLabel({ target: { hvac_mode: 'heat_cool', target_temp_low: 19, target_temp_high: 24.5 } }, loc), '19–24,5 °C');
      assert.equal(overrideLabel({ target: FAN }, loc), 'Ventilation');
      assert.equal(overrideLabel({ target: { hvac_mode: 'cool', temperature: 24 } }, loc), '24 °C');
    });
  });

  describe('the thermostat card chip and the row chip', () => {
    test('a VTherm heating at the frost setpoint for its open window says so, without setpoint', () => {
      const hass = setup({ thermostats: { 'climate.salon': { paused: false, revision: 7, cause: 'window' } } });
      hass.states['climate.salon'].attributes.temperature = 7;
      hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'eco', target_temperature: 17 };
      assert.equal(text($(thermostatCard(hass), '.tc-state')), 'Fenêtre ouverte · Éco');
      const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
      assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'fenêtre ouverte');
    });

    test('an off slot reads Éteint, grey, without setpoint; a fan-only slot reads Ventilation', () => {
      const hass = setup({ planned: { 'climate.salon': { preset: null, hvac_mode: 'off', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' },
        'climate.atelier': { preset: null, hvac_mode: 'fan_only', next_preset: 'comfort', next_hvac_mode: null, next_start: '2026-10-13T06:30:00+02:00' } } });
      hass.states['climate.salon'].state = 'off';
      hass.states['climate.salon'].attributes.temperature = 17;
      const tc = thermostatCard(hass);
      assert.equal(text($(tc, '.tc-state')), 'Éteint');
      assert.ok(!$(tc, '.tc-state').classList.contains('override'));
      hass.states['climate.atelier'].state = 'fan_only';
      assert.equal(text($(thermostatCard(hass, 'climate.atelier'), '.tc-state')), 'Ventilation');
    });

    test('a VTherm off by its window or its auto start/stop says why, and the preset it restarts on', () => {
      const hass = setup({ thermostats: { 'climate.salon': { paused: false, revision: 7, cause: 'window' } } });
      hass.entities['climate.salon'].platform = 'versatile_thermostat';
      hass.states['climate.salon'].state = 'off';
      hass.states['climate.salon'].attributes.requested_state = { hvac_mode: 'heat', preset: 'comfort', target_temperature: 20 };
      const tc = thermostatCard(hass);
      assert.equal(text($(tc, '.tc-state')), 'Fenêtre ouverte · Confort');
      const card = cardOf(hass, { show: ['climate.salon', 'climate.atelier'] });
      assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'fenêtre ouverte');
      hass.push({ ...hass.data, thermostats: { ...hass.data.thermostats, 'climate.salon': { paused: false, revision: 7, cause: 'auto_start_stop' } } });
      assert.equal(text($(card, '.chip[data-climate="climate.salon"] .live')), 'arrêt auto');
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The presets have a cooling temperature. The card shows the
// suite.
{
  const { COMBLES, SALON, SUITE, cardOf, seg, setup } = everyHvacMode;

  describe('the week and the legend', () => {
    const DAYS = ['00:00 eco', ['08:00', null, { hvac_mode: 'dry' }], ['12:00', 'comfort', { hvac_mode: 'heat_cool' }], ['18:00', null, { hvac_mode: 'auto' }]];

    test('a dry slot and an auto slot have Home Assistant\'s color and icon, hatched: not a preset\'s slot', () => {
      const card = cardOf(setup({ suite: DAYS }));
      assert.match(seg(card, SUITE, 1).getAttribute('style'), /repeating-linear-gradient.*--state-climate-dry-color/);
      assert.doesNotMatch(seg(card, SUITE, 2).getAttribute('style'), /repeating-linear-gradient/);
      assert.match($(card, '.legend .legend-off i').getAttribute('style'), /repeating-linear-gradient.*--state-climate-dry-color/);
      assert.deepEqual(icons(seg(card, SUITE, 1)), ['mdi:water-percent']);
      assert.match(seg(card, SUITE, 1).getAttribute('aria-label'), /Déshum\.$/);
      assert.match(seg(card, SUITE, 3).getAttribute('style'), /--state-climate-auto-color/);
      assert.deepEqual(icons(seg(card, SUITE, 3)), ['mdi:thermostat-auto']);
    });

    test('a heat/cool slot shows the heat color and the cool color of its preset', () => {
      const card = cardOf(setup({ suite: DAYS }));
      assert.match(seg(card, SUITE, 2).getAttribute('style'), /linear-gradient\(.*#f57c00.*#1976d2/);
      assert.deepEqual(icons(seg(card, SUITE, 2)), ['mdi:sun-snowflake-variant']);
      assert.match(seg(card, SUITE, 2).getAttribute('aria-label'), /Confort · Chauffe\/Clim$/);
    });

    test('the legend names dry and auto when a shown week has them', () => {
      const card = cardOf(setup({ suite: DAYS }));
      assert.deepEqual($$(card, '.legend .legend-off').map(text), ['Déshum.', 'Auto']);
      assert.deepEqual($$(cardOf(setup()), '.legend .legend-off').map(text), []);
    });

    test('the legend lists the presets the shown thermostats can use', () => {
      const names = (card) => $$(card, '.legend > span:not(.legend-off):not(.settings-link)').map((s) => text(s).split(' ')[0]);
      assert.deepEqual(names(cardOf(setup(), { show: [COMBLES] })), ['Éco', 'Confort', 'Boost']);
      assert.deepEqual(names(cardOf(setup(), { show: [SALON] })), ['Hors-gel', 'Éco', 'Confort', 'Boost']);
      // Frost protection heats: it has a heat color and no cool color next to an air conditioner
      const card = cardOf(setup());
      const frost = $$(card, '.legend > span').find((s) => text(s).startsWith('Hors-gel'));
      assert.ok(frost.querySelector('i.heat') && !frost.querySelector('i.cool'));
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and a valve that lists heat and auto. The card shows the suite. It is Monday, 10:00.
{
  const { SUITE, cardOf, onMondayAtTen, setup } = suiteAndValve;

  describe('the legend and the week', () => {
    onMondayAtTen();
    const DAYS = ['00:00 eco', ['06:00', null, { hvac_mode: 'dry' }], ['12:00', 'comfort', { hvac_mode: 'heat_cool' }], ['18:00', null, { hvac_mode: 'auto' }]];
    const seg = (card, idx) => $(card, `.bar[data-climate="${SUITE}"][data-day="0"] .seg[data-idx="${idx}"]`);

    test('the legend names heat/cool when a shown week has it', () => {
      const card = cardOf(setup({ suite: DAYS }));
      const entry = $(card, '.legend .legend-heat-cool');
      assert.equal(text(entry), 'Chauffe/Clim');
      assert.match(entry.querySelector('i').getAttribute('style'), /linear-gradient/);
      assert.equal($(cardOf(setup()), '.legend .legend-heat-cool'), null);
    });

    test('a heat/cool slot wide enough says its preset', () => {
      const card = cardOf(setup({ suite: DAYS }));
      assert.equal(text(seg(card, 2).querySelector('.l')), 'Confort');
    });

    test('a heat/cool slot of two hours says its preset rather than its time: its two colors are no preset\'s color', () => {
      const card = cardOf(setup({ suite: ['00:00 eco', ['12:00', 'comfort', { hvac_mode: 'heat_cool' }], ['14:00', 'comfort', { hvac_mode: 'cool' }]] }));
      assert.equal(text(seg(card, 1).querySelector('.l')), 'Confort');
      assert.equal(text(seg(card, 1).querySelector('.t')), '');
    });

    test('a dry slot is hatched in Home Assistant\'s color of dry on a neutral base: it does not look like Comfort', () => {
      const card = cardOf(setup({ suite: DAYS }));
      const style = seg(card, 1).getAttribute('style');
      assert.match(style, /repeating-linear-gradient\(.*--state-climate-dry-color/);
      assert.match(style, /--secondary-background-color/);
      assert.doesNotMatch(style, /radial-gradient/);
      assert.match(seg(card, 3).getAttribute('style'), /repeating-linear-gradient\(.*--state-climate-auto-color/);
      assert.match($(card, '.legend .legend-off i').getAttribute('style'), /repeating-linear-gradient\(.*--state-climate-dry-color/);
    });

    test('every chip and HVAC mode button has one height, from one variable', async () => {
      const { CHIP_STYLE } = await import('../../custom_components/chauffage/frontend/chauffage-programme-card.js');
      assert.match(CHIP_STYLE, /--chauffage-chip-h:34px/);
      assert.match(CHIP_STYLE, /\.mode-row \.mode, \.presets button \{[^}]*height:var\(--chauffage-chip-h\)/);
      assert.match(CHIP_STYLE, /\.mode-row \{[^}]*margin-bottom:0/);
      assert.match(CHIP_STYLE, /\.mode\.on \{[^}]*color-mix\(in srgb, var\(--mode-color\) 20%, transparent\)/);
    });
  });
}

// The salon, a heater, the suite, a reversible unit that lists every HVAC mode and takes a range,
// and the combles, which only cool. The card shows the salon. It is Monday, 10:00.
{
  const { SALON, SUITE, at, cardOf, onMondayAtTen, override, setup } = suiteAndCombles;

  describe('an override on a week with several thermostats', () => {
    onMondayAtTen();
    test('says its HVAC mode and its end on the week, without a tooltip', () => {
      const hass = setup({ overrides: { [SUITE]: override({ temperature: 24, hvac_mode: 'cool' }) } });
      const card = cardOf(hass, { show: [SALON, SUITE] });
      const tag = $(card, `.override[data-climate="${SUITE}"] .override-tag`);
      assert.ok(tag, 'a short override has a tag next to it');
      assert.match(text(tag), /11:30/);
      assert.equal(tag.querySelector('ha-icon').getAttribute('icon'), 'mdi:snowflake');
    });

    test('on a heater: its end', () => {
      const hass = setup({ overrides: { [SALON]: override({ temperature: 21 }) } });
      const card = cardOf(hass, { show: [SALON, SUITE] });
      const tag = $(card, `.override[data-climate="${SALON}"] .override-tag`);
      assert.match(text(tag), /11:30/);
      assert.equal(tag.querySelector('ha-icon'), null);
    });

    test('a long override has its label inside (the stylesheet shows the label or the tag, from the width)', () => {
      const hass = setup({ overrides: { [SUITE]: override({ temperature: 24, hvac_mode: 'cool' }, { end: at('16:30') }) } });
      const card = cardOf(hass, { show: [SALON, SUITE] });
      assert.match(text($(card, `.override[data-climate="${SUITE}"] .override-label`)), /16:30/);
      assert.match(STYLE_TEXT, /\.override-tag \{[^}]*display:none/);
    });
  });

  describe('a slot without a preset on a narrow week', () => {
    onMondayAtTen();
    test('is marked, so that its name wins over its time', () => {
      const card = cardOf(setup({ salon: [['00:00', null, { hvac_mode: 'off' }], '06:30 comfort'] }), { show: [SALON, SUITE] });
      const segs = $$(card, `.bar[data-climate="${SALON}"][data-day="0"] .seg`);
      assert.ok(segs[0].classList.contains('word'));
      assert.ok(!segs[1].classList.contains('word'));
      assert.match(STYLE_TEXT, /\.multi \.seg\.word \.t/);
    });
  });

  describe('two slots alike in a row', () => {
    onMondayAtTen();
    test('have a faded handle between them', () => {
      const card = cardOf(setup({ salon: ['00:00 eco', '06:00 eco', '14:00 comfort'] }));
      const handles = $$(card, `.bar[data-climate="${SALON}"][data-day="0"] .handle`);
      assert.deepEqual(handles.map((h) => h.classList.contains('same')), [true, false]);
      assert.match(STYLE_TEXT, /\.handle\.same::after/);
    });
  });

  describe('an override on the week says its HVAC mode and its end in one format', () => {
    onMondayAtTen();
    const tagOf = (card, climate) => $(card, `.override[data-climate="${climate}"] .override-tag`);
    const labelOf = (card, climate) => $(card, `.override[data-climate="${climate}"] .override-label`);
    const icon = (el) => (el.querySelector('ha-icon') || { getAttribute: () => null }).getAttribute('icon');

    test('an off override: the off icon, an arrow, its end', () => {
      const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'off' }, { end: at('17:00') }) } });
      const card = cardOf(hass, { show: [SALON, SUITE] });
      for (const el of [tagOf(card, SUITE), labelOf(card, SUITE)]) {
        assert.equal(text(el), '⏱ → 17:00');
        assert.equal(icon(el), 'mdi:power');
      }
    });

    test('a cooling override, short or long: the same words', () => {
      for (const end of ['11:30', '16:30']) {
        const hass = setup({ overrides: { [SUITE]: override({ temperature: 24, hvac_mode: 'cool' }, { end: at(end) }) } });
        const card = cardOf(hass, { show: [SALON, SUITE] });
        for (const el of [tagOf(card, SUITE), labelOf(card, SUITE)]) {
          assert.equal(text(el), `⏱ → ${end}`);
          assert.equal(icon(el), 'mdi:snowflake');
        }
      }
    });

    test('on a heater: no icon', () => {
      const card = cardOf(setup({ overrides: { [SALON]: override({ temperature: 21 }) } }));
      assert.equal(text(tagOf(card, SALON)), '⏱ → 11:30');
      assert.equal(icon(tagOf(card, SALON)), null);
    });

    test('an end on another day names the day', () => {
      const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'off' }, { end: '2026-10-13T08:00:00+02:00' }) } });
      const card = cardOf(hass, { show: [SUITE] });
      const today = $(card, `.override[data-climate="${SUITE}"][data-day="0"]`);
      assert.equal(text(today.querySelector('.override-label')), '⏱ → mar. 08:00');
      assert.ok(today.classList.contains('dated'), 'a longer label: outside sooner');
      const last = $(card, `.override[data-climate="${SUITE}"][data-day="1"]`);
      assert.equal(text(last.querySelector('.override-tag')), '⏱ → mar. 08:00');
    });

    test('an end in a week or more: its date', () => {
      const hass = setup({ overrides: { [SUITE]: override({ hvac_mode: 'off' }, { end: '2026-10-19T08:00:00+02:00' }) } });
      const card = cardOf(hass, { show: [SUITE] });
      assert.match(text($(card, `.override[data-climate="${SUITE}"][data-day="0"] .override-label`)), /^⏱ → 19\/10 08:00$/);
    });

    test('the label goes outside a block narrower than it: the width decides, not the duration', () => {
      assert.match(STYLE_TEXT, /\.override \{[^}]*container-type:inline-size/);
      assert.match(STYLE_TEXT, /@container \(max-width:\d+px\) \{ \.override\.last \.override-label \{ display:none; \} \.override\.last \.override-tag \{ display:inline-flex; \}/);
    });
  });

  describe('the schedule card says to restart Home Assistant', () => {
    onMondayAtTen();
    test('when the data of an older integration comes after the card is drawn', () => {
      const hass = fakeHass({ data: null });
      const card = createCard(hass);
      assert.ok($(card, '.loading'));
      hass.push({ ...integrationData(), version: '0.0.1' });
      assert.match(text($(card, '.missing')), /redémarrez Home Assistant/);
    });

    test('and to reload the page when the card is the older one', () => {
      const hass = fakeHass({ data: null });
      const card = createCard(hass);
      hass.push({ ...integrationData(), version: '99.0.0' });
      assert.match(text($(card, '.missing')), /rechargez la page/);
    });
  });
}

// The salon, a heater, the atelier, which heats and cools, and the combles, which only cool, with
// values of their own when cooling. The card shows the atelier.
{
  const { COMBLES, SALON, cardOf, setup } = atelierAndCombles;

  describe('the legend says heat and cool', () => {
    test('each preset has a heat swatch and a cool swatch, each with its mark, when a shown thermostat cools', () => {
      const card = cardOf(setup());
      const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
      assert.deepEqual(icons(comfort).slice(0, 2), ['mdi:fire', 'mdi:snowflake']);
      assert.equal(comfort.querySelectorAll('i').length, 2);
    });

    test('a heater alone has plain swatches', () => {
      const card = cardOf(setup(), { show: [SALON] });
      const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
      assert.deepEqual(icons(comfort), []);
      assert.equal(text(comfort), 'Confort 20°');
    });

    test('the cool value follows the heat value: the cooling temperature, else what its own preset gives when cooling', () => {
      const card = cardOf(setup());
      const legend = (name) => text($$(card, '.legend > span').find((s) => s.textContent.includes(name)));
      assert.equal(legend('Confort'), 'Confort 20° · 24°');
      assert.equal(legend('Éco'), 'Éco 17° · 27°');
      assert.equal(legend('Hors-gel'), 'Hors-gel 7°');
      const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
      assert.equal(icons(comfort).at(-1), 'mdi:snowflake', 'the cool value has its mark');
    });

    test('a unit that only cools shows its cool values alone', () => {
      const card = cardOf(setup(), { show: [COMBLES] });
      const legend = (name) => text($$(card, '.legend > span').find((s) => s.textContent.includes(name)));
      assert.equal(legend('Confort'), 'Confort 26°');
      // Frost protection has no value when cooling: the unit cannot use it
      assert.equal($$(card, '.legend > span').some((s) => s.textContent.includes('Hors-gel')), false);
      const comfort = $$(card, '.legend > span').find((s) => /Confort/.test(s.textContent));
      assert.equal(comfort.querySelectorAll('i').length, 1, 'no heat swatch');
    });
  });
}

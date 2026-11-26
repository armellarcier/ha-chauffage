import { COLS3_STYLE, FAN_STYLE, FIELD_BOX } from './hvac.ts';

// What opens in Home Assistant looks like a link, even without a mouse to hover it (every card)
export const LINK_STYLE = `
  .mi-link { cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px;
    text-decoration-color:rgba(127,127,127,.6); }
  .mi-link:hover, .mi-link:focus-visible { color:var(--primary-color); text-decoration:underline; }
`;

// A badge: Active, or Paused, which must be seen at a glance (Chauffage sends nothing, the thermostat
// runs by hand)
export const BADGE_STYLE = `
  .badge { display:inline-block; padding:1px 8px; border-radius:10px; font-size:12px;
    background:rgba(127,127,127,.18); color:var(--secondary-text-color); }
  .badge.on { background:rgba(67,160,71,.18); color:var(--success-color, #43a047); }
  .badge.paused { background:var(--warning-color, #ffa600); color:#000; font-weight:500; }
`;

// The box of a field typed in: a time field, a number (the more-info block, the settings dialog)

// A time field and its small arrows (the card's popovers, the more-info block). Each arrow takes
// a finger a few pixels beyond its edge, away from the other arrow.
export const TIME_FIELD_STYLE = `
  input.time { font-variant-numeric:tabular-nums; }
  .time-field { display:inline-flex; align-items:stretch; vertical-align:middle; }
  /* As wide as the longest time, counted in characters: the padding comes on top */
  .time-field input.time { border-radius:8px 0 0 8px; box-sizing:content-box; height:calc(var(--chauffage-chip-h, 34px) - 2px); padding:0 6px; }
  .time-spin { display:flex; flex-direction:column; }
  .time-step { position:relative; flex:1; width:22px; height:auto; min-height:0; padding:0; border:1px solid var(--divider-color);
    border-left:0; background:none; color:var(--primary-text-color); cursor:pointer;
    display:flex; align-items:center; justify-content:center; }
  .time-step::after { content:''; position:absolute; left:0; right:-8px; }
  .time-step:first-child { border-radius:0 8px 0 0; border-bottom:0; }
  .time-step:first-child::after { top:-8px; bottom:0; }
  .time-step:last-child { border-radius:0 0 8px 0; }
  .time-step:last-child::after { top:0; bottom:-8px; }
  .time-step svg { width:16px; height:16px; fill:currentColor; }
  /* A finger: a − and a +, each as large as a chip, as around a temperature */
  @media (pointer:coarse) {
    .time-spin { flex-direction:row-reverse; }
    .time-step { flex:none; width:var(--chauffage-chip-h, 34px); height:var(--chauffage-chip-h, 34px); font-size:16px; line-height:1; }
    .time-step::after { content:none; }
    .time-step svg { display:none; }
    .time-step[data-time-step="1"]::before { content:'+'; }
    .time-step[data-time-step="-1"]::before { content:'−'; }
    .time-step:first-child { border-radius:0 8px 8px 0; border-bottom:1px solid var(--divider-color); }
    .time-step:last-child { border-radius:0; }
  }
`;

export const STYLE = `
  :host { display:block; }
  /* The popovers of the week editor draw in the card: they lay out nothing themselves */
  chauffage-slot-popover, chauffage-override-popover { display:contents; }
  ha-card { display:block; position:relative; padding:16px; overflow:visible; }
  ha-card.flat { padding:0; background:none; border:none; box-shadow:none; --ha-card-border-width:0; }
  /* The views of the panel's pages, each its own element in the card */
  chauffage-presets-view, chauffage-schedules-view, chauffage-thermostats-view, chauffage-rules-view { display:block; }
  select, input, button { font:inherit; color:var(--primary-text-color); }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { border:1px solid var(--divider-color); background:var(--card-background-color); border-radius:16px;
    padding:6px 12px; cursor:pointer; font-size:.88em; }
  .chip .live { color:var(--secondary-text-color); font-size:.9em; margin-left:2px; }
  .chip.on { background:var(--primary-color); border-color:var(--primary-color); color:var(--text-primary-color,#fff); }
  .chip.on .live { color:inherit; opacity:.85; }
  .chip.paused .live { font-style:italic; }
  .off-note { margin:6px 0; padding:6px 10px; border-radius:8px; font-size:.9em;
    background:rgba(255,152,0,.15); color:var(--primary-text-color); }
  .paused-note { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-top:8px; padding:6px 10px;
    border-radius:8px; background:rgba(127,127,127,.12); color:var(--secondary-text-color); font-size:.9em; }
  .paused-note span { flex:1 1 180px; }
  .bar.paused .seg, .bar.unscheduled .seg { opacity:.45; }
  .th-hint { color:var(--secondary-text-color); font-size:.9em; margin:12px 8px 8px; }
  /* The list is a card of its own, as on the integration's page: the first and the last rows touch
     its edges, a line between two rows; the texts and the actions to add one sit outside it */
  .th-list { overflow:hidden; background:var(--ha-card-background, var(--card-background-color));
    border:1px solid var(--ha-card-border-color, var(--divider-color)); /* not the flat card's width: 0 */
    border-radius:var(--ha-card-border-radius, 12px); box-shadow:var(--ha-card-box-shadow, none); }
  .th-row { display:flex; align-items:center; padding-right:8px; cursor:pointer; outline:none; }
  .th-row + .th-row { border-top:1px solid var(--divider-color); }
  .th-main { flex:1 1 auto; min-width:0; display:flex; align-items:center; gap:16px; min-height:48px;
    padding:12px 8px 12px 16px; }
  .th-row:hover, .th-row:focus-visible { background:rgba(127,127,127,.08); }
  .th-row:focus-visible { outline:2px solid var(--primary-color); outline-offset:-2px; }
  .th-icon, .th-chevron { flex:none; color:var(--secondary-text-color); --mdc-icon-size:24px; }
  .th-text { flex:1 1 auto; min-width:0; }
  .th-title { font-size:14px; line-height:22px; color:var(--primary-text-color); overflow-wrap:anywhere; }
  .th-divider { flex:none; align-self:center; width:1px; height:48px; margin:0 4px; background:var(--divider-color); }
  .th-actions { flex:none; display:flex; align-items:center; gap:4px; }
  .icon-btn { flex:none; width:48px; height:48px; border:0; border-radius:50%; background:transparent; cursor:pointer;
    color:var(--secondary-text-color); --mdc-icon-size:24px; display:flex; align-items:center; justify-content:center; padding:0; }
  .icon-btn:hover, .icon-btn:focus-visible, .icon-btn.on { background:var(--secondary-background-color); color:var(--primary-text-color); }
  ${BADGE_STYLE}
  .th-row .badge { margin-left:8px; vertical-align:2px; }
  .th-cards { font-size:12px; line-height:19px; color:var(--secondary-text-color); }
  .th-cards .mi-link { color:inherit; }
  .btn.icon { min-width:36px; padding:6px 8px; }
  .btn.icon.on { border-color:var(--primary-color); color:var(--primary-color); }
  .chip-sep { width:1px; align-self:stretch; margin:2px 2px; background:var(--divider-color); }
  .chip.tool { border-style:dashed; color:var(--secondary-text-color); background:transparent; }
  .chip.tool.on { border-style:solid; border-color:var(--primary-color); color:var(--primary-color); }
  /* A schedule's sheet shows no tab: the same space under the chips */
  .no-tabs { height:12px; }
  .tabs { display:flex; gap:4px; margin:12px 0 10px; padding:3px; border-radius:10px;
    background:var(--secondary-background-color); }
  /* Many schedules: the tabs keep a minimum width and scroll sideways, the "+" stays in place */
  /* --clear: the edge left plain grey under an arrow (with a mouse), then the fade */
  .tabs-wrap { position:relative; display:flex; flex:1; min-width:0; --clear:0px; }
  /* A native scrolling area, without a scrollbar (the fades and the arrows show it) */
  .tabs-scroll { display:flex; gap:4px; flex:1; min-width:0; overflow-x:auto; scrollbar-width:none; }
  .tabs-scroll::-webkit-scrollbar { display:none; }
  /* A fade on each side where schedules are hidden; with a mouse, an arrow over it. Not on a touch
     screen, where a finger scrolls */
  .tabs-wrap.more-right .tabs-scroll { mask-image:linear-gradient(to left, transparent var(--clear), #000 calc(var(--clear) + 32px)); }
  .tabs-wrap.more-left .tabs-scroll { mask-image:linear-gradient(to right, transparent var(--clear), #000 calc(var(--clear) + 32px)); }
  .tabs-wrap.more-left.more-right .tabs-scroll { mask-image:linear-gradient(to right, transparent var(--clear),
    #000 calc(var(--clear) + 32px), #000 calc(100% - var(--clear) - 32px), transparent calc(100% - var(--clear))); }
  @media (hover:hover) { .tabs-wrap { --clear:28px; } }
  /* A plain chevron: the fade to the grey of the tabs behind it gives it its contrast */
  .tab-arrow { position:absolute; top:0; bottom:0; display:flex; align-items:center; justify-content:center;
    width:32px; padding:0; border:0; border-radius:8px; background:transparent; color:var(--secondary-text-color);
    cursor:pointer; --mdc-icon-size:20px; opacity:0; pointer-events:none; transition:opacity .15s; }
  .tab-arrow[data-tabs-scroll="left"] { left:0; }
  .tab-arrow[data-tabs-scroll="right"] { right:0; }
  .tabs-wrap.more-left .tab-arrow[data-tabs-scroll="left"], .tabs-wrap.more-right .tab-arrow[data-tabs-scroll="right"] { opacity:1; pointer-events:auto; }
  .tab-arrow:hover, .tab-arrow:focus-visible { background:var(--card-background-color); color:var(--primary-text-color); }
  @media (hover:none) { .tab-arrow { display:none; } }
  /* A tab is as wide as its name (a long one shrinks with an ellipsis), and grows when there is
     room: a short name leaves no large empty space */
  .tab { flex:1 0 auto; min-width:44px; max-width:180px; border:0; background:transparent; padding:7px 8px;
    border-radius:8px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tab.on { background:var(--card-background-color); box-shadow:0 1px 3px rgba(0,0,0,.25); font-weight:600; }
  /* An icon chosen in HA, in the line of the name: the browser aligns it with the text */
  .tab-icon { --mdc-icon-size:18px; display:inline-flex; vertical-align:middle; margin-inline-end:4px; }
  .tab-name { vertical-align:middle; }
  .tab-tool { flex:0 0 auto; border:0; background:transparent; padding:7px 9px; border-radius:8px; cursor:pointer;
    color:var(--secondary-text-color); font-weight:600; }
  .tab-tool:hover { background:var(--card-background-color); }
  .sched-menu { min-width:200px; max-width:260px; }
  .sched-menu .mi small { display:block; font-size:.85em; color:var(--secondary-text-color); }
  .sched-menu .mi.danger:not(:disabled) { color:var(--error-color,#db4437); }
  .sched-menu .mi:disabled { opacity:1; color:var(--secondary-text-color); }
  .sched-form { display:flex; flex-direction:column; gap:8px; padding:4px 14px 8px; font-size:.92em; }
  .sched-form input { padding:6px 8px; border-radius:6px; border:1px solid var(--divider-color);
    background:var(--card-background-color); }
  .sched-btns { display:flex; gap:6px; justify-content:flex-end; }
  .sched-err { color:var(--error-color,#db4437); font-size:.9em; }
  .schedule-bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px 12px;
    margin:-4px 0 10px; padding:6px 10px; border-radius:8px; font-size:.88em;
    background:var(--secondary-background-color); color:var(--secondary-text-color); }
  .schedule-bar strong { color:var(--primary-text-color); }
  .btn.small { padding:4px 10px; font-size:.95em; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px;
    background:var(--success-color,#43a047); vertical-align:middle; }

  /* Grid: day | (name) | bar | tools. Its layout follows the width of the card (a card in a
     column of a dashboard is narrow on a wide screen too) */
  .days { container-type:inline-size; }
  .scale { display:grid; grid-template-columns:var(--day-w) 1fr 28px; gap:8px; align-items:center; }
  .multi .scale { grid-template-columns:var(--day-w) fit-content(100px) 1fr 28px; }
  .dgroup { display:grid; grid-template-columns:var(--day-w) 1fr; gap:8px; align-items:center; margin:7px 0; }
  .multi .dgroup { padding-top:7px; border-top:1px solid var(--divider-color); }
  /* Today stands out among the days and thermostats: its whole row is tinted, with a border on
     each side, thicker on the left. Wider than the row (negative margin, padding minus the
     border) so that its content stays aligned with the other days */
  .dgroup.today { margin-left:-8px; margin-right:-8px; padding:5px 7px 5px 4px; border-radius:6px;
    border:1px solid var(--primary-color); border-left-width:4px; border-top-width:0; border-bottom-width:0;
    background:rgba(3,169,244,.12); background:color-mix(in srgb, var(--primary-color) 12%, transparent); }
  .multi .dgroup.today { padding-top:7px; padding-bottom:7px; }
  .multi .dgroup.today + .dgroup { border-top-color:transparent; }
  .subs { display:flex; flex-direction:column; gap:5px; }
  .sub { display:grid; grid-template-columns:1fr 28px; gap:8px; align-items:center; }
  .multi .sub { grid-template-columns:fit-content(100px) 1fr 28px; }
  .name { font-size:.78em; color:var(--secondary-text-color); overflow:hidden; white-space:nowrap; text-align:right; }
  .name .mi-link { display:block; overflow:hidden; text-overflow:ellipsis; }
  .sizer, .sizer span { display:block; height:0; visibility:hidden; }
  ${LINK_STYLE}
  .chip-open { display:inline-flex; align-items:center; justify-content:center; vertical-align:middle;
    width:24px; height:24px; margin:-4px -8px -4px 2px; border-radius:50%; opacity:.7; cursor:pointer; }
  .chip-open:hover { opacity:1; background:rgba(127,127,127,.25); }
  .chip-open svg { width:15px; height:15px; fill:currentColor; }
  .th-foot { margin:12px 8px 0; font-size:.9em; }
  .th-add { margin:16px 8px 0; }
  .th-add-title { font-weight:500; margin-bottom:8px; }
  .th-add-row { display:flex; gap:8px; align-items:center; }
  .th-add select { flex:1; min-width:0; min-height:36px; }

  .ticks { position:relative; height:16px; font-size:11px; color:var(--secondary-text-color); }
  .ticks span { position:absolute; transform:translateX(-50%); white-space:nowrap; }
  .ticks span:first-child { transform:none; }
  .ticks span:last-child { transform:translateX(-100%); }
  .day { font-size:.9em; color:var(--secondary-text-color); text-align:right; line-height:1.2; }
  .dgroup.today .day { color:var(--primary-color); font-weight:700; }
  .bar { position:relative; height:38px; border-radius:6px; background:var(--secondary-background-color);
    user-select:none; -webkit-user-select:none; }
  .h2 .bar { height:28px; }
  .h3 .bar { height:24px; }
  .seg { position:absolute; top:0; bottom:0; box-sizing:border-box; overflow:hidden; padding:2px 5px;
    color:#fff; font-size:11px; line-height:1.2; white-space:nowrap; cursor:pointer;
    display:flex; flex-direction:column; justify-content:center; text-shadow:0 1px 1px rgba(0,0,0,.25); }
  .multi .seg { flex-direction:row; align-items:center; justify-content:flex-start; gap:5px; font-size:10.5px; }
  .seg.first { border-radius:6px 0 0 6px; }
  .seg.last { border-radius:0 6px 6px 0; }
  .seg.first.last { border-radius:6px; }
  .seg .t { font-weight:600; }
  /* A label that does not fit is hidden (a time) or ends in "…" (a name), never cut into
     meaningless pieces such as "06:" */
  .seg { container-type:inline-size; }
  .seg .l { min-width:0; overflow:hidden; text-overflow:ellipsis; }
  @container (max-width:38px) { .seg .t { visibility:hidden; font-size:0; } }
  @container (max-width:44px) { .seg .l { visibility:hidden; } }
  .h12 .seg .t { white-space:nowrap; }
  @container (max-width:56px) { .h12 .seg .t { visibility:hidden; font-size:0; } }
  /* A time with a marker needs more room: hidden sooner, so the marker is never cut. A hidden
     time takes no room (font-size:0): its marker stays in sight */
  @container (max-width:54px) { .seg.marked .t { visibility:hidden; font-size:0; } }
  @container (max-width:72px) { .h12 .seg.marked .t { visibility:hidden; font-size:0; } }
  /* With several thermostats, the time and the name share one line. On a slot without a
     preset, the name wins: "⏻ Off", not "00:00 ⏻ O…" */
  @container (max-width:96px) { .multi .seg.word .t { visibility:hidden; font-size:0; } }
  .seg.sel { box-shadow:inset 0 0 0 3px var(--primary-text-color); z-index:1; }
  /* A slot's markers (#91), on the time's line ("00:00 ⏻"): the icon of its HVAC mode (off, fan
     only, cool, heat), and a mark when the slot sets the fan or the vanes. They stay even when
     the time is hidden, down to a 20 px wide segment; an off slot is grey */
  .seg .t ha-icon { --mdc-icon-size:12px; width:12px; height:12px; vertical-align:-2px; visibility:visible; }
  .seg .t:not(:empty) ha-icon { margin-left:3px; }
  .seg .t.alone ha-icon { --mdc-icon-size:14px; width:14px; height:14px; margin-left:0; }
  .seg.off { color:#fff; }
  ${FAN_STYLE}
  .legend .legend-off ha-icon, .legend .legend-mode ha-icon { --mdc-icon-size:14px; width:14px; height:14px; display:flex; flex:none; }
  /* A preset's cool color, next to its heat color */
  .legend i.cool { margin-left:-2px; }
  /* A swatch with its mark, a flame or a snowflake: the icon in white */
  .legend i.mk { display:inline-flex; align-items:center; justify-content:center; color:#fff; }
  .legend i.mk ha-icon { --mdc-icon-size:10px; width:10px; height:10px; display:flex; }
  .legend .cv { display:inline-flex; align-items:center; }
  .legend .cv ha-icon { --mdc-icon-size:12px; width:12px; height:12px; display:flex; }
  /* The fan and the vanes of a slot (#91, lot 3), folded behind a summary that looks like a
     button, with a chevron; the summary may wrap; the capture button on its own line */
  details.more summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:6px; min-height:36px;
    padding:0 10px; border:1px solid var(--divider-color); border-radius:8px; font-size:.9em; box-sizing:border-box; }
  details.more summary::-webkit-details-marker { display:none; }
  details.more summary > span { flex:1; min-width:0; overflow-wrap:anywhere; }
  details.more summary ha-icon { --mdc-icon-size:18px; width:18px; height:18px; flex:none; transition:transform .15s; }
  details.more[open] summary ha-icon { transform:rotate(180deg); }
  .more-rows { display:flex; flex-direction:column; gap:var(--chauffage-row-gap); margin-top:var(--chauffage-row-gap); }
  .more-rows.direct { margin-top:0; }
  .more-row > span { flex:none; }
  .more-row select, .pv-row select { min-width:0; text-overflow:ellipsis; }
  .capture-row { display:flex; }
  /* The icon of "Copy from the thermostat" on the line of its text */
  .btn.capture ha-icon { --mdc-icon-size:16px; width:16px; height:16px; display:flex; flex:none; }
  .pv-error { font-size:.9em; color:var(--error-color,#db4437); }
  tr.target th.name, tr.target td { background:rgba(127,127,127,.14); background:color-mix(in srgb, var(--primary-color) 14%, transparent); }
  /* "🔥 20° · ❄ 25°": each icon on the line of its number, and the same gap on both sides of "·" */
  .pv-val .m ha-icon, .pv-default .m ha-icon { --mdc-icon-size:14px; width:14px; height:14px; vertical-align:-2px; margin:0 2px 0 0; }
  .pv-val .m.tuned ha-icon { margin:0 0 0 4px; }
  /* Read-only weeks (the access level): a slot opens nothing */
  .bar.ro .seg { cursor:default; }
  .seg.movable { cursor:grab; }
  .seg.movable:active { cursor:grabbing; }
  .seg.movable.sel { touch-action:pan-y; } /* by touch, the selected slot slides sideways */
  .handle { position:absolute; top:-3px; bottom:-3px; width:18px; margin-left:-9px; z-index:2;
    cursor:ew-resize; touch-action:pan-y; } /* a vertical swipe scrolls the page (#67) */
  .handle::after { content:''; position:absolute; left:7px; top:3px; bottom:3px; width:4px; border-radius:2px;
    background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.4); }
  .tip { display:none; position:absolute; bottom:100%; left:50%; transform:translate(-50%,-2px); z-index:4;
    padding:2px 6px; border-radius:4px; font-size:11px; white-space:nowrap;
    background:var(--primary-text-color); color:var(--card-background-color); }
  /* Between two slots alike: faded and dashed, the mark of a cut the user made */
  .handle.same::after { opacity:.55; background:repeating-linear-gradient(to bottom, #fff 0 4px, transparent 4px 7px); box-shadow:none; }
  .handle:hover .tip, .handle.drag .tip { display:block; }
  .chip.tool.loading { animation:chauffage-pulse 1s ease-in-out infinite; }
  @keyframes chauffage-pulse { 50% { opacity:.4; } }
  /* Measured temperature (white) and setpoint applied (yellow, with a shadow, over it and the
     handles) of the last 7 days */
  .history { position:absolute; left:0; top:0; width:100%; height:100%; z-index:2; pointer-events:none; overflow:hidden; }
  .history path { fill:none; vector-effect:non-scaling-stroke; }
  .history .measured { stroke:#fff; stroke-width:1.5; stroke-linejoin:round; stroke-linecap:round; shape-rendering:geometricPrecision; }
  .history.setpoint { filter:drop-shadow(0 1px 1px rgba(0,0,0,.7)); }
  /* A day shown larger: its scale in degrees, the readout under the mouse or the finger (the bar
     slides with the finger instead of scrolling the page sideways) */
  ha-card .bar.zoom { height:180px; touch-action:pan-y; }
  .bar.zoom .seg { justify-content:flex-start; align-items:flex-start; padding-top:4px; }
  .bar.zoom .yaxis { position:absolute; inset:0; z-index:1; pointer-events:none; }
  .bar.zoom .yaxis i { position:absolute; left:0; right:0; border-top:1px dashed rgba(255,255,255,.35); }
  .bar.zoom .yaxis span { position:absolute; right:4px; transform:translateY(-100%); font-size:11px; color:#fff;
    text-shadow:0 1px 2px rgba(0,0,0,.8); }
  .bar.zoom .cross { position:absolute; top:0; bottom:0; width:1px; z-index:4; background:rgba(255,255,255,.8); pointer-events:none; }
  .bar.zoom .readout { position:absolute; bottom:4px; z-index:4; margin-left:6px; padding:2px 6px; border-radius:4px;
    font-size:12px; white-space:nowrap; pointer-events:none; background:rgba(0,0,0,.75); color:#fff; }
  .bar.zoom .readout.left { transform:translateX(-100%); margin-left:-6px; }
  .bar.zoom [hidden] { display:none; }
  .single .day[data-day] { cursor:pointer; }
  .history .target { stroke:#ffe14d; stroke-width:1; }
  /* The current time: one line across the thermostats of the day, each bar's line reaching the
     next bar (up to 9 px away: 24 px bars in 28 px rows, 5 px apart), with a triangle at each
     end, like a playhead */
  .now { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; z-index:5; pointer-events:none;
    color:var(--primary-text-color); background:currentColor; filter:drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
  .sub:not(:first-child) .now { top:-10px; }
  .sub:not(:last-child) .now { bottom:-10px; }
  .sub:first-child .now::before, .sub:last-child .now::after { content:''; position:absolute; left:50%; margin-left:-5px;
    border-left:5px solid transparent; border-right:5px solid transparent; }
  .sub:first-child .now::before { top:0; border-top:6px solid; }
  .sub:last-child .now::after { bottom:0; border-bottom:6px solid; }
  .ibtn { width:28px; height:28px; padding:0; display:inline-flex; align-items:center; justify-content:center;
    border:1px solid var(--divider-color); border-radius:6px; background:var(--card-background-color);
    color:var(--secondary-text-color); cursor:pointer; }
  .ibtn svg { width:16px; height:16px; fill:currentColor; }
  .ibtn:hover:not(:disabled) { color:var(--primary-color); border-color:var(--primary-color); }
  .ibtn.open { color:var(--primary-color); border-color:var(--primary-color); }
  .ibtn:disabled { opacity:.35; cursor:default; }
  /* A day with nothing to offer keeps its place in the grid */
  .ibtn.none { visibility:hidden; }
  .bar.clipsrc { outline:2px dashed var(--primary-color); outline-offset:2px; }
  .menu { position:absolute; z-index:12; min-width:230px; padding:6px 0; border-radius:10px;
    background:var(--card-background-color); border:1px solid var(--divider-color);
    box-shadow:0 6px 20px rgba(0,0,0,.25); }
  .mh { padding:4px 14px 6px; font-size:.78em; color:var(--secondary-text-color); }
  .mi { display:flex; align-items:center; gap:10px; width:100%; padding:8px 14px; border:0; background:transparent;
    text-align:left; cursor:pointer; font-size:.92em; }
  .mi:hover:not(:disabled) { background:var(--secondary-background-color); }
  .mi:disabled { opacity:.4; cursor:default; }
  .mi svg { width:16px; height:16px; fill:currentColor; flex:none; }
  .mi:not(:has(svg)) span { padding-left:26px; }
  .mi small { display:block; font-size:.8em; color:var(--secondary-text-color); }
  .sep { height:1px; margin:5px 0; background:var(--divider-color); }
  .hint { margin-top:10px; font-size:.8em; color:var(--secondary-text-color); }
  .editor { position:absolute; z-index:11; visibility:hidden; box-sizing:border-box; width:max-content; max-width:min(500px, calc(100% - 16px));
    padding:10px 12px; border-radius:10px; background:var(--card-background-color);
    border:1px solid var(--divider-color); box-shadow:0 6px 20px rgba(0,0,0,.25);
    display:flex; flex-direction:column; gap:var(--chauffage-row-gap); }
  /* No room above nor below its row: only the body scrolls. Its head and its buttons stay in
     sight, and the popover does not clip its caret. Its padding leaves room for the ring of a
     chip at its edges. A shadow shows on the side where there is more: the covers scroll with
     the content (local), the shadows stay with the view (scroll) */
  .ed-body { display:flex; flex-direction:column; gap:var(--chauffage-row-gap); min-height:0; overflow-y:auto;
    overscroll-behavior:contain; padding:4px; margin:-4px;
    background:linear-gradient(var(--card-background-color) 30%, transparent) top / 100% 24px no-repeat local,
      linear-gradient(transparent, var(--card-background-color) 70%) bottom / 100% 24px no-repeat local,
      radial-gradient(farthest-side at 50% 0, rgba(0,0,0,.3), transparent) top / 100% 10px no-repeat scroll,
      radial-gradient(farthest-side at 50% 100%, rgba(0,0,0,.3), transparent) bottom / 100% 10px no-repeat scroll; }
  .editor > .ed-head, .editor > .ed-actions { flex:none; }
  .editor.placed { visibility:visible; }
  .editor::before { content:''; position:absolute; top:-7px; left:var(--caret,50%); width:12px; height:12px;
    margin-left:-6px; transform:rotate(45deg); background:var(--card-background-color);
    border-left:1px solid var(--divider-color); border-top:1px solid var(--divider-color); }
  .editor.above::before { top:auto; bottom:-7px; border:0;
    border-right:1px solid var(--divider-color); border-bottom:1px solid var(--divider-color); }
  /* Override (temporary setpoint) drawn over the schedule */
  .override { position:absolute; top:3px; bottom:3px; z-index:3; box-sizing:border-box; overflow:visible;
    border-radius:4px; cursor:pointer; color:#fff; font-size:10.5px; font-weight:600; white-space:nowrap;
    display:flex; align-items:center; padding:0 6px; border:2px solid #fff;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px);
    box-shadow:0 1px 4px rgba(0,0,0,.35); text-shadow:0 1px 1px rgba(0,0,0,.4); }
  .override { container-type:inline-size; }
  .override .override-label { display:inline-flex; align-items:center; gap:3px; overflow:hidden; }
  .override .override-label .rest { display:inline-flex; align-items:center; gap:3px; }
  /* The label of an override next to its block, where the block is narrower than the label */
  .override-tag { position:absolute; top:50%; left:calc(100% + 12px); transform:translateY(-50%); display:none; align-items:center;
    gap:3px; padding:1px 5px; border-radius:4px; border:1px solid #fff; background:#7b1fa2; line-height:1.3; }
  .override-tag.before { left:auto; right:calc(100% + 4px); }
  /* No room on either side without covering a slot's name: a flag above the bar */
  .override-tag.above { top:auto; bottom:calc(100% - 1px); left:-2px; transform:none; }
  .override-tag.above.end { left:auto; right:-2px; }
  .override-tag ha-icon, .override-label ha-icon { --mdc-icon-size:12px; width:12px; height:12px; display:flex; flex:none; }
  /* The width of "⏱ ⏻ → 17:00" in a block, and of "⏱ ⏻ → sam. 08:00"; then on a 12 h clock */
  @container (max-width:70px) { .override.last .override-label { display:none; } .override.last .override-tag { display:inline-flex; }
    .override:not(.last) .override-label .rest { display:none; } }
  @container (max-width:92px) { .override.last.dated .override-label { display:none; } .override.last.dated .override-tag { display:inline-flex; }
    .override.dated:not(.last) .override-label .rest { display:none; } }
  @container (max-width:90px) { .h12 .override.last .override-label { display:none; } .h12 .override.last .override-tag { display:inline-flex; }
    .h12 .override:not(.last) .override-label .rest { display:none; } }
  @container (max-width:112px) { .h12 .override.last.dated .override-label { display:none; } .h12 .override.last.dated .override-tag { display:inline-flex; }
    .h12 .override.dated:not(.last) .override-label .rest { display:none; } }
  .override.sel { outline:2px solid var(--primary-text-color); outline-offset:1px; }
  .override-handle { position:absolute; top:-6px; bottom:-6px; right:-10px; width:18px; cursor:ew-resize; touch-action:none; }
  .override-handle::after { content:''; position:absolute; left:6px; top:3px; bottom:3px; width:6px; border-radius:3px;
    background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.45); }
  .override-handle:hover .tip, .override-handle.drag .tip { display:block; }
  .override-value { padding:2px 8px; border-radius:6px; color:#fff; font-weight:600;
    background:repeating-linear-gradient(135deg, #7b1fa2 0 6px, #9c4dcc 6px 12px); }
  .muted { font-size:.85em; color:var(--secondary-text-color); }
  .ed-actions.start { margin-left:0; flex-wrap:wrap; }
  .btn.danger { color:var(--error-color,#db4437); border-color:var(--error-color,#db4437); }
  .ed-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; }
  .ed-head .close { margin-left:auto; }
  /* Close stays at the top right of a popover, whatever wraps in its header. A slot's times
     stay together: on a phone, the slot's name on the first line, its times on the second one */
  .editor > .ed-head:first-child { padding-right:42px; min-height:34px; }
  .editor > .ed-head:first-child > .close { position:absolute; top:10px; right:12px; margin:0; }
  .ed-times { height:var(--chauffage-chip-h); display:inline-flex; align-items:center; gap:12px; flex:none; white-space:nowrap; }
  .ed-times label { height:var(--chauffage-chip-h); display:inline-flex; align-items:center; gap:4px; line-height:1; }
  .temp-label { flex:none; }
  .ed-measured { font-size:12px; color:var(--secondary-text-color); }
  .editor input[type=text], .sched-menu input[type=text] { ${FIELD_BOX} }
  /* The buttons of a popover: as high as a chip, at its text size */
  .editor .btn { box-sizing:border-box; height:var(--chauffage-chip-h); min-height:0; padding:0 10px; font-size:13px; line-height:1;
    display:inline-flex; align-items:center; justify-content:center; gap:6px; }
  .editor .btn.icon { min-width:var(--chauffage-chip-h); }
  ${TIME_FIELD_STYLE}
  ${COLS3_STYLE('.narrow ')}
  .fixed { font-variant-numeric:tabular-nums; padding:0 4px; }
  .ed-actions { display:flex; gap:6px; margin-left:auto; }
  .btn { border:1px solid var(--divider-color); background:var(--card-background-color); padding:6px 12px;
    border-radius:8px; cursor:pointer; }
  .btn.icon { padding:6px 10px; }
  .btn.primary { background:var(--primary-color); color:var(--text-primary-color,#fff); border-color:transparent; }
  .btn:disabled { opacity:.4; cursor:default; }
  .foot { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-top:14px; }
  .legend { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:.85em; color:var(--secondary-text-color); }
  /* Each entry lays out its swatch, its icon and its text on one line; one swatch size */
  .legend > span { display:inline-flex; align-items:center; gap:4px; }
  .legend i { display:inline-block; width:14px; height:14px; border-radius:3px; flex:none; box-sizing:border-box; }
  .actions { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .copyweek { max-width:260px; text-align:left; }
  .copyweek-menu { overflow-y:auto; }
  .msg { min-height:1.2em; margin-top:6px; font-size:.85em; color:var(--secondary-text-color); text-align:right; }
  ha-card.flat .msg:empty { min-height:0; margin:0; }
  .dirty { color:var(--warning-color,#ff9800); }
  /* Unsaved edits of the weeks: a bar at the foot of the card, kept at the bottom of the window
     while the card scrolls */
  .savebar { position:sticky; bottom:0; z-index:10; display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end;
    gap:8px; margin:10px -16px -16px; padding:10px 16px; border-top:1px solid var(--divider-color);
    background:var(--ha-card-background, var(--card-background-color)); box-shadow:0 -4px 12px rgba(0,0,0,.15);
    border-radius:0 0 var(--ha-card-border-radius,12px) var(--ha-card-border-radius,12px); }
  .savebar .dirty { margin-right:auto; font-size:.9em; }
  .loading { color:var(--secondary-text-color); }
  .legend .settings-link { white-space:nowrap; }
  .chips.with-open { position:relative; padding-right:44px; }
  .panel-open { position:absolute; top:0; right:0; display:flex; align-items:center; justify-content:center;
    width:36px; height:36px; border:0; border-radius:50%; background:transparent; color:var(--secondary-text-color);
    cursor:pointer; --mdc-icon-size:22px; }
  .panel-open:hover, .panel-open:focus-visible { background:var(--secondary-background-color); color:var(--primary-color); }
  /* Many presets stay on one line: the table scrolls sideways, the names of the thermostats stay */
  .table-wrap { overflow-x:auto; }
  /* A table wider than the screen says so: a fade and a chevron on the side with more to see, a
     shadow along the names once it is scrolled (_tableCue) */
  .table-outer { position:relative; }
  .table-outer::after { content:'›'; position:absolute; top:0; right:0; bottom:0; width:30px; z-index:2; pointer-events:none;
    display:flex; align-items:center; justify-content:flex-end; font-size:24px; line-height:1; color:var(--primary-text-color);
    background:linear-gradient(to right, transparent, var(--ha-card-background, var(--card-background-color)) 75%);
    opacity:0; transition:opacity .15s; }
  .table-outer.more-right::after { opacity:1; }
  .table-outer.more-left .pv-table th.name, .table-outer.more-left .pv-table thead th:first-child { box-shadow:6px 0 6px -4px rgba(0,0,0,.3); }
  .pv-list { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:8px; }
  .pv-list .cell { align-items:flex-start; min-width:0; box-sizing:border-box; padding:8px 10px; gap:2px;
    border-color:var(--divider-color); text-align:left; }
  .pv-list .pv-val { font-size:1.2em; }
  .pv-intro { margin:0 0 10px; }
  .pv-table { border-collapse:separate; border-spacing:0; width:100%; font-size:.9em; }
  .pv-table th, .pv-table td { padding:2px; text-align:center; white-space:nowrap; }
  .pv-table thead th { border-bottom:1px solid var(--divider-color); padding-bottom:6px; }
  /* The names stay in place while the table scrolls sideways (narrow screens) */
  .pv-table th.name { position:sticky; left:0; z-index:1; text-align:left; font-weight:500; padding-right:10px;
    font-size:1em; color:var(--primary-text-color); overflow:visible;
    background:var(--ha-card-background, var(--card-background-color)); }
  .pv-table thead th:first-child { position:sticky; left:0; z-index:1; background:var(--ha-card-background, var(--card-background-color)); }
  .cell { display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; width:100%; min-width:76px;
    padding:5px 6px; border:1px solid transparent; border-radius:6px; background:transparent; font:inherit; color:inherit; }
  button.cell { cursor:pointer; }
  button.cell:hover, .cell.on { border-color:var(--divider-color); background:var(--secondary-background-color); }
  .cell.on, button.cell.on { border-color:var(--primary-color); }
  .pv-pname { display:inline-flex; align-items:center; gap:5px; font-weight:600; }
  .pv-pname i { display:inline-block; width:10px; height:10px; border-radius:3px; }
  .pv-default, .pv-how { font-size:.8em; color:var(--secondary-text-color); font-weight:normal; }
  .pv-val { font-weight:600; font-variant-numeric:tabular-nums; }
  .cell.default .pv-val { font-weight:normal; color:var(--secondary-text-color); }
  .pv-note { margin-top:6px; }
  .pv-add { margin-top:10px; }
  .pv-device { font-size:.9em; }
  .pv-foot .pv-del { margin-right:auto; }
  .rules-view { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
  .rules-try { color:var(--primary-color); white-space:nowrap; }
  .rule { padding:8px 10px; border-radius:10px; border:1px solid var(--divider-color); display:flex; flex-direction:column; gap:6px; }
  .rule-head { display:flex; align-items:center; gap:8px; }
  .rule-num { font-weight:500; }
  .rule-state { font-size:.78em; padding:1px 8px; border-radius:10px; background:var(--secondary-background-color); color:var(--secondary-text-color); }
  .rule-state.true { background:var(--success-color,#43a047); color:#fff; }
  .rule-state.error { background:var(--error-color,#db4437); color:#fff; }
  .rule-tools { margin-left:auto; display:flex; gap:4px; }
  .rule textarea { width:100%; box-sizing:border-box; font-family:var(--code-font-family,monospace); font-size:.85em;
    padding:6px; border-radius:6px; border:1px solid var(--divider-color); background:var(--card-background-color);
    color:var(--primary-text-color); resize:vertical; }
  .rule-then { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:.9em; }
  .rule-then select { padding:4px 6px; border-radius:6px; border:1px solid var(--divider-color); max-width:100%;
    background:var(--card-background-color); color:var(--primary-text-color); }
  .rule-result { font-size:.8em; color:var(--secondary-text-color); overflow-wrap:anywhere; }
  .rule-result.error { color:var(--error-color,#db4437); }
  .rules-outcome { font-size:.9em; }
  /* Popover of a preset cell: a grid of lines (label, then its field on the right), OK at the foot */
  .cell-ed { gap:12px; width:min(380px, calc(100% - 16px)); }
  .cell-ed .ed-head strong { display:flex; align-items:center; gap:8px; }
  /* A list is a field like the others: a grey one reads as disabled */
  .cell-ed select { ${FIELD_BOX} max-width:100%; }
  .cell-ed input[type=color] { box-sizing:border-box; width:40px; height:var(--chauffage-chip-h); padding:0 2px; flex:none; }
  .cell-ed input[type=radio], .cell-ed input[type=checkbox] { padding:0; margin:0; }
  .pv-dot { width:12px; height:12px; border-radius:3px; flex:none; }
  /* A choice's label stays on one line; its field takes the rest (a list too long ends in "…") */
  .pv-choices { display:flex; flex-direction:column; gap:10px; }
  /* One row per answer (#91): the default, its own preset, a temperature. Its radio and its
     label on one line, its field after them; at a phone's width the field goes to the next
     line, on the right */
  .pv-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; min-height:30px; cursor:pointer; }
  .pv-row > span:not(.pv-field) { min-width:0; overflow-wrap:anywhere; }
  .pv-row > input[type=radio] { width:18px; height:18px; margin:0; cursor:pointer; flex:none; }
  .pv-row .pv-field { flex:1 1 auto; justify-content:flex-end; }
  /* On an air conditioner that heats and cools: "When heating" over the rows, "When cooling"
     over its field */
  .pv-when { display:flex; align-items:center; gap:6px; font-weight:600; font-size:.9em; }
  .pv-when ha-icon { --mdc-icon-size:16px; width:16px; height:16px; }
  .pv-cool { cursor:default; }
  .pv-field { margin-left:auto; min-width:0; display:flex; justify-content:flex-end; }
  .pv-fields { display:grid; grid-template-columns:auto 1fr; align-items:center; gap:10px 12px; }
  .pv-fields > .pv-temp { justify-self:end; }
  .pv-name { display:flex; align-items:center; gap:6px; }
  .pv-name input[type=text] { flex:1; min-width:0; }
  .pv-delete { display:flex; flex-direction:column; gap:8px; }
  .pv-replace { display:flex; align-items:center; gap:8px; color:var(--secondary-text-color); }
  .pv-foot { margin-left:0; justify-content:flex-end; padding-top:10px; border-top:1px solid var(--divider-color); }
  .missing { color:var(--secondary-text-color); padding:16px; }
  .missing .btn { margin-top:12px; }
  /* Several thermostats: the day's name above its rows, so that the bars get the width; beside
     them only on a wide card */
  @container (max-width:699px) {
    .multi .scale { grid-template-columns:fit-content(100px) 1fr 28px; }
    .multi .scale > div:first-child { display:none; }
    .multi .dgroup { grid-template-columns:1fr; gap:4px; }
    .multi .day { text-align:left; font-weight:500; }
  }
  @container (max-width:499px) {
    .multi .scale { grid-template-columns:fit-content(60px) 1fr 28px; }
    .dgroup { grid-template-columns:min(var(--day-w), 56px) 1fr; }
    .multi .sub { grid-template-columns:fit-content(60px) 1fr 28px; }
    .sub { grid-template-columns:1fr 28px; }
    .scale { grid-template-columns:min(var(--day-w), 56px) 1fr 28px; }
    .ticks .minor { display:none; }
  }
  /* On a touch screen, the hint speaks of a finger */
  .hint .touch { display:none; }
  @media (hover:none), (pointer:coarse) {
    .hint .mouse { display:none; }
    .hint .touch { display:inline; }
  }
  @media (hover:none) {
    /* A finger: the chip's ↗ gets a larger target, so a tap beside it does not pick the chip */
    .chip-open { width:32px; height:32px; margin:-8px -10px -8px 0; }
  }
`;

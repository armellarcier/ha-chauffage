// Faux Home Assistant pour le banc de test (chargé AVANT la carte).
// Expose sur window : states, events, hass, pushHass(), openMoreInfo(), closeMoreInfo(), setMode().

// --- Faux ha-card : comme le vrai (Lit), il rend son <slot> en différé ---
customElements.define('ha-card', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.updateComplete = new Promise((res) => setTimeout(() => {
      this.shadowRoot.innerHTML = '<style>:host{display:block;background:#fff;border-radius:12px;box-shadow:0 2px 4px rgba(0,0,0,.15)}</style><slot></slot>';
      res(true);
    }, 30));
  }
});

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const climate = (name, a) => ({ state: 'heat', attributes: { friendly_name: name, ...a }, last_updated: '0' });
const semaine = ['00:00 eco', '06:30 comfort', '08:30 eco', '17:30 comfort', '22:30 eco'];
const weekend = ['00:00 eco', '08:00 comfort', '23:00 eco'];

const states = {
  'input_select.mode_chauffage': { state: 'Normal', attributes: { options: ['Normal', 'Absent', 'Vacances'] }, last_updated: '0' },
  'climate.salon': climate('Salon', { current_temperature: 20.4, temperature: 21.5, preset_mode: 'none', comfort_temp: 20, eco_temp: 17, boost_temp: 22, frost_temp: 7 }),
  'climate.bureau': climate('Bureau', { current_temperature: 19.1, temperature: 22, preset_mode: 'boost' }),
  'climate.chambre': climate('Chambre', { current_temperature: 18, temperature: 17, preset_mode: 'eco' }),
  'sensor.programmes_chauffage': { state: 'x', last_updated: '0', attributes: { programmes: {
    'climate.salon': { Normal: [semaine, semaine, semaine, semaine, semaine, weekend, weekend] },
    'climate.bureau': { Normal: Array(7).fill(['00:00 eco', '07:00 comfort', '21:00 eco']) },
  } } },
  'sensor.derogations_chauffage': { state: 'x', last_updated: '0', attributes: { derogations: {
    'climate.salon': { type: 'temp', valeur: 21.5, debut: iso(now - 30 * 60000), fin: iso(now + 90 * 60000) },
    'climate.bureau': { type: 'preset', valeur: 'boost', debut: iso(now - 10 * 60000), fin: iso(now + 30 * 3600000) },
  } } },
};

let stamp = 1;
const events = [];

// Diffuse un nouvel objet hass (nouvelles références = changement détecté par la carte)
function pushHass() {
  window.hass = { ...window.hass, states: { ...states } };
  if (window.card) window.card.hass = window.hass;
  const ha = document.querySelector('home-assistant');
  if (ha) ha.hass = window.hass;
}

// Simule HA : les événements de la carte mettent à jour les capteurs template
async function callWS(msg) {
  events.push(msg);
  if (msg.type !== 'fire_event') return;
  setTimeout(() => {
    if (msg.event_type === 'chauffage_derogation_set') {
      const d = { ...states['sensor.derogations_chauffage'].attributes.derogations };
      if (msg.event_data.derogation) d[msg.event_data.climate] = msg.event_data.derogation;
      else delete d[msg.event_data.climate];
      states['sensor.derogations_chauffage'] = { state: 'x', last_updated: String(stamp++), attributes: { derogations: d } };
    } else if (msg.event_type === 'chauffage_programmes_set') {
      states['sensor.programmes_chauffage'] = { state: 'x', last_updated: String(stamp++), attributes: { programmes: msg.event_data.programmes } };
    }
    pushHass();
  }, 100);
}

// Simulates the HA services used by the card
async function callService(domain, service, data) {
  events.push({ type: 'call_service', domain, service, data });
  if (domain === 'input_select' && service === 'select_option') {
    const id = data.entity_id;
    states[id] = { ...states[id], state: data.option, last_updated: String(stamp++) };
    setTimeout(pushHass, 100);
  }
}

window.states = states;
window.events = events;
window.hass = { states, callWS, callService };
window.pushHass = pushHass;
window.setMode = (m) => { states['input_select.mode_chauffage'] = { ...states['input_select.mode_chauffage'], state: m, last_updated: String(stamp++) }; pushHass(); };

// --- Maquette de la fenêtre de détail : <home-assistant> > ha-more-info-dialog > ha-more-info-info ---
const ha = document.createElement('home-assistant');
ha.attachShadow({ mode: 'open' });
ha.hass = window.hass;
const dlg = document.createElement('ha-more-info-dialog');
dlg.attachShadow({ mode: 'open' });
dlg.shadowRoot.innerHTML = '<div class="d" style="display:none;width:420px;padding:16px;border:1px solid #ccc;border-radius:16px;background:#fff;margin-bottom:20px"><h3 class="t"></h3><div class="c"></div></div>';
const info = document.createElement('ha-more-info-info');
info.attachShadow({ mode: 'open' });
info.shadowRoot.innerHTML = '<div style="height:60px;background:#eee;border-radius:8px;display:flex;align-items:center;justify-content:center">[commandes du thermostat]</div>';
dlg.shadowRoot.querySelector('.c').appendChild(info);
ha.shadowRoot.appendChild(dlg);
document.addEventListener('DOMContentLoaded', () => document.body.prepend(ha));

// Comme le vrai HA : tout événement hass-more-info (tuile, carte…) ouvre la fenêtre de détail
window.addEventListener('hass-more-info', (e) => {
  const id = e.detail && e.detail.entityId;
  if (!id) return;
  dlg._entityId = id;
  dlg.shadowRoot.querySelector('.d').style.display = '';
  dlg.shadowRoot.querySelector('.t').textContent = `${states[id]?.attributes.friendly_name || id} (détail simulé)`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
window.openMoreInfo = (id) => {
  document.body.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: id } }));
};
window.closeMoreInfo = () => {
  dlg._entityId = undefined;
  dlg.shadowRoot.querySelector('.d').style.display = 'none';
};

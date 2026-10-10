// Mounts the card in the test harness (loaded AFTER the card).
const card = document.createElement('chauffage-programme-card');
card.setConfig({
  show: 'all',
  thermostats: ['climate.salon', 'climate.bureau', { entity: 'climate.chambre', name: 'Chambre parents' }],
});
document.body.appendChild(card);
card.hass = window.hass;
window.card = card;

// Monte la carte dans le banc de test (chargé APRÈS la carte).
const card = document.createElement('chauffage-programme-card');
card.setConfig({
  show: 'all',
  thermostats: ['climate.salon', 'climate.bureau', { entity: 'climate.chambre', name: 'Chambre parents' }],
});
document.body.appendChild(card);
card.hass = window.hass;
window.card = card;

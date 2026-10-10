# ha-chauffage

Programmes de chauffe hebdomadaires pour **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)** dans Home Assistant :

- 3 modes (Normal / Absent / Vacances), un programme sur 7 jours par thermostat et par mode ;
- carte Lovelace d'édition visuelle (`custom:chauffage-programme-card`) : glisser les horaires,
  copier / coller des journées, plusieurs thermostats par journée ;
- **dérogations** : une consigne changée à la main devient temporaire (2 h par défaut),
  visible et ajustable sur la carte et dans la fenêtre de détail du thermostat,
  puis le thermostat reprend son programme.

## Installation

1. Copier `www/*` dans `<config>/www/chauffage/` et `packages/chauffage/*` dans
   `<config>/packages/chauffage/` (ou `scripts/deploy.sh <config>`).
2. Dans `configuration.yaml` :
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   frontend:
     extra_module_url:
       - /local/chauffage/chauffage-loader.js
   recorder:
     exclude:
       entities:
         - sensor.programmes_chauffage
         - sensor.derogations_chauffage
         - sensor.suivi_vannes_chauffage
   ```
3. Redémarrer HA, puis ajouter la carte :
   ```yaml
   type: custom:chauffage-programme-card
   thermostats:
     - entity: climate.salon
       name: Salon
   ```

Les thermostats sont des entités **Versatile Thermostat** (presets `comfort`, `eco`, `boost`, `frost`).
Le mode actif se choisit avec `input_select.mode_chauffage`.

## Structure

```
packages/chauffage/chauffage.yaml   capteurs template + automatisations (package HA)
www/chauffage-loader.js             chargeur stable (charge toujours la dernière version de la carte)
www/chauffage-programme-card.js     carte Lovelace + bloc injecté dans la fenêtre de détail
dev/harness.html, dev/*.js          banc de test hors HA (faux hass, faux ha-card, faux dialogue)
dev/compose.yaml, dev/hass/         HA de développement jetable (VTherm + pièces simulées)
scripts/                            reload.sh, logs.sh, deploy.sh
deploy/pre-receive                  hook pour déployer par git push
```

Développement et déploiement : voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture

- `sensor.programmes_chauffage` (template, déclenché par l'événement `chauffage_programmes_set`
  envoyé par la carte) : `{climate: {mode: [7 × ["HH:MM preset", …]]}}`.
- `sensor.derogations_chauffage` (événement `chauffage_derogation_set`, envoyé par la carte
  ou par la détection) : `{climate: {type, valeur, debut, fin}}` ; `derogation: null` = suppression.
- `sensor.suivi_vannes_chauffage` : consigne / preset des thermostats présents dans les programmes ;
  déclencheur de la détection des changements manuels (aucune liste d'entités à maintenir).
- Automatisation **programmes hebdomadaires** : applique le preset du créneau (chaque minute,
  au changement de mode, à l'enregistrement d'un programme, au démarrage), ignore les thermostats
  en dérogation, rétablit le programme à l'échéance.
- Automatisation **dérogation manuelle** : un changement de consigne / preset qui ne vient pas
  d'une automatisation (`context.parent_id` vide) crée une dérogation.

Pièges connus (déjà gérés) : templates multi-lignes → `{%- -%}` sinon HA ne relit pas le
dictionnaire ; presets ZHA sous forme d'Enum → convertis en texte ; dates avec microsecondes
refusées par Safari ; `ha-card` rendu en différé (positionnement des fenêtres flottantes) ;
une vanne Zigbee injoignable n'interrompt pas l'application du programme aux autres.

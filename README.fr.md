# ha-chauffage

[English](README.md) · **Français**

![Édition des plannings, une dérogation et le mode de chauffe, puis la fenêtre de détail du thermostat](docs/demo.gif)

Plannings de chauffe hebdomadaires pour Home Assistant, pour les thermostats à presets
comme **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(projet indépendant, sans lien avec Versatile Thermostat) :

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

Le mode actif est `input_select.mode_chauffage` : il se change depuis la carte (ouvrir l'onglet
du mode, puis « Activer ») ou depuis n'importe quelle automatisation (présence, calendrier…).

### Thermostats compatibles

Le planning applique des **presets** (`comfort`, `eco`, `boost`, `frost`) et la détection des
réglages manuels s'appuie sur le passage du thermostat en preset `none` quand on change sa
consigne à la main. C'est le comportement de **Versatile Thermostat**, la configuration testée.
Un thermostat qui n'a pas ces presets n'est pas encore pris en charge.

La dépendance à Versatile Thermostat est **temporaire** : l'objectif est de prendre en charge
n'importe quelle entité `climate`, avec des groupes de thermostats et des modes de chauffage
définis par l'utilisateur, et une interface dans la langue de chacun. Voir la
[feuille de route](ROADMAP.fr.md).

## Structure

```
packages/chauffage/chauffage.yaml   capteurs template + automatisations (package HA)
www/chauffage-loader.js             chargeur stable (charge toujours la dernière version de la carte)
www/chauffage-programme-card.js     carte Lovelace + bloc injecté dans la fenêtre de détail
dev/harness.html, dev/*.js          banc de test hors HA (faux hass, faux ha-card, faux dialogue)
dev/compose.yaml, dev/hass/         HA de développement jetable (VTherm + pièces simulées)
tests/ha/, tests/js/                 tests automatisés (pytest + HA en mémoire, node --test + jsdom)
scripts/                            test.sh, reload.sh, logs.sh, deploy.sh
deploy/pre-receive                  hook pour déployer par git push
```

Développement et déploiement : voir [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md).

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

Pièges connus (déjà gérés, couverts par les tests) : presets ZHA sous forme d'Enum → convertis
en texte (sinon HA stocke tout l'attribut du capteur sous forme de texte illisible) ; dates avec microsecondes
refusées par Safari ; `ha-card` rendu en différé (positionnement des fenêtres flottantes) ;
une vanne Zigbee injoignable n'interrompt pas l'application du programme aux autres.

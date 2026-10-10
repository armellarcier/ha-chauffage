# ha-chauffage

Programmes de chauffe hebdomadaires pour **Versatile Thermostat** dans Home Assistant :

- 3 modes (Normal / Absent / Vacances), un programme sur 7 jours par thermostat et par mode ;
- carte Lovelace d'édition visuelle (`custom:chauffage-programme-card`) ;
- **dérogations** : une consigne changée à la main devient temporaire (2 h par défaut),
  visible et ajustable sur la carte et dans la fenêtre de détail du thermostat,
  puis le thermostat reprend son programme.

## Structure

```
packages/chauffage/chauffage.yaml   capteurs template + automatisations (package HA)
www/chauffage-loader.js             chargeur stable, référencé une fois dans configuration.yaml
www/chauffage-programme-card.js     carte Lovelace + bloc injecté dans la fenêtre de détail
dev/                                banc de test hors HA (faux hass, faux ha-card, faux dialogue)
scripts/reload.sh                   vérifie la config HA et recharge template / automations
scripts/logs.sh                     fin du journal HA (filtré sur le projet)
```

## Installation (NAS OMV, HA sous Docker)

Le dépôt vit dans `/srv/ha-chauffage` et ses dossiers sont **montés** dans le conteneur
(pas de copie, pas de lien symbolique : une modification du dépôt est vue immédiatement).

1. **Montages** — OMV → Services → Compose → Files → homeassistant, dans `volumes:` :
   ```yaml
   - /srv/ha-chauffage/www:/config/www/chauffage:ro
   - /srv/ha-chauffage/packages/chauffage:/config/packages/chauffage:ro
   ```
   puis « Up » pour recréer le conteneur. Monter des **dossiers**, pas des fichiers
   (un fichier monté seul reste figé quand git le remplace).

2. **configuration.yaml** :
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

3. **Jeton API** (pour les scripts) : profil HA → Sécurité → jeton longue durée, puis
   ```bash
   cp .env.example .env && chgrp hadev .env && chmod 640 .env   # et renseigner HA_TOKEN
   ```

4. **Carte** :
   ```yaml
   type: custom:chauffage-programme-card
   thermostats:
     - entity: climate.salon
       name: Salon
   ```

## Boucle de développement

| Je modifie… | Pour l'appliquer |
|---|---|
| `www/*.js` | recharger la page (le chargeur détecte la nouvelle version) |
| `packages/…/chauffage.yaml` | `scripts/reload.sh` (vérification + rechargement, sans redémarrage) |
| `configuration.yaml`, montages | redémarrer HA |

Tester la carte sans HA : `python3 -m http.server 8000` à la racine, puis `/dev/harness.html`.

## Architecture

- `sensor.programmes_chauffage` (template, déclenché par l'événement `chauffage_programmes_set`
  envoyé par la carte) : `{climate: {mode: [7 × ["HH:MM preset", …]]}}`.
- `sensor.derogations_chauffage` (événement `chauffage_derogation_set`, envoyé par la carte
  ou par la détection) : `{climate: {type, valeur, debut, fin}}` ; `derogation: null` = suppression.
- `sensor.suivi_vannes_chauffage` : consigne / preset des thermostats présents dans les programmes ;
  sert de déclencheur à la détection des changements manuels (pas de liste d'entités à maintenir).
- Automatisation **programmes hebdomadaires** : applique le preset du créneau (chaque minute,
  au changement de mode, à l'enregistrement d'un programme, au démarrage), ignore les thermostats
  en dérogation, rétablit le programme à l'échéance.
- Automatisation **dérogation manuelle** : un changement de consigne / preset qui ne vient pas
  d'une automatisation (`context.parent_id` vide) crée une dérogation.

Pièges connus (déjà gérés) : templates multi-lignes → `{%- -%}` sinon HA ne relit pas le
dictionnaire ; presets ZHA sous forme d'Enum → convertis en texte ; dates avec microsecondes
refusées par Safari ; `ha-card` rendu en différé (positionnement des popovers).

## Accès

Le compte `claude` (clé SSH dédiée, groupe `hadev`) n'a accès en écriture qu'à ce dépôt ;
ni sudo, ni Docker, ni accès à `/docker/homeassistant`. Rechargements et journaux passent par l'API HA.

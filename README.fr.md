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

Depuis la v0.2, ha-chauffage est une **intégration Home Assistant** configurée depuis
l'interface : aucun YAML à modifier. La version 0.1 était un package YAML ; la
[mise à jour](#mise-à-jour-depuis-le-package-v01) importe ses données automatiquement.

1. Dans HACS : ⋮ → *Dépôts personnalisés* → `https://github.com/armellarcier/ha-chauffage`,
   type *Intégration* ; installer **ha-chauffage** puis redémarrer Home Assistant. (Tant que la
   v0.2 est en bêta, activer *Afficher les versions bêta* sur le dépôt dans HACS.)
2. Paramètres → Appareils et services → *Ajouter une intégration* → **Chauffage**.
3. Ajouter la carte à un tableau de bord (elle est servie par l'intégration : aucune ressource à
   ajouter) :
   ```yaml
   type: custom:chauffage-programme-card
   thermostats:
     - entity: climate.salon
       name: Salon
   ```
   La carte suit la langue et les formats de l'utilisateur (12 / 24 h, séparateur décimal, premier
   jour de la semaine) ; l'anglais et le français sont disponibles, et `language: en` ou
   `language: fr` en force un.

Nécessite Home Assistant 2026.9 ou plus récent.

### Ce que fournit l'intégration

- Un sélecteur **Mode de chauffage** (`select.chauffage_mode`) : il se change depuis la
  carte (ouvrir l'onglet du mode, puis « Activer ») ou depuis n'importe quelle automatisation
  (présence, calendrier…).
- Pour chaque thermostat programmé, deux capteurs **désactivés par défaut** (à activer depuis la
  page de l'appareil du thermostat) : **Programme** (preset prévu maintenant, plage suivante en
  attributs) et **Fin de dérogation** (horodatage, utilisable comme déclencheur horaire).
- Les services `chauffage.set_override` (température ou preset pour une durée ou jusqu'à une
  heure) et `chauffage.clear_override`.
- Les options (Paramètres → Appareils et services → Chauffage → *Configurer*) : durée des
  dérogations (2 h par défaut).

### Mise à jour depuis le package (v0.1)

1. Installer l'intégration (étapes 1 et 2 ci-dessus) **sans retirer le package** : la
   configuration propose d'importer ses plannings, ses dérogations en cours et le mode actif,
   puis désactive les deux automatisations du package pour qu'un seul programmateur pilote les
   thermostats.
2. Vérifier la carte et les thermostats. Pour revenir en arrière, supprimer l'intégration et
   réactiver les deux automatisations `automation.chauffage_*` : les données du package ne sont
   pas modifiées.
3. Suivre la réparation affichée dans Paramètres : supprimer `packages/chauffage/` et
   `www/chauffage/`, retirer la ligne `extra_module_url` et les exclusions `recorder` de
   `configuration.yaml`, redémarrer. Dans vos automatisations, remplacer
   `input_select.mode_chauffage` par `select.chauffage_mode`.

Mettre à jour l'intégration elle-même : lire le [journal des modifications](CHANGELOG.md) (en
anglais) et mettre à jour depuis HACS ; les données stockées sont migrées automatiquement. Revenir
à une version antérieure n'est pas pris en charge.

### Installation du package (v0.1)

La [version v0.1.0](https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0) est un
package YAML : décompresser son ZIP dans le dossier de configuration et suivre le README de cette
version.

### Thermostats compatibles

Le programme applique des **presets** (`comfort`, `eco`, `boost`, `frost`), et les changements
manuels sont détectés parce que le thermostat passe en preset `none` quand on change sa consigne
à la main. C'est le comportement de **Versatile Thermostat**, et c'est la configuration testée.
Les thermostats sans ces presets ne sont pas encore pris en charge.

La dépendance à Versatile Thermostat est **temporaire** : l'objectif est de prendre en charge
n'importe quelle entité `climate`, avec des groupes de thermostats, des modes de chauffage définis
par l'utilisateur et une interface dans votre langue. Voir la [feuille de route](ROADMAP.fr.md).

## Structure

```
custom_components/chauffage/        l'intégration (programmateur, entités, services, API websocket)
custom_components/chauffage/frontend/  carte Lovelace + bloc injecté dans la fenêtre de détail
packages/chauffage/, www/           le package v0.1 et le chargeur de sa carte (jusqu'à la v0.2.0)
dev/harness.html, dev/*.js          banc de test hors HA (faux hass, faux ha-card, faux dialogue)
dev/compose.yaml, dev/hass/         HA de développement jetable (VTherm + pièces simulées)
tests/integration/, tests/js/       tests automatisés (pytest + HA en mémoire, node --test + jsdom)
tests/ha/                           tests du package v0.1
tests/fixtures/                     données stockées dans chaque ancien format (tests des migrations)
scripts/                            test.sh, reload.sh, logs.sh, deploy.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, vérifications HACS et publication
```

Développement : voir [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md).

## Architecture

- Les données sont stockées dans `.storage/chauffage` (versionnées, migrées automatiquement) :
  modes, plannings (`{climate: {id du mode: [7 jours × [[début, preset], …]]}}`), dérogations en
  cours.
- **Programmateur** : chaque minute, il applique le preset des plages qui commencent et fait
  reprendre leur programme aux thermostats dont la dérogation se termine ; il réaligne tous les
  thermostats au démarrage, au changement de mode et à l'enregistrement des plannings. Les
  thermostats en dérogation, éteints ou indisponibles ne sont pas touchés ; une vanne injoignable
  ne bloque pas les autres.
- **Changements manuels** : une consigne changée à la main (le thermostat passe en preset
  `none`) ou un preset choisi par un utilisateur devient une dérogation temporaire. Les
  changements faits par l'intégration elle-même (son propre contexte) ou par une automatisation
  sont ignorés.
- **Carte** : servie par l'intégration et chargée sur toutes les pages (carte + bloc de la
  fenêtre de détail) ; elle dialogue avec l'intégration par websocket (`chauffage/subscribe`,
  `chauffage/schedules/save`…) ; un enregistrement fait depuis une copie périmée est refusé au
  lieu d'écraser les modifications de quelqu'un d'autre.

Pièges connus (déjà gérés, couverts par des tests) : les presets ZHA sont des Enum ; Safari
refuse les dates avec microsecondes ; `ha-card` s'affiche de façon asynchrone (placement des
popovers).

## Licence

[MIT](LICENSE) © 2026 Armel Larcier

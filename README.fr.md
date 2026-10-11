# ha-chauffage

[![Tests](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml/badge.svg)](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml)
![Couverture (intégration)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-integration.json)
![Couverture (carte)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-card.json)
[![Offrez-moi un café](https://img.shields.io/badge/Offrez--moi%20un%20caf%C3%A9-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/TRlbXsQ2yu)

[English](README.md) · **Français**

![Édition des plannings, une dérogation et le planning actif, puis la fenêtre de détail du thermostat](docs/demo.gif)

Plannings de chauffe hebdomadaires pour les thermostats de Home Assistant : sans préréglages, avec
préréglages, ou **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(projet indépendant, sans lien avec Versatile Thermostat) :

- des **plannings** que vous créez, dupliquez et nommez (*Normal*, *Télétravail*, *Vacances*,
  *Absent*…), chacun avec une semaine de 7 jours par thermostat ; un seul est actif, changé
  depuis la carte ou par des automatisations ;
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
   type *Intégration* ; installer **ha-chauffage** puis redémarrer Home Assistant.
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

Vocabulaire : un **planning** est un programme hebdomadaire (*Normal*, *Vacances*…) avec une
**semaine** par thermostat, faite de **créneaux** ; chaque créneau demande un **préréglage**
(*Confort*, *Éco*…) ; une **dérogation** est un changement temporaire sur un thermostat
([glossaire](docs/glossary.md), en anglais).

- Des **plannings** : une nouvelle installation démarre avec *Normal* ; dans la carte, **+**
  crée un planning (vide, ou copie d'un autre) et **⋮** sur l'onglet ouvert le renomme, le
  déplace ou le supprime (administrateurs). Chaque planning a un **identifiant stable** (affiché
  dans *Renommer…*), qui ne change jamais, même quand on le renomme.
- Un sélecteur **Planning actif** (`select.chauffage_schedule`) : il se change depuis la carte
  (ouvrir l'onglet du planning, puis « Activer ») ou depuis n'importe quelle automatisation.
  Dans les automatisations, utiliser l'identifiant, qui survit à un renommage : le service
  `chauffage.activate_schedule` et l'attribut `schedule_id` du sélecteur. Par exemple, semaines
  paires et impaires :
  ```yaml
  triggers:
    - trigger: time
      at: "00:00:00"
  conditions:
    - condition: template
      value_template: "{{ now().weekday() == 0 }}"
  actions:
    - action: chauffage.activate_schedule
      data:
        schedule: "{{ 'normal' if now().isocalendar().week % 2 == 0 else 'semaines_impaires' }}"
  ```
- Des **préréglages** : les créneaux utilisent les préréglages de l'intégration (par défaut
  *Confort* 20 °C, *Éco* 17 °C, *Boost* 21 °C, *Hors-gel* 7 °C). Pour chaque thermostat, un
  préréglage correspond à son propre préréglage du même nom s'il en a un, sinon à la température
  du préréglage ; c'est modifiable par thermostat (un de ses propres préréglages, ou une
  température). **Tout se règle dans la carte**, vue *Préréglages* (bouton en haut de la carte,
  administrateurs) : un tableau avec une colonne par préréglage et une ligne par thermostat.
  L'en-tête de colonne est le préréglage (nom, couleur ; ajout, suppression) et sa température
  par défaut ; chaque case indique ce que fait ce thermostat avec ce préréglage : automatique, un
  de ses propres préréglages (⟲), ou sa propre température (●).
- Le tableau et la légende affichent la température de chaque préréglage. Pour un préréglage
  propre au thermostat, aucun attribut standard ne la donne : l'intégration retient la consigne
  vue quand il était actif. **Petit plus pour Versatile Thermostat** : les températures de ses
  préréglages sont lues directement dans ses attributs (`preset_temperatures` depuis VTherm 10,
  `comfort_temp`… avant), un parti pris pour les utilisateurs de VTherm.
- Pour chaque thermostat programmé, deux capteurs **désactivés par défaut** (à activer depuis la
  page de l'appareil du thermostat) : **Planning** (préréglage prévu maintenant ; attributs
  `preset_name`, `target`, `next_preset`, `next_preset_name`, `next_start`) et **Fin de
  dérogation** (horodatage, utilisable comme déclencheur horaire).
- Les services `chauffage.set_override` (température ou préréglage pour une durée ou jusqu'à une
  heure), `chauffage.clear_override` et `chauffage.activate_schedule`.
- Les options (Paramètres → Appareils et services → Chauffage → *Configurer*), un seul
  formulaire : durée des dérogations (2 h par défaut), et *Utiliser les préréglages des
  thermostats* (activé par défaut ; désactivé, tous les thermostats sont pilotés en température,
  entièrement réglée dans la carte).

### Mise à jour depuis le package (v0.1)

1. Installer l'intégration (étapes 1 et 2 ci-dessus) **sans retirer le package** : la
   configuration propose d'importer ses semaines, ses dérogations en cours et le planning actif
   (le « mode » du package), puis désactive les deux automatisations du package pour qu'un seul
   programmateur pilote les thermostats.
2. Vérifier la carte et les thermostats. Pour revenir en arrière, supprimer l'intégration et
   réactiver les deux automatisations `automation.chauffage_*` : les données du package ne sont
   pas modifiées.
3. Suivre la réparation affichée dans Paramètres : supprimer `packages/chauffage/` et
   `www/chauffage/`, retirer la ligne `extra_module_url` et les exclusions `recorder` de
   `configuration.yaml`, redémarrer. Dans vos automatisations, remplacer
   `input_select.mode_chauffage` par `select.chauffage_schedule`.

Mettre à jour l'intégration elle-même : lire le [journal des modifications](CHANGELOG.md) (en
anglais) et mettre à jour depuis HACS ; les données stockées sont migrées automatiquement. Revenir
à une version antérieure n'est pas pris en charge.

### Installation du package (v0.1)

La [version v0.1.0](https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0) est un
package YAML, qui n'est plus maintenu : décompresser son ZIP dans le dossier de configuration et
suivre le README de cette version.

### Thermostats compatibles

Toute entité `climate` avec une température de consigne, testée avec trois types :

- **Versatile Thermostat** : les préréglages utilisent les siens (`comfort`, `eco`, `boost`,
  `frost`), dont les températures se règlent dans VTherm ; une consigne changée à la main le fait
  passer en preset `none` et devient une dérogation ;
- **thermostats à préréglages standard** (`eco`, `comfort`, `away`, `boost`…) : les préréglages
  utilisent ceux du thermostat du même nom, des températures pour les autres (le hors-gel, par
  exemple) ;
- **thermostats sans préréglages** (comme `generic_thermostat`) : les préréglages sont des
  températures ; toute consigne changée par quelqu'un d'autre devient une dérogation.

Pas encore pris en charge : les thermostats chaud / froid à plage de températures
(`heat_cool`), et les appareils qui changent leur consigne d'eux-mêmes (ça peut ressembler à des
changements manuels). Un appareil qui garde son préréglage quand on change sa consigne à la main
est mieux réglé en températures (vue *Préréglages* de la carte). Voir la
[feuille de route](ROADMAP.fr.md) pour les groupes de thermostats et un calendrier des plannings.

## Structure

```
custom_components/chauffage/        l'intégration (programmateur, entités, services, API websocket)
custom_components/chauffage/frontend/  carte Lovelace + bloc injecté dans la fenêtre de détail
dev/compose.yaml, dev/hass/         HA de développement jetable (VTherm + pièces simulées)
tests/integration/, tests/js/       tests automatisés (pytest + HA en mémoire, node --test + jsdom)
docs/                               glossaire, décisions de conception, cas d'usage et leurs tests (en anglais)
tests/fixtures/                     données stockées dans chaque ancien format (tests des migrations)
scripts/                            test.sh, logs.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, vérifications HACS et publication
```

Développement : voir [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md).

## Architecture

- Les données sont stockées dans `.storage/chauffage` (versionnées, migrées automatiquement) :
  plannings, préréglages, semaines (`{climate: {id du planning: [7 jours × [[début,
  préréglage], …]]}}`), dérogations en cours.
- **Programmateur** : chaque minute, il applique le préréglage des créneaux qui commencent et
  fait reprendre leur planning aux thermostats dont la dérogation se termine ; il réaligne tous
  les thermostats au démarrage, à l'activation d'un planning et à l'enregistrement des semaines.
  Les thermostats en dérogation, éteints ou indisponibles ne sont pas touchés ; une vanne
  injoignable ne bloque pas les autres.
- **Changements manuels** : une consigne changée à la main (le thermostat passe en preset
  `none`) ou un préréglage choisi par un utilisateur devient une dérogation temporaire. Les
  changements faits par l'intégration elle-même (son propre contexte) ou par une automatisation
  sont ignorés.
- **Carte** : servie par l'intégration et chargée sur toutes les pages (carte + bloc de la
  fenêtre de détail) ; elle dialogue avec l'intégration par websocket (`chauffage/subscribe`,
  `chauffage/weeks/save`…) ; un enregistrement fait depuis une copie périmée est refusé au
  lieu d'écraser les modifications de quelqu'un d'autre.

Pièges connus (déjà gérés, couverts par des tests) : les presets ZHA sont des Enum ; Safari
refuse les dates avec microsecondes ; `ha-card` s'affiche de façon asynchrone (placement des
popovers).

## Licence

[MIT](LICENSE) © 2026 Armel Larcier

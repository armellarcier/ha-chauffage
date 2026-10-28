# ha-chauffage

[![Tests](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml/badge.svg)](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml)
![Couverture (intégration)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-integration.json)
![Couverture (carte)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-card.json)
[![Offrez-moi un café](https://img.shields.io/badge/Offrez--moi%20un%20caf%C3%A9-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/TRlbXsQ2yu)

[English](README.md) · **Français**

![Édition des plannings, les préréglages, une dérogation et le planning actif, la fenêtre de détail du thermostat, les cartes thermostat, puis l'historique de la température mesurée et une journée en grand](docs/demo.gif)

Plannings de chauffe hebdomadaires pour les thermostats de Home Assistant : sans préréglages, avec
préréglages, ou **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(projet indépendant, sans lien avec Versatile Thermostat) :

- des **plannings** que vous créez, dupliquez et nommez (*Normal*, *Télétravail*, *Vacances*,
  *Absent*…), chacun avec une semaine de 7 jours par thermostat ; un seul est actif, changé
  depuis la carte ou par des automatisations ;
- carte Lovelace d'édition visuelle (`custom:chauffage-programme-card`) : glisser les horaires,
  copier / coller des journées, les jours identiques sur une ligne (*Lun–Ven*, *Tous les jours*)
  modifiés d'un coup, plusieurs thermostats par journée, voir la température mesurée
  des 7 derniers jours tracée sur chaque journée ; pensée aussi pour le téléphone ; chaque
  thermostat, planning ou réglage qu'elle nomme s'ouvre dans Home Assistant ;
- une **carte thermostat** (`custom:chauffage-thermostat-card`) pour composer vos propres tableaux
  de bord : un thermostat, ce qu'il fait, pourquoi et jusqu'à quand, la journée, une consigne
  temporaire ;
- **dérogations** : une consigne changée à la main devient temporaire (2 h par défaut),
  visible et ajustable (sa fin, et sa valeur : un préréglage ou une température) sur la carte
  et dans la fenêtre de détail du thermostat, qui peuvent aussi en créer une, puis le
  thermostat reprend son programme.
  Revenir au préréglage ou à la consigne du créneau, même avec la molette du thermostat,
  reprend le programme tout de suite.

## Installation

Depuis la v0.2, ha-chauffage est une **intégration Home Assistant** configurée depuis
l'interface : aucun YAML à modifier. La version 0.1 était un package YAML ; la
[mise à jour](#mise-à-jour-depuis-le-package-v01) importe ses données automatiquement.

1. Dans HACS : ⋮ → *Dépôts personnalisés* → `https://github.com/armellarcier/ha-chauffage`,
   type *Intégration* ; installer **ha-chauffage** puis redémarrer Home Assistant.
2. Paramètres → Appareils et services → *Ajouter une intégration* → **Chauffage**.
3. Ajouter la carte à un tableau de bord (elle est servie par l'intégration : aucune ressource à
   ajouter) : *Ajouter une carte* → **Plannings de chauffe**, ou en YAML :
   ```yaml
   type: custom:chauffage-programme-card
   thermostats:
     - entity: climate.salon
       name: Salon
   ```
   La carte suit la langue et les formats de l'utilisateur (12 / 24 h, séparateur décimal, premier
   jour de la semaine) ; l'anglais et le français sont disponibles, et `language: en` ou
   `language: fr` en force un.
   Les jours identiques partagent une ligne (*Lun–Ven*, *Sam, Dim*, *Tous les jours*) : modifier
   la ligne modifie chacun de ses jours. Le bouton *Grouper les jours* affiche chaque jour sur sa
   ligne (pour rendre un jour différent), et `group_days: false` en fait l'affichage par défaut.
   Les thermostats, leurs noms et les autres options se règlent aussi dans l'éditeur visuel de la
   carte (Modifier la carte) ; `language` et `group_days` se règlent seulement en YAML.
4. Si vous le souhaitez, une carte **Thermostat programmé** par pièce, à placer dans vos propres
   tableaux de bord (elle est proposée pour un thermostat dans *Ajouter une carte* → *Par
   entité*) :
   ```yaml
   type: custom:chauffage-thermostat-card
   entity: climate.salon
   name: Salon  # facultatif
   ```
   Elle montre la température mesurée, ce que fait le thermostat, pourquoi et jusqu'à quand
   (« Normal · Éco jusqu'à 17:30, puis Confort »), la journée, une consigne temporaire à créer ou
   modifier, *Mettre en pause* (ou *Reprendre*), et ouvre le thermostat, son planning, son
   interrupteur *Pilotage* et son appareil. La fenêtre de détail du thermostat montre la même
   chose, sous ses commandes.

Nécessite Home Assistant 2025.1 ou plus récent. Cette version minimale ne monte que quand une
API de Home Assistant l'impose, dans une version mineure annoncée dans le
[changelog](CHANGELOG.md) ; les tests tournent sur elle, sur une version par trimestre depuis,
sur la dernière version de Home Assistant et, chaque semaine, sur la beta.

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

> **Installer plutôt le package (v0.1)** : la
> [version v0.1.0](https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0) est un
> package YAML, qui n'est plus maintenu : décompresser son ZIP dans le dossier de configuration
> et suivre le README de cette version.

## Plannings

Vocabulaire : un **planning** est un programme hebdomadaire (*Normal*, *Vacances*…) avec une
**semaine** par thermostat, faite de **créneaux** ; chaque créneau demande un **préréglage**
(*Confort*, *Éco*…) ; une **dérogation** est un changement temporaire sur un thermostat
([glossaire](docs/glossary.md), en anglais).

### Créer des plannings

- Une nouvelle installation démarre avec un seul planning, *Normal*.
- Dans la carte (administrateurs), **+** crée un planning : vide, ou copie d'un autre. **⋮** sur
  l'onglet ouvert le renomme, le déplace ou le supprime.
- Chaque planning a un **identifiant stable**, affiché dans *Renommer…*. Il ne change jamais,
  même quand on renomme le planning : les automatisations l'utilisent.

### Planning actif

Un seul planning est actif à la fois : le sélecteur **Planning actif**
(`select.chauffage_schedule`).

- Depuis la carte : ouvrir l'onglet du planning, puis *Activer*.
- Depuis une automatisation : le service `chauffage.activate_schedule` et l'attribut
  `schedule_id` du sélecteur, tous deux avec l'identifiant stable.
- Depuis un tableau de bord, un script ou à la voix : le sélecteur, ou l'interrupteur de chaque
  planning (voir *Entités et services*).

Par exemple, semaines paires et impaires :

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

## Règles d'activation

Des plannings qui s'activent tout seuls, sans écrire d'automatisation : la vue *Règles* de la
carte (administrateurs) contient une liste ordonnée de règles.

### Comment marchent les règles

- **La première règle qui s'applique l'emporte.** Quand aucune ne s'applique, le planning par
  défaut est activé (ou, sans planning par défaut, le planning actif reste).
- **Une règle est un template**, de deux façons :
  - un template et le planning qu'il active tant qu'il est vrai. Vrai et faux se lisent comme
    dans une condition template : `true`, `on`, `yes`, `1`… ; tout autre texte est faux ;
  - un template qui donne lui-même le planning, par son identifiant ou son nom.
- **Les règles sont essayées pendant la saisie** : chacune montre ce que rend son template en ce
  moment (ou son erreur), et si elle s'applique.
- **Un planning choisi à la main reste** jusqu'à ce que le résultat des règles change.
  L'attribut `rules_choice` du sélecteur dit quel planning donnent les règles : une
  automatisation peut y revenir tout de suite avec `chauffage.activate_schedule`.

### Exemple : EDF Tempo

Suivre la couleur du jour EDF Tempo, avec deux règles et un planning par défaut :

| Template | Planning |
|---|---|
| `{{ is_state('sensor.edf_tempo_color', 'red') }}` | *Absent* |
| `{{ is_state('sensor.edf_tempo_color', 'white') }}` | *Jours éco* |
| (aucune n'est vraie) | *Normal* (par défaut) |

Ou une seule règle dont le template donne le planning :

```jinja
{{ {'red': 'absent', 'white': 'jours_eco'}.get(states('sensor.edf_tempo_color'), 'normal') }}
```

### Exemple : un calendrier des plannings

#### Une seule règle

Ajoutez un *Calendrier local* (Paramètres › Appareils et
services › Ajouter une intégration), par exemple `calendar.chauffage`, et mettez-y des
événements nommés comme les plannings : *Vacances* du vendredi soir au dimanche, *Absent*
jusqu'à mardi 18:00, *Télétravail* tous les mercredis (un événement récurrent). Une seule règle,
et *Normal* comme planning par défaut :

```jinja
{{ state_attr('calendar.chauffage', 'message') if is_state('calendar.chauffage', 'on') }}
```

Pendant un événement, son titre donne le planning (son nom, en majuscules ou minuscules, ou son
identifiant) ; entre deux événements, c'est le planning par défaut. Un nouveau planning ne
demande pas de changer la règle. Tout calendrier marche de la même façon (Google, CalDAV…), pour
planifier depuis un téléphone ou partager avec la maison.

#### Des événements qui se chevauchent

Avec cette règle, les événements ne doivent pas se chevaucher : une entité calendrier ne montre
qu'un événement, celui qui a commencé le premier, donc une soirée *Absent* pendant une semaine de
*Vacances* n'est pas vue. Pour des exceptions dans une période, le blueprint
[`calendar_schedule.yaml`](blueprints/automation/chauffage/calendar_schedule.yaml) lit tous les
événements en cours et écrit dans une entrée texte le planning de celui qui a commencé le
dernier :

1. Créez une entrée *Texte* (Paramètres › Appareils et services › Entrées), par exemple
   `input_text.planning_du_calendrier`.
2. [![Importer le blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Farmellarcier%2Fha-chauffage%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fchauffage%2Fcalendar_schedule.yaml),
   puis créez une automatisation à partir de lui, avec le calendrier et l'entrée.
3. La règle lit l'entrée : `{{ states('input_text.planning_du_calendrier') }}`.

Les événements dont le titre ne nomme aucun planning sont ignorés. Le planning change quand un
événement commence ou finit ; un événement ajouté ou modifié est vu à la lecture suivante du
calendrier, toutes les cinq minutes (toutes les quinze suffisent pour un calendrier en ligne, qui
se synchronise à ce rythme).

## Préréglages

Les créneaux demandent les préréglages de l'intégration : par défaut *Confort* 20 °C, *Éco*
17 °C, *Boost* 21 °C et *Hors-gel* 7 °C.

- **Pour chaque thermostat**, un préréglage correspond à son propre préréglage du même nom s'il
  en a un, sinon à la température du préréglage. C'est modifiable par thermostat : un de ses
  propres préréglages, ou une température.
- **Tout se règle dans la carte**, vue *Préréglages* (administrateurs) : un tableau avec une
  colonne par préréglage, du plus froid au plus chaud, et une ligne par thermostat. L'en-tête
  de colonne est le préréglage : son nom, sa couleur et sa température par défaut, modifiés dans
  un seul popover, avec *Supprimer…* ; *+ Ajouter un préréglage* est sous le tableau. Chaque case
  donne la température et dit ce qu'elle est : « son préréglage *Confort* », « réglé ici » ou
  « par défaut » (« ? » tant qu'un préréglage propre au thermostat n'a pas servi). Une case ouvre
  un popover pour la modifier, comme pour les créneaux, avec un lien vers l'appareil du
  thermostat, où se règlent ses propres préréglages.
- **Températures affichées** : le tableau et la légende affichent la température de chaque
  préréglage. Aucun attribut standard ne donne celle d'un préréglage propre au thermostat :
  l'intégration retient la consigne vue quand il était actif.
- **Petit plus pour Versatile Thermostat** : les températures de ses préréglages sont lues
  directement dans ses attributs (`preset_temperatures` depuis VTherm 10, `comfort_temp`…
  avant).

## Thermostats compatibles

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

## Entités et services

Un thermostat est **programmé** dès qu'il est dans une carte. Il le reste quand on le retire d'une
carte (une autre carte peut l'afficher), jusqu'à ce qu'on l'oublie. En pause, il reste programmé : il
garde ses semaines, mais Chauffage ne le pilote plus. La vue *Thermostats* de la carte liste tous
les thermostats programmés, en pause ou non, y compris ceux qui ne sont dans aucune carte, avec leur
interrupteur *Pilotage* et leur appareil. Si son
entité est supprimée de Home Assistant, Paramètres → Réparations propose de l'oublier.

Tout ce que sait Chauffage se voit et s'utilise dans Home Assistant, sans la carte : sur les pages
des appareils, dans les tableaux de bord, les automatisations, les scripts et à la voix. Les
entités apparaissent d'elles-mêmes ; elles n'ont pas d'état propre (elles montrent les données de
l'intégration et les changent comme la carte), et leurs noms et icônes se changent dans Home
Assistant.

Pour chaque thermostat programmé, sur la page de l'appareil du thermostat :

| Entité | Ce qu'elle dit |
|---|---|
| **Pilotage** (interrupteur) | Éteint, le thermostat est **en pause** : Chauffage garde ses semaines mais ne le pilote plus (rien n'est envoyé, pas de dérogation), jusqu'à ce qu'on le rallume. Pratique pour une pièce gérée à la main quelques jours, ou à la fin de la saison de chauffe. |
| **Préréglage prévu** (capteur) | Le préréglage prévu maintenant. Attributs `preset_name`, `target`, `next_preset`, `next_preset_name`, `next_start`, et `temperatures` : la température de chaque préréglage sur ce thermostat. |
| **Dérogation** (capteur binaire) | Allumé tant que le thermostat a une dérogation. Attributs `kind` (`temperature` ou `preset`), `value` (une température, ou le préréglage du thermostat), `preset` (le préréglage Chauffage demandé, le cas échéant), `end`. |
| **Fin de dérogation** (capteur, désactivé par défaut) | La fin de la dérogation en cours sous forme d'horodatage, pour une tuile de tableau de bord. |

Les capteurs sont indisponibles pendant la pause. Une installation d'avant la 0.6 garde l'ancien
identifiant du capteur de préréglage prévu (`sensor.<thermostat>_planning` en français), et
l'active une fois.

Sur l'appareil *Chauffage* :

| Entité | Ce qu'elle dit |
|---|---|
| **Planning actif** (sélecteur, `select.chauffage_schedule`) | Le planning actif, à choisir parmi tous. Attributs `schedule_id` et `rules_choice` : le planning que donnent les règles d'activation (vide sans règles). |
| **Planning &lt;nom&gt;** (un interrupteur par planning, `switch.chauffage_schedule_<id>`) | Allumé pour le planning actif. En allumer un l'active ; on n'éteint pas le planning actif, on en allume un autre. Son icône, choisie dans Home Assistant, s'affiche sur l'onglet du planning dans la carte. |

**Assist** : Home Assistant expose les nouveaux interrupteurs aux assistants vocaux, donc « éteins
le pilotage du salon » ou « allume le planning Vacances » fonctionnent. Les interrupteurs Pilotage
créés avant la 0.6 gardent le choix fait alors (non exposés) ; dans Paramètres → Assistants
vocaux → Exposer, chaque entité peut être exposée ou non.

Services :

- `chauffage.set_override` : une température ou un préréglage (ce que ce préréglage signifie pour
  le thermostat, comme dans la carte), pour une durée ou jusqu'à une heure.
- `chauffage.clear_override` : le thermostat reprend son planning tout de suite.
- `chauffage.activate_schedule` : active un planning par son identifiant stable.
- `chauffage.get_schedules` (avec une réponse, pour les scripts) : les plannings (`id`, `name`,
  `entity_id` de leur interrupteur), `active_schedule`, `rules_choice`, `default_schedule`.
- `chauffage.get_week` (avec une réponse) : la semaine de thermostats dans un planning (le planning
  actif par défaut) : par thermostat, puis par jour comme `schedule.get_schedule` de Home
  Assistant : `schedule` et une liste par jour (`monday`…), chaque créneau avec son `start`, son `end` et son `preset`.

```yaml
- action: chauffage.get_week
  data:
    entity_id: climate.salon
  response_variable: semaine
- action: notify.mobile_app_telephone
  data:
    message: >-
      {% set demain = (now() + timedelta(days=1)).strftime('%A') | lower %}
      Demain le salon est en confort à partir de
      {{ semaine['climate.salon'][demain] | selectattr('preset', 'eq', 'comfort') | map(attribute='start') | first }}
```

Événements, pour les automatisations (déclencheur *Événement*) :

| Événement | Données |
|---|---|
| `chauffage_override_started` | `entity_id`, `kind`, `value`, `preset`, `end` et `source` : `thermostat` (un changement fait dessus, à la main), `card`, `service`. Signalé pour une nouvelle dérogation ou une nouvelle valeur, pas quand seule sa fin change. |
| `chauffage_override_ended` | `entity_id` et `reason` : `expired`, `thermostat` (remis sur son planning à la main), `card`, `service`, `paused`, `forgotten`. |
| `chauffage_schedule_activated` | `schedule` (identifiant), `schedule_name`, `previous_schedule`, `entity_id` (le sélecteur du planning actif) et `source` : `card`, `entity` (le sélecteur ou un interrupteur de planning), `service`, `rules`. |

Chaque événement porte le contexte de ce qui l'a causé : le journal de bord dit qui a changé le thermostat, utilisé la carte, appelé le service ou choisi le planning.

Par exemple, être prévenu quand quelqu'un change un thermostat à la main :

```yaml
triggers:
  - trigger: event
    event_type: chauffage_override_started
    event_data:
      source: thermostat
actions:
  - action: notify.mobile_app_telephone
    data:
      message: "{{ trigger.event.data.entity_id }} : {{ trigger.event.data.value }} jusqu'à {{ as_datetime(trigger.event.data.end).strftime('%H:%M') }}"
```

## Options

Paramètres → Appareils et services → Chauffage → *Configurer* :

- **Durée des dérogations** : 2 h par défaut.
- **Utiliser les préréglages des thermostats** : activé par défaut. Désactivé, tous les
  thermostats sont pilotés en température, entièrement réglée dans la carte.

## Dépannage

Ce que Chauffage fait aux thermostats, et pourquoi, se suit :

- **Journal de bord** : une dérogation qui commence (d'où elle vient : le thermostat, la carte,
  un service) ou qui finit (expirée, retour au planning sur le thermostat, retirée, thermostat
  en pause…) est dans le journal du thermostat ; un planning activé (et par quoi) dans celui du
  sélecteur.
- **Journaux** : chaque commande envoyée à un thermostat, avec sa raison (nouveau créneau,
  planning activé, dérogation terminée, retour en ligne, nouvel essai, commande appliquée en
  retard…), chaque dérogation et chaque changement vu sur un thermostat, au niveau INFO :
  ```yaml
  logger:
    logs:
      custom_components.chauffage: info
  ```
- **Diagnostics** (Paramètres → Appareils et services → Chauffage → ⋮ → *Télécharger les
  diagnostics*) : les données stockées (semaines, dérogations, commandes qu'une vanne n'a pas
  encore appliquées) et les thermostats programmés tels qu'ils sont. À joindre à une issue.

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
  `none`) ou un préréglage choisi par un utilisateur devient une dérogation temporaire ;
  revenir de la même façon à ce que donne le créneau (son préréglage, ou une consigne à la
  température de ce préréglage sur ce thermostat) la termine. Les
  changements faits par l'intégration elle-même (son propre contexte) ou par une automatisation
  sont ignorés, tout comme une commande qu'une vanne à pile applique en retard (les commandes
  qu'elle n'a pas encore prises sont gardées un jour).
- **Carte** : servie par l'intégration et chargée sur toutes les pages (carte + bloc de la
  fenêtre de détail) ; elle dialogue avec l'intégration par websocket (`chauffage/subscribe`,
  `chauffage/weeks/save`…) ; un enregistrement fait depuis une copie périmée est refusé au
  lieu d'écraser les modifications de quelqu'un d'autre.
- **Historique** : la carte demande à l'intégration la température mesurée et la consigne
  appliquée des 7 derniers jours (`chauffage/history`) ; l'intégration les lit dans le recorder
  de HA, ne garde que ces deux valeurs (l'historique de HA envoie tous les attributs d'un
  thermostat, des mégaoctets pour une semaine) et garde en mémoire ce qu'elle a lu : les
  rafraîchissements de la carte ne lisent que les dernières minutes.

Pièges connus (déjà gérés, couverts par des tests) : les presets ZHA sont des Enum ; Safari
refuse les dates avec microsecondes ; `ha-card` s'affiche de façon asynchrone (placement des
popovers).

## Structure

```
custom_components/chauffage/        l'intégration (programmateur, entités, services, API websocket)
custom_components/chauffage/frontend/  carte Lovelace + bloc injecté dans la fenêtre de détail
dev/compose.yaml, dev/hass/         HA de développement jetable (VTherm + pièces simulées)
dev/sim_rooms/, dev/sim_climate/    dev uniquement : modèle thermique des pièces (et une semaine
                                    d'historique simulée pour un HA de dev neuf), un climate à
                                    préréglages standard
tests/integration/, tests/js/       tests automatisés (pytest + HA en mémoire, node --test + jsdom)
docs/                               glossaire, décisions de conception, cas d'usage et leurs tests (en anglais)
tests/fixtures/                     données stockées dans chaque ancien format (tests des migrations)
scripts/                            test.sh, logs.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, vérifications HACS et publication
```

Développement : voir [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md).

## Licence

[MIT](LICENSE) © 2026 Armel Larcier

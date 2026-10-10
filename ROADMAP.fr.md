# Feuille de route

[English](ROADMAP.md) · **Français**

ha-chauffage cible aujourd'hui **[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**
(VTherm). Cette dépendance est **temporaire** : l'objectif est de fonctionner avec **n'importe
quelle entité `climate` de Home Assistant**, et de permettre d'organiser ses thermostats en groupes
avec leurs propres plannings et modes de chauffage. Ce document explique pourquoi VTherm est le
point de départ et ce qu'il faut faire pour devenir générique.

## Pourquoi Versatile Thermostat pour l'instant

| Ce dont on a besoin | Ce que VTherm apporte |
|---|---|
| Une consigne par créneau, réglable sans toucher au planning | Des **presets avec une température par thermostat** (`comfort`, `eco`, `boost`, `frost`), modifiables dans l'interface : le planning dit seulement « confort à partir de 06:30 » |
| Savoir quand quelqu'un a changé la consigne à la main | VTherm **passe en preset `none`** lors d'un changement manuel de consigne : un signal clair et fiable |
| Une bonne régulation quel que soit le matériel | VTherm pilote interrupteurs, vannes ou autres climates avec sa propre régulation (TPI), détection d'ouverture / de présence, sécurité… |
| Une installation réelle pour valider | C'est l'installation de l'auteur (vannes Zigbee derrière des thermostats VTherm) |

Partir d'un seul type de thermostat, au comportement bien défini, a permis de mettre au point
l'essentiel d'abord : plannings hebdomadaires, modes, carte d'édition, dérogations temporaires et
leur fin, tests.

**Conséquences assumées pour l'instant**

- Seuls les thermostats proposant les presets `comfort` / `eco` / `boost` / `frost` sont pris en charge.
- La détection des changements manuels repose sur le preset `none` de VTherm.
- Le HA de développement (`dev/setup/setup.py`) crée les thermostats VTherm en parcourant le
  formulaire de configuration de VTherm, champ par champ. Ce parcours a été découvert sur
  VTherm 10.5.0 et peut changer. **Nous ne figeons volontairement pas les versions et n'ajoutons
  pas encore de vérification de bout en bout de ce setup en CI** : cette partie sera remplacée
  (voir « Environnement de développement » plus bas), la blinder maintenant serait du travail
  perdu. Si elle casse, `docker compose logs setup` indique l'étape en échec.

## Première version, migrations, puis un système sans YAML

Le package actuel fonctionne et sert au quotidien : il mérite une **première version publiée**
rapidement, pour que chacun puisse installer une version connue. C'est une étape : le chantier
suivant le remplace par une **intégration entièrement configurable, sans aucun YAML**.

### Données versionnées et migrations, dès la première version

Chaque version qui change les données stockées doit mettre à jour les installations existantes
automatiquement, sans action manuelle ni perte de données :

- une **version de schéma** est stockée avec les données (plannings, dérogations, réglages) ; les
  données créées avant la première version comptent comme version 1 ;
- les **migrations** sont de petites étapes ordonnées (version N → N+1), exécutées
  automatiquement au chargement des données ; chacune est idempotente et **testée avec des données
  d'exemple de l'ancien format** (`tests/fixtures/`) ;
- une **sauvegarde** des données précédentes est conservée avant de migrer ; le retour à une
  version antérieure n'est pas pris en charge, et les notes de version le disent ;
- tant que le package est la version distribuée, la carte migre les données qu'elle charge et les
  réenregistre ; dans l'intégration, les migrations utilisent les mécanismes de HA (versions du
  `Store`, `async_migrate_entry` pour les entrées de configuration) ;
- **versions publiées** : numérotation sémantique, un `CHANGELOG.md`, des tags Git et des
  « releases » GitHub (sur lesquelles s'appuie HACS). Liste de contrôle avant publication : tests au
  vert, migrations testées, démo réenregistrée si l'interface a changé, changelog à jour.

**Fait en v0.1.0** pour les plannings (version de schéma, migrations par la carte avec
sauvegarde, fixtures, changelog, workflow de publication) : voir CONTRIBUTING.fr.md, « Versions
des données et migrations » et « Publier une version ». Les dérogations, de courte durée, ne
sont pas migrées.

### Puis, rapidement : plus de YAML

**En cours (v0.2.0)** : l'intégration est écrite et testée, la bêta est la prochaine étape ; voir
[docs/integration-plan.md](docs/integration-plan.md) (en anglais).

La première version demande encore de copier des fichiers et de modifier `configuration.yaml`
(package, `extra_module_url`, exclusions du recorder). L'intégration (section 5 plus bas) supprime
tout cela : installation depuis HACS, puis **tout se configure depuis l'interface** — thermostats,
modes, niveaux de chauffe, durée des dérogations, règles de détection. Sa première version inclut
la **migration automatique depuis la version package** (plannings, dérogations et mode actif
importés, puis instructions pour retirer le package).

## Devenir générique

### 1. Des niveaux de chauffe plutôt que des presets

Les plannings doivent référencer des **niveaux de chauffe** définis par l'utilisateur (par ex.
*Confort*, *Éco*, *Nuit*, *Hors-gel*, *Arrêt*), pas les noms de presets d'un thermostat. Chaque
niveau est ensuite **associé, par thermostat** (ou par groupe, voir plus bas), à ce que le
thermostat comprend :

- un **preset** (`preset_mode`), quand le thermostat en a un correspondant ;
- une **consigne** (`temperature`, ou `target_temp_low` / `target_temp_high` en heat_cool) ;
- l'**arrêt** (`hvac_mode: off`).

L'association découle des capacités de chaque entité : `supported_features`, `preset_modes`,
`hvac_modes`, `min_temp` / `max_temp` / `target_temp_step`. VTherm devient un cas parmi d'autres
(niveaux associés à ses presets), et un thermostat sans presets fonctionne en températures.

Un créneau peut aussi porter directement une température (« 21 °C à partir de 06:30 »), pour
ceux qui ne veulent pas de niveaux nommés.

### 2. Détecter les changements manuels sans le preset `none`

Au lieu de dépendre d'un signal propre à un type de thermostat :

- mémoriser, par thermostat, **ce que le planning a appliqué en dernier** (niveau, preset ou
  consigne, et quand) ;
- un changement est **manuel** quand la consigne du thermostat diffère de cette attente **et**
  qu'il ne vient pas d'une automatisation (`context.parent_id` vide — déjà utilisé aujourd'hui) ;
- ignorer les ajustements faits par le thermostat lui-même (fenêtre ouverte, présence,
  sécurité…) via des règles configurables, car certaines intégrations changent leur consigne seules.

### 3. Des groupes de thermostats

Aujourd'hui chaque thermostat a son propre planning. Beaucoup de logements ont besoin de **zones**
partageant un planning : « chambres », « pièces de vie », « salles de bain »…

- Un **groupe** est un ensemble nommé de climates ; chaque climate appartient à au plus un groupe.
- Les plannings sont définis **par groupe et par mode** ; un thermostat peut toujours avoir son
  propre planning (groupe d'un seul thermostat, ou exception au sein du groupe).
- L'association des niveaux (étape 1) se règle par groupe, avec des exceptions par thermostat
  (par ex. *Confort* = 21 °C au salon, 19 °C dans les chambres).
- Les dérogations restent par thermostat (un changement manuel dans une pièce ne touche pas le groupe).
- La carte édite des groupes : une ligne par groupe au lieu d'une ligne par thermostat,
  composition des groupes modifiable dans la carte.

### 4. Des modes de chauffage définis par l'utilisateur

Aujourd'hui les modes sont fixes (`Normal` / `Absent` / `Vacances`, dans `input_select.mode_chauffage`).

- Les modes deviennent **définis par l'utilisateur** (nom, ordre), avec des plannings par (groupe, mode).
- Le mode actif peut être **global ou par groupe** (par ex. une chambre d'amis en *Absent* pendant
  que le reste est en *Normal*).
- Les changements de mode restent de simples entités HA (un `select` par groupe), pilotables par
  la présence, un calendrier (vacances) ou n'importe quelle automatisation.
- Un mode peut être **limité dans le temps** (« Absent jusqu'à dimanche 18:00 »), comme les dérogations.

### 5. D'un package YAML à une intégration sans YAML

Le package (capteurs template stockant les données dans des attributs, événements envoyés par la
carte) atteint ses limites : taille des attributs (le recorder ignore les attributs de plus de
16 Ko), pas de vrais services, pas d'interface de configuration, pas de distribution HACS, et du
YAML à modifier à la main. La prochaine version majeure est une **intégration**
(`custom_components/chauffage`) :

- **aucun YAML** : un formulaire de configuration et un formulaire d'options couvrent tous les
  réglages (thermostats, modes, niveaux de chauffe, groupes, durée des dérogations, règles de
  détection) ;
- stockage via le `Store` de HA (plannings, groupes, modes, niveaux, dérogations), avec migrations
  versionnées (voir plus haut) ;
- des **services** (`chauffage.set_schedule`, `chauffage.set_override`, `chauffage.set_mode`…)
  utilisés par la carte et utilisables depuis les automatisations ;
- des **entités** : un `select` par groupe pour le mode, des capteurs pour le créneau en cours /
  suivant et la dérogation active ;
- la carte servie par l'intégration elle-même (plus besoin d'`extra_module_url`), installable
  avec **HACS** ;
- une **migration automatique depuis la version package** (plannings, dérogations et mode importés).

### 6. Environnement de développement et tests

- Le HA de développement reçoit des **thermostats génériques sans configuration par l'interface** :
  le [`generic_thermostat`](https://www.home-assistant.io/integrations/generic_thermostat/) de HA
  (100 % YAML), des climates template, et un thermostat à presets sans signal `none`. VTherm reste
  un profil parmi d'autres. L'essentiel du parcours de formulaires de `dev/setup/setup.py`
  disparaît alors.
- Les tests tournent sur une **matrice de types de thermostats** (presets seuls, consigne seule,
  heat_cool, VTherm).
- Une fois cet environnement stable : **figer les versions** de HA et des intégrations (avec un bot
  de dépendances qui propose les montées de version) et ajouter une **vérification de bout en bout
  en CI** qui démarre le HA de dev, lance le setup et vérifie que le planning est appliqué — le
  blindage volontairement reporté plus haut.

### 7. Internationalisation

**Fait — la carte** parle anglais et français et suit le profil de l'utilisateur Home Assistant
(`hass.locale`) : langue, horloge 12 / 24 h, séparateur décimal, premier jour de la semaine, et
l'unité de température. Les textes sont dans un dictionnaire par langue (mêmes clés, vérifiées par
les tests) ; heures, noms des jours et nombres viennent des API `Intl` du navigateur. Voir
CONTRIBUTING.fr.md, « Traductions ».

**Encore en français** : les noms des modes (`Normal` / `Absent` / `Vacances`, qui sont des
données), les noms d'entités et d'événements (`input_select.mode_chauffage`,
`sensor.derogations_chauffage`, `chauffage_derogation_set`) et les clés stockées (`valeur`,
`debut`, `fin`). Prochaines étapes :

- **Intégration** (phase 1) : le système de traduction de HA (`strings.json`,
  `translations/*.json`) pour les noms d'entités (`translation_key`), les états, les services, le
  formulaire de configuration et les messages d'erreur.
- **Traductions de la carte en fichiers** : une fois la carte compilée par l'intégration, un
  fichier JSON par langue et ICU MessageFormat (pluriels), comme la plupart des cartes Home
  Assistant ; d'autres langues via des contributions.
- **Identifiants neutres** : des clés anglaises et stables pour les entités, événements, services
  et données stockées (`value`, `start`, `end`…) ; seul ce que voit l'utilisateur est traduit. Les
  modes et niveaux de chauffe par défaut sont créés avec des noms dans la langue de l'utilisateur,
  puis librement renommables.
- **Documentation** : déjà en anglais (version de référence) et en français ; d'autres langues
  sont les bienvenues.

Les identifiants neutres arrivent avec le passage à l'intégration (phase 1), dont la migration
depuis la version package renomme les clés stockées.

## Ordre des travaux

| Phase | Contenu | Terminée quand |
|---|---|---|
| 0 | **Première version** du package actuel : `CHANGELOG.md`, données versionnées, système de migration testé | v0.1.0 taguée et publiée sur GitHub ; les données stockées portent une version de schéma |
| 1 | **Intégration sans YAML** : formulaires de configuration et d'options, stockage, services, entités, carte servie par l'intégration, HACS, traductions, identifiants neutres, migration automatique depuis la version package | installation depuis HACS sans YAML ; une installation package est migrée automatiquement ; interface en anglais et en français |
| 2 | Niveaux de chauffe, association à preset / consigne / arrêt, détection des capacités | un `generic_thermostat` suit un planning |
| 3 | Détection générique des changements manuels | les dérogations fonctionnent sur un thermostat sans presets |
| 4 | Groupes et modes définis par l'utilisateur (modèle de données, puis carte) | deux groupes dans des modes différents fonctionnent en parallèle |
| 5 | Environnement de dev générique, matrice de tests, versions figées, CI de bout en bout | la CI couvre chaque type de thermostat |

Les phases 2 à 4 sont développées directement dans l'intégration. La carte parle déjà anglais et
français (section 7) ; ses traductions sont reprises telles quelles par l'intégration.

**Liste officielle de HACS** : d'ici là, ha-chauffage s'installe comme *dépôt personnalisé*
HACS (HACS n'affiche pas d'icône pour ceux-ci ; Home Assistant l'affiche une fois l'intégration
installée). Il sera proposé à la liste officielle de HACS (`hacs/default`) quand il fonctionnera
avec n'importe quelle entité `climate`, c'est-à-dire après les phases 2 et 3, avec une version
stable.

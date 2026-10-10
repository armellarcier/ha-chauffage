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

### 5. D'un package YAML à une intégration

Le package (capteurs template stockant les données dans des attributs, événements envoyés par la
carte) atteint ses limites : taille des attributs (le recorder ignore les attributs de plus de
16 Ko), pas de vrais services, pas d'interface de configuration, pas de distribution HACS. La
version générique doit être une **intégration** (`custom_components/chauffage`) :

- stockage via le `Store` de HA (plannings, groupes, modes, niveaux, dérogations), avec migrations ;
- des **services** (`chauffage.set_schedule`, `chauffage.set_override`, `chauffage.set_mode`…)
  utilisés par la carte et utilisables depuis les automatisations ;
- des **entités** : un `select` par groupe pour le mode, des capteurs pour le créneau en cours /
  suivant et la dérogation active ;
- un **formulaire de configuration** pour créer groupes et niveaux ;
- la carte servie par l'intégration elle-même (plus besoin d'`extra_module_url`), installable
  avec **HACS** ;
- une migration depuis le package actuel (plannings et dérogations importés une fois).

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

## Ordre des travaux

| Phase | Contenu | Terminée quand |
|---|---|---|
| 1 | Niveaux de chauffe, association à preset / consigne / arrêt, détection des capacités | un `generic_thermostat` suit un planning |
| 2 | Détection générique des changements manuels | les dérogations fonctionnent sur un thermostat sans presets |
| 3 | Groupes et modes définis par l'utilisateur (modèle de données, puis carte) | deux groupes dans des modes différents fonctionnent en parallèle |
| 4 | Intégration, services, stockage, HACS, migration depuis le package | installation depuis HACS, données existantes migrées |
| 5 | Environnement de dev générique, matrice de tests, versions figées, CI de bout en bout | la CI couvre chaque type de thermostat |

Les phases 1 à 3 peuvent être prototypées dans le package actuel pour valider le comportement
(avec tests), avant le passage à l'intégration en phase 4.

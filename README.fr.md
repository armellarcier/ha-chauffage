# ha-chauffage

[![Tests](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml/badge.svg)](https://github.com/armellarcier/ha-chauffage/actions/workflows/tests.yml)
![Couverture (intégration)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-integration.json)
![Couverture (carte)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/armellarcier/ha-chauffage/badges/coverage-card.json)
[![Offrez-moi un café](https://img.shields.io/badge/Offrez--moi%20un%20caf%C3%A9-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/TRlbXsQ2yu)

[English](README.md) · **Français**

![Édition des plannings, les préréglages, une dérogation et le planning actif, la fenêtre de détail du thermostat, les cartes thermostat, puis l'historique de la température mesurée et une journée en grand](docs/demo.gif)

Chauffage donne des plannings de chauffe hebdomadaires à vos thermostats Home Assistant. Il
fonctionne avec les thermostats sans préréglages, avec préréglages, et avec
**[Versatile Thermostat](https://github.com/jmcollin78/versatile_thermostat)**. ha-chauffage est
un projet indépendant, sans lien avec Versatile Thermostat.

- **Plannings.** Vous créez autant de plannings que nécessaire, par exemple *Normal*,
  *Télétravail* ou *Vacances*. Chaque planning contient une semaine par thermostat. Un seul
  planning est actif à la fois, et vous en changez depuis la carte ou par une automatisation.
- **Une carte pour modifier les semaines.** Vous faites glisser les créneaux, copiez et collez
  des journées, et modifiez d'un coup les jours identiques. La carte trace aussi la température
  mesurée sur les 7 derniers jours. Elle marche aussi sur téléphone.
- **Une carte par thermostat.** La carte thermostat montre ce que fait le thermostat, pourquoi,
  et jusqu'à quand. Vous pouvez y régler une consigne temporaire.
- **Un panneau Chauffage pour tout régler.** Les administrateurs trouvent *Chauffage* dans la
  barre latérale. Le panneau rassemble les plannings et leurs règles d'activation, les
  thermostats et les préréglages. Chaque thermostat y a sa propre page, avec sa semaine dans
  chaque planning.
- **Dérogations.** Si vous changez une consigne à la main, Chauffage la garde 2 heures
  (réglable), puis revient au planning. Vous pouvez voir et modifier la dérogation depuis la
  carte.

  La dérogation s'arrête dès que vous remettez le thermostat sur la consigne prévue.

## Installation

ha-chauffage est une intégration Home Assistant, qui se configure depuis l'interface. Vous
n'avez aucun YAML à modifier.

Nécessite Home Assistant 2025.1 ou plus récent. Nous ne relevons la version minimale de Home
Assistant que si Chauffage a besoin d'une API plus récente, et le [journal des
modifications](CHANGELOG.md) (en anglais) l'annonce. Les tests tournent sur la version minimale,
sur une version par trimestre depuis, sur la dernière version, et chaque semaine sur la bêta.

### 1. Installer l'intégration depuis HACS

Dans HACS, ouvrez ⋮ → *Dépôts personnalisés*. Ajoutez
`https://github.com/armellarcier/ha-chauffage` avec le type *Intégration*. Installez ensuite
**ha-chauffage**, puis redémarrez Home Assistant.

### 2. Ajouter l'intégration

Allez dans Paramètres → Appareils et services → *Ajouter une intégration*, puis choisissez
**Chauffage**.

Chauffage ajoute alors un panneau **Chauffage** dans la barre latérale, pour les
administrateurs. Ouvrez-le : le panneau vous accueille et liste vos thermostats. Cochez ceux que
Chauffage pilote, puis cliquez sur *Programmer*. Voir [Le panneau Chauffage](#le-panneau-chauffage).

### 3. Ajouter la carte des plannings

Ajoutez la carte à un tableau de bord : *Ajouter une carte* → **Plannings de chauffe**.
L'intégration fournit la carte : vous n'avez pas de ressource à ajouter. Dans l'éditeur visuel
de la carte, choisissez les thermostats et leurs noms.

Vous pouvez aussi écrire la carte en YAML :

```yaml
type: custom:chauffage-programme-card
thermostats:
  - entity: climate.salon
    name: Salon
```

La carte suit votre langue et vos formats, par exemple l'heure sur 12 ou 24 heures. Pour imposer
l'anglais ou le français, ajoutez `language: en` ou `language: fr` dans le YAML.

Les jours identiques partagent une ligne, par exemple *Lun–Ven*. Modifier la ligne modifie
chacun de ses jours. Pour rendre un jour différent, cliquez sur *Grouper les jours* : la carte
affiche alors chaque jour sur sa ligne. Pour afficher chaque jour sur sa ligne par défaut,
ajoutez `group_days: false` dans le YAML.

### 4. Ajouter une carte par pièce (facultatif)

La carte **Thermostat programmé** montre un seul thermostat, pour vos propres tableaux de bord.
Dans *Ajouter une carte* → *Par entité*, Home Assistant la propose pour chaque thermostat. En
YAML :

```yaml
type: custom:chauffage-thermostat-card
entity: climate.salon
name: Salon  # facultatif
```

La carte montre la température mesurée et ce que fait le thermostat, par exemple
« Normal · Éco jusqu'à 17:30, puis Confort », ainsi que les créneaux du jour. Depuis la carte,
vous pouvez régler une consigne temporaire et mettre le thermostat en pause. La carte ouvre aussi
le thermostat, son planning, son interrupteur *Pilotage* et son appareil.

La fenêtre de détail du thermostat montre les mêmes informations, sous les commandes du
thermostat. Son lien *Ouvrir dans Chauffage* ouvre la page du thermostat dans le panneau
Chauffage.

## Le panneau Chauffage

C'est dans le panneau **Chauffage**, dans la barre latérale, qu'un administrateur règle
Chauffage. Les cartes des tableaux de bord servent au quotidien : elles montrent ce que fait le
chauffage, changent de planning et modifient les semaines.

### Les pages du panneau

Le panneau a trois onglets :

- **Thermostats.** Tous les thermostats programmés, et les cartes qui les affichent. Vous pouvez
  mettre un thermostat en pause, l'oublier avec ⋮, ou en programmer un autre. Avant votre premier
  thermostat, cet onglet vous accueille : cochez les thermostats que Chauffage pilote, puis
  *Programmer*.
- **Plannings.** La liste des plannings, avec le planning actif signalé. Vous pouvez activer un
  planning, en créer un ou l'ouvrir. Les [règles d'activation](#règles-dactivation) se trouvent
  sous la liste.
- **Préréglages.** Le tableau des préréglages : leurs noms, leurs couleurs et leurs
  températures, et ce que fait chacun sur chaque thermostat (voir [Préréglages](#préréglages)).

Un planning ou un thermostat s'ouvre sur une page à lui. Le titre de la page, par exemple
« Thermostats › Salon », ramène à sa liste.

- **La page d'un planning** montre la semaine de chaque thermostat dans ce planning. Son menu ⋮
  renomme, copie ou supprime le planning.
- **La page d'un thermostat** montre le thermostat, si Chauffage le pilote, et ses appareils.
  En dessous, ses préréglages servent de légende à ses semaines, une semaine par planning.
  *Copier vers…* copie une semaine vers un autre planning. *Grouper les jours* regroupe les jours
  identiques de toutes les semaines, et *Historique* trace la température mesurée sur les 7
  derniers jours.

### Ouvrir la page d'un thermostat

- Dans le panneau Chauffage, sur l'onglet *Thermostats*, cliquez sur le nom du thermostat.
- Dans la fenêtre de détail du thermostat, cliquez sur *Ouvrir dans Chauffage*.
- Sur l'appareil du thermostat programmé, cliquez sur *Visiter*. Voir
  [Sur l'appareil de chaque thermostat programmé](#sur-lappareil-de-chaque-thermostat-programmé).

Chaque page a sa propre adresse, par exemple `/chauffage/thermostats/climate.salon`. Vous pouvez
y renvoyer depuis un tableau de bord ou une notification.

## Mettre à jour

Lisez le [journal des modifications](CHANGELOG.md) (en anglais), puis mettez ha-chauffage à jour
depuis HACS. Chauffage migre vos données automatiquement. Le retour à une version antérieure
n'est pas pris en charge.

## Mise à jour depuis le package (v0.1)

La version 0.1 d'ha-chauffage était un package YAML. L'intégration importe les données du
package.

1. Installez l'intégration (étapes 1 et 2 de l'installation). **Ne retirez pas encore le
   package.** La configuration propose d'importer les semaines du package, ses dérogations en
   cours et son planning actif. Elle désactive ensuite les deux automatisations du package :
   ainsi, seule l'intégration pilote les thermostats.
2. Vérifiez la carte et les thermostats. Pour revenir au package, supprimez l'intégration et
   réactivez les deux automatisations `automation.chauffage_*`. L'import ne modifie pas les
   données du package.
3. Suivez la réparation que Home Assistant affiche dans Paramètres. La réparation vous demande
   de supprimer `packages/chauffage/` et `www/chauffage/`, de retirer la ligne `extra_module_url`
   et les exclusions `recorder` de `configuration.yaml`, puis de redémarrer Home Assistant.
4. Dans vos automatisations, remplacez `input_select.mode_chauffage` par
   `select.chauffage_schedule`.

Le package n'est plus maintenu. Si vous le voulez quand même, la
[version v0.1.0](https://github.com/armellarcier/ha-chauffage/releases/tag/v0.1.0) le contient,
avec son propre README.

## Plannings

Un **planning** est un programme pour la semaine, par exemple *Normal* ou *Vacances*. Un planning
contient une **semaine** pour chaque thermostat. Une semaine se compose de **créneaux**, et
chaque créneau demande un **préréglage**, par exemple *Confort* ou *Éco*. Le
[glossaire](docs/glossary.md) (en anglais) définit ces mots.

### Créer un planning

Une nouvelle installation démarre avec un seul planning, *Normal*. Dans la carte, **+** crée un
planning : un planning vide, ou la copie d'un autre. Pour renommer, déplacer ou supprimer un
planning, ouvrez son onglet et utilisez **⋮**. Seuls les administrateurs peuvent modifier les
plannings.

Chaque planning a un **identifiant stable**, affiché dans *Renommer…*. L'identifiant stable ne
change jamais, même si vous renommez le planning. Utilisez l'identifiant stable dans vos
automatisations.

### Changer de planning actif

Un seul planning est actif à la fois. Le sélecteur **Planning actif**
(`select.chauffage_schedule`) indique lequel.

- **Depuis la carte**, ouvrez l'onglet du planning, puis cliquez sur *Activer*.
- **Depuis le panneau Chauffage**, sur l'onglet *Plannings*, cliquez sur *Activer*.
- **Depuis une automatisation**, appelez `chauffage.activate_schedule` avec l'identifiant stable
  du planning. L'attribut `schedule_id` du sélecteur donne l'identifiant stable du planning
  actif.
- **Depuis un tableau de bord, un script ou à la voix**, utilisez le sélecteur ou l'interrupteur
  du planning (voir [Entités](#entités)).

Par exemple, cette automatisation alterne deux plannings, les semaines paires et impaires :

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

Les règles d'activation changent de planning à votre place, sans automatisation. Vous écrivez
les règles dans le panneau Chauffage, sur l'onglet *Plannings*, sous la liste des plannings.
Seuls les administrateurs peuvent modifier les règles.

### Comment marchent les règles

Les règles sont dans l'ordre. **La première règle qui s'applique l'emporte.** Si aucune règle ne
s'applique, Chauffage active le planning par défaut. Sans planning par défaut, le planning actif
reste le même.

Une règle est un template. Vous pouvez écrire une règle de deux façons :

- **Un template et un planning.** Le planning est actif tant que le template est vrai. Chauffage
  lit le template comme une condition template : par exemple `true`, `on`, `yes` ou `1` sont
  vrais, et tout autre texte est faux.
- **Un template qui donne le planning.** Le template renvoie le nom du planning ou son
  identifiant stable.

La carte essaie chaque règle pendant que vous l'écrivez. Pour chaque règle, la carte montre ce
que donne le template en ce moment (ou son erreur), et si la règle s'applique.

Si vous choisissez un planning à la main, votre choix reste jusqu'à ce que le résultat des
règles change. L'attribut `rules_choice` du sélecteur donne le planning que demandent les
règles. Pour y revenir tout de suite, une automatisation peut appeler
`chauffage.activate_schedule`.

### Exemple : EDF Tempo

Pour suivre la couleur du jour EDF Tempo, écrivez deux règles et choisissez *Normal* comme
planning par défaut :

| Template | Planning |
|---|---|
| `{{ is_state('sensor.edf_tempo_color', 'red') }}` | *Absent* |
| `{{ is_state('sensor.edf_tempo_color', 'white') }}` | *Jours éco* |
| (aucune règle ne s'applique) | *Normal* (par défaut) |

Vous pouvez aussi écrire une seule règle, dont le template donne le planning :

```jinja
{{ {'red': 'absent', 'white': 'jours_eco'}.get(states('sensor.edf_tempo_color'), 'normal') }}
```

### Exemple : un calendrier des plannings

#### Une seule règle

Vous pouvez prévoir vos plannings dans un calendrier. Chauffage active alors le planning que
nomme l'événement en cours.

1. Ajoutez un *Calendrier local* (Paramètres › Appareils et services › Ajouter une
   intégration), par exemple `calendar.chauffage`.
2. Ajoutez des événements qui portent le nom de vos plannings. Par exemple : *Vacances* du
   vendredi soir au dimanche, *Absent* jusqu'à mardi 18:00, et *Télétravail* tous les mercredis,
   avec un événement récurrent.
3. Écrivez une seule règle, et choisissez *Normal* comme planning par défaut :

   ```jinja
   {{ state_attr('calendar.chauffage', 'message') if is_state('calendar.chauffage', 'on') }}
   ```

Pendant un événement, le titre de l'événement donne le planning. Le titre peut être le nom du
planning, en majuscules ou en minuscules, ou son identifiant stable. Entre deux événements, le
planning par défaut s'applique. Un nouveau planning ne demande aucun changement de la règle.

Tous les calendriers marchent de la même façon, par exemple Google ou CalDAV. Vous pouvez alors
planifier depuis votre téléphone, ou partager le calendrier avec toute la maison.

#### Des événements qui se chevauchent

Avec la règle ci-dessus, les événements ne doivent pas se chevaucher. Une entité calendrier ne
montre qu'un seul événement : celui qui a commencé le premier. Une soirée *Absent* pendant une
semaine de *Vacances* passe donc inaperçue.

Pour prévoir des exceptions dans un long événement, utilisez le blueprint
[`calendar_schedule.yaml`](blueprints/automation/chauffage/calendar_schedule.yaml). Le blueprint
lit tous les événements en cours. Il écrit dans une entrée texte le planning de l'événement qui
a commencé le dernier.

1. Créez une entrée *Texte* (Paramètres › Appareils et services › Entrées), par exemple
   `input_text.planning_du_calendrier`.
2. [![Importer le blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Farmellarcier%2Fha-chauffage%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fchauffage%2Fcalendar_schedule.yaml),
   puis créez une automatisation à partir du blueprint, avec votre calendrier et l'entrée.
3. Écrivez une règle qui lit l'entrée : `{{ states('input_text.planning_du_calendrier') }}`.

Le blueprint ignore les événements dont le titre ne nomme aucun planning. Le planning change dès
qu'un événement commence ou finit. Le blueprint voit un événement ajouté ou modifié à sa
prochaine lecture du calendrier : toutes les cinq minutes par défaut. Pour un calendrier en
ligne, choisissez quinze minutes : un calendrier en ligne ne se synchronise pas plus souvent.

## Préréglages

Les créneaux demandent des préréglages. Chauffage est livré avec quatre préréglages :
*Confort* 20 °C, *Éco* 17 °C, *Boost* 21 °C et *Hors-gel* 7 °C.

### Ce que fait un préréglage sur chaque thermostat

Si le thermostat a son propre préréglage du même nom, Chauffage utilise ce préréglage. Sinon,
Chauffage règle la température du préréglage. Vous pouvez changer ce choix pour chaque
thermostat : prenez un des préréglages du thermostat, ou une température.

### Régler les préréglages dans le panneau Chauffage

Ouvrez le panneau Chauffage, puis l'onglet *Préréglages*. Seuls les administrateurs peuvent
modifier les préréglages. Le tableau a une colonne par préréglage, du plus froid au plus chaud,
et une ligne par thermostat. La page d'un thermostat, dans le panneau, ne montre que sa ligne.

- **Un en-tête de colonne** ouvre le préréglage : son nom, sa couleur et sa température par
  défaut. Vous pouvez aussi y supprimer le préréglage. Pour ajouter un préréglage, cliquez sur
  *+ Ajouter un préréglage* sous le tableau.
- **Une case** ouvre ce que fait le préréglage sur ce thermostat. La case indique d'où vient sa
  température, par exemple « son préréglage *Confort* », « réglé ici » ou « par défaut ». La
  fenêtre de la case donne un lien vers l'appareil du thermostat, où se règlent les préréglages
  propres au thermostat.

### La température d'un préréglage propre au thermostat

Aucun attribut standard ne donne la température d'un préréglage propre au thermostat. Chauffage
retient donc la consigne qu'il a vue pendant que ce préréglage était actif. En attendant, la
carte affiche « ? ».

Versatile Thermostat fait exception. Chauffage lit les températures de ses préréglages dans ses
attributs.

## Thermostats compatibles

Chauffage fonctionne avec toute entité `climate` qui a une température de consigne. Les tests
couvrent trois types de thermostats :

- **Versatile Thermostat.** Chauffage utilise ses préréglages (`comfort`, `eco`, `boost`,
  `frost`). Leurs températures se règlent dans Versatile Thermostat. Si vous changez la consigne
  à la main, Versatile Thermostat passe en preset `none`, et Chauffage en fait une dérogation.
- **Les thermostats à préréglages standard**, par exemple `eco` ou `comfort`. Chauffage utilise
  le préréglage du thermostat qui porte le même nom. Pour les autres préréglages, par exemple le
  hors-gel, Chauffage règle une température.
- **Les thermostats sans préréglages**, par exemple `generic_thermostat`. Chauffage règle des
  températures. Toute consigne changée par quelqu'un d'autre devient une dérogation.

Chauffage ne prend pas encore en charge ces appareils :

- les thermostats chaud / froid à plage de températures (`heat_cool`) ;
- les appareils qui changent leur consigne d'eux-mêmes : Chauffage pourrait prendre leurs
  changements pour des changements manuels.

Certains appareils gardent leur préréglage quand vous changez leur consigne à la main. Pour un tel
appareil, réglez chaque préréglage sur une température, dans le panneau Chauffage, sur l'onglet *Préréglages*.

La [feuille de route](ROADMAP.fr.md) présente la suite, par exemple les groupes de thermostats.

## Dérogations

Une dérogation est un changement temporaire sur un thermostat. Une dérogation dure 2 heures par
défaut. Vous pouvez changer cette durée dans les [options](#options).

### Créer une dérogation

- **Sur le thermostat.** Changez la consigne ou le préréglage à la main, avec la molette ou dans
  Home Assistant. Chauffage fait de votre changement une dérogation.
- **Depuis la carte**, ou depuis la fenêtre de détail du thermostat. Choisissez un préréglage ou
  une température, et une fin.
- **Depuis une automatisation**, avec l'action `chauffage.set_override`.

Un changement fait par une automatisation ne crée pas de dérogation. Une commande qu'une vanne à
pile applique en retard n'en crée pas non plus.

### Arrêter une dérogation

Une dérogation s'arrête d'elle-même, et le thermostat reprend son planning. Pour l'arrêter plus
tôt, remettez le thermostat sur le préréglage ou la consigne prévus, même avec la molette. Vous
pouvez aussi arrêter la dérogation depuis la carte, ou avec l'action `chauffage.clear_override`.

## Thermostats programmés

Un thermostat est **programmé** dès que vous l'ajoutez à une carte, ou dès que vous le
programmez dans le panneau Chauffage : sur l'onglet *Thermostats*, choisissez-le sous
*Programmer un autre thermostat*. Si vous retirez le thermostat d'une carte, il reste programmé,
car une autre carte peut l'afficher. Le thermostat reste programmé jusqu'à ce que vous
l'oubliiez.

L'onglet *Thermostats* du panneau liste tous les thermostats programmés, et les cartes qui les
affichent. Pour oublier un thermostat, ouvrez son menu ⋮, puis *Oublier…*. Si vous supprimez
l'entité d'un thermostat de Home Assistant, Paramètres → Réparations propose d'oublier le
thermostat.

### Mettre un thermostat en pause

Pour mettre un thermostat en pause, éteignez son interrupteur **Pilotage**, ou cliquez sur
*Mettre en pause* dans le panneau Chauffage. Chauffage garde les semaines du thermostat, mais ne lui envoie plus de commandes et ne crée plus de dérogations. La
pause est pratique pour une pièce que vous gérez à la main quelques jours, ou à la fin de la
saison de chauffe.

Pour reprendre le planning, rallumez l'interrupteur **Pilotage**.

## Entités

Tout ce que sait Chauffage s'utilise aussi sans la carte : sur les pages des appareils, dans les
tableaux de bord, les automatisations, les scripts et à la voix. Les entités apparaissent
d'elles-mêmes. Elles montrent les données de Chauffage et les modifient, comme la carte. Vous
pouvez les renommer et changer leurs icônes dans Home Assistant.

### Sur l'appareil de chaque thermostat programmé

Chauffage donne à chaque thermostat programmé son propre appareil, au nom du thermostat, avec le
modèle *Thermostat programmé*. L'appareil est dans la pièce du thermostat. Quand le thermostat a
un appareil, par exemple celui de sa vanne, l'appareil de Chauffage y est connecté : la page de
l'appareil du thermostat le liste dans *Appareils connectés*. Le bouton *Visiter* de l'appareil
ouvre la page du thermostat dans le panneau Chauffage.

| Entité | Ce qu'elle indique |
|---|---|
| **Pilotage** (interrupteur) | Éteint quand le thermostat est **en pause**. |
| **Préréglage prévu** (capteur) | Le préréglage prévu maintenant. Attributs : `preset_name`, `target`, `next_preset`, `next_preset_name`, `next_start`, et `temperatures` (la température de chaque préréglage sur ce thermostat). |
| **Dérogation** (capteur binaire) | Allumé tant que le thermostat a une dérogation. Attributs : `kind` (`temperature` ou `preset`), `value` (une température, ou le préréglage propre au thermostat), `preset` (le préréglage Chauffage demandé, s'il y en a un), `end`. |
| **Fin de dérogation** (capteur, désactivé par défaut) | La fin de la dérogation en cours, sous forme d'horodatage, pour une tuile de tableau de bord. |

Les capteurs sont indisponibles pendant la pause du thermostat.

Sur une installation d'avant la 0.6, le capteur du préréglage prévu garde son ancien
identifiant, `sensor.<thermostat>_planning` en français. Chauffage active ce capteur une fois.

### Sur l'appareil *Chauffage*

| Entité | Ce qu'elle indique |
|---|---|
| **Planning actif** (sélecteur, `select.chauffage_schedule`) | Le planning actif. Choisissez une autre option pour activer un autre planning. Attributs : `schedule_id`, et `rules_choice` (le planning que donnent les règles d'activation, vide sans règles). |
| **Planning &lt;nom&gt;** (un interrupteur par planning, `switch.chauffage_schedule_<id>`) | Allumé pour le planning actif. Allumez un interrupteur pour activer son planning. Vous ne pouvez pas éteindre le planning actif : allumez-en un autre. La carte affiche l'icône de l'interrupteur sur l'onglet du planning. |

### Assistants vocaux

Home Assistant expose les nouveaux interrupteurs aux assistants vocaux. Vous pouvez donc dire
« éteins le pilotage du salon » ou « allume le planning Vacances ». Les interrupteurs *Pilotage*
créés avant la 0.6 ne sont pas exposés. Pour exposer une entité ou non, allez dans Paramètres →
Assistants vocaux → Exposer.

## Services

| Action | Ce qu'elle fait |
|---|---|
| `chauffage.set_override` | Crée une dérogation sur un thermostat : une température ou un préréglage, pour une durée ou jusqu'à une heure. Un préréglage a le même sens que dans la carte. |
| `chauffage.clear_override` | Arrête la dérogation : le thermostat reprend son planning tout de suite. |
| `chauffage.activate_schedule` | Active un planning, par son identifiant stable. |
| `chauffage.get_schedules` | Renvoie les plannings (`id`, `name`, et `entity_id` de leur interrupteur), `active_schedule`, `rules_choice` et `default_schedule`. |
| `chauffage.get_week` | Renvoie les semaines des thermostats dans un planning (le planning actif par défaut). |

`chauffage.get_week` renvoie une entrée par thermostat, au format de `schedule.get_schedule` de
Home Assistant : `schedule`, puis une liste par jour (`monday`…), et chaque créneau avec son `start`, son `end` et
son `preset`. Par exemple, pour envoyer l'heure du confort de demain :

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

## Événements

Chauffage émet des événements que vos automatisations peuvent utiliser, avec le déclencheur
*Événement* :

| Événement | Données |
|---|---|
| `chauffage_override_started` | `entity_id`, `kind`, `value`, `preset`, `end`, et `source` : `thermostat` (changé à la main), `card` ou `service`. Émis pour une nouvelle dérogation ou une nouvelle valeur, pas quand seule la fin change. |
| `chauffage_override_ended` | `entity_id`, et `reason` : `expired`, `thermostat` (remis sur son planning à la main), `card`, `service`, `paused` ou `forgotten`. |
| `chauffage_schedule_activated` | `schedule` (l'identifiant stable), `schedule_name`, `previous_schedule`, `entity_id` (le sélecteur *Planning actif*), et `source` : `card`, `entity` (le sélecteur ou un interrupteur de planning), `service` ou `rules`. |

Chaque événement porte le contexte de ce qui l'a causé. Le journal de bord indique donc qui a
changé le thermostat, utilisé la carte, appelé l'action ou choisi le planning.

Par exemple, pour être prévenu quand quelqu'un change un thermostat à la main :

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

Pour changer les options, allez dans Paramètres → Appareils et services → Chauffage →
*Configurer*.

- **Durée des dérogations.** 2 heures par défaut.
- **Utiliser les préréglages des thermostats.** Activée par défaut. Si vous la désactivez,
  Chauffage pilote tous les thermostats en température, et vous réglez toutes les températures
  dans la carte.

## Dépannage

Un thermostat n'a pas fait ce que vous attendiez ? Voici où chercher, dans l'ordre.

### 1. Le journal de bord du thermostat

Le journal de bord du thermostat note chaque dérogation. Il indique d'où vient la dérogation
(la molette, la carte ou l'action `chauffage.set_override`) et pourquoi elle s'est arrêtée.

Les changements de planning sont notés dans le journal de bord du sélecteur *Planning actif*.

### 2. Les journaux de Home Assistant

Pour voir chaque commande envoyée aux thermostats et sa raison, passez Chauffage au niveau
`info` :

```yaml
logger:
  logs:
    custom_components.chauffage: info
```

### 3. Les diagnostics

Téléchargez les diagnostics : Paramètres → Appareils et services → Chauffage → ⋮ →
*Télécharger les diagnostics*. Joignez ce fichier à votre issue. Le fichier contient vos plannings
et l'état actuel des thermostats.

## Architecture

Cette section s'adresse aux curieux et aux contributeurs.

**Les données.** Chauffage enregistre ses données dans `.storage/chauffage` : les plannings, les
préréglages, les semaines et les dérogations en cours. Les semaines ont le format
`{climate: {id du planning: [7 jours × [[début, préréglage], …]]}}`. Les données ont une
version, et Chauffage les migre automatiquement.

**Le programmateur.** Chaque minute, le programmateur applique le préréglage des créneaux qui
commencent. Il remet aussi sur leur planning les thermostats dont la dérogation se termine. Le
programmateur remet chaque thermostat sur son planning au démarrage, à l'activation d'un
planning et à l'enregistrement des semaines. Il ne touche pas à un thermostat en dérogation,
éteint ou indisponible. Une vanne injoignable ne bloque pas les autres thermostats.

**Les changements manuels.** Une consigne changée à la main, ou un préréglage choisi par un
utilisateur, devient une dérogation. Revenir à ce que demande le créneau arrête la dérogation.
Chauffage ignore ses propres changements, grâce à leur contexte, et ceux des automatisations.
Chauffage ignore aussi une commande qu'une vanne à pile applique en retard : il garde en mémoire
pendant un jour les commandes pas encore appliquées.

**La carte.** L'intégration fournit la carte et la charge sur toutes les pages, pour la carte et
pour le bloc de la fenêtre de détail. La carte dialogue avec l'intégration par l'API websocket,
par exemple `chauffage/subscribe` ou `chauffage/weeks/save`. L'intégration refuse un
enregistrement fait depuis une copie périmée : un enregistrement n'écrase jamais les
modifications de quelqu'un d'autre.

**L'historique.** La carte demande à l'intégration la température mesurée et la consigne
appliquée des 7 derniers jours (`chauffage/history`). L'intégration lit ces deux valeurs dans le
recorder de Home Assistant, et rien d'autre : l'historique de Home Assistant enverrait tous les
attributs du thermostat, des mégaoctets pour une semaine. L'intégration garde aussi en mémoire ce
qu'elle a lu : un rafraîchissement de la carte ne lit que les dernières minutes.

**Pièges connus**, déjà gérés et couverts par des tests :

- Les préréglages ZHA sont des Enum.
- Safari refuse les dates avec des microsecondes.
- `ha-card` s'affiche de façon asynchrone, ce qui compte pour placer les popovers.

## Structure

```
custom_components/chauffage/        l'intégration (programmateur, entités, services, API websocket)
custom_components/chauffage/frontend/  carte Lovelace + bloc injecté dans la fenêtre de détail
dev/compose.yaml, dev/hass/         HA de développement jetable (VTherm + pièces simulées)
dev/sim_rooms/, dev/sim_climate/    dev uniquement : modèle thermique des pièces (et une semaine
                                    d'historique simulée pour un HA de dev neuf), un climate à
                                    préréglages standard
tests/integration/, tests/js/       tests automatisés (pytest + HA en mémoire, node --test + jsdom)
docs/                               glossaire, décisions, cas d'usage, style d'écriture (en anglais)
tests/fixtures/                     données stockées dans chaque ancien format (tests des migrations)
scripts/                            test.sh, logs.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, vérifications HACS et publication
```

Pour contribuer, lisez [CONTRIBUTING.fr.md](CONTRIBUTING.fr.md).

## Licence

[MIT](LICENSE) © 2026 Armel Larcier

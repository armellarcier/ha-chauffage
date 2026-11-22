# Règles d'activation

[English](activation-rules.md) · **Français**

Les règles d'activation changent de planning à votre place, sans automatisation. Écrivez les
règles dans le panneau Chauffage, sur l'onglet *Plannings*, sous la liste des plannings. Qui
peut modifier les règles dépend du [niveau d'accès](panel.fr.md#qui-peut-modifier-quoi).

## Comment marchent les règles

Les règles sont dans l'ordre. **La première règle qui s'applique l'emporte.** Si aucune règle ne
s'applique, Chauffage active le planning par défaut. Sans planning par défaut, le planning actif
reste le même.

Une règle est un template. Vous pouvez écrire une règle de deux façons :

- **Un template et un planning.** Le planning est actif tant que le template est vrai, par
  exemple `true`, `on` ou `1`.
- **Un template qui donne le planning.** Le template renvoie le nom du planning ou son
  identifiant stable.

**Un planning choisi à la main** reste actif jusqu'à ce que le résultat des règles change. Pour
revenir tout de suite au planning des règles, appelez `chauffage.activate_schedule` avec
l'attribut `rules_choice` du sélecteur.

## Exemple : EDF Tempo

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

## Exemple : un calendrier des plannings

### Une seule règle

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
planning par défaut s'applique.

Tous les calendriers marchent de la même façon, par exemple Google ou CalDAV. Vous pouvez alors
planifier depuis votre téléphone, ou partager le calendrier avec toute la maison.

### Des événements qui se chevauchent

Avec la règle ci-dessus, les événements ne doivent pas se chevaucher. Une entité calendrier ne
montre que l'événement qui a commencé le premier. Une soirée *Absent* pendant une semaine de
*Vacances* passe donc inaperçue.

Pour prévoir des exceptions dans un long événement, utilisez le blueprint
[`calendar_schedule.yaml`](../blueprints/automation/chauffage/calendar_schedule.yaml). Le blueprint
écrit dans une entrée texte le planning de l'événement qui a commencé le dernier.

1. Créez une entrée *Texte* (Paramètres › Appareils et services › Entrées), par exemple
   `input_text.planning_du_calendrier`.
2. [![Importer le blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Farmellarcier%2Fha-chauffage%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fchauffage%2Fcalendar_schedule.yaml),
   puis créez une automatisation à partir du blueprint, avec votre calendrier et l'entrée.
3. Écrivez une règle qui lit l'entrée : `{{ states('input_text.planning_du_calendrier') }}`.

Par défaut, le blueprint voit un événement ajouté ou modifié toutes les cinq minutes. Pour un
calendrier en ligne, choisissez quinze minutes : un calendrier en ligne ne se synchronise pas
plus souvent.

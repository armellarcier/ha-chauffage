# Entités, services et événements

[English](automations.md) · **Français**

Lisez cette page pour utiliser Chauffage dans vos automatisations, vos scripts et vos tableaux
de bord. Chauffage vous donne trois outils :

- des **entités**, pour lire le préréglage prévu et les dérogations, et pour changer les
  réglages ;
- des **services**, pour créer ou arrêter une dérogation, activer un planning, ou lire les
  semaines ;
- des **événements**, pour réagir quand une dérogation commence ou finit, ou quand un planning
  est activé.

## Entités

Les entités apparaissent d'elles-mêmes. Elles lisent et modifient les mêmes données que la
carte. Vous pouvez les renommer et changer leurs icônes dans Home Assistant.

### Sur l'appareil de chaque thermostat programmé

Chaque thermostat programmé reçoit son propre appareil, au nom du thermostat, avec le modèle
*Thermostat programmé*. Vous trouvez cet appareil dans la pièce du thermostat, et dans
*Appareils connectés* sur la page de l'appareil du thermostat. Le bouton *Visiter* de l'appareil
ouvre la page du thermostat dans le panneau Chauffage.

| Entité | Ce qu'elle indique |
|---|---|
| **Pilotage** (interrupteur) | Éteint quand le pilotage du thermostat est **suspendu**. |
| **Préréglage prévu** (capteur) | Déprécié : utilisez **Prochain changement**. Le préréglage prévu maintenant. Désactivé par défaut. |
| **Dérogation** (capteur binaire) | Allumé tant que le thermostat a une dérogation. |
| **Fin de dérogation** (capteur, désactivé par défaut) | La fin de la dérogation en cours, sous forme d'horodatage. |
| **Prochain changement** (capteur) | Le moment où Chauffage changera le thermostat, et ce qu'il enverra. Pour les outils de préchauffage, voir [Outils de préchauffage](preheating.fr.md). |

Les capteurs sont indisponibles pendant la pause du thermostat.

**Attributs du capteur du préréglage prévu.**

- `preset_name` et `target`.
- `hvac_mode` : le mode HVAC du créneau, par exemple `off` ou `cool`. Le créneau d'un radiateur
  n'a pas de mode HVAC. Pendant un créneau sans préréglage, l'état du capteur est inconnu.
- `next_preset`, `next_preset_name`, `next_hvac_mode` et `next_start`.
- `temperatures` : la température de chaque préréglage sur ce thermostat. Pendant un créneau qui
  climatise, c'est la température en clim.

**Attributs du capteur de dérogation.**

- `target` : ce que reçoit le thermostat, par exemple `{"temperature": 21.5}` ou
  `{"preset_mode": "boost"}`.
- `preset` : le préréglage Chauffage demandé, s'il y en a un.
- `end`.
- `kind` et `value` : le format d'avant la 0.10, gardé pour les anciennes automatisations.

**Installé avant la 0.6 ?** Le capteur du préréglage prévu garde son ancien identifiant,
`sensor.<thermostat>_planning` en français.

### Sur l'appareil *Chauffage*

| Entité | Ce qu'elle indique |
|---|---|
| **Planning actif** (sélecteur, `select.chauffage_schedule`) | Le planning actif. Choisissez une autre option pour activer un autre planning. |
| **Planning &lt;nom&gt;** (interrupteur, `switch.chauffage_schedule_<id>`) | Un interrupteur par planning, allumé pour le planning actif. Allumez un interrupteur pour activer son planning. |
| **Fin des dérogations** (sélecteur, `select.chauffage_manual_override_end`) | Combien de temps dure une dérogation : `duration`, `next_slot_within_duration` ou `next_slot`. |
| **Thermostat éteint** (sélecteur, `select.chauffage_off_override_end`) | Combien de temps un thermostat éteint reste éteint : `next_slot` (par défaut), `duration` ou `next_slot_within_duration`. |
| **Durée des dérogations** (nombre, `number.chauffage_override_duration`) | La durée des dérogations en minutes, de 15 minutes à 24 heures. |

Le sélecteur *Planning actif* a deux attributs. `schedule_id` est l'identifiant du planning
actif. `rules_choice` est le planning que donnent les règles d'activation. Sans règles,
`rules_choice` est vide.

Vous ne pouvez pas éteindre l'interrupteur du planning actif. Allumez plutôt l'interrupteur d'un
autre planning. Pour changer l'icône de l'interrupteur d'un planning, ouvrez le menu ⋮ du
planning dans la carte, puis *Changer l'icône…*. La carte affiche cette icône sur l'onglet du
planning.

[Choisir combien de temps dure une
dérogation](overrides.fr.md#choisir-combien-de-temps-dure-une-dérogation) et [Éteindre un
thermostat à la main](overrides.fr.md#éteindre-un-thermostat-à-la-main) expliquent les réglages
*Fin des dérogations* et *Thermostat éteint*.

### Assistants vocaux

Vous pouvez dire « éteins le pilotage du salon » ou « allume le planning Vacances ». Home
Assistant expose les nouveaux interrupteurs aux assistants vocaux. Les interrupteurs *Pilotage*
créés avant la 0.6 ne sont pas exposés. Pour exposer une entité ou non, allez dans Paramètres →
Assistants vocaux → Exposer.

## Services

| Action | Ce qu'elle fait |
|---|---|
| `chauffage.set_override` | Crée une dérogation sur un thermostat, pour une durée ou jusqu'à une heure. |
| `chauffage.clear_override` | Arrête la dérogation. Le thermostat reprend son planning tout de suite. |
| `chauffage.activate_schedule` | Active un planning, par son identifiant stable. |
| `chauffage.get_schedules` | Renvoie les plannings, `active_schedule`, `rules_choice` et `default_schedule`. |
| `chauffage.get_week` | Renvoie les semaines des thermostats dans un planning, le planning actif par défaut. |

### `chauffage.set_override`

Une dérogation règle un mode HVAC, une température ou un préréglage. Un préréglage a le même sens
que dans la carte.

- **Éteindre.** Donnez `hvac_mode: off`. Sans durée ni heure, le thermostat reste éteint aussi
  longtemps que le dit le réglage *Thermostat éteint*.
- **Allumer dans un mode HVAC.** Donnez `hvac_mode`, par exemple `heat` ou `cool`. `dry`, `auto`
  et `fan_only` ne prennent ni température ni préréglage.
- **Chauffe/Clim.** `heat_cool` prend un préréglage, ou `target_temp_low` et
  `target_temp_high`.

L'action refuse une demande qui se contredit, et son message dit pourquoi. Par exemple, l'action
refuse `off` avec une température, ou une durée et une heure ensemble.

### `chauffage.get_schedules`

Chaque planning a son `id`, son `name` et l'`entity_id` de son interrupteur.

### `chauffage.get_week`

`chauffage.get_week` renvoie une entrée par thermostat, comme `schedule.get_schedule` de Home
Assistant. Chaque entrée a son `schedule`, et une liste par jour, par exemple `monday`. Chaque
créneau a son `start`, son `end` et son `preset`.

Sur un thermostat qui a des modes HVAC, un créneau a aussi son `hvac_mode`, par exemple `heat`
ou `off`. Un créneau *Éteint*, *Ventilation*, *Déshum.* ou *Auto* n'a pas de préréglage : son
`preset` est vide.

Par exemple, pour envoyer l'heure du confort de demain :

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

Utilisez ces événements avec le déclencheur *Événement* :

| Événement | Quand |
|---|---|
| `chauffage_override_started` | Une dérogation commence, ou change de valeur. |
| `chauffage_override_end_changed` | Seule la fin d'une dérogation change. |
| `chauffage_override_ended` | Une dérogation s'arrête. |
| `chauffage_schedule_activated` | Un planning est activé. |

Le journal de bord indique qui a changé le thermostat, utilisé la carte, appelé l'action ou
choisi le planning.

### Événements des dérogations

Les trois événements des dérogations portent `entity_id`, `start` et `end`.

`chauffage_override_started` et `chauffage_override_end_changed` portent aussi :

- `target`, par exemple `{"temperature": 21.5}`, et `preset` ;
- `source` : `thermostat` (changé à la main), `card`, `panel` (le panneau Chauffage) ou
  `service` ;
- `kind` et `value`, le format d'avant la 0.10.

`chauffage_override_ended` porte aussi `reason`, par exemple `expired`, `thermostat` (remis sur
son planning à la main) ou `card`. Les autres raisons sont `panel`, `service`, `paused` et
`forgotten`.

Quand Chauffage sait pourquoi la dérogation s'arrête à ce moment, les événements portent
`ends_at` : `duration`, `next_slot` ou `no_next_slot`.

### Événement du planning

`chauffage_schedule_activated` porte :

- `schedule` (l'identifiant stable), `schedule_name` et `previous_schedule` ;
- `entity_id`, le sélecteur *Planning actif* ;
- `source` : `card`, `panel`, `entity` (le sélecteur ou un interrupteur de planning), `service`
  ou `rules`.

### Exemple

Pour être prévenu quand quelqu'un change un thermostat à la main :

```yaml
triggers:
  - trigger: event
    event_type: chauffage_override_started
    event_data:
      source: thermostat
actions:
  - action: notify.mobile_app_telephone
    data:
      message: "{{ trigger.event.data.entity_id }} : {{ trigger.event.data.target.values() | join(', ') }} jusqu'à {{ as_datetime(trigger.event.data.end).strftime('%H:%M') }}"
```

# Outils de préchauffage

[English](preheating.md) · **Français**

Cette page s'adresse aux développeurs d'outils de préchauffage, comme
[Intelligent Heating Pilot](https://github.com/RastaChaum/Intelligent-Heating-Pilot). Un outil de
préchauffage allume un thermostat avant un créneau, pour que la pièce soit chaude quand le
créneau commence.

Chauffage décide de ce qui arrive au thermostat, et quand. Votre outil décide combien de temps à
l'avance démarrer.

## 1. Lire le prochain changement

Chaque thermostat programmé a un capteur **Prochain changement** (*Next change* en anglais). Ce
capteur est activé par défaut.

### L'état

L'état est un horodatage : le moment où Chauffage changera le thermostat la prochaine fois.

- **Sans dérogation**, le prochain changement est le prochain créneau qui envoie au thermostat
  autre chose. Par exemple, sur un thermostat sans préréglages, un créneau *Éco* à 17 °C suivi
  d'un créneau *Nuit* à 17 °C envoie deux fois 17 °C. Le créneau *Nuit* n'est pas un changement.
- **Avec une dérogation**, le prochain changement est la fin de la dérogation.
- **Quand aucun créneau ne change le thermostat** dans la semaine, l'état est inconnu.
- **Pendant la pause du thermostat**, le capteur est indisponible.

Le capteur suit le planning, pas ce qu'affiche le thermostat. Pendant que votre outil préchauffe
un créneau, le capteur donne donc toujours le début de ce créneau.

Le capteur ne tient pas compte des règles d'activation : Chauffage ne peut pas prévoir quand une
règle change de planning. Quand une règle ou un utilisateur active un autre planning, le capteur
suit aussitôt le nouveau planning.

### Les attributs

Les attributs portent les noms des attributs d'une entité `climate`. Votre outil peut donc les
passer tels quels aux services `climate`.

| Attribut | Ce qu'il donne | Exemple |
|---|---|---|
| `hvac_mode` | Le mode HVAC qu'aura le thermostat. C'est le mode HVAC du créneau, ou le mode HVAC actuel du thermostat quand le créneau n'en fixe pas. | `"heat"` |
| `preset_mode` | Le préréglage du thermostat que Chauffage enverra, ou `null` quand Chauffage envoie une température. | `"comfort"` |
| `temperature` | La consigne qu'aura le thermostat, ou `null` quand Chauffage ne la connaît pas encore. | `20.0` |
| `target_temp_low`, `target_temp_high` | La plage d'un créneau chaud/froid. Présents seulement pour un créneau chaud/froid. | `20.0`, `25.0` |
| `preset` | Le préréglage Chauffage du créneau qui commencera. `null` pour un créneau éteint. | `"comfort"` |
| `preset_name` | Le nom du préréglage, tel que l'utilisateur l'a écrit. | `"Confort"` |

Quand `hvac_mode` vaut `heat` ou `cool`, `preset_mode` ou `temperature` est toujours renseigné.
Les deux valent `null` pour un créneau sans consigne, par exemple un créneau éteint ou en
ventilation.

Sur un thermostat qui a ses propres préréglages, Chauffage apprend la température de chaque
préréglage pendant que le thermostat l'utilise. Un Versatile Thermostat publie les températures
de ses préréglages, donc Chauffage les connaît tout de suite.

### Quoi envoyer

1. Quand `hvac_mode` vaut `off`, Chauffage éteindra le thermostat. Il n'y a rien à préchauffer.
2. Quand le thermostat est dans un autre mode HVAC, envoyez aussi `hvac_mode`, ou ne préchauffez
   pas. Par exemple, un climatiseur en ventilation ne chauffe pas tant qu'il n'a pas reçu `heat`.
3. Quand `preset_mode` est renseigné, envoyez ce préréglage. La `temperature` à côté indique ce
   que donne le préréglage : ne l'envoyez pas.
4. Sinon, envoyez `temperature`, ou la plage d'un créneau chaud/froid.

### Laisser l'utilisateur choisir le capteur

Dans la configuration de votre outil, laissez l'utilisateur choisir le capteur **Prochain
changement** du thermostat, comme il choisit une entité de planning. Pour reconnaître le
capteur, lisez son entrée dans le registre des entités :

| Champ | Valeur |
|---|---|
| Plateforme | `chauffage` |
| Clé de traduction (`translation_key`) | `next_change` |
| Classe d'appareil | `timestamp` |

Ne vous fiez ni à l'identifiant unique ni à l'identifiant d'entité. L'identifiant unique est
interne, et l'utilisateur peut renommer l'identifiant d'entité.

## 2. Appliquer le prochain créneau en avance

Pour préchauffer, mettez le thermostat sur la valeur du prochain créneau avec un **contexte qui a
un parent**. Chauffage traite ce changement comme celui d'une automatisation : il ne crée pas de
dérogation.

```python
await hass.services.async_call(
    "climate", "set_preset_mode",
    {"entity_id": "climate.salon", "preset_mode": "comfort"},
    context=Context(parent_id=own_context.id),
)
```

Si votre intégration change sa propre entité climate, appelez
`self.async_set_context(Context(parent_id=...))` avant `async_write_ha_state()`. Sans contexte,
Home Assistant en crée un vide, et Chauffage prend le changement pour un changement fait sur
l'appareil.

Par exemple, avec un créneau *Confort* à 17h30 préchauffé dès 16h45 :

1. À 16h45, votre outil met *Confort* avec un contexte parent. Chauffage ne touche pas au
   thermostat.
2. Jusqu'à 17h30, Chauffage n'envoie rien au thermostat.
3. À 17h30, le thermostat est déjà sur *Confort*, donc rien ne change.

## 3. Recommencer après un réalignement

Chauffage remet parfois un thermostat sur son créneau en cours. Par exemple, Chauffage le fait
quand Home Assistant a démarré, quand un thermostat devient prêt après un redémarrage, ou quand
l'utilisateur modifie un préréglage. Ce réalignement annule votre préchauffage.

Le capteur **Prochain changement** ne bouge pas lors d'un réalignement. Surveillez donc le
thermostat pendant que votre outil préchauffe :

- **Le thermostat quitte votre valeur, et le capteur donne toujours la même heure.** Chauffage a
  remis le thermostat sur son créneau en cours. Remettez votre valeur, avec votre contexte parent.
- **Le capteur donne une nouvelle heure.** Le planning a changé, ou l'utilisateur a changé le
  thermostat à la main et Chauffage a créé une dérogation. Décidez à nouveau d'après le nouveau
  prochain changement.

## Un format stable

L'état, les attributs et les champs du registre des entités ci-dessus sont stables. Un changement
de ce format est noté dans le
[journal des modifications](../CHANGELOG.md), sous « Upgrading ».

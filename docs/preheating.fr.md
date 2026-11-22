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

Le capteur ne tient pas compte des règles d'activation : Chauffage ne peut pas prévoir quand une
règle change de planning. Quand une règle ou un utilisateur active un autre planning, le capteur
suit aussitôt le nouveau planning.

### Les attributs

| Attribut | Ce qu'il donne | Exemple |
|---|---|---|
| `preset` | Le préréglage Chauffage du créneau qui commencera. `null` pour un créneau éteint. | `"comfort"` |
| `preset_name` | Le nom du préréglage, tel que l'utilisateur l'a écrit. | `"Confort"` |
| `hvac_mode` | Le mode HVAC du créneau, quand le créneau en choisit un. | `"cool"` |
| `target` | Ce que Chauffage enverra : le préréglage du thermostat, une température, un mode HVAC. | `{"preset_mode": "comfort"}` |
| `temperature` | La température qu'aura le thermostat, ou `null` quand Chauffage ne la connaît pas encore. | `20.0` |

Sur un thermostat qui a ses propres préréglages, Chauffage apprend la température de chaque
préréglage pendant que le thermostat l'utilise. Un Versatile Thermostat publie les températures
de ses préréglages, donc Chauffage les connaît tout de suite.

### Laisser l'utilisateur choisir le capteur

Dans la configuration de votre outil, laissez l'utilisateur choisir le capteur **Prochain
changement** du thermostat, comme il choisit une entité de planning. Le capteur a la plateforme
`chauffage` et la classe d'appareil `timestamp`.

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

Chauffage remet chaque thermostat sur son créneau en cours quand Home Assistant démarre, quand un
planning est activé, et quand l'utilisateur enregistre les semaines. Un réalignement pendant un
préchauffage annule le préchauffage. Relisez le capteur **Prochain changement** pour décider s'il
faut recommencer.

## Un format stable

L'état et les attributs ci-dessus sont stables. Un changement de ce format est noté dans le
[journal des modifications](../CHANGELOG.md), sous « Upgrading ».

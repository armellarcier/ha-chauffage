# Dépannage

[English](troubleshooting.md) · **Français**

Un thermostat n'a pas fait ce que vous attendiez ? Voici où chercher, dans l'ordre.

## 1. Le journal de bord

Ouvrez *Activité* (le journal de bord) sans filtre. Chauffage y note chaque dérogation, sous le
nom du thermostat. La ligne indique d'où vient la dérogation, par exemple la molette ou la carte,
et pourquoi la dérogation s'est arrêtée.

Pour filtrer le journal de bord sur un thermostat, filtrez sur le thermostat **et** sur son
capteur *Dérogation*. Filtré sur le thermostat seul, le journal de bord cache les lignes de
Chauffage.

Le journal de bord note les dérogations, pas les créneaux. Pour savoir ce qu'un créneau a
envoyé, lisez les journaux de Home Assistant (point 2).

Les changements de planning sont notés dans le journal de bord du sélecteur *Planning actif*.

## 2. Les journaux de Home Assistant

Pour voir chaque commande envoyée aux thermostats et sa raison, passez Chauffage au niveau
`info` :

```yaml
logger:
  logs:
    custom_components.chauffage: info
```

## 3. Les diagnostics

Téléchargez les diagnostics : Paramètres → Appareils et services → Chauffage → ⋮ →
*Télécharger les diagnostics*. Joignez ce fichier à votre issue. Le fichier contient vos plannings
et l'état actuel des thermostats.

## Une dérogation démarre alors que personne n'a touché au thermostat

Votre thermostat arrondit sans doute la consigne qu'il reçoit, par exemple au degré près.
Chauffage envoie 18,5 °C, le thermostat répond 18 °C, et Chauffage prend cet écart pour un
changement à la main.

Pour le vérifier, lisez les journaux de Home Assistant au niveau `info`. Juste après la
température envoyée par Chauffage, une ligne montre la consigne arrondie, par exemple :

```text
climate.bedroom_valve: changed on the device (heat, setpoint 16.0 → 18.0); the slot asks for temperature 18.5: an override
```

Pour ne plus avoir ces dérogations, choisissez l'une de ces solutions :

- Dans le panneau Chauffage, sur l'onglet *Préréglages*, donnez à ce thermostat des températures
  qu'il accepte, par exemple 18 °C au lieu de 18,5 °C.
- Ou indiquez à Home Assistant le pas du thermostat, dans `configuration.yaml`. Chauffage arrondit
  alors chaque température à ce pas avant de l'envoyer.

```yaml
homeassistant:
  customize:
    climate.vanne_chambre:
      target_temp_step: 1
```

## La carte affiche « Erreur de configuration » après un redémarrage

Rechargez la page. Dans l'application compagnon, fermez l'application et rouvrez-la.

La page a été ouverte pendant le démarrage de Home Assistant, avant que Chauffage soit prêt.
L'erreur reste jusqu'à ce que vous rechargiez la page.

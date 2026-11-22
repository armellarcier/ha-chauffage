# Comment ça marche

[English](how-it-works.md) · **Français**

Cette page s'adresse aux curieux et aux contributeurs. [decisions.md](decisions.md) donne les
détails et leurs raisons.

**Les données.** Chauffage enregistre les plannings, les préréglages, les semaines et les
dérogations en cours dans `.storage/chauffage`. Les semaines de chaque thermostat sont dans
`thermostats.<climate>.weeks`, au format
`{id du planning: [7 jours × [[début, préréglage, réglages?], …]]}`. Les réglages,
facultatifs, donnent le mode HVAC et la ventilation du créneau. Un créneau éteint ou en
ventilation seule n'a pas de préréglage. Les données ont une version, et Chauffage les migre
automatiquement.

**Le programmateur.** Chaque minute, le programmateur applique les créneaux qui commencent, et
arrête les dérogations qui expirent. Le programmateur remet aussi chaque thermostat sur son
planning au démarrage, à l'activation d'un planning et à l'enregistrement des semaines. Le
programmateur laisse de côté un thermostat en dérogation ou indisponible.

**Les changements manuels.** Une consigne, un préréglage ou un mode HVAC changé à la main
devient une dérogation. Par exemple, un thermostat éteint à la main passe en dérogation.
Chauffage reconnaît ses propres commandes à leur contexte, et ignore les changements faits par
les automatisations.

**La carte.** L'intégration fournit la carte et la charge sur toutes les pages, avec
`add_extra_js_url` : le bloc de la fenêtre de détail marche ainsi partout. La carte dialogue avec
l'intégration par l'API websocket, par exemple `chauffage/subscribe` ou `chauffage/weeks/save`.
L'intégration refuse un enregistrement fait depuis une copie périmée. Un enregistrement n'écrase
donc jamais les modifications de quelqu'un d'autre.

**L'historique.** La carte demande à l'intégration les 7 derniers jours (`chauffage/history`).
L'intégration lit la température mesurée et la consigne appliquée dans le recorder de Home
Assistant, et n'enregistre rien.

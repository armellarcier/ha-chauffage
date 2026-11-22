# Thermostats compatibles

[English](thermostats.md) · **Français**

Chauffage fonctionne avec toute entité `climate` qui a une température de consigne. Les tests
couvrent trois types de thermostats :

- **Versatile Thermostat.** Chauffage utilise ses préréglages, par exemple `comfort` ou `eco`.
  Vous réglez leurs températures dans Versatile Thermostat.
- **Les thermostats à préréglages standard**, par exemple `eco` ou `comfort`. Chauffage utilise
  le préréglage du thermostat qui porte le même nom, et règle une température pour les autres.
- **Les thermostats sans préréglages**, par exemple `generic_thermostat`. Chauffage règle des
  températures.

Sur tous ces thermostats, une consigne changée à la main devient une
[dérogation](overrides.fr.md).

**Climatisations.** Chacun de ces types de thermostats peut aussi être une climatisation. Sur
une climatisation, un créneau choisit ce que fait l'appareil, par exemple *Clim* ou
*Chauffe/Clim*. Voir [Climatisations](air-conditioners.fr.md).

**Appareils qui changent leur consigne d'eux-mêmes.** Chauffage ne les prend pas encore en
charge. Chauffage risque de prendre leurs changements pour des changements à la main.

**Appareils qui gardent leur préréglage après un changement à la main.** Pour un tel appareil,
réglez chaque préréglage sur une température, dans le panneau Chauffage, sur l'onglet
*Préréglages*.

**Appareils qui arrondissent la consigne.** Chauffage risque de prendre la consigne arrondie
pour un changement à la main. Voyez le
[Dépannage](troubleshooting.fr.md#une-dérogation-démarre-alors-que-personne-na-touché-au-thermostat).

La [feuille de route](../ROADMAP.fr.md) présente la suite, par exemple les groupes de thermostats.

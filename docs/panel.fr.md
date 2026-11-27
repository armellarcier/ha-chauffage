# Le panneau Chauffage

[English](panel.md) · **Français**

Vous réglez Chauffage dans le panneau **Chauffage**, dans la barre latérale. Les administrateurs
ouvrent le panneau, comme les autres utilisateurs qui ont le
[niveau d'accès](#qui-peut-modifier-quoi) *Configurer*. Au quotidien, servez-vous des cartes
des tableaux de bord.

## Les pages du panneau

Le panneau a trois onglets :

- **Thermostats.** Programmez un autre thermostat, ou suspendez le pilotage d'un thermostat ou
  oubliez-le depuis son menu ⋮.
- **Plannings.** Créez, activez, renommez, déplacez ou supprimez un planning. Écrivez les
  [règles d'activation](activation-rules.fr.md) sous la liste des plannings.
- **Préréglages.** Réglez ce que fait chaque préréglage sur chaque thermostat. Voir
  [Préréglages](presets.fr.md).

**Réglages.** Ouvrez le bouton ⚙, en haut à droite du panneau, pour régler la durée des
dérogations, la fin des dérogations, combien de temps un thermostat éteint le reste, si
Chauffage contrôle le mode HVAC, et le niveau d'accès. Voir [Dérogations](overrides.fr.md) et
[Allumer et éteindre les pièces vous-même](overrides.fr.md#allumer-et-éteindre-les-pièces-vous-même). Pour changer les autres
[options](#options), cliquez sur *Autres options de Chauffage*, en bas des réglages. Le lien
ouvre la page de l'intégration, où vous cliquez sur *Configurer*. Seuls les administrateurs
voient ce lien.

## Ouvrir la page d'un thermostat

La page d'un thermostat montre la semaine du thermostat dans chaque planning. Depuis cette page,
vous pouvez copier une semaine vers un autre planning, et afficher l'*Historique* du thermostat.

- Dans le panneau Chauffage, sur l'onglet *Thermostats*, cliquez sur le nom du thermostat.
- Dans la fenêtre de détail du thermostat, cliquez sur *Modifier sa semaine*.
- Sur l'appareil du thermostat programmé, cliquez sur *Visiter*. Voir
  [Sur l'appareil de chaque thermostat programmé](automations.fr.md#sur-lappareil-de-chaque-thermostat-programmé).

Avec le niveau d'accès *Programmer*, *Modifier sa semaine* ouvre le tableau de bord qui contient
la carte des plannings du thermostat, et non le panneau.

En haut de la page, *Contrôler le mode HVAC* dit si Chauffage allume et éteint ce thermostat.
Voir [Allumer et éteindre les pièces vous-même](overrides.fr.md#allumer-et-éteindre-les-pièces-vous-même).

Chaque page a sa propre adresse, par exemple `/chauffage/thermostats/climate.salon`. Vous pouvez
mettre un lien vers une page dans un tableau de bord ou une notification.

## Qui peut modifier quoi

Les administrateurs peuvent toujours tout modifier. Vous choisissez ce que peuvent modifier les
autres utilisateurs : leur **niveau d'accès**.

| Niveau d'accès | Ce que peuvent faire les utilisateurs non administrateurs |
|---|---|
| *Utiliser*, par défaut | Poser et arrêter des dérogations, mettre un thermostat en pause, changer de planning actif. |
| *Programmer* | Aussi modifier les semaines, et créer, renommer, déplacer ou supprimer des plannings, depuis les cartes des tableaux de bord. |
| *Configurer* | Aussi tout le panneau Chauffage : les préréglages, les règles d'activation, les thermostats programmés et les réglages des dérogations. |

Pour choisir le niveau d'accès, ouvrez le bouton ⚙ du panneau Chauffage, ou les
[options](#options) de l'intégration. Seuls les administrateurs choisissent le niveau d'accès.

**Avec *Configurer*, tous les utilisateurs voient *Chauffage* dans la barre latérale.** Chaque
utilisateur peut masquer l'entrée dans son profil.

**Un niveau d'accès ne verrouille pas le chauffage.** Le niveau d'accès ne concerne que les
cartes et le panneau. Tous les utilisateurs peuvent toujours tourner la molette d'un thermostat,
ou modifier les entités de Chauffage. Pour qu'un enfant ne touche pas aux semaines, donnez-lui
un tableau de bord sans la carte des plannings.

## Thermostats programmés

Pour programmer un thermostat, modifiez sa semaine dans une carte. Vous pouvez aussi choisir le
thermostat sous *Programmer un autre thermostat*, sur l'onglet *Thermostats* du panneau.

Un thermostat reste programmé tant que vous ne l'oubliez pas, même si vous le retirez d'une
carte. Pour oublier un thermostat, ouvrez son menu ⋮, puis *Oublier…*. Si vous supprimez
l'entité d'un thermostat de Home Assistant, Paramètres → Réparations propose d'oublier le
thermostat.

### Suspendre le pilotage d'un thermostat

Suspendez le pilotage d'un thermostat pour gérer sa pièce à la main quelques jours, ou pour
laisser un radiateur éteint tout l'été. Cliquez sur *Suspendre le pilotage* dans la fenêtre de
détail du thermostat ou dans le panneau Chauffage. Vous pouvez aussi éteindre l'interrupteur
**Pilotage** du thermostat.

Pendant la suspension, Chauffage garde les semaines du thermostat, mais ne le pilote plus.

Pour rendre le thermostat à Chauffage, cliquez sur *Reprendre le pilotage*, ou rallumez
l'interrupteur **Pilotage**.

Tout utilisateur qui peut piloter le thermostat peut suspendre son pilotage, pas seulement les
administrateurs.

## Options

Pour changer les options, allez dans Paramètres → Appareils et services → Chauffage →
*Configurer*.

- **Durée des dérogations.** Combien de temps dure une consigne changée à la main, 2 heures par
  défaut.
- **Fin des dérogations.** *Pendant la durée des dérogations* par défaut. Voir
  [Choisir combien de temps dure une dérogation](overrides.fr.md#choisir-combien-de-temps-dure-une-dérogation).
- **Thermostat éteint.** Combien de temps un thermostat éteint le reste, *Jusqu'au prochain
  créneau* par défaut. Voir
  [Éteindre un thermostat à la main](overrides.fr.md#éteindre-un-thermostat-à-la-main).
- **Utiliser les préréglages des thermostats.** Activée par défaut. Désactivez cette option pour
  piloter tous les thermostats avec des températures que vous réglez dans Chauffage.
- **Afficher Chauffage dans la barre latérale.** Activée par défaut. Si vous masquez Chauffage de la
  barre latérale, ouvrez le panneau depuis les cartes, ou avec le bouton *Visiter* de l'appareil
  d'un thermostat programmé.
- **Nom dans la barre latérale.** *Chauffage* par défaut. Donnez un autre nom au panneau, par
  exemple *Planning* si vous avez déjà un tableau de bord *Thermostats*. Pour revenir à
  *Chauffage*, videz le champ.
- **Niveau d'accès des utilisateurs non administrateurs.** *Utiliser* par défaut. Voir
  [Qui peut modifier quoi](#qui-peut-modifier-quoi).

Vous pouvez aussi changer les trois premières options avec le bouton ⚙ du panneau, ou avec leurs
entités.

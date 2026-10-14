# Feuille de route

[English](ROADMAP.md) · **Français**

L'objectif : des plannings de chauffe hebdomadaires pour **n'importe quelle entité `climate` de
Home Assistant**, entièrement configurés depuis l'interface, dans la liste par défaut de HACS.
Pourquoi les choses sont comme elles sont : [docs/decisions.md](docs/decisions.md) (en anglais) ;
ce qui a changé à chaque version : [CHANGELOG.md](CHANGELOG.md) (en anglais).

Cette page contient la vision et les idées retenues, dans l'ordre. Les demandes et les idées se
discutent dans les [issues GitHub](https://github.com/armellarcier/ha-chauffage/issues) ; une
idée retenue renvoie vers son issue quand elle en a une.

## Fait

| Version | Contenu |
|---|---|
| 0.1.0 | Première version, sous forme de package YAML (plus maintenu) : plannings par thermostat, carte d'édition, dérogations temporaires, données versionnées |
| 0.2 (bêtas) | L'**intégration Chauffage** : installée depuis HACS, configurée depuis l'interface, données dans un `Store` versionné, sélecteur, capteurs, services, API websocket, carte servie par l'intégration, anglais et français, import des données du package |
| 0.3.0 | **Préréglages** (alors appelés niveaux de chauffe) pour tout thermostat à consigne de température (Versatile Thermostat, préréglages standard, sans préréglages), réglés dans la carte ; changements manuels jugés par rapport à ce qu'attend le planning ; tests sur les trois types de thermostats ; analyse fonctionnelle ([docs/use-cases.md](docs/use-cases.md)) |
| 0.4.0 | **Plannings définis par l'utilisateur** (créés vides ou par copie, renommés, déplacés, supprimés ; identifiants stables pour les automatisations) et **un seul vocabulaire** partout ([docs/glossary.md](docs/glossary.md)) |

### Des règles d'activation

Fait en 0.5 (en bêta, [#1](https://github.com/armellarcier/ha-chauffage/issues/1)) : des plannings
qui s'activent d'eux-mêmes, selon une liste ordonnée de règles écrites en templates, la première
qui s'applique l'emportant, un planning par défaut sinon. Voir le
[README](README.fr.md#règles-dactivation).

## À court terme

1. **Liste par défaut de HACS** : demande déposée avec la 0.4.0
   ([hacs/default#11827](https://github.com/hacs/default/pull/11827), toutes les vérifications au
   vert), en attente de la relecture de l'équipe HACS (cela peut prendre des mois). D'ici là,
   ha-chauffage s'installe comme *dépôt personnalisé* HACS (HACS n'affiche pas d'icône pour
   ceux-ci ; Home Assistant l'affiche une fois l'intégration installée). Le dépôt doit garder un
   seul `manifest.json` (le climate simulé du HA de développement utilise `manifest.dev.json`).

## Ensuite

### Un calendrier des plannings

Construit sur les [règles d'activation](#des-règles-dactivation). Une vue de l'année, une ligne
par mois, avec des périodes (jours et heures) colorées selon le planning, comme la vue de la
semaine avec ses créneaux. Ses périodes sont aussi des règles. Il couvre également « activer
*Absent* jusqu'à mardi » ou « jusqu'à 18:00 ».

### Des groupes de thermostats

Des zones partageant leurs semaines (« chambres », « pièces de vie »), avec des exceptions par
thermostat ; la correspondance des préréglages réglée par groupe (*Confort* = 21 °C au salon,
19 °C dans les chambres) ; un planning actif par groupe (une chambre d'amis sur son propre
planning pendant que le reste est en *Normal*) ; les dérogations restent par thermostat ; la
carte édite les groupes.

### Anticipation de la chauffe

Atteindre la température d'un créneau à son heure de début au lieu de commencer à chauffer à ce
moment-là : apprendre à quelle vitesse chaque pièce monte en température (à partir de l'historique
de la température mesurée et des consignes appliquées, et de la température extérieure), puis
suggérer des débuts plus tôt dans la carte ou anticiper la chauffe toute seule. D'ici là, la carte
affiche la température mesurée et la consigne appliquée sur la semaine (le bouton *Historique*),
à l'utilisateur de juger.

### Les thermostats qui changent leur consigne d'eux-mêmes

Certains appareils ajustent eux-mêmes leur consigne (fenêtre ouverte, présence, sécurité) :
aujourd'hui cela ressemble à un changement manuel et devient une dérogation. Reconnaître ces
ajustements (règles par thermostat ou par intégration).

### Plus de thermostats et de créneaux

- Les thermostats chaud / froid à plage de températures (`heat_cool` : `target_temp_low` /
  `target_temp_high`).
- Un préréglage *Arrêt* (`hvac_mode: off`).
- Des créneaux portant directement une température (« 21 °C à partir de 06:30 »), sans
  préréglage nommé.

### Édition des semaines

- **Annuler** (Ctrl+Z, et rétablir) pendant l'édition des semaines dans la carte, jusqu'à
  l'enregistrement.
- **Copier et coller une journée entière, tous thermostats confondus** : la journée de tous les
  thermostats affichés, collée sur un autre jour (aujourd'hui, le presse-papiers contient la
  journée d'un seul thermostat).

### Carte

- **Historique de la température mesurée** (dans la 0.5.0-beta.1 : les 7 derniers jours tracés sur
  la semaine) : remonter aux semaines précédentes, et l'afficher aussi dans la fenêtre de détail
  du thermostat.
- Une compilation (bundling), puis les traductions en fichiers : un fichier JSON par langue avec
  ICU MessageFormat (pluriels), comme la plupart des cartes Home Assistant ; d'autres langues via
  des contributions.

### Environnement de développement et CI

- Figer les versions de Home Assistant et de Versatile Thermostat dans le HA de développement,
  avec un bot qui propose les montées de version ; le setup parcourt le formulaire de
  configuration de VTherm champ par champ et casse quand VTherm le change (`docker compose logs
  setup` indique l'étape).
- Une vérification de bout en bout en CI qui démarre le HA de développement, lance le setup et
  vérifie qu'un planning est appliqué, et que la carte marche dans le vrai frontend de la version
  minimale et de la dernière version de Home Assistant ([#6](https://github.com/armellarcier/ha-chauffage/issues/6)).
- Des thermostats simulés pour les types qui manquent encore (chaud / froid, un thermostat qui
  garde son préréglage après une consigne manuelle), dans les tests et le HA de développement.

## Version 1.0

Quand les groupes de thermostats seront là et que tous les types de thermostats ci-dessus seront
pris en charge.

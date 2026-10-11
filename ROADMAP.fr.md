# Feuille de route

[English](ROADMAP.md) · **Français**

L'objectif : des plannings de chauffe hebdomadaires pour **n'importe quelle entité `climate` de
Home Assistant**, entièrement configurés depuis l'interface, et à terme dans la liste par défaut
de HACS.

## Fait

| Version | Contenu |
|---|---|
| 0.1.0 | Première version, sous forme de package YAML (plus maintenu) : plannings par thermostat et par mode, carte d'édition, dérogations temporaires, données versionnées |
| 0.2 (bêtas) | L'**intégration Chauffage** : installée depuis HACS, configurée depuis l'interface, données dans un `Store` versionné avec migrations, sélecteur de mode, capteurs, services, API websocket, carte servie par l'intégration, anglais et français, import des données du package ([docs/integration-plan.md](docs/integration-plan.md), en anglais) |
| 0.3.0 | **Préréglages** (alors appelés niveaux de chauffe) pour tout thermostat à consigne de température (Versatile Thermostat, préréglages standard, sans préréglages), réglés dans la vue *Niveaux* de la carte (aujourd'hui *Préréglages*) ; changements manuels jugés par rapport à ce qu'attend le programme ; tests sur les trois types de thermostats et analyse fonctionnelle ([docs/use-cases.md](docs/use-cases.md), [docs/phase-2-plan.md](docs/phase-2-plan.md), en anglais) |

## À court terme

- Passer les tâches à court terme et les étapes de la feuille de route en issues GitHub.
- Réécrire le scénario de démo (`dev/demo/record.mjs`) et réenregistrer `docs/demo.gif` :
  montrer les préréglages et les plannings, avec trois plannings **Normal**, **Vacances**,
  **Absent**, dans cet ordre (l'ordre dans lequel le HA de développement les crée).

## Ensuite

### 1. Des plannings définis par l'utilisateur, un seul vocabulaire

**Fait (non publié, v0.4)** : ce qu'on appelait des *modes* (*Normal* / *Absent* / *Vacances*,
prédéfinis) sont des **plannings** que l'utilisateur crée (vides ou par copie), renomme,
déplace et supprime, avec des identifiants stables pour les automatisations
([docs/schedules-plan.md](docs/schedules-plan.md), en anglais) ; et un seul vocabulaire partout
— plannings, semaines, créneaux, préréglages, dérogations ([docs/glossary.md](docs/glossary.md)),
avec une migration des données stockées.

### 2. Un calendrier des plannings

Une vue de l'année, une ligne par mois, avec des périodes (jours et heures) colorées selon le
planning, comme la vue de la semaine avec ses créneaux ; un **planning par défaut** s'applique en
dehors des périodes. Cela couvre aussi « activer *Absent* jusqu'à mardi » ou « jusqu'à 18:00 »
sans écrire d'automatisation.

### 3. Des groupes de thermostats

Des zones partageant un planning (« chambres », « pièces de vie »), avec des exceptions par
thermostat ; les dérogations restent par thermostat ; la carte édite les groupes. S'appuie sur
les plannings (étape 1).

### 4. Les thermostats qui changent leur consigne d'eux-mêmes

Certains appareils ajustent eux-mêmes leur consigne (fenêtre ouverte, présence, sécurité) :
aujourd'hui cela ressemble à un changement manuel et devient une dérogation. Reconnaître ces
ajustements (règles par thermostat ou par intégration).

### 5. Plus de thermostats et de créneaux

Les thermostats chaud / froid à plage de températures (`heat_cool`), un préréglage *Arrêt*, des
créneaux portant directement une température (« 21 °C à partir de 06:30 »).

### 6. Environnement de développement et CI

Figer les versions de Home Assistant et de Versatile Thermostat dans le HA de développement (avec
un bot qui propose les montées de version) et ajouter une vérification de bout en bout en CI qui
le démarre, lance le setup et vérifie qu'un planning est appliqué.

### 7. Traductions de la carte en fichiers

Une fois la carte compilée : un fichier JSON par langue avec ICU MessageFormat (pluriels), comme
la plupart des cartes Home Assistant ; d'autres langues via des contributions.

### 8. Édition des semaines

- **Annuler** (Ctrl+Z, et rétablir) pendant l'édition des semaines dans la carte, jusqu'à
  l'enregistrement.
- **Copier et coller une journée entière, tous thermostats confondus** : la journée de tous les
  thermostats affichés, collée sur un autre jour (aujourd'hui, le presse-papiers contient la
  journée d'un seul thermostat).

## Liste par défaut de HACS

ha-chauffage s'installe comme *dépôt personnalisé* HACS (HACS n'affiche pas d'icône pour ceux-ci ;
Home Assistant l'affiche une fois l'intégration installée). Il sera proposé à la liste par défaut
(`hacs/default`) quand les plannings ne seront plus prédéfinis (étape 1), avec une
version stable.

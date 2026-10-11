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
| 0.3.0 | **Niveaux de chauffe** pour tout thermostat à consigne de température (Versatile Thermostat, presets standard, sans presets), réglés dans la vue *Niveaux* de la carte ; changements manuels jugés par rapport à ce qu'attend le programme ; tests sur les trois types de thermostats et analyse fonctionnelle ([docs/use-cases.md](docs/use-cases.md), [docs/phase-2-plan.md](docs/phase-2-plan.md), en anglais) |

## Ensuite

### 1. Repenser les modes de chauffage

Aujourd'hui il y a trois modes, *Normal* / *Absent* / *Vacances*, créés à l'installation avec un
planning hebdomadaire par thermostat et par mode, et un seul mode actif pour toute la maison. Ce
qu'ils veulent dire n'est porté que par leur nom : *Absent*, c'est une journée dehors ou une
semaine ? *Vacances* se termine-t-il tout seul ? et une chambre d'amis inoccupée ? Ces modes fixes
et prédéfinis sont aussi ce qui empêche ha-chauffage d'entrer dans la liste par défaut de HACS.

Le travail se fait dans cet ordre :

1. **Concept et fonctionnel** : ce qu'est un mode, ce dont les utilisateurs ont vraiment besoin
   (une journée dehors, des vacances, une pièce vide, une journée de télétravail…), ce qui se
   planifie à l'avance, ce qui se termine tout seul.
2. **Cas d'usage / user stories**, ajoutés à [docs/use-cases.md](docs/use-cases.md).
3. **Implémentation, tests d'abord** (voir CONTRIBUTING.fr.md, « Les tests d'abord »), avec une
   migration des modes et plannings existants.

Des idées à examiner à ce moment-là, pas des décisions : des modes définis par l'utilisateur, un
mode limité dans le temps (« absent jusqu'à dimanche 18:00 »), un mode pour certaines pièces
seulement, des modes pilotés par la présence ou un calendrier.

### 2. Des groupes de thermostats

Des zones partageant un planning (« chambres », « pièces de vie »), avec des exceptions par
thermostat ; les dérogations restent par thermostat ; la carte édite les groupes. Dépend du
résultat du travail sur les modes.

### 3. Les thermostats qui changent leur consigne d'eux-mêmes

Certains appareils ajustent eux-mêmes leur consigne (fenêtre ouverte, présence, sécurité) :
aujourd'hui cela ressemble à un changement manuel et devient une dérogation. Reconnaître ces
ajustements (règles par thermostat ou par intégration).

### 4. Plus de thermostats et de créneaux

Les thermostats chaud / froid à plage de températures (`heat_cool`), un niveau *Arrêt*, des
créneaux portant directement une température (« 21 °C à partir de 06:30 »).

### 5. Environnement de développement et CI

Figer les versions de Home Assistant et de Versatile Thermostat dans le HA de développement (avec
un bot qui propose les montées de version) et ajouter une vérification de bout en bout en CI qui
le démarre, lance le setup et vérifie qu'un planning est appliqué.

### 6. Traductions de la carte en fichiers

Une fois la carte compilée : un fichier JSON par langue avec ICU MessageFormat (pluriels), comme
la plupart des cartes Home Assistant ; d'autres langues via des contributions.

## Liste par défaut de HACS

ha-chauffage s'installe comme *dépôt personnalisé* HACS (HACS n'affiche pas d'icône pour ceux-ci ;
Home Assistant l'affiche une fois l'intégration installée). Il sera proposé à la liste par défaut
(`hacs/default`) quand les modes de chauffage ne seront plus prédéfinis (étape 1), avec une
version stable.

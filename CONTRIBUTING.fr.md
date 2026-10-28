# Contribuer à ha-chauffage

[English](CONTRIBUTING.md) · **Français**

Règle d'or, comme dans la plupart des projets Home Assistant : **on ne développe pas sur
son HA de production.** On travaille avec les tests automatisés et un HA de développement
jetable, puis on publie une préversion.

## Prérequis

- Git, Bash (Linux, macOS, ou Git Bash / WSL sous Windows), `curl`.
- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop sous Windows / macOS) pour le HA de dev.

Pas de compilation : la carte est un fichier JavaScript servi tel quel. Node et Python ne
servent qu'aux tests automatisés, et Docker les remplace s'ils ne sont pas installés.

## Le HA de développement

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

- Versatile Thermostat est installé automatiquement (`VTHERM_VERSION=… docker compose … up -d`
  pour une autre version ; `HA_VERSION=beta` pour tester la prochaine version de HA).
- Le dépôt est **monté en direct** : `custom_components/chauffage/` → l'intégration et sa carte.
- `dev/hass/packages/simulation.yaml` crée cinq pièces virtuelles : un radiateur
  `input_boolean.radiateur_*` et une température `sensor.temperature_*` (envoyée chaque minute
  au dixième de degré, comme de vrais capteurs). L'intégration de dev
  [`dev/sim_rooms/`](dev/sim_rooms/model.py) leur donne un modèle thermique réaliste : le
  radiateur, l'air, les murs et le capteur ont chacun leur inertie (une pièce chauffe d'environ
  1,7 °C par heure et refroidit d'environ 0,6 °C par heure), la température extérieure suit la
  journée, et des occupants, des portes ouvertes et des nuages perturbent un peu chaque pièce.
  Elles couvrent **tous les types de thermostats** :
  - salon, bureau, chambre : **Versatile Thermostat** (presets, `none` après une consigne
    manuelle) ;
  - cuisine : le **`generic_thermostat`** de HA, sans presets (déclaré en YAML) ;
  - chambre d'amis : **presets standard** (`eco`, `comfort`, `away`, `boost`, pas de `frost` ;
    preset effacé après une consigne manuelle), fournis par la plateforme de dev
    [`dev/sim_climate/`](dev/sim_climate/climate.py).

**Tout est configuré automatiquement au premier démarrage** par le service `setup`
([`dev/setup/setup.py`](dev/setup/setup.py), via les API publiques de HA) : se connecter sur
<http://localhost:8124/chauffage-dev> avec **`dev` / `dev`** : le tableau de bord « Chauffage »
(barre latérale) affiche la carte avec les cinq thermostats (les trois Versatile Thermostat sont
« sur un interrupteur », températures de presets 7 / 17 / 20 / 22 °C), l'intégration
**Chauffage** et des programmes d'exemple. **Un HA de dev neuf démarre aussi avec une semaine
d'historique** : la semaine qui précède sa création, simulée avec le même modèle, les
thermostats suivant les programmes d'exemple (avec un changement manuel un soir), pour que
l'*Historique* de la carte montre tout de suite des courbes réalistes (le recorder garde
10 jours). Un jeton longue durée est écrit dans `dev/hass/.dev-token` et utilisé par
`scripts/logs.sh` (pas besoin de `.env` pour le HA de dev). L'état est conservé dans
`dev/hass/` (non versionné) ; pour repartir de zéro :
`docker compose -f dev/compose.yaml down && git clean -fdX dev/hass`.

Un **second HA de dev neuf** à côté du vôtre (pour essayer quelque chose sur un HA vierge, ou
enregistrer la démo) : un autre projet compose, son propre dossier de configuration (une copie
des fichiers versionnés de `dev/hass`) et son port :

```bash
mkdir -p /tmp/ha-fresh/packages && cp dev/hass/configuration.yaml /tmp/ha-fresh/ && cp dev/hass/packages/simulation.yaml /tmp/ha-fresh/packages/
DEV_HASS=/tmp/ha-fresh DEV_PORT=8125 docker compose -p ha-chauffage-fresh -f dev/compose.yaml up -d   # http://localhost:8125
```

**Boucle de travail :**

| Je modifie… | Pour l'appliquer |
|---|---|
| `custom_components/chauffage/frontend/*.js` (carte) | recharger la page du navigateur |
| `custom_components/chauffage/*.py`, `*.json` | `docker compose -f dev/compose.yaml restart homeassistant` |
| `dev/hass/configuration.yaml`, `dev/sim_rooms/*.py`, `dev/sim_climate/*.py` | `docker compose -f dev/compose.yaml restart homeassistant` |

`scripts/logs.sh` affiche la fin du journal (filtrée sur le projet ; `scripts/logs.sh dev 200 all`
pour tout voir). Pour accélérer les tests de la logique temporelle, changer les températures
avec les curseurs `input_number.temperature_*` et la durée de dérogation (options de
l'intégration).

## Tests automatisés

```bash
scripts/test.sh          # tout (utilise Node / Python s'ils sont installés, sinon Docker)
scripts/test.sh js       # la carte seulement
scripts/test.sh integration   # l'intégration (arguments passés à pytest : scripts/test.sh integration -k ends)
scripts/test.sh coverage      # carte et intégration avec la couverture (échoue sous le minimum)
HA=min scripts/test.sh integration   # idem, sur le HA minimal pris en charge (hacs.json, 2025.1)
```

| Suite | Outil | Ce qui est couvert |
|---|---|---|
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component) : un vrai Home Assistant en mémoire, horloge figée, `custom_components/` chargé | créneaux appliqués au bon moment, modes, thermostats éteints ou injoignables, détection des changements manuels, dérogations et leur fin, les règles d'activation, la logique pure (`engine.py`), le stockage et ses migrations, les entités, les services, l'API websocket, l'historique lu dans le recorder, les flux de configuration et d'options, l'import depuis le package v0.1 |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (navigateur simulé), avec un faux HA et une fausse intégration (`tests/js/helpers.mjs`) | la carte : calculs, édition des semaines, copier / coller, enregistrement, plannings, préréglages, règles d'activation, dérogations, historique et journée en grand, fenêtre de détail |

La suite Python tourne sur la dernière version de Home Assistant et sur la version minimale
prise en charge (CI et `HA=min`). Les thermostats sont de simples états `climate.*` simulés et
les services `climate` sont remplacés par des enregistreurs ; l'objet `Bench` (`conftest.py`)
avance le temps, simule un changement manuel ou la réponse du thermostat, et enregistre des
programmes comme le fait la carte. Les tests de comportement tournent sur **les trois types de
thermostats** (fixture `thermostat_kind` : `vtherm`, `standard`, `plain`) ; un test qui n'a de
sens que pour certains types appelle `bench.needs(...)`.

Les tests tournent aussi sur GitHub Actions à chaque push et pull request
(`.github/workflows/tests.yml`). **Lancer `scripts/test.sh` avant de publier.**

## Versions de Home Assistant prises en charge

**La version minimale reste aussi basse que possible.** ha-chauffage prend en charge tous les
Home Assistant depuis la version minimale de `hacs.json` (aussi écrite dans les README)
jusqu'à la dernière version publiée.

- **La version minimale ne monte que quand une API de Home Assistant l'impose** : une
  fonctionnalité ou une correction a besoin d'une API que les versions plus anciennes n'ont pas,
  ou une API utilisée disparaît. Pas pour suivre les versions, ni pour retirer du vieux code qui
  marche encore. Une hausse va dans une version mineure, avec la raison dans le changelog
  (« Upgrading »). Changer ensemble `hacs.json`, `tests/integration/requirements-min.txt` (le
  `pytest-homeassistant-custom-component` qui embarque ce Home Assistant), le nom du job dans
  `.github/workflows/tests.yml` et les README : `tests/js/release.test.mjs` vérifie qu'ils
  concordent. Si ce Home Assistant demande un autre Python, le changer aussi (le `python` du
  job, et celui de `HA=min` dans `scripts/test.sh`).
- **La CI teste les versions prises en charge**, à chaque push (la matrice du job `python` de
  `.github/workflows/tests.yml`) : la dernière version (`requirements.txt`, avancé par
  Dependabot, `.github/dependabot.yml`), la version minimale (`requirements-min.txt`, avancé
  seulement à la main ; `HA=min scripts/test.sh integration` en local), une version par
  trimestre depuis (x.1, x.4, x.7, x.10), et les deux côtés d'un test de version dans le code.
  Pas chaque mois : un trimestre suffit pour attraper une API qui apparaît ou disparaît. Quand
  Dependabot fait entrer un nouveau trimestre, `test_supported_versions.py` échoue tant que le
  précédent n'a pas sa ligne dans la matrice (le `pytest-homeassistant-custom-component` de ce
  Home Assistant, son Python, et des versions figées si une dépendance non figée le casse). Les
  versions plus anciennes que la version minimale ne sont pas testées.
- **Descendre s'essaie par grands pas**, pas mois par mois : dans une pull request, baisser la
  version minimale et ajouter les versions plus anciennes à la matrice ; la CI montre ce qui
  casse. La carte est ensuite essayée dans un HA de développement sur la version choisie
  (`HA_VERSION=2025.1.0`) : la CI ne la teste que face à un faux HA, pas face au vrai frontend
  de cette version. En octobre 2026, la version minimale est passée de 2026.9 à 2025.1 ;
  2024.10 demande un flux d'options et un recorder qui fonctionnent autrement.
- **La prochaine version est essayée chaque semaine** : `.github/workflows/ha-beta.yml` lance
  les tests de l'intégration sur la beta de Home Assistant (le lundi, ou à la main depuis
  l'onglet *Actions*). Il ne bloque jamais un push ni une publication ; un échec prévient d'un
  changement à venir, à corriger si possible avant la sortie de Home Assistant, sans monter la
  version minimale.
- Le code qui dépend de la version (une API apparue après la version minimale) la vérifie et
  continue de marcher sur la version minimale, avec un test de chaque côté.

## Animation de démo

`docs/demo.gif` (affichée en tête du README) est enregistrée depuis le HA de développement :

```bash
scripts/demo.sh      # nécessite le HA de dev démarré ; Playwright + ffmpeg dans Docker
```

Le scénario est dans [`dev/demo/record.mjs`](dev/demo/record.mjs) : un mardi matin (horloge du
navigateur), avec une dérogation de démo, il crée un planning *Télétravail* par copie de
*Normal*, modifie son mardi, montre la vue *Préréglages* (le popover d'un préréglage, puis la
case d'un thermostat), active *Vacances*, ouvre la fenêtre de détail d'un thermostat, montre les
cartes thermostat de la vue *Pièces* (30 minutes de plus pour la dérogation du salon), puis
montre l'*Historique* du salon et une journée en grand (en revenant à l'heure réelle :
l'historique est réel), avec un curseur visible ; ensuite il remet tout en état (dérogation et
planning créé supprimés, *Normal* de nouveau actif, modifications des semaines non
enregistrées). Il attend les données d'exemple, la vue *Pièces* et la semaine simulée d'un HA de
développement neuf (*Normal*, *Vacances*, *Absent*, noms en français) : enregistrer depuis un
second HA de dev neuf (ci-dessus) avec `DEMO_NETWORK=ha-chauffage-fresh_default scripts/demo.sh`. La question de la réenregistrer se pose à
chaque publication (voir « Publier une version »).

## Essayer une version sur un vrai Home Assistant

L'intégration s'installe avec HACS (voir le README), ou en copiant `custom_components/chauffage/`
dans `<config>/custom_components/chauffage/` puis en redémarrant HA. Pour essayer une version de
développement sur son propre HA, publier une préversion (voir « Publier une version ») et
l'installer depuis HACS avec les versions bêta activées.

## Versions des données et migrations

Les installations doivent se mettre à jour sans action manuelle ni perte de données.

`.storage/chauffage` est un `Store` Home Assistant versionné (`STORAGE_VERSION` dans
`custom_components/chauffage/store.py`). Un changement de format l'incrémente et ajoute
`MIGRATIONS[n]` (version n → n + 1), avec `tests/fixtures/store-v<n+1>.json` ;
`tests/integration/test_store.py` vérifie que chaque fixture migre vers la plus récente. Ne
jamais modifier une ancienne fixture. La carte ne voit que l'API websocket, dont le format évolue
avec l'intégration.

Les dérogations durent quelques heures : une version qui change leur format peut supprimer celles
en cours (les thermostats reprennent leur programme) plutôt que de les migrer ; le préciser dans
le changelog.

Les données du package v0.1 (`sensor.programmes_chauffage`, format dans
`tests/fixtures/schedules-v1.json`) sont importées par l'intégration (`importer.py`) quand on
l'ajoute.

## Publier une version

Les versions suivent la [numérotation sémantique](https://semver.org/lang/fr/) ; avant la 1.0,
une version mineure peut changer l'installation ou les données (toujours migrées
automatiquement). Liste de contrôle :

1. `scripts/test.sh` : tout au vert, migrations testées avec des fixtures.
2. **La démo : se poser la question à chaque publication.** La réenregistrer (`scripts/demo.sh`)
   quand la carte a changé d'apparence ou qu'une fonctionnalité visible mérite d'être montrée
   (compléter le scénario) ; pas quand les changements ne se voient pas.
3. Mettre la version dans `custom_components/chauffage/frontend/chauffage-programme-card.js`
   (`VERSION`), `package.json` et `custom_components/chauffage/manifest.json` ; déplacer les
   entrées « Unreleased » de `CHANGELOG.md` sous la nouvelle version, avec la date et les étapes
   de mise à jour. `tests/js/release.test.mjs` vérifie que ces versions concordent.
4. Commiter, puis taguer et pousser :
   ```bash
   git tag -a v0.3.0 -m v0.3.0
   git push origin main v0.3.0
   ```
   Le workflow `Release` (`.github/workflows/release.yml`) lance les tests, vérifie la version
   et publie la « release » GitHub avec l'entrée du changelog et `ha-chauffage-v0.3.0.zip`
   (`custom_components/chauffage/`, à décompresser dans le dossier de configuration de HA, sans
   HACS).

**Préversions** (`0.3.0-beta.1`) : mêmes étapes ; un tag contenant `-` est publié comme
préversion GitHub (proposée par HACS seulement à ceux qui activent les versions bêta). Un
changement des données stockées ou de l'installation passe par une bêta installée sur une vraie
installation avant la version finale.

## Traductions

La carte parle anglais et français. Elle suit le profil de l'utilisateur Home Assistant
(`hass.locale`) : **langue** (français pour toute langue `fr*`, anglais sinon ; l'option
`language` de la carte permet de la forcer), **format de l'heure** (12 / 24 h), **format des
nombres** (séparateur décimal), **premier jour de la semaine**, et l'unité de température de la
configuration HA.

- Les textes sont dans l'objet `I18N` de `custom_components/chauffage/frontend/chauffage-programme-card.js`, un objet par langue,
  avec des clés en anglais et des variables `{placeholder}`.
- Chaque langue a exactement les mêmes clés et variables : `tests/js/i18n.test.mjs` le vérifie.
- Les formats ne sont jamais écrits à la main : heures, noms des jours et nombres viennent des API
  `Intl` du navigateur, selon `hass.locale` (voir `makeLocale`).
- Les noms des plannings et des préréglages (`Normal`, `Confort`…) sont des données, pas des
  textes d'interface : ils ne sont pas traduits (l'intégration crée ceux par défaut dans la
  langue de HA).
- Les textes de l'intégration (flux de configuration, entités, services, réparations, erreurs)
  utilisent les fichiers de traduction de Home Assistant : `strings.json` (anglais, source) et
  `translations/en.json`, `translations/fr.json`, avec les mêmes clés.
- Pour ajouter une langue : ajouter un objet à `I18N` (mêmes clés que `en`), étendre
  `resolveLanguage`, puis lancer `scripts/test.sh js`.
- Une fois la carte compilée (feuille de route), les traductions passeront à un fichier JSON par
  langue avec ICU MessageFormat (pluriels), comme la plupart des cartes Home Assistant.

## Les tests d'abord

**Les tests sont la documentation** : ils disent ce que fait ha-chauffage, en phrases
(`a_thermostat_back_online_is_set_to_its_schedule`), et le prouvent à chaque exécution. Donc
tout est testé, et les tests viennent en premier (TDD) :

1. **Écrire le test d'abord**, pour un nouveau comportement ou un bug : un test qui porte le nom
   du cas d'usage, dans les mots de l'utilisateur. Le lancer et **le voir échouer**, pour la
   raison attendue (un test qui passe tout de suite ne prouve rien : vérifier qu'il échoue
   quand on casse le code exprès).
2. **Écrire le code** qui le fait passer, sans plus ; puis nettoyer, tests au vert.
3. **Chaque cas d'usage a son test**, répertorié dans [docs/use-cases.md](docs/use-cases.md) :
   ajouter une ligne quand on ajoute un cas d'usage. Tester ce que font et attendent les
   utilisateurs, pas des lignes de code : cas d'erreur, limites (minuit, dimanche → lundi,
   heure d'été), redémarrages, appareils injoignables, autres langues.
4. **Tous les types de thermostats** : les tests de comportement de l'intégration tournent sur
   Versatile Thermostat, des presets standard et des thermostats sans presets
   (`thermostat_kind`) ; `bench.needs(...)` seulement pour un comportement qui ne peut pas
   exister sur un type.
5. **Un bug corrigé reçoit un test de non-régression** qui échoue sans le correctif.

La couverture est un plancher, pas un objectif (100 % des lignes ne veut pas dire que tous les
cas d'usage sont couverts) : la CI échoue sous **97 %** pour l'intégration et **95 %** pour la
carte (`scripts/test.sh coverage`), et le README affiche les valeurs actuelles.

## Conventions

Ces conventions s'appliquent à tous les contributeurs, humains comme assistants IA
(`AGENTS.md` et `CLAUDE.md` renvoient ici).

- **Code en anglais**, même si le projet s'appelle `ha-chauffage` : noms de variables,
  fonctions et fichiers, commentaires, specs et tests. Du code existant a encore des
  commentaires ou des noms en français : les traduire quand on modifie le code autour.
- **Un seul vocabulaire** ([docs/glossary.md](docs/glossary.md)) : *planning*, *préréglage*,
  *créneau*, *dérogation*, les mêmes dans l'interface, la doc, le code, les données et les
  tests. En anglais (code, données), un préréglage est un *preset*, comme dans Home Assistant.
- Noms d'entités HA en français.
- **Commits en anglais**, courts et descriptifs.
- **Documentation** (`README`, `CONTRIBUTING`) : la version anglaise (`*.md`) est la référence.
  La version française (`*.fr.md`) est toujours maintenue et mise à jour dans le même commit.
- **Les tests d'abord** (voir plus haut) : `tests/integration/` pour l'intégration,
  `tests/js/` pour la carte.
- **Décisions** : un choix qu'un futur contributeur pourrait remettre en question (et sa raison)
  va dans [docs/decisions.md](docs/decisions.md). Les demandes et les idées se discutent dans
  les issues GitHub ; [ROADMAP.fr.md](ROADMAP.fr.md) contient la vision et les idées retenues,
  avec un lien vers leurs issues.
- Les données lues sur les thermostats peuvent contenir des Enum (par ex. un `preset_mode`
  ZHA) : les convertir en valeurs simples (`.value`) avant de les stocker ou de les mettre dans
  un attribut.
- **Tout ce que Chauffage fait à un thermostat dit pourquoi** (#49), pour les analyses entre
  intégrations : une commande passe par `send()` avec sa raison (journalisée en INFO), une
  dérogation commence et finit par `_keep_override()` / `_drop_override()` avec sa source ou sa
  raison (journalisée, envoyée en événement, décrite dans le journal de bord). Une nouvelle
  source ou raison a son texte dans chaque langue de `logbook.py` (`test_traces.py` le vérifie),
  et une nouvelle trace a son test dans `test_traces.py`.
- Les changements de la carte s'essaient dans le HA de développement, sur tous les types de
  thermostats.
- **Le mobile aussi** : la carte est utilisée dans l'application Home Assistant sur téléphone.
  Tout fonctionne au doigt (aucune information visible seulement au survol, aucune action
  accessible seulement à la souris ou au clavier) et sur un écran étroit (dès 360 px de large) ;
  les changements de la carte s'essaient aussi à cette largeur dans le HA de développement.

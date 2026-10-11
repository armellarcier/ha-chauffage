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
  `input_boolean.radiateur_*` et une température `sensor.temperature_*` qui monte quand le
  radiateur chauffe (les capteurs envoient une mesure chaque minute, comme de vrais capteurs).
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
**Chauffage** et des programmes d'exemple. Un jeton longue durée est écrit dans
`dev/hass/.dev-token` et utilisé par `scripts/logs.sh` (pas besoin de `.env` pour le HA de dev).
L'état est conservé dans `dev/hass/` (non versionné) ; pour repartir de zéro :
`docker compose -f dev/compose.yaml down && git clean -fdX dev/hass`.

**Boucle de travail :**

| Je modifie… | Pour l'appliquer |
|---|---|
| `custom_components/chauffage/frontend/*.js` (carte) | recharger la page du navigateur |
| `custom_components/chauffage/*.py`, `*.json` | `docker compose -f dev/compose.yaml restart homeassistant` |
| `dev/hass/configuration.yaml` | `docker compose -f dev/compose.yaml restart homeassistant` |

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
HA=min scripts/test.sh integration   # idem, sur le HA minimal pris en charge (hacs.json, 2026.9)
```

| Suite | Outil | Ce qui est couvert |
|---|---|---|
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component) : un vrai Home Assistant en mémoire, horloge figée, `custom_components/` chargé | créneaux appliqués au bon moment, modes, thermostats éteints ou injoignables, détection des changements manuels, dérogations et leur fin, la logique pure (`engine.py`), le stockage et ses migrations, les entités, les services, l'API websocket, les flux de configuration et d'options, l'import depuis le package v0.1 |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (navigateur simulé), avec un faux HA et une fausse intégration (`tests/js/helpers.mjs`) | la carte : calculs, édition des semaines, copier / coller, enregistrement, plannings, préréglages, dérogations, fenêtre de détail |

La suite Python tourne sur la dernière version de Home Assistant et sur la version minimale
prise en charge (CI et `HA=min`). Les thermostats sont de simples états `climate.*` simulés et
les services `climate` sont remplacés par des enregistreurs ; l'objet `Bench` (`conftest.py`)
avance le temps, simule un changement manuel ou la réponse du thermostat, et enregistre des
programmes comme le fait la carte. Les tests de comportement tournent sur **les trois types de
thermostats** (fixture `thermostat_kind` : `vtherm`, `standard`, `plain`) ; un test qui n'a de
sens que pour certains types appelle `bench.needs(...)`.

Les tests tournent aussi sur GitHub Actions à chaque push et pull request
(`.github/workflows/tests.yml`). **Lancer `scripts/test.sh` avant de publier.**

## Animation de démo

`docs/demo.gif` (affichée en tête du README) est enregistrée depuis le HA de développement :

```bash
scripts/demo.sh      # nécessite le HA de dev démarré ; Playwright + ffmpeg dans Docker
```

Le scénario est dans [`dev/demo/record.mjs`](dev/demo/record.mjs) : un mardi matin (horloge du
navigateur), avec une dérogation de démo, il crée un planning *Télétravail* par copie de
*Normal*, modifie son mardi, montre la vue *Préréglages*, active *Vacances*, puis ouvre la
fenêtre de détail d'un thermostat, avec un curseur visible ; ensuite il remet tout en état
(dérogation et planning créé supprimés, *Normal* de nouveau actif, modifications des semaines
non enregistrées). Il attend les données d'exemple d'un HA de développement neuf (*Normal*,
*Vacances*, *Absent*, noms en français) : pour garder les vôtres, enregistrer depuis un second HA
de développement neuf (un autre projet compose) avec
`DEMO_NETWORK=<son réseau docker> scripts/demo.sh`. À réenregistrer quand l'apparence de la carte
change.

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
2. Réenregistrer la démo (`scripts/demo.sh`) si l'apparence de la carte a changé.
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
  va dans [docs/decisions.md](docs/decisions.md) ; les idées et prochaines étapes vont dans
  [ROADMAP.fr.md](ROADMAP.fr.md).
- Les données lues sur les thermostats peuvent contenir des Enum (par ex. un `preset_mode`
  ZHA) : les convertir en valeurs simples (`.value`) avant de les stocker ou de les mettre dans
  un attribut.
- Les changements de la carte s'essaient dans le HA de développement, sur tous les types de
  thermostats.

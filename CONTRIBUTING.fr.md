# Contribuer à ha-chauffage

[English](CONTRIBUTING.md) · **Français**

Règle d'or, comme dans la plupart des projets Home Assistant : **on ne développe pas sur
son HA de production.** On travaille avec un banc de test et un HA de développement
jetable, puis on déploie.

## Prérequis

- Git, Bash (Linux, macOS, ou Git Bash / WSL sous Windows), `curl`.
- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop sous Windows / macOS) pour le HA de dev.
- Python 3 (facultatif) pour servir le banc de test.

Pas de compilation : la carte est un fichier JavaScript servi tel quel. Node et Python ne
servent qu'aux tests automatisés, et Docker les remplace s'ils ne sont pas installés.

## 1. Interface de la carte : le banc de test (le plus rapide)

```bash
python3 -m http.server 8000      # à la racine du dépôt
```

Ouvrir <http://localhost:8000/dev/harness.html>. Le banc simule Home Assistant : états,
capteurs du projet, événements, rendu différé de `ha-card` et fenêtre de détail d'un thermostat
(boutons en haut de page). Modifier `custom_components/chauffage/frontend/chauffage-programme-card.js`,
recharger la page. Le banc simule les capteurs du package v0.1 ; le mode intégration de la carte
est couvert par `tests/js/card-integration.test.mjs` et par le HA de développement.

## 2. Logique HA : le HA de développement

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

- Versatile Thermostat est installé automatiquement (`VTHERM_VERSION=… docker compose … up -d`
  pour une autre version ; `HA_VERSION=beta` pour tester la prochaine version de HA).
- Le dépôt est **monté en direct** : `custom_components/chauffage/` → l'intégration et sa carte ;
  `packages/chauffage/` → le package v0.1, gardé jusqu'à la v0.2.0 pour tester son import (ses
  automatisations sont désactivées par l'import).
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
<http://localhost:8124/chauffage-dev> avec **`dev` / `dev`** : le tableau de bord « Chauffage » (barre latérale) affiche la carte,
avec trois thermostats Versatile Thermostat (salon, bureau, chambre : « sur un interrupteur »,
températures de presets 7 / 17 / 20 / 22 °C) et des programmes d'exemple, enregistrés via le
package puis importés par l'intégration **Chauffage** (comme lors d'une mise à jour). Un jeton longue durée
est écrit dans `dev/hass/.dev-token` et utilisé par `scripts/reload.sh` et `scripts/logs.sh`
(pas besoin de `.env` pour le HA de dev). L'état est conservé dans `dev/hass/` (non versionné) ;
pour repartir de zéro : `docker compose -f dev/compose.yaml down && git clean -fdX dev/hass`.

**Boucle de travail :**

| Je modifie… | Pour l'appliquer |
|---|---|
| `custom_components/chauffage/frontend/*.js` (carte) | recharger la page du navigateur |
| `custom_components/chauffage/*.py`, `*.json` | `docker compose -f dev/compose.yaml restart homeassistant` |
| `packages/chauffage/chauffage.yaml` | `scripts/reload.sh` (vérifie la config puis recharge) |
| `dev/hass/configuration.yaml` | `docker compose -f dev/compose.yaml restart homeassistant` |

`scripts/logs.sh` affiche la fin du journal (filtrée sur le projet ; `scripts/logs.sh dev 200 all`
pour tout voir). Pour accélérer les tests de la logique temporelle, changer les températures
avec les curseurs `input_number.temperature_*` et la durée de dérogation (options de
l'intégration). Pour rejouer l'import depuis le package : supprimer l'intégration Chauffage,
réactiver les automatisations `automation.chauffage_*`, puis ajouter de nouveau l'intégration.

## 3. Tests automatisés

```bash
scripts/test.sh          # tout (utilise Node / Python s'ils sont installés, sinon Docker)
scripts/test.sh js       # la carte seulement
scripts/test.sh ha       # le package HA seulement (arguments passés à pytest : scripts/test.sh ha -k ends)
scripts/test.sh integration   # l'intégration (custom_components/chauffage)
scripts/test.sh coverage      # carte et intégration avec la couverture (échoue sous le minimum)
HA=min scripts/test.sh integration   # idem, sur le HA minimal pris en charge (hacs.json, 2026.9)
```

| Suite | Outil | Ce qui est couvert |
|---|---|---|
| `tests/ha/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component) : un vrai Home Assistant en mémoire, horloge figée | le package : créneaux appliqués au bon moment, modes, thermostats éteints ou injoignables, détection des changements manuels, dérogations et leur fin |
| `tests/integration/` | idem, avec `custom_components/` chargé | l'intégration : les mêmes comportements que le package (tests repris), la logique pure (`engine.py`), le stockage et ses migrations, les entités, les services, l'API websocket, les flux de configuration et d'options, l'import depuis le package |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (navigateur simulé) | la carte : calculs, édition du planning, copier / coller, enregistrement, dérogations, fenêtre de détail, sur le package et sur l'intégration |

Les suites Python tournent sur la dernière version de Home Assistant et sur la version minimale
prise en charge (CI et `HA=min`). Dans `tests/ha/` et `tests/integration/`, les thermostats sont
de simples états `climate.*` simulés et
`climate.set_preset_mode` est remplacé par un enregistreur ; l'objet `Bench` (`conftest.py`)
avance le temps, simule un changement manuel ou la réponse du thermostat, et enregistre des
programmes comme le fait la carte. Dans `tests/integration/`, les tests de comportement tournent
sur **les trois types de thermostats** (fixture `thermostat_kind` : `vtherm`, `standard`,
`plain`) ; un test qui n'a de sens que pour certains types appelle `bench.needs(...)`.

Les tests tournent aussi sur GitHub Actions à chaque push et pull request
(`.github/workflows/tests.yml`). **Lancer `scripts/test.sh` avant de déployer.**

## Animation de démo

`docs/demo.gif` (affichée en tête du README) est enregistrée depuis le HA de développement :

```bash
scripts/demo.sh      # nécessite le HA de dev démarré ; Playwright + ffmpeg dans Docker
```

Le scénario est dans [`dev/demo/record.mjs`](dev/demo/record.mjs) : il règle l'horloge du
navigateur sur un mardi matin, ajoute une dérogation de démo, joue les actions avec un curseur
visible, puis remet tout en état (dérogation supprimée, mode Normal, modifications du planning
abandonnées). À réenregistrer quand l'apparence de la carte change.

## 4. Déployer sur un vrai Home Assistant

**L'intégration** (v0.2+) s'installe avec HACS (voir le README), ou en copiant
`custom_components/chauffage/` dans `<config>/custom_components/chauffage/` puis en redémarrant
HA. Pour essayer une version de développement sur son propre HA, publier une préversion (voir
« Publier une version ») et l'installer depuis HACS avec les versions bêta activées.

**Le package v0.1** (ci-dessous, jusqu'à la v0.2.0) s'installe en **copiant des fichiers** dans
la configuration HA :

| Dépôt | Configuration HA |
|---|---|
| `www/*` | `<config>/www/chauffage/` |
| `packages/chauffage/*` | `<config>/packages/chauffage/` |

et une seule fois dans `configuration.yaml` :

```yaml
homeassistant:
  packages: !include_dir_named packages
frontend:
  extra_module_url:
    - /local/chauffage/chauffage-loader.js
recorder:
  exclude:
    entities:
      - sensor.programmes_chauffage
      - sensor.derogations_chauffage
      - sensor.suivi_vannes_chauffage
```

Que HA tourne sous Docker, en VM (HA OS) ou en venv, seul compte le chemin de son dossier
de configuration. Trois façons de copier :

### a. À la main
Copier les fichiers (Samba, add-on File editor, scp…), puis recharger les automatisations et
les entités template (Outils de développement → YAML), ou redémarrer HA.

### b. `scripts/deploy.sh`
```bash
scripts/deploy.sh /chemin/vers/config              # HA sur la même machine
scripts/deploy.sh monserveur:/chemin/vers/config   # via SSH
```
Avec `PROD_HA_URL` / `PROD_HA_TOKEN` dans `.env`, le script vérifie la configuration après
la copie, **restaure la version précédente si elle est invalide**, sinon recharge HA.

### c. `git push` (pour son propre serveur)
Un dépôt nu sur la machine de HA, avec le hook [`deploy/pre-receive`](deploy/pre-receive) :
`git push prod` déploie via `deploy.sh`, et **le push est refusé** si la configuration est
invalide (production inchangée).

```bash
# Sur le serveur HA (utilisateur ayant le droit d'écrire dans la config HA)
git init --bare /srv/ha-chauffage.git
cd /srv/ha-chauffage.git
git config deploy.haconfig /chemin/vers/config
curl -fsSL -o hooks/pre-receive https://raw.githubusercontent.com/armellarcier/ha-chauffage/main/deploy/pre-receive
chmod +x hooks/pre-receive
printf 'PROD_HA_URL=http://localhost:8123\nPROD_HA_TOKEN=…\n' > deploy.env && chmod 600 deploy.env

# Sur le poste de dev
git remote add prod monserveur:/srv/ha-chauffage.git
git push prod main
```

La carte se met à jour au rechargement de la page : `chauffage-loader.js` détecte la
nouvelle version (aucun `?v=` à changer, aucun redémarrage).

## Versions des données et migrations

Les installations doivent se mettre à jour sans action manuelle ni perte de données.

**Intégration** : `.storage/chauffage` est un `Store` Home Assistant versionné
(`STORAGE_VERSION` dans `custom_components/chauffage/store.py`). Un changement de format
l'incrémente et ajoute `MIGRATIONS[n]` (version n → n + 1), avec
`tests/fixtures/store-v<n+1>.json` ; `tests/integration/test_store.py` vérifie que chaque fixture
migre vers la plus récente. La carte ne voit que l'API websocket, dont le format évolue avec
l'intégration.

**Package (v0.1)** : les plannings stockés dans `sensor.programmes_chauffage` portent une **version de schéma** (attribut
`version` ; absent = 1, le format d'avant la v0.1.0). La version actuelle est `DATA_VERSION` dans
`custom_components/chauffage/frontend/chauffage-programme-card.js`.

- La carte migre les données plus anciennes à la lecture et les réenregistre une fois (depuis la
  carte, ou depuis n'importe quelle page de Home Assistant ouverte par un administrateur : le
  fichier de la carte est chargé sur toutes les pages). Les données d'avant la migration sont
  gardées dans l'attribut `previous` du capteur jusqu'à la suivante.
- Des données d'une version **plus récente** ne sont jamais modifiées : la carte affiche une
  erreur à la place (le retour à une version antérieure n'est pas pris en charge).
- Les dérogations durent quelques heures : une version qui change leur format peut supprimer
  celles en cours (les thermostats reprennent leur programme) plutôt que de les migrer ; le
  préciser dans le changelog.

**Changer le format des plannings :**

1. Incrémenter `DATA_VERSION` et ajouter `MIGRATIONS[n]`, une fonction pure qui passe de la
   version n à n + 1 (elle reçoit une copie des données et renvoie les nouvelles).
2. Ajouter `tests/fixtures/schedules-v<n+1>.json` : les mêmes plannings que les fixtures
   précédentes, au nouveau format. `tests/js/migrations.test.mjs` vérifie que chaque fixture
   migre vers la plus récente et que migrer deux fois ne change rien. Ne jamais modifier une
   ancienne fixture.
3. Adapter le package pour que l'automatisation lise le nouveau format, et lui faire ignorer les
   données dont elle ne connaît pas la `version` (tant qu'aucun administrateur n'a ouvert HA, les
   données ne sont pas encore migrées).
4. Décrire la migration dans `CHANGELOG.md` (« Upgrading »).

## Publier une version

Les versions suivent la [numérotation sémantique](https://semver.org/lang/fr/) ; avant la 1.0,
une version mineure peut changer l'installation ou les données (toujours migrées
automatiquement). Liste de contrôle :

1. `scripts/test.sh` : tout au vert, migrations testées avec des fixtures.
2. Réenregistrer la démo (`scripts/demo.sh`) si l'apparence de la carte a changé.
3. Mettre la version dans `custom_components/chauffage/frontend/chauffage-programme-card.js` (`VERSION`), `package.json`,
   l'en-tête de `packages/chauffage/chauffage.yaml` et `custom_components/chauffage/manifest.json` ; déplacer les entrées « Unreleased » de
   `CHANGELOG.md` sous la nouvelle version, avec la date et les étapes de mise à jour.
   `tests/js/release.test.mjs` vérifie que ces versions concordent.
4. Commiter, puis taguer et pousser :
   ```bash
   git tag -a v0.2.0 -m v0.2.0
   git push origin main v0.2.0
   ```
   Le workflow `Release` (`.github/workflows/release.yml`) lance les tests, vérifie la version
   et publie la « release » GitHub avec l'entrée du changelog et `ha-chauffage-v0.2.0.zip` (à
   décompresser dans le dossier de configuration de HA).

**Préversions** (`0.2.0-beta.1`) : mêmes étapes ; un tag contenant `-` est publié comme
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
- Les noms des modes (`Normal` / `Absent` / `Vacances`) sont des données, pas des textes
  d'interface : ils ne sont pas traduits (l'intégration crée les modes par défaut dans la langue
  de HA).
- Les textes de l'intégration (flux de configuration, entités, services, réparations, erreurs)
  utilisent les fichiers de traduction de Home Assistant : `strings.json` (anglais, source) et
  `translations/en.json`, `translations/fr.json`, avec les mêmes clés.
- Pour ajouter une langue : ajouter un objet à `I18N` (mêmes clés que `en`), étendre
  `resolveLanguage`, puis lancer `scripts/test.sh js`.
- Avec l'intégration (feuille de route, phase 1), la carte sera compilée : les traductions
  passeront à un fichier JSON par langue avec ICU MessageFormat (pluriels), comme la plupart des
  cartes Home Assistant.

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
- Noms d'entités HA en français.
- **Commits en anglais**, courts et descriptifs.
- **Documentation** (`README`, `CONTRIBUTING`) : la version anglaise (`*.md`) est la référence.
  La version française (`*.fr.md`) est toujours maintenue et mise à jour dans le même commit.
- **Les tests d'abord** (voir plus haut) : `tests/integration/` pour l'intégration,
  `tests/js/` pour la carte, `tests/ha/` pour le package v0.1.
- Les attributs des capteurs template ne doivent contenir que des valeurs simples (texte,
  nombres, listes, dictionnaires) : une seule valeur Enum (par ex. un `preset_mode` ZHA) fait
  stocker tout l'attribut sous forme de texte. Convertir avec `.value`.
- Les nouvelles fonctionnalités de la carte s'essaient d'abord dans le banc
  (`dev/fake-ha.js` simule HA : l'enrichir si besoin).

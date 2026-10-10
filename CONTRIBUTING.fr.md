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
(boutons en haut de page). Modifier `www/chauffage-programme-card.js`, recharger la page.

## 2. Logique HA : le HA de développement

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

- Versatile Thermostat est installé automatiquement (`VTHERM_VERSION=… docker compose … up -d`
  pour une autre version ; `HA_VERSION=beta` pour tester la prochaine version de HA).
- Le dépôt est **monté en direct** : `www/` → `/local/chauffage/`, `packages/chauffage/` → package HA,
  `custom_components/chauffage/` → l'intégration en cours (phase 1 de la feuille de route, voir
  [docs/integration-plan.md](docs/integration-plan.md) ; redémarrer HA après un changement Python).
- `dev/hass/packages/simulation.yaml` crée trois pièces virtuelles (salon, bureau, chambre) :
  un radiateur `input_boolean.radiateur_*` et une température `sensor.temperature_*` qui monte
  quand le radiateur chauffe.

**Tout est configuré automatiquement au premier démarrage** par le service `setup`
([`dev/setup/setup.py`](dev/setup/setup.py), via les API publiques de HA) : se connecter sur
<http://localhost:8124/chauffage-dev> avec **`dev` / `dev`** : le tableau de bord « Chauffage » (barre latérale) affiche la carte,
avec trois thermostats Versatile Thermostat (salon, bureau, chambre : « sur un interrupteur »,
températures de presets 7 / 17 / 20 / 22 °C) et des programmes d'exemple. Un jeton longue durée
est écrit dans `dev/hass/.dev-token` et utilisé par `scripts/reload.sh` et `scripts/logs.sh`
(pas besoin de `.env` pour le HA de dev). L'état est conservé dans `dev/hass/` (non versionné) ;
pour repartir de zéro : `docker compose -f dev/compose.yaml down && git clean -fdX dev/hass`.

**Boucle de travail :**

| Je modifie… | Pour l'appliquer |
|---|---|
| `www/*.js` | recharger la page du navigateur |
| `packages/chauffage/chauffage.yaml` | `scripts/reload.sh` (vérifie la config puis recharge) |
| `dev/hass/configuration.yaml` | `docker compose -f dev/compose.yaml restart homeassistant` |

`scripts/logs.sh` affiche la fin du journal (filtrée sur le projet ; `scripts/logs.sh dev 200 all`
pour tout voir). Pour accélérer les tests de la logique temporelle, changer les températures
avec les curseurs `input_number.temperature_*` et la durée de dérogation (`default_duration`).

## 3. Tests automatisés

```bash
scripts/test.sh          # tout (utilise Node / Python s'ils sont installés, sinon Docker)
scripts/test.sh js       # la carte seulement
scripts/test.sh ha       # le package HA seulement (arguments passés à pytest : scripts/test.sh ha -k ends)
scripts/test.sh integration   # l'intégration en cours (custom_components/chauffage)
```

| Suite | Outil | Ce qui est couvert |
|---|---|---|
| `tests/ha/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component) : un vrai Home Assistant en mémoire, horloge figée | le package : créneaux appliqués au bon moment, modes, thermostats éteints ou injoignables, détection des changements manuels, dérogations et leur fin |
| `tests/integration/` | idem, avec `custom_components/` chargé | l'intégration en cours : le flux de configuration pour l'instant |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (navigateur simulé) | la carte : calculs, édition du planning, copier / coller, enregistrement, dérogations, fenêtre de détail |

Dans `tests/ha/`, les thermostats sont de simples états `climate.*` simulés et
`climate.set_preset_mode` est remplacé par un enregistreur ; l'objet `Bench` (`conftest.py`)
avance le temps, simule un changement manuel ou la réponse du thermostat, et enregistre des
programmes comme le fait la carte.

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

Le projet s'installe en **copiant des fichiers** dans la configuration HA :

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

Les installations doivent se mettre à jour sans action manuelle ni perte de données. Les
plannings stockés dans `sensor.programmes_chauffage` portent une **version de schéma** (attribut
`version` ; absent = 1, le format d'avant la v0.1.0). La version actuelle est `DATA_VERSION` dans
`www/chauffage-programme-card.js`.

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
3. Mettre la version dans `www/chauffage-programme-card.js` (`VERSION`), `package.json`,
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

## Traductions

La carte parle anglais et français. Elle suit le profil de l'utilisateur Home Assistant
(`hass.locale`) : **langue** (français pour toute langue `fr*`, anglais sinon ; l'option
`language` de la carte permet de la forcer), **format de l'heure** (12 / 24 h), **format des
nombres** (séparateur décimal), **premier jour de la semaine**, et l'unité de température de la
configuration HA.

- Les textes sont dans l'objet `I18N` de `www/chauffage-programme-card.js`, un objet par langue,
  avec des clés en anglais et des variables `{placeholder}`.
- Chaque langue a exactement les mêmes clés et variables : `tests/js/i18n.test.mjs` le vérifie.
- Les formats ne sont jamais écrits à la main : heures, noms des jours et nombres viennent des API
  `Intl` du navigateur, selon `hass.locale` (voir `makeLocale`).
- Les noms des modes (`Normal` / `Absent` / `Vacances`) sont des données (options de
  `input_select.mode_chauffage`), pas des textes d'interface : ils ne sont pas traduits.
- Pour ajouter une langue : ajouter un objet à `I18N` (mêmes clés que `en`), étendre
  `resolveLanguage`, puis lancer `scripts/test.sh js`.
- Avec l'intégration (feuille de route, phase 1), la carte sera compilée : les traductions
  passeront à un fichier JSON par langue avec ICU MessageFormat (pluriels), comme la plupart des
  cartes Home Assistant.

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
- **Tout changement de comportement s'accompagne d'un test** (`tests/ha/` pour le package,
  `tests/js/` pour la carte) ; un bug corrigé reçoit un test de non-régression.
- Les attributs des capteurs template ne doivent contenir que des valeurs simples (texte,
  nombres, listes, dictionnaires) : une seule valeur Enum (par ex. un `preset_mode` ZHA) fait
  stocker tout l'attribut sous forme de texte. Convertir avec `.value`.
- Les nouvelles fonctionnalités de la carte s'essaient d'abord dans le banc
  (`dev/fake-ha.js` simule HA : l'enrichir si besoin).

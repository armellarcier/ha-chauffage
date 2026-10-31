# Contribuer à ha-chauffage

[English](CONTRIBUTING.md) · **Français**

**Ne développez pas sur votre Home Assistant de production.** Travaillez avec les tests
automatisés et un HA de développement jetable, puis publiez une préversion pour essayer votre
version sur un vrai Home Assistant.

## Prérequis

- Git, Bash (Linux, macOS, ou Git Bash / WSL sous Windows) et `curl`.
- [Docker](https://docs.docker.com/get-docker/) pour le HA de développement. Sous Windows et
  macOS, utilisez Docker Desktop.

La carte est un fichier JavaScript servi tel quel : il n'y a rien à compiler. Node et Python ne
servent qu'aux tests automatisés. Si Node ou Python n'est pas installé, les tests tournent dans
Docker.

## Le HA de développement

Démarrez le HA de développement :

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

Ouvrez <http://localhost:8124/chauffage-dev> et connectez-vous avec **`dev` / `dev`**. Le tableau
de bord *Chauffage*, dans la barre latérale, affiche la carte avec cinq thermostats.

### Ce que contient le HA de développement

Le service `setup` ([`dev/setup/setup.py`](dev/setup/setup.py)) configure tout au premier
démarrage, par les API publiques de Home Assistant : l'intégration **Chauffage**, la carte et
des plannings d'exemple.

Le dépôt est **monté en direct**. Vos modifications de `custom_components/chauffage/` arrivent
dans le HA de développement sans copie.

`dev/hass/packages/simulation.yaml` crée cinq pièces simulées. Chaque pièce a un radiateur
(`input_boolean.radiateur_*`) et un capteur de température (`sensor.temperature_*`). Le capteur
envoie la température chaque minute, au dixième de degré, comme un vrai capteur. Les pièces
couvrent **tous les types de thermostats** :

| Pièces | Thermostat |
|---|---|
| salon, bureau, chambre | **Versatile Thermostat**, « sur un interrupteur », avec des préréglages à 7 / 17 / 20 / 22 °C. Une consigne manuelle met le preset à `none`. |
| cuisine | Le **`generic_thermostat`** de Home Assistant, sans presets, déclaré en YAML. |
| chambre d'amis | **Presets standard** (`eco`, `comfort`, `away`, `boost`, pas de `frost`), fournis par la plateforme de dev [`dev/sim_climate/`](dev/sim_climate/climate.py). Une consigne manuelle efface le preset. |

L'intégration de dev [`dev/sim_rooms/`](dev/sim_rooms/model.py) donne aux pièces un modèle
thermique réaliste. Le radiateur, l'air, les murs et le capteur ont chacun leur inertie. Une
pièce chauffe d'environ 1,7 °C par heure et refroidit d'environ 0,6 °C par heure. La température
extérieure suit la journée, et des occupants, des portes ouvertes et des nuages perturbent un
peu chaque pièce.

**Un HA de développement neuf démarre avec une semaine d'historique.** Le setup simule la
semaine qui précède la création du HA de développement, avec le même modèle thermique, les
plannings d'exemple et un changement manuel un soir. L'*Historique* de la carte montre ainsi
tout de suite des courbes réalistes. Le recorder garde 10 jours.

### Changer les versions

- Pour une autre version de Versatile Thermostat, indiquez `VTHERM_VERSION` :
  `VTHERM_VERSION=… docker compose -f dev/compose.yaml up -d`.
- Pour essayer la prochaine version de Home Assistant, indiquez `HA_VERSION=beta`.

### Appliquer vos modifications

| Vous modifiez… | Pour appliquer la modification |
|---|---|
| `custom_components/chauffage/frontend/*.js` (la carte) | Rechargez la page du navigateur. |
| `custom_components/chauffage/*.py`, `*.json` | `docker compose -f dev/compose.yaml restart homeassistant` |
| `dev/hass/configuration.yaml`, `dev/sim_rooms/*.py`, `dev/sim_climate/*.py` | `docker compose -f dev/compose.yaml restart homeassistant` |

Pour voir la fin du journal, filtrée sur le projet, lancez `scripts/logs.sh`. Pour tout voir,
lancez `scripts/logs.sh dev 200 all`. `scripts/logs.sh` utilise le jeton longue durée que le
setup écrit dans `dev/hass/.dev-token` : vous n'avez pas besoin de fichier `.env`.

Pour tester plus vite la logique liée au temps, changez les températures avec les curseurs
`input_number.temperature_*`, et raccourcissez la durée des dérogations dans les options de
l'intégration.

### Repartir de zéro

Le HA de développement garde son état dans `dev/hass/`, qui n'est pas versionné. Pour repartir de
zéro :

```bash
docker compose -f dev/compose.yaml down && git clean -fdX dev/hass
```

### Un second HA de développement neuf

Pour essayer quelque chose sur un HA de développement vierge, ou pour enregistrer la démo,
démarrez-en un second à côté du vôtre. Le second HA de développement est un autre projet compose,
avec son propre dossier de configuration et son propre port :

```bash
mkdir -p /tmp/ha-fresh/packages && cp dev/hass/configuration.yaml /tmp/ha-fresh/ && cp dev/hass/packages/simulation.yaml /tmp/ha-fresh/packages/
DEV_HASS=/tmp/ha-fresh DEV_PORT=8125 docker compose -p ha-chauffage-fresh -f dev/compose.yaml up -d   # http://localhost:8125
```

## Tests automatisés

```bash
scripts/test.sh          # tout (utilise Node / Python s'ils sont installés, sinon Docker)
scripts/test.sh js       # la carte seulement
scripts/test.sh integration   # l'intégration (arguments passés à pytest : scripts/test.sh integration -k ends)
scripts/test.sh coverage      # carte et intégration avec la couverture (échoue sous le minimum)
HA=min scripts/test.sh integration   # idem, sur le HA minimal pris en charge (hacs.json, 2025.1)
```

**Lancez `scripts/test.sh` avant de publier.** GitHub Actions lance aussi les tests à chaque push
et à chaque pull request (`.github/workflows/tests.yml`).

| Suite | Outil | Ce qui est couvert |
|---|---|---|
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component) : un vrai Home Assistant en mémoire, horloge figée, `custom_components/` chargé | créneaux appliqués au bon moment, plannings, thermostats éteints ou injoignables, détection des changements manuels, dérogations et leur fin, les règles d'activation, la logique pure (`engine.py`), le stockage et ses migrations, les entités, les services, l'API websocket, l'historique lu dans le recorder, les flux de configuration et d'options, l'import depuis le package v0.1 |
| `tests/js/` | `node --test` + [jsdom](https://github.com/jsdom/jsdom) (navigateur simulé), avec un faux HA et une fausse intégration (`tests/js/helpers.mjs`) | la carte : calculs, édition des semaines, copier / coller, enregistrement, plannings, préréglages, règles d'activation, dérogations, historique et journée en grand, fenêtre de détail |

### Les tests de l'intégration

Dans les tests de l'intégration, les thermostats sont de simples états `climate.*` simulés, et
des enregistreurs remplacent les services `climate`. L'objet `Bench` (`conftest.py`) avance le
temps, simule un changement manuel ou la réponse du thermostat, et enregistre des plannings
comme le fait la carte.

Les tests de comportement tournent sur **les trois types de thermostats**, grâce à la fixture
`thermostat_kind` : `vtherm`, `standard` et `plain`. Si un test n'a de sens que pour certains
types, appelez `bench.needs(...)` dans le test.

## Versions de Home Assistant prises en charge

ha-chauffage fonctionne avec toutes les versions de Home Assistant, de la version minimale
indiquée dans `hacs.json` (2025.1) jusqu'à la dernière. Nous gardons la version minimale de Home
Assistant aussi basse que possible : [docs/decisions.md](docs/decisions.md#process) explique
pourquoi.

### 1. Relever la version minimale de Home Assistant

Relevez la version minimale de Home Assistant uniquement si le code a besoin d'une API absente
des versions plus anciennes, ou si Home Assistant supprime une API que nous utilisons. Faites-le
dans une version mineure d'ha-chauffage, et donnez la raison dans le changelog, sous
« Upgrading ».

Modifiez ces fichiers dans le même commit :

- `hacs.json` ;
- `tests/integration/requirements-min.txt`, avec la version de
  `pytest-homeassistant-custom-component` qui embarque cette version de Home Assistant ;
- le nom du job de la version minimale dans `.github/workflows/tests.yml` ;
- `README.md` et `README.fr.md`.

`tests/js/release.test.mjs` vérifie que ces fichiers indiquent la même version minimale. Si cette
version de Home Assistant demande une autre version de Python, changez aussi la version de Python
du job de la version minimale, et celle de `HA=min` dans `scripts/test.sh`.

### 2. Les versions de Home Assistant testées par la CI

À chaque push, la CI teste ces versions de Home Assistant :

- la dernière version (`requirements.txt`, mise à jour par Dependabot) ;
- la version minimale (`requirements-min.txt`, mise à jour à la main) ;
- une version par trimestre entre les deux (x.1, x.4, x.7, x.10) ;
- pour chaque test de version dans le code, la version juste avant et la version juste après.

Pour tester la version minimale de Home Assistant sur votre machine, lancez
`HA=min scripts/test.sh integration`.

Quand Dependabot apporte une version de Home Assistant d'un nouveau trimestre,
`test_supported_versions.py` échoue. Pour le corriger, ajoutez la version du trimestre précédent
à la matrice de tests : sa version de `pytest-homeassistant-custom-component`, sa version de
Python, et des versions figées si une dépendance non figée la casse.

### 3. Du code qui dépend de la version de Home Assistant

Si votre code utilise une API apparue après la version minimale de Home Assistant, vérifiez que
l'API existe avant de l'utiliser. Le code doit continuer à fonctionner sur la version minimale.
Ajoutez un test pour chaque cas : avec l'API, et sans l'API.

### 4. Baisser la version minimale de Home Assistant

Baissez la version minimale par grands pas, pas mois par mois. Dans une pull request, baissez la
version minimale et ajoutez les versions plus anciennes à la matrice de tests. La CI montre ce
qui casse.

La CI teste la carte uniquement avec un faux Home Assistant. Essayez donc aussi la carte dans un
HA de développement qui tourne sur la nouvelle version minimale, par exemple avec
`HA_VERSION=2025.1.0`.

### 5. La bêta de Home Assistant

Chaque lundi, `.github/workflows/ha-beta.yml` lance les tests de l'intégration sur la bêta de
Home Assistant. Vous pouvez aussi lancer ce workflow à la main depuis l'onglet *Actions*. Un
échec ne bloque jamais un push ni une release. L'échec annonce un changement à venir dans Home
Assistant : corrigez-le si possible avant la sortie de la version de Home Assistant, sans relever la version
minimale.

## Animation de démo

Le README affiche `docs/demo.gif`. Pour réenregistrer la démo, démarrez un second HA de
développement neuf (voir [plus haut](#un-second-ha-de-développement-neuf)), puis lancez :

```bash
DEMO_NETWORK=ha-chauffage-fresh_default scripts/demo.sh      # Playwright + ffmpeg dans Docker
```

La démo a besoin des données d'exemple, de la vue *Pièces* et de la semaine simulée d'un HA de
développement neuf, avec les noms français *Normal*, *Vacances* et *Absent*.

Le scénario se trouve dans [`dev/demo/record.mjs`](dev/demo/record.mjs). L'horloge du navigateur
est réglée sur un mardi matin, avec une dérogation de démo. Le scénario montre ensuite, dans
l'ordre :

1. un planning *Télétravail* créé par copie de *Normal*, puis son mardi modifié ;
2. la vue *Préréglages* : la fenêtre d'un préréglage, puis la case d'un thermostat ;
3. l'activation de *Vacances* ;
4. la fenêtre de détail d'un thermostat ;
5. les cartes thermostat de la vue *Pièces*, avec 30 minutes de plus pour la dérogation du
   salon ;
6. l'*Historique* du salon, et une journée en grand. Pour cette étape, le scénario revient à
   l'heure réelle, car l'historique est réel.

À la fin, le scénario remet tout en état : il supprime la dérogation et le nouveau planning,
réactive *Normal*, et n'enregistre pas les modifications des semaines.

## Essayer une version sur un vrai Home Assistant

Pour essayer une version de développement sur votre propre Home Assistant, publiez une
préversion (voir [Publier une version](#publier-une-version)). Installez ensuite la préversion
depuis HACS, avec les versions bêta activées.

Sans HACS, copiez `custom_components/chauffage/` dans `<config>/custom_components/chauffage/`,
puis redémarrez Home Assistant.

## Versions des données et migrations

Les installations doivent se mettre à jour sans action manuelle et sans perte de données.

### Les données stockées

`.storage/chauffage` est un `Store` Home Assistant versionné : `STORAGE_VERSION`, dans
`custom_components/chauffage/store.py`. Quand vous changez le format des données stockées :

1. Incrémentez `STORAGE_VERSION`.
2. Ajoutez `MIGRATIONS[n]`, qui migre la version n vers la version n + 1.
3. Ajoutez la fixture `tests/fixtures/store-v<n+1>.json`.

`tests/integration/test_store.py` vérifie que chaque fixture migre vers la dernière version. Ne
modifiez jamais une ancienne fixture.

Une version qui change le format des dérogations peut supprimer les dérogations en cours au lieu
de les migrer. Les thermostats reprennent alors leur planning. Indiquez-le dans le changelog.

La carte ne voit que l'API websocket. Le format de l'API websocket évolue avec l'intégration :
la carte n'a donc besoin d'aucune migration.

### Les données du package v0.1

L'intégration importe les données du package v0.1 (`sensor.programmes_chauffage`) quand on
l'ajoute. L'import se trouve dans `importer.py`, et `tests/fixtures/schedules-v1.json` contient
le format du package.

## Publier une version

Les versions suivent la [numérotation sémantique](https://semver.org/lang/fr/). Avant la 1.0, une
version mineure peut changer l'installation ou les données stockées. Les données stockées sont
toujours migrées automatiquement.

### 1. Lancer les tests

Lancez `scripts/test.sh`. Tout doit être au vert, et chaque migration doit avoir sa fixture.

### 2. Décider s'il faut réenregistrer la démo

Posez-vous la question à chaque publication. Réenregistrez la démo (voir [Animation de démo](#animation-de-démo)) quand la
carte a changé d'apparence, ou quand une fonctionnalité visible mérite d'être montrée : complétez
alors le scénario. Ne la réenregistrez pas quand les changements ne se voient pas.

### 3. Changer la version

Indiquez la nouvelle version dans ces fichiers :

- `custom_components/chauffage/frontend/chauffage-programme-card.js` (`VERSION`) ;
- `package.json` ;
- `custom_components/chauffage/manifest.json`.

`tests/js/release.test.mjs` vérifie que ces versions concordent.

Dans `CHANGELOG.md`, déplacez les entrées « Unreleased » sous la nouvelle version, avec la date
et les étapes de mise à jour.

### 4. Taguer et pousser

Commitez, puis taguez et poussez :

```bash
git tag -a v0.3.0 -m v0.3.0
git push origin main v0.3.0
```

Le workflow `Release` (`.github/workflows/release.yml`) lance les tests et vérifie la version. Il
publie ensuite la release GitHub, avec l'entrée du changelog et `ha-chauffage-v0.3.0.zip`. Le ZIP
contient `custom_components/chauffage/`, à décompresser dans le dossier de configuration de Home
Assistant, sans HACS.

### Préversions

Pour une préversion, par exemple `0.3.0-beta.1`, suivez les mêmes étapes. Un tag qui contient `-`
est publié comme préversion GitHub. HACS ne propose une préversion qu'aux utilisateurs qui
activent les versions bêta.

Un changement des données stockées ou de l'installation passe d'abord par une bêta. Installez la
bêta sur une vraie installation avant la version finale.

## Traductions

La carte parle anglais et français. La carte suit le profil de l'utilisateur Home Assistant
(`hass.locale`) :

- la **langue** : le français pour toute langue `fr*`, et l'anglais sinon ;
- le **format de l'heure** (12 ou 24 heures), le **format des nombres** (le séparateur décimal)
  et le **premier jour de la semaine** ;
- l'unité de température de la configuration de Home Assistant.

L'option `language` de la carte permet d'imposer une langue.

### Les textes de la carte

- Écrivez les textes dans l'objet `I18N` de
  `custom_components/chauffage/frontend/chauffage-programme-card.js`. `I18N` contient un objet par
  langue, avec des clés en anglais et des variables `{placeholder}`.
- Donnez à chaque langue exactement les mêmes clés et les mêmes variables.
  `tests/js/i18n.test.mjs` le vérifie.
- N'écrivez jamais un format à la main. Les heures, les noms des jours et les nombres viennent
  des API `Intl` du navigateur, selon `hass.locale` (voir `makeLocale`).
- Ne traduisez pas les noms des plannings et des préréglages, par exemple `Normal` ou `Confort`.
  Ces noms sont des données, pas des textes d'interface. L'intégration crée les noms par défaut
  dans la langue de Home Assistant.

### Les textes de l'intégration

Les textes de l'intégration utilisent les fichiers de traduction de Home Assistant :
`strings.json` (l'anglais, la source), `translations/en.json` et `translations/fr.json`.
Donnez-leur les mêmes clés. Ces textes sont par exemple le flux de configuration, les entités,
les services, les réparations et les erreurs.

### Ajouter une langue

1. Ajoutez un objet à `I18N`, avec les mêmes clés que `en`.
2. Complétez `resolveLanguage`.
3. Lancez `scripts/test.sh js`.

Quand la carte sera compilée (voir la feuille de route), les traductions passeront à un fichier
JSON par langue, avec ICU MessageFormat pour les pluriels, comme dans la plupart des cartes Home
Assistant.

## Les tests d'abord

Les tests sont la documentation d'ha-chauffage. Chaque test dit en une phrase ce que fait
ha-chauffage, par exemple `a_thermostat_back_online_is_set_to_its_schedule`, et le prouve à
chaque exécution. Testez donc tout, et écrivez les tests en premier (TDD).

### 1. Écrire le test d'abord

Pour un nouveau comportement ou un bug, écrivez un test qui porte le nom du cas d'usage, dans
les mots de l'utilisateur. Lancez le test et **voyez-le échouer**, pour la raison attendue. Un
test qui passe tout de suite ne prouve rien : cassez le code exprès et vérifiez que le test
échoue.

### 2. Écrire le code

Écrivez le code qui fait passer le test, sans rien de plus. Nettoyez ensuite, avec les tests au
vert.

### 3. Répertorier le cas d'usage

Chaque cas d'usage a son test, répertorié dans [docs/use-cases.md](docs/use-cases.md). Quand
vous ajoutez un cas d'usage, ajoutez-y une ligne.

Testez ce que font et attendent les utilisateurs, pas des lignes de code. Pensez aux cas
d'erreur, aux limites (minuit, le passage du dimanche au lundi, l'heure d'été), aux
redémarrages, aux appareils injoignables et aux autres langues.

### 4. Tester tous les types de thermostats

Les tests de comportement de l'intégration tournent sur Versatile Thermostat, sur des préréglages
standard et sur des thermostats sans préréglages (`thermostat_kind`). Utilisez `bench.needs(...)`
seulement pour un comportement qui ne peut pas exister sur un type de thermostat.

### 5. Ajouter un test de non-régression à chaque correctif

Un bug corrigé reçoit un test de non-régression, qui échoue sans le correctif.

### La couverture

La CI échoue sous **97 %** de couverture pour l'intégration, et **95 %** pour la carte
(`scripts/test.sh coverage`). Le README affiche les valeurs actuelles. Traitez la couverture
comme un plancher, pas comme un objectif : [docs/decisions.md](docs/decisions.md#process)
explique pourquoi.

## Conventions

Ces conventions s'appliquent à tous les contributeurs, humains comme assistants IA. `AGENTS.md`
et `CLAUDE.md` renvoient ici.

- **Écrivez le code en anglais**, même si le projet s'appelle `ha-chauffage` : les noms de
  variables, de fonctions et de fichiers, les commentaires, les specs et les tests. Du code
  existant a encore des commentaires ou des noms en français. Traduisez-les quand vous modifiez
  le code autour.
- **Utilisez un seul vocabulaire**, défini dans [docs/glossary.md](docs/glossary.md) :
  *planning*, *préréglage*, *créneau* et *dérogation*. Utilisez les mêmes notions partout : dans
  l'interface, la doc, le code, les données et les tests. Dans le code et les données, ces mots
  sont en anglais : *schedule*, *preset*, *slot* et *override*.
- **Nommez les entités Home Assistant en français.**
- **Écrivez les commits en anglais**, courts et descriptifs.
- **Écrivez la doc pour le lecteur.** Lisez [docs/writing-style.md](docs/writing-style.md)
  avant de modifier une doc, une entrée du changelog ou une pull request.
- **Tenez la doc française à jour.** La doc anglaise (`README.md`, `CONTRIBUTING.md`) est la
  référence. Mettez à jour la version française (`*.fr.md`) dans le même commit.
- **Écrivez les tests d'abord** (voir [Les tests d'abord](#les-tests-dabord)) :
  `tests/integration/` pour l'intégration, `tests/js/` pour la carte.
- **Notez les décisions.** Quand vous faites un choix qu'un futur contributeur pourrait remettre
  en question, écrivez ce choix et sa raison dans [docs/decisions.md](docs/decisions.md).
- **Discutez des demandes et des idées dans les issues GitHub.** [ROADMAP.fr.md](ROADMAP.fr.md)
  contient la vision et les idées retenues, avec un lien vers leurs issues.
- **Convertissez les Enum en valeurs simples.** Les données lues sur les thermostats peuvent
  contenir des Enum, par exemple un `preset_mode` ZHA. Convertissez-les avec `.value` avant de
  les stocker ou de les mettre dans un attribut.
- **Dites pourquoi Chauffage agit sur un thermostat** (#49) :
  - Envoyez chaque commande par `send()`, avec sa raison. `send()` journalise la commande au
    niveau INFO.
  - Commencez et terminez chaque dérogation par `_keep_override()` et `_drop_override()`, avec sa
    source ou sa raison. Ces fonctions journalisent la dérogation, émettent l'événement, et la
    décrivent dans le journal de bord.
  - Donnez à une nouvelle source ou raison son texte dans chaque langue de `logbook.py`.
    `test_traces.py` le vérifie.
  - Donnez à une nouvelle trace son test dans `test_traces.py`.
- **Essayez vos changements de la carte dans le HA de développement**, sur tous les types de
  thermostats.
- **Faites marcher la carte sur téléphone.** La carte doit marcher au doigt : aucune information
  visible seulement au survol, et aucune action accessible seulement à la souris ou au clavier.
  La carte doit aussi marcher sur un écran étroit, dès 360 px de large. Essayez vos changements
  de la carte à cette largeur dans le HA de développement.

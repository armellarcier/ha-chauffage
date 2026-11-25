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

## Structure du dépôt

```
custom_components/chauffage/        l'intégration (programmateur, entités, services, API websocket)
custom_components/chauffage/frontend/  carte Lovelace + bloc injecté dans la fenêtre de détail
dev/compose.yaml, dev/hass/         HA de développement jetable (VTherm + pièces simulées)
dev/sim_rooms/, dev/sim_climate/    dev uniquement : modèle thermique des pièces (et une semaine
                                    d'historique simulée pour un HA de dev neuf), un climate à
                                    préréglages standard
tests/integration/, tests/js/       tests automatisés (pytest + HA en mémoire, node --test + jsdom)
docs/                               le guide utilisateur (une page par sujet, en anglais et en
                                    français), et le glossaire, les décisions, les cas d'usage et
                                    le style d'écriture (en anglais)
tests/fixtures/                     données stockées dans chaque ancien format (tests des migrations)
scripts/                            test.sh, logs.sh, demo.sh
.github/workflows/                  tests (CI), hassfest, vérifications HACS et publication
```

### Ajouter ou déplacer une page de la doc

1. Écrivez la page dans `docs/<sujet>.md`, et sa version française dans `docs/<sujet>.fr.md`.
2. Ajoutez une ligne pour la page dans la table du guide de `docs/README.md` et de
   `docs/README.fr.md`.
3. Ajoutez la même ligne dans la table *Documentation* de `README.md` et de `README.fr.md`, à la
   fin de *En savoir plus*. Si une section du README présente le sujet de la page, faites aussi
   un lien vers la page depuis cette section.
4. Quand une section quitte le README, gardez son ancre : ajoutez un `<a id>` dans la table
   *Sections déplacées* du README.

## Le HA de développement

Démarrez le HA de développement :

```bash
docker compose -f dev/compose.yaml up -d          # http://localhost:8124
```

Ouvrez <http://localhost:8124/chauffage-dev> et connectez-vous avec **`dev` / `dev`**. Le tableau
de bord *Chauffage*, dans la barre latérale, affiche la carte avec dix thermostats.

### Ce que contient le HA de développement

Le service `setup` ([`dev/setup/setup.py`](dev/setup/setup.py)) configure tout au premier
démarrage, par les API publiques de Home Assistant : l'intégration **Chauffage**, la carte et
des plannings d'exemple.

Le dépôt est **monté en direct**. Vos modifications de `custom_components/chauffage/` arrivent
dans le HA de développement sans copie.

`dev/hass/packages/simulation.yaml` crée dix pièces simulées. Chaque pièce a un radiateur
(`input_boolean.radiateur_*`) et un capteur de température (`sensor.temperature_*`). Le capteur
envoie la température chaque minute, au dixième de degré, comme un vrai capteur. Une pièce
climatisée a aussi un refroidisseur (`input_boolean.clim_*`) : le refroidisseur rafraîchit la
pièce quand la climatisation refroidit. Les pièces couvrent **tous les types de thermostats** :

| Pièces | Thermostat |
|---|---|
| salon, bureau, chambre | **Versatile Thermostat**, « sur un interrupteur », avec des préréglages à 7 / 17 / 20 / 22 °C. Une consigne manuelle met le preset à `none`. |
| cuisine | Le **`generic_thermostat`** de Home Assistant, sans presets, déclaré en YAML. |
| chambre d'amis | **Presets standard** (`eco`, `comfort`, `away`, `boost`, pas de `frost`), fournis par la plateforme de dev [`dev/sim_climate/`](dev/sim_climate/climate.py). Une consigne manuelle efface le preset. |
| véranda | **Versatile Thermostat**, « sur un climate », avec l'**auto start/stop**. Le climate qu'il pilote, `climate.clim_veranda`, vient de `dev/sim_climate/` et n'est pas programmé. |
| atelier | Une **climatisation réversible** de `dev/sim_climate/` : presets standard, `heat`, `cool`, `auto` et `fan_only`, avec `fan_modes`, `swing_modes` et `swing_horizontal_modes` (les valeurs de #61). En `cool`, `input_boolean.clim_atelier` refroidit la pièce, et ses presets donnent des consignes de climatisation (`eco` 27 °C, `comfort` 25 °C). |
| mezzanine | **Versatile Thermostat**, « sur un climate », en **mode AC** : `heat`, `cool` et `off`. En `cool`, ses préréglages sont à 27 / 25 / 23 °C (`eco`, `comfort`, `boost`). Le climate qu'il pilote, `climate.clim_mezzanine`, vient de `dev/sim_climate/` et n'est pas programmé. |
| combles | Une **climatisation qui ne fait que du froid**, de `dev/sim_climate/` : `cool`, `fan_only` et `off`, avec des `fan_modes` et des presets standard réglés sur des consignes de froid. La pièce n'a pas de radiateur. |
| suite parentale | Une **Daikin réversible**, simulée d'après ce qu'expose l'intégration `daikin` de Home Assistant : `heat`, `cool`, `heat_cool`, `dry` et `fan_only`, les presets `none`, `away`, `eco` et `boost`, avec des `fan_modes` et des `swing_modes`. Un preset ne change pas la consigne. |

Les semaines d'exemple des climatisations montrent ce qu'un créneau peut choisir. La suite
parentale a un créneau *Clim*, un créneau *Chauffe/Clim*, un créneau *Déshum.*, un créneau
*Ventilation* et un créneau *Éteint*. L'atelier a un créneau *Auto* le week-end.

La Daikin simulée diffère de la vraie sur un point. En `heat_cool`, elle prend une plage de
températures : le HA de développement a ainsi un thermostat pour les créneaux *Chauffe/Clim*.

Deux Versatile Thermostats surveillent aussi une **fenêtre** : un `input_boolean` que vous
allumez pour l'ouvrir.

| Fenêtre | Ce que fait le VTherm tant que la fenêtre est ouverte |
|---|---|
| `input_boolean.fenetre_bureau` | Il garde son preset et passe à la consigne hors-gel. |
| `input_boolean.fenetre_chambre` | Il s'éteint. |

Pour essayer l'auto start/stop, réglez `input_number.temperature_veranda` sur 28 °C : la véranda
s'éteint en moins d'une minute. Remettez le curseur à 12 °C : la véranda se rallume au bout
d'environ 7 minutes.

Ces fonctions de VTherm changent le thermostat d'elles-mêmes. Elles n'existent que dans un HA de
développement neuf : un HA existant garde ses Versatile Thermostats tels quels.

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

Pour essayer quelque chose sur un HA de développement vierge, démarrez-en un second à côté du
vôtre. Le second HA de développement est un autre projet compose, avec son propre dossier de
configuration et son propre port :

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
| `tests/integration/` | pytest + [pytest-homeassistant-custom-component](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component) : un vrai Home Assistant en mémoire, horloge figée, `custom_components/` chargé | créneaux appliqués au bon moment, plannings, thermostats éteints ou injoignables, détection des changements manuels, dérogations et leur fin, les règles d'activation, la logique pure (`engine.py`), le stockage et ses migrations, les entités, les services, l'API websocket, l'historique lu dans le recorder, les flux de configuration et d'options |
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
- `README.md`, `README.fr.md`, `docs/installation.md` et `docs/installation.fr.md`.

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

## Relire la carte dans le HA de développement

Pour vérifier une modification de la carte comme un utilisateur la voit, pilotez le HA de
développement avec Playwright. La bibliothèque de relecture de
[`dev/review/`](dev/review/README.md) ouvre un créneau, une dérogation ou une case de l'onglet
*Préréglages*, mesure ce qu'elle affiche, et compare l'état des thermostats avec ce que la carte
annonçait.

Lancez un script depuis la racine du dépôt, avec le HA de développement démarré :

```bash
dev/review/run.sh dev/review/examples/slot.mjs
```

Le script tourne dans l'image Docker de Playwright : vous n'installez rien. Les captures d'écran
vont dans `dev/review/out/`. Ouvrez-les : une rangée peut avoir les bonnes mesures et pourtant
mal s'afficher.

Avant qu'un script modifie des créneaux ou des dérogations, faites un `backup` des thermostats
qu'il touche, puis un `restore` à la fin. [`dev/review/README.md`](dev/review/README.md), en
anglais, décrit chaque fonction de la bibliothèque.

## Démos

Le README montre trois démos, dans `docs/media/` :

| GIF | Ce qu'il montre |
|---|---|
| `week.gif` | un planning copié et modifié, un autre activé, puis l'historique |
| `override.gif` | un changement à la main sur téléphone, puis sa fin glissée plus tard et 30 minutes de plus, sur la carte de la pièce |
| `panel.gif` | l'onglet *Préréglages* du panneau, puis les réglages de Chauffage |

Chaque démo a son scénario dans `dev/demo/scenarios/<nom>.mjs`. `dev/demo/lib.mjs` se connecte,
enregistre les images et remet tout en état, pour chaque scénario.

### 1. Enregistrer les démos

```bash
scripts/demo.sh            # toutes les démos
scripts/demo.sh override   # une seule démo
```

Le script n'a besoin que de Docker. Votre HA de développement peut continuer à tourner.

**Le HA de démo.** Le script démarre un nouveau HA de développement, le HA de démo, sur le port
8127. L'horloge du HA de démo indique un mardi à 17 h 30, heure de Paris, quelle que soit l'heure
réelle. Les démos montrent donc le même jour et la même heure à chaque enregistrement. Le HA de
démo a les données d'exemple et la semaine simulée d'un HA de développement neuf. Le script
supprime le HA de démo à la fin.

- Pour enregistrer à une autre heure, réglez `DEMO_TIME`, par exemple
  `DEMO_TIME="wednesday 08:00"`.
- Pour garder le HA de démo après l'enregistrement, réglez `DEMO_KEEP=1`. Ouvrez-le sur
  <http://localhost:8127>, avec `dev` / `dev`.

**Les GIF.** Le script garde chaque image que dessine le navigateur, sans perte. Puis ffmpeg en
fait un GIF à 15 images par seconde, avec une seule palette calculée pour tout le GIF. Le script
écrit `docs/media/<nom>.gif`.

### 2. Vérifier chaque GIF

Ouvrez chaque GIF avant de le commiter. Un GIF peut aller jusqu'au bout et montrer quand même la
mauvaise chose. Gardez une démo sous 30 secondes et sous 2 Mo.

### 3. Ajouter une démo

1. Copiez un scénario de `dev/demo/scenarios/`, et donnez-lui un nouveau nom.
2. Écrivez sa `scene`. Écrivez son `prepare` avec l'API de l'intégration, si la scène a besoin
   d'un état que les données d'exemple n'ont pas.
3. Ajoutez le nom à la liste par défaut de `scripts/demo.sh`.
4. Montrez le GIF dans la section du README qui présente son sujet, et sur la page de la doc de
   son sujet.

## Essayer une version sur un vrai Home Assistant

### Avec une préversion

Pour essayer une version sur un vrai Home Assistant, publiez une préversion (voir
[Publier une version](#publier-une-version)). Installez ensuite la préversion depuis HACS, avec
les versions bêta activées. HACS installe et met à jour une préversion comme n'importe quelle
version.

### Notre raccourci : scripts/deploy.sh

**`scripts/deploy.sh` est un bricolage, à vos risques et périls.** Nous le gardons pour nos
propres essais rapides entre deux préversions. Nous ne le prenons pas en charge : merci de ne pas
ouvrir d'issue à son sujet.

Le script copie un commit directement dans le dossier de configuration de votre Home Assistant.
HACS n'en sait rien, et votre Home Assistant fait tourner une version que personne n'a publiée.
Revenez en arrière, ou publiez la version, dès que vous l'avez essayée.

#### 1. Vérifier les prérequis

- Home Assistant tourne dans un conteneur Docker.
- Votre machine a `bash` et `git`.
- `ssh <hôte>` fonctionne sans demander de mot de passe, par exemple avec un alias dans
  `~/.ssh/config`.
- L'utilisateur SSH peut écrire dans le dossier de configuration de Home Assistant et peut
  lancer `docker`.
- L'hôte a `bash` et `tar`.

#### 2. Remplir `.env`

```bash
PROD_HA_CONFIG=home-assistant:/docker/homeassistant/config   # hôte:/dossier, ou un dossier local
PROD_HA_CONTAINER=homeassistant
```

#### 3. Déployer

Committez vos modifications, puis lancez :

```bash
scripts/deploy.sh
```

Le script installe le dernier commit de votre branche courante. Les modifications non
committées ne partent pas. Avant de changer quoi que ce soit, le script affiche le sha du commit.

Le script arrête Home Assistant, installe le commit, puis relance Home Assistant. Au premier
déploiement, il met aussi de côté ce qui est installé et ses données, dans
`<config>/.chauffage-backup`. Les déploiements suivants gardent cette sauvegarde, et indiquent
quelle version elle contient.

#### 4. Déployer une autre branche

Pour déployer une autre branche sans changer de branche, lancez
`scripts/deploy.sh --branch <branche>`. Pour déployer exactement le commit que vous avez relu,
donnez son sha complet à la place.

Pour une branche qui n'est que sur GitHub, par exemple celle d'un contributeur, récupérez-la
d'abord :

```bash
git fetch origin <branche>
scripts/deploy.sh --branch origin/<branche>
```

Lancez le script depuis votre propre copie de `main`.

#### 5. Revenir à la version d'avant

```bash
scripts/deploy.sh --rollback
```

Le retour en arrière arrête Home Assistant, remet la version publiée et ses données, relance
Home Assistant et supprime la sauvegarde.

Tout ce que vous avez modifié dans Chauffage depuis le premier déploiement est perdu, par
exemple une semaine retouchée. Le retour en arrière garde les données de la version de
développement dans `<config>/.chauffage-dev-data-<heure>`. Ce fichier est au format de la
version de développement, et la version publiée ne sait peut-être pas le lire.

Si Chauffage n'était pas installé avant le premier déploiement, le retour en arrière le retire.

#### 6. Ou garder la version

Si la version marche, ne revenez pas en arrière :

1. Publiez le commit essayé (voir [Publier une version](#publier-une-version)).
2. Mettez à jour Chauffage depuis HACS vers cette version.

Home Assistant garde les données modifiées pendant l'essai. La sauvegarde est alors périmée : le
déploiement suivant en refait une, et un retour en arrière se contente de la supprimer.

#### Ce que la sauvegarde ne couvre pas

- **HACS.** Jusqu'à votre mise à jour depuis HACS, HACS affiche la version installée avant le
  premier déploiement.
- **La configuration de l'intégration.** La sauvegarde contient `.storage/chauffage`, mais pas
  l'entrée de l'intégration dans `.storage/core.config_entries`. Si votre version augmente la
  version majeure de cette entrée, la version publiée ne peut plus charger l'intégration après
  le retour en arrière.

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

## Publier une version

Les versions suivent la [numérotation sémantique](https://semver.org/lang/fr/). Avant la 1.0, une
version mineure peut changer l'installation ou les données stockées. Les données stockées sont
toujours migrées automatiquement.

### 1. Lancer les tests

Lancez `scripts/test.sh`. Tout doit être au vert, et chaque migration doit avoir sa fixture.

### 2. Décider s'il faut réenregistrer les démos

Posez-vous la question à chaque publication. Réenregistrez une démo (voir [Démos](#démos)) quand
ce qu'elle montre a changé d'apparence. Quand une fonctionnalité visible mérite d'être montrée,
complétez le scénario de son sujet, ou ajoutez une démo. Ne réenregistrez rien quand les
changements ne se voient pas.

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
- **Tenez la doc française à jour.** La doc anglaise (`README.md`, `CONTRIBUTING.md` et les
  pages de `docs/`) est la référence. Mettez à jour la version française (`*.fr.md`) dans le
  même commit.
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

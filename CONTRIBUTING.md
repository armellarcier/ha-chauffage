# Contribuer à ha-chauffage

Règle d'or, comme dans la plupart des projets Home Assistant : **on ne développe pas sur
son HA de production.** On travaille avec un banc de test et un HA de développement
jetable, puis on déploie.

## Prérequis

- Git, Bash (Linux, macOS, ou Git Bash / WSL sous Windows), `curl`.
- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop sous Windows / macOS) pour le HA de dev.
- Python 3 (facultatif) pour servir le banc de test.

Pas de Node, pas de compilation : la carte est un fichier JavaScript servi tel quel.

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
- Le dépôt est **monté en direct** : `www/` → `/local/chauffage/`, `packages/chauffage/` → package HA.
- `dev/hass/packages/simulation.yaml` crée trois pièces virtuelles (salon, bureau, chambre) :
  un radiateur `input_boolean.radiateur_*` et une température `sensor.temperature_*` qui monte
  quand le radiateur chauffe.

**Première fois seulement** (l'état est conservé dans `dev/hass/`, non versionné) :

1. Ouvrir <http://localhost:8124>, créer le compte (ex. `dev` / `dev`).
2. Paramètres → Appareils et services → Ajouter → **Versatile Thermostat**, pour chaque pièce :
   type « sur un interrupteur », capteur `sensor.temperature_<pièce>`, capteur extérieur
   `sensor.temperature_exterieure`, interrupteur `input_boolean.radiateur_<pièce>`,
   et des températures de presets (confort, éco, boost, hors-gel).
3. Profil → Sécurité → créer un jeton longue durée, puis `cp .env.example .env` et le coller
   dans `DEV_HA_TOKEN`.
4. Ajouter la carte `custom:chauffage-programme-card` à un tableau de bord.

**Boucle de travail :**

| Je modifie… | Pour l'appliquer |
|---|---|
| `www/*.js` | recharger la page du navigateur |
| `packages/chauffage/chauffage.yaml` | `scripts/reload.sh` (vérifie la config puis recharge) |
| `dev/hass/configuration.yaml` | `docker compose -f dev/compose.yaml restart homeassistant` |

`scripts/logs.sh` affiche la fin du journal (filtrée sur le projet ; `scripts/logs.sh dev 200 all`
pour tout voir). Pour accélérer les tests de la logique temporelle, changer les températures
avec les curseurs `input_number.temperature_*` et la durée de dérogation (`duree_defaut`).

## 3. Déployer sur un vrai Home Assistant

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
curl -fsSL -o hooks/pre-receive https://raw.githubusercontent.com/<compte>/ha-chauffage/main/deploy/pre-receive
chmod +x hooks/pre-receive
printf 'PROD_HA_URL=http://localhost:8123\nPROD_HA_TOKEN=…\n' > deploy.env && chmod 600 deploy.env

# Sur le poste de dev
git remote add prod monserveur:/srv/ha-chauffage.git
git push prod main
```

La carte se met à jour au rechargement de la page : `chauffage-loader.js` détecte la
nouvelle version (aucun `?v=` à changer, aucun redémarrage).

## Conventions

- Code, commentaires et documentation en français ; noms d'entités HA en français.
- Templates Jinja multi-lignes : `{%- … -%}` (sinon HA ne relit pas les dictionnaires).
- Toute nouvelle fonctionnalité de la carte se teste d'abord dans le banc
  (`dev/fake-ha.js` simule HA : l'enrichir si besoin).
- Commits courts et descriptifs, en français.

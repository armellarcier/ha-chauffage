#!/usr/bin/env bash
# Déploie le projet dans la configuration d'un Home Assistant (installation réelle).
#
#   scripts/deploy.sh <cible>
#
#   <cible> = dossier de configuration HA, en local      ex. /config, /docker/homeassistant/config
#           = ou hôte:dossier, via SSH                   ex. nas:/docker/homeassistant/config
#
# Copie :  www/                 → <cible>/www/chauffage/
#          packages/chauffage/  → <cible>/packages/chauffage/
# Puis, si PROD_HA_URL / PROD_HA_TOKEN sont définis (.env) : vérifie la configuration HA,
# restaure la version précédente si elle est invalide, sinon recharge template + automatisations.
# Sans jeton : copie seule (recharger ou redémarrer HA à la main).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/_ha.sh
ha_load_env
ha_target prod

cible="${1:?Usage : scripts/deploy.sh <dossier config HA | hôte:dossier>}"

# hôte:chemin (SSH) — mais pas une lettre de lecteur Windows (C:/…)
if [[ "$cible" == *:* && ! "$cible" =~ ^[A-Za-z]:[\\/] ]]; then
  hote="${cible%%:*}"; dossier="${cible#*:}"
  run() { ssh "$hote" "$1"; }
else
  hote=""; dossier="$cible"
  run() { bash -c "$1"; }
fi

# Script exécuté sur la cible : sauvegarde, remplacement, puis (éventuellement) restauration
distant=$(cat <<EOF
set -e
cd '$dossier'
test -f configuration.yaml || { echo "Pas de configuration.yaml dans $dossier" >&2; exit 1; }
case "\${1:-}" in
  install)
    # Sauvegarde de la version en place (pour restauration si la config est invalide)
    rm -rf .chauffage-precedent
    mkdir -p .chauffage-precedent/www .chauffage-precedent/packages www/chauffage packages/chauffage
    cp -a www/chauffage/. .chauffage-precedent/www/
    cp -a packages/chauffage/. .chauffage-precedent/packages/
    find www/chauffage packages/chauffage -mindepth 1 -delete
    tar -xf - --no-same-owner ;;
  restore)
    find www/chauffage packages/chauffage -mindepth 1 -delete
    cp -a .chauffage-precedent/www/. www/chauffage/
    cp -a .chauffage-precedent/packages/. packages/chauffage/ ;;
esac
EOF
)

echo "Déploiement vers ${hote:+$hote:}$dossier"
# Arborescence de destination préparée à part (portable : pas de tar --transform)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/www/chauffage" "$stage/packages/chauffage"
cp -R www/. "$stage/www/chauffage/"
cp -R packages/chauffage/. "$stage/packages/chauffage/"
tar -C "$stage" -cf - www packages | run "bash -c $(printf '%q' "$distant") _ install"
echo "  fichiers copiés"

if ! ha_configured; then
  echo "PROD_HA_URL / PROD_HA_TOKEN non définis : rechargez (ou redémarrez) HA à la main."
  exit 0
fi

if ! ha_check_config; then
  echo "Restauration de la version précédente…" >&2
  run "bash -c $(printf '%q' "$distant") _ restore </dev/null"
  exit 1
fi
echo "Rechargement (${HA_URL}) :"
ha_reload
echo "Terminé. La carte se met à jour au prochain rechargement de la page."

#!/usr/bin/env bash
# Downloads Maskito into the card's vendor folder: its core, and only its time mask
# (tree-shaken by esm.sh). Usage: scripts/vendor-maskito.sh 5.6.1
set -euo pipefail
version="${1:?usage: scripts/vendor-maskito.sh <version>}"
dir="$(dirname "$0")/../custom_components/chauffage/frontend/vendor"
mkdir -p "$dir"
rm -f "$dir"/maskito-*.js
header="/* Maskito $version (https://github.com/taiga-family/maskito), Apache-2.0, see LICENSE-maskito */"
{ echo "$header"; curl -fsSL "https://esm.sh/@maskito/core@$version/es2022/core.mjs"; } > "$dir/maskito-core-$version.js"
{ echo "$header"; curl -fsSL "https://esm.sh/@maskito/kit@$version/es2022/kit.bundle.mjs?exports=maskitoTimeOptionsGenerator" \
  | sed -E "s#from\"/@maskito/core@[^\"]*\"#from\"./maskito-core-$version.js\"#"; } > "$dir/maskito-time-$version.js"
curl -fsSL "https://raw.githubusercontent.com/taiga-family/maskito/v$version/LICENSE" > "$dir/LICENSE-maskito"
if grep -q 'from"/' "$dir"/maskito-*.js; then echo "An import still points to esm.sh" >&2; exit 1; fi
ls -l "$dir"

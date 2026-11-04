#!/usr/bin/env bash
# Rebuild js/pdf-fonts.js (fonts embedded in the patient PDF), subset to Greek + Latin.
# Needs: npm, python3 with fonttools (pip install fonttools), DejaVu Sans Bold installed (for the → arrow).
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
( cd "$tmp" && npm init -y >/dev/null && npm install @expo-google-fonts/commissioner@0.4.1 @expo-google-fonts/gfs-didot@0.4.1 >/dev/null )
N="$tmp/node_modules/@expo-google-fonts"
U="U+0020-007E,U+00A0-00FF,U+0370-03FF,U+1F00-1FFF,U+2010-2027,U+2030-203A,U+2190-2193,U+2212,U+00B7,U+20AC"
pyftsubset "$N/commissioner/400Regular/Commissioner_400Regular.ttf" --unicodes="$U" --layout-features='kern,liga' --output-file="$tmp/c400.ttf"
pyftsubset "$N/commissioner/600SemiBold/Commissioner_600SemiBold.ttf" --unicodes="$U" --layout-features='kern,liga' --output-file="$tmp/c600.ttf"
pyftsubset "$N/commissioner/700Bold/Commissioner_700Bold.ttf" --unicodes="$U" --layout-features='kern,liga' --output-file="$tmp/c700.ttf"
pyftsubset "$N/gfs-didot/400Regular/GFSDidot_400Regular.ttf" --unicodes="$U" --layout-features='kern,liga' --output-file="$tmp/d400.ttf"
pyftsubset "$(fc-match -f '%{file}' 'DejaVu Sans:bold')" --unicodes="U+0020,U+2192" --output-file="$tmp/arrow.ttf"
python3 - "$tmp" <<'PY'
import base64, json, sys
d = sys.argv[1]
f = {k: base64.b64encode(open(f'{d}/{k}.ttf', 'rb').read()).decode() for k in ['c400', 'c600', 'c700', 'd400', 'arrow']}
open('js/pdf-fonts.js', 'w').write('// Embedded PDF fonts (base64 TTF, subset to Greek + Latin): Commissioner 400/600/700, GFS Didot 400, DejaVu Sans Bold (arrow only).\n// Regenerate with scripts/make_fonts.sh if needed.\nconst PDF_FONTS = ' + json.dumps(f) + ';\n')
print('js/pdf-fonts.js written')
PY

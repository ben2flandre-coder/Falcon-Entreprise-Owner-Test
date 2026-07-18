#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
evidence="$root/evidence"
mkdir -p "$evidence"

chrome="$(command -v google-chrome || command -v google-chrome-stable || true)"
if [[ -z "$chrome" ]]; then
  echo "Google Chrome is required on the runner." >&2
  exit 1
fi

python3 -m http.server 4173 --bind 127.0.0.1 --directory "$root/candidate" >"$evidence/http-server.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

for _ in {1..30}; do
  if curl --fail --silent http://127.0.0.1:4173/index.html >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:4173/test-context.json >"$evidence/served-test-context.json"

common=(
  --headless
  --no-sandbox
  --disable-gpu
  --hide-scrollbars
  --virtual-time-budget=8000
)

"$chrome" "${common[@]}" --window-size=1440,1000 \
  --dump-dom http://127.0.0.1:4173/index.html >"$evidence/desktop-dom.html"
"$chrome" "${common[@]}" --window-size=1440,1000 \
  --screenshot="$evidence/desktop.png" http://127.0.0.1:4173/index.html >/dev/null

"$chrome" "${common[@]}" --window-size=390,844 \
  --dump-dom http://127.0.0.1:4173/index.html >"$evidence/mobile-dom.html"
"$chrome" "${common[@]}" --window-size=390,844 \
  --screenshot="$evidence/mobile.png" http://127.0.0.1:4173/index.html >/dev/null

"$chrome" "${common[@]}" --window-size=1440,1000 \
  --dump-dom http://127.0.0.1:4173/probe.html >"$evidence/probe-dom.html"

grep -q 'data-falcon-enterprise-runtime="ready"' "$evidence/desktop-dom.html"
grep -q 'data-falcon-enterprise-runtime="ready"' "$evidence/mobile-dom.html"
grep -q 'data-falcon-probe-ready="true"' "$evidence/probe-dom.html"
grep -q 'data-falcon-mode="production"' "$evidence/probe-dom.html"
grep -q 'data-falcon-runtime-empty="true"' "$evidence/probe-dom.html"
grep -q 'Falcon Enterprise' "$evidence/desktop-dom.html"
grep -q 'Falcon Enterprise' "$evidence/mobile-dom.html"

printf '%s\n' 'owner-test-browser-smoke: PASS'

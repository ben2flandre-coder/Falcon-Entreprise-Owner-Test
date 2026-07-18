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
  --no-first-run
  --virtual-time-budget=12000
)

desktop_profile="$(mktemp -d)"
mobile_profile="$(mktemp -d)"

qualify_viewport() {
  local viewport="$1"
  local window_size="$2"
  local profile="$3"

  "$chrome" "${common[@]}" --user-data-dir="$profile" --window-size="$window_size" \
    --dump-dom "http://127.0.0.1:4173/probe.html?expected=trial" >"$evidence/${viewport}-preactivation-probe-dom.html"

  "$chrome" "${common[@]}" --user-data-dir="$profile" --window-size="$window_size" \
    --dump-dom "http://127.0.0.1:4173/activate.html?automation=1&expectBefore=trial" >"$evidence/${viewport}-activation-dom.html"

  "$chrome" "${common[@]}" --user-data-dir="$profile" --window-size="$window_size" \
    --dump-dom "http://127.0.0.1:4173/probe.html?expected=enterprise" >"$evidence/${viewport}-postactivation-probe-dom.html"

  "$chrome" "${common[@]}" --user-data-dir="$profile" --window-size="$window_size" \
    --dump-dom http://127.0.0.1:4173/index.html >"$evidence/${viewport}-dom.html"

  "$chrome" "${common[@]}" --user-data-dir="$profile" --window-size="$window_size" \
    --screenshot="$evidence/${viewport}.png" http://127.0.0.1:4173/index.html >/dev/null
}

qualify_viewport desktop 1440,1000 "$desktop_profile"
qualify_viewport mobile 390,844 "$mobile_profile"

node "$root/scripts/assert-browser-evidence.mjs"

printf '%s\n' 'owner-test-browser-smoke: PASS — clean trial, explicit Enterprise activation, persisted Enterprise reload, desktop/mobile render'

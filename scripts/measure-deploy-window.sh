#!/usr/bin/env bash
#
# Measure how long each public origin stops serving while a deploy runs (M33 WP0).
#
# Run it in a second terminal, start it BEFORE `scripts/deploy.sh`, and stop it with Ctrl-C
# after the deploy prints "Done". It probes the three public origins every INTERVAL seconds
# through the real path (DNS -> Cloudflare -> tunnel -> nginx -> app), so a local-only check
# cannot flatter the result, and prints the longest unbroken run of non-200 answers per
# origin when stopped.
#
#   KAYAK_DOMAIN=example.com ./scripts/measure-deploy-window.sh
#   KAYAK_DOMAIN=example.com INTERVAL=0.25 ./scripts/measure-deploy-window.sh
#
# The domain is not committed (nginx template: it is a portable template, not tied to one
# box), so it comes from the environment.
#
# What counts as "not serving": anything other than the 2xx/3xx a healthy origin returns —
# a 502/504, a connection error (reported as 000), and a maintenance-mode 503 alike. During
# a deploy WITH maintenance mode, the 503 windows are expected and are the honest page;
# the number to read then is how long they last, and whether any 000/502 appears outside them.

set -uo pipefail

readonly DOMAIN="${KAYAK_DOMAIN:-}"
readonly INTERVAL="${INTERVAL:-0.5}"
[ -n "$DOMAIN" ] || { echo "ERROR: KAYAK_DOMAIN is not set (e.g. KAYAK_DOMAIN=example.com)" >&2; exit 2; }

# name|url — paths chosen so each answers from its own app, not from nginx or a redirect.
readonly -a TARGETS=(
    "frontend|https://app.${DOMAIN}/login"
    "backend|https://api.${DOMAIN}/api/v1/health"
    "sse|https://live.${DOMAIN}/api/v1/health"
)

readonly LOG="$(mktemp)"

report() {
    echo
    echo "=== longest outage per origin (probe every ${INTERVAL}s; raw log: ${LOG}) ==="
    for target in "${TARGETS[@]}"; do
        name="${target%%|*}"
        awk -F'\t' -v name="$name" '
            $2 == name {
                if ($3 ~ /^[23]/) {
                    if (run_start != "") { if (last - run_start > longest) longest = last - run_start; run_start = "" }
                } else {
                    if (run_start == "") run_start = $1
                    last = $1; bad++
                    codes[$3]++
                }
                total++
            }
            END {
                if (run_start != "" && last - run_start > longest) longest = last - run_start
                printf "%-9s probes=%d  not-serving=%d  longest-outage=%.1fs  codes:", name, total, bad, longest
                for (c in codes) printf " %s×%d", c, codes[c]
                printf "\n"
            }' "$LOG"
    done
}
trap 'report; exit 0' INT TERM

echo "Probing ${#TARGETS[@]} origins every ${INTERVAL}s. Start the deploy now; Ctrl-C when it is done."
while true; do
    now="$(date +%s.%N)"
    for target in "${TARGETS[@]}"; do
        name="${target%%|*}"
        url="${target#*|}"
        # -m 3: a hung connection counts as not serving rather than stalling the loop.
        code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$url")"
        printf '%s\t%s\t%s\n' "$now" "$name" "$code" >>"$LOG"
    done
    sleep "$INTERVAL"
done

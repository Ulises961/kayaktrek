#!/usr/bin/env bash
#
# Reproduce the remote E2E CI run locally under the GitHub-hosted runner's real
# resource envelope using `act`, so contention-driven post-mutation flakiness
# surfaces without burning remote runs. See plans/e2e-hardening.md / ADR-030.
#
# Usage:
#   e2e/run-constrained-ci.sh                 # faithful: 2 CPU / 7g
#   CPUS=1 MEM=4g e2e/run-constrained-ci.sh   # amplified: starve it to fail fast
#
# Tune CPUS/MEM down to amplify the race, leave them alone for the faithful gate.
#
# The envelope is 2 vCPU / 7 GB, not 1 vCPU: this repo is PRIVATE, and GitHub's
# standard `ubuntu-latest` runner for private repos is 2-core / 7 GB / 14 GB SSD.
# (Public repos were raised to 4-core / 16 GB in 2024; private ones were not.)
# The earlier 1-CPU default was half the real runner, which starved the suite
# into broad 120s click/visibility timeouts that look like app bugs but are the
# harness throttling itself.
set -euo pipefail

CPUS="${CPUS:-2}"
MEM="${MEM:-7g}"

# Docker 29 hardened archive extraction to refuse traversing a symlinked path
# component. act copies actions into /var/run/act, and /var/run is a symlink to
# /run in every Debian/Ubuntu runner image, so every action copy now dies with
# "path escapes from parent" and the job runs ZERO tests. Only actions/checkout
# survives, because act special-cases it and never copies it there.
#
# Upgrading act does not help: the fix (nektos/act#6093, for issue #6092) was
# closed unmerged, and 0.2.89 fails identically. So patch the image instead —
# make /var/run a real directory. Rebuilt here rather than pinned to a registry
# so it tracks whatever catthehacker:act-latest currently is.
#
# Drop this block once act ships a fix and the plain image works again.
BASE_IMAGE="${BASE_IMAGE:-catthehacker/ubuntu:act-latest}"
IMAGE="${IMAGE:-act-runner-varrunfix:latest}"

if [ "$IMAGE" = "act-runner-varrunfix:latest" ]; then
  echo ">>> Building runner image with a non-symlinked /var/run (Docker 29 workaround)..."
  docker build -q -t "$IMAGE" - <<EOF >/dev/null
FROM ${BASE_IMAGE}
RUN rm /var/run && mkdir -p /var/run/act
EOF
fi

cd "$(dirname "$0")/.."
mkdir -p /tmp/act-artifacts

echo ">>> act e2e job under --cpus=${CPUS} --memory=${MEM} (image ${IMAGE})"
# --pull=false: the image above is local-only, and act force-pulls by default,
# which fails with "pull access denied" on a tag that exists nowhere but here.
exec act pull_request \
  -j e2e \
  -W .github/workflows/e2e-ci.yml \
  -P "ubuntu-latest=${IMAGE}" \
  --pull=false \
  --container-options "--cpus=${CPUS} --memory=${MEM}" \
  --artifact-server-path /tmp/act-artifacts

#!/usr/bin/env bash
#
# Reproduce the remote E2E CI run locally under the free-runner resource envelope
# (1 vCPU) using `act`, so contention-driven post-mutation flakiness surfaces
# without burning remote runs. See plans/e2e-hardening.md / ADR-030.
#
# Usage:
#   e2e/run-constrained-ci.sh                 # faithful: 1 CPU / 7g
#   CPUS=1 MEM=4g e2e/run-constrained-ci.sh   # amplified: starve memory too
#
# Tune CPUS/MEM down to amplify the race (fail fast), up toward the real runner
# (1 CPU / 7g) for the faithful gate.
set -euo pipefail

CPUS="${CPUS:-1}"
MEM="${MEM:-7g}"
IMAGE="${IMAGE:-catthehacker/ubuntu:act-latest}"

cd "$(dirname "$0")/.."
mkdir -p /tmp/act-artifacts

echo ">>> act e2e job under --cpus=${CPUS} --memory=${MEM} (image ${IMAGE})"
exec act pull_request \
  -j e2e \
  -W .github/workflows/e2e-ci.yml \
  -P "ubuntu-latest=${IMAGE}" \
  --container-options "--cpus=${CPUS} --memory=${MEM}" \
  --artifact-server-path /tmp/act-artifacts

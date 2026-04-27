#!/bin/bash
# PlanetScale CLI wrapper that authenticates via GCP Secret Manager.
# Usage: ./scripts/pscale.sh <pscale command args>
# Example: ./scripts/pscale.sh database list --org glass-box-solutions

set -euo pipefail

export PLANETSCALE_SERVICE_TOKEN_ID=$(gcloud secrets versions access latest --secret=planetscale-service-token-id --project=adjudica-internal 2>/dev/null)
export PLANETSCALE_SERVICE_TOKEN=$(gcloud secrets versions access latest --secret=planetscale-service-token --project=adjudica-internal 2>/dev/null)

if [ -z "$PLANETSCALE_SERVICE_TOKEN_ID" ] || [ -z "$PLANETSCALE_SERVICE_TOKEN" ]; then
  echo "ERROR: Could not retrieve PlanetScale credentials from GCP Secret Manager" >&2
  exit 1
fi

exec pscale "$@"

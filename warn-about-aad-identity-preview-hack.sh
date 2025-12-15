#!/usr/bin/env bash
# Lightweight placeholder to keep Jenkins happy; emits a warning and exits zero.

set -euo pipefail

SERVICE_NAME="${1:-xui}"
REPO_NAME="${2:-rpx-xui-e2e-tests}"
CHART_DIR="charts/${SERVICE_NAME}-${REPO_NAME}"

if [ -d "${CHART_DIR}" ]; then
  cd "${CHART_DIR}"
  echo "warn-about-aad-identity-preview-hack.sh: chart dir present (${CHART_DIR}); no AAD preview hack required."
else
  echo "warn-about-aad-identity-preview-hack.sh: chart dir missing (${CHART_DIR}); skipping."
fi

exit 0

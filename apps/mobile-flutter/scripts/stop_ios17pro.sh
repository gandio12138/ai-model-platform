#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DEVICE_NAME="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"
BUNDLE_ID="${IOS_APP_BUNDLE_ID:-com.otoken.app.dev}"

DEVICE_ID="$(
  xcrun simctl list devices \
    | sed -n "s/^[[:space:]]*${DEVICE_NAME} (\([0-9A-F-]*\)) .*/\1/p" \
    | head -n 1
)"

if [[ -z "${DEVICE_ID}" ]]; then
  echo "Cannot find simulator: ${DEVICE_NAME}" >&2
  echo "Run 'xcrun simctl list devices' to check installed simulators." >&2
  exit 1
fi

xcrun simctl terminate "${DEVICE_ID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl shutdown "${DEVICE_ID}" >/dev/null 2>&1 || true

echo "Stopped ${BUNDLE_ID} and shut down ${DEVICE_NAME} (${DEVICE_ID})."

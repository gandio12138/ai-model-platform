#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DEVICE_NAME="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:4000}"
USE_MOCKS="${USE_MOCKS:-true}"

DEVICE_ID="$(
  xcrun simctl list devices available \
    | sed -n "s/^[[:space:]]*${DEVICE_NAME} (\([0-9A-F-]*\)) .*/\1/p" \
    | head -n 1
)"

if [[ -z "${DEVICE_ID}" ]]; then
  echo "Cannot find available simulator: ${DEVICE_NAME}" >&2
  echo "Run 'xcrun simctl list devices available' to check installed simulators." >&2
  exit 1
fi

xcrun simctl list devices booted \
  | sed -n "s/^[[:space:]]*iPhone 17 (\([0-9A-F-]*\)) .*/\1/p" \
  | while read -r extra_device_id; do
      [[ -z "${extra_device_id}" ]] && continue
      xcrun simctl shutdown "${extra_device_id}" >/dev/null 2>&1 || true
    done

open -a Simulator
xcrun simctl boot "${DEVICE_ID}" >/dev/null 2>&1 || true
xcrun simctl bootstatus "${DEVICE_ID}" -b >/dev/null

NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
flutter run \
  -d "${DEVICE_ID}" \
  -t lib/main_dev.dart \
  --dart-define=API_BASE_URL="${API_BASE_URL}" \
  --dart-define=USE_MOCKS="${USE_MOCKS}" \
  "$@"

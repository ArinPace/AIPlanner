#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
command -v xcodebuild >/dev/null || { print -u2 'Install Xcode before running the iPhone app.'; exit 1; }
planner_simulator_id="${1:-$(xcrun simctl list devices available --json | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((x["udid"] for group in d["devices"].values() for x in group if x["name"].startswith("iPhone") and x.get("isAvailable")),""))')}"
if [[ -z "$planner_simulator_id" ]]; then
  print -u2 'No iPhone simulator is installed. In Xcode > Settings > Components, install an iOS runtime.'
  exit 1
fi
xcrun simctl boot "$planner_simulator_id" 2>/dev/null || true
xcrun simctl bootstatus "$planner_simulator_id" -b
xcodebuild -project ios/AIPlanner.xcodeproj -scheme AIPlanner -destination "platform=iOS Simulator,id=$planner_simulator_id" -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
xcrun simctl install "$planner_simulator_id" ios/build/Build/Products/Debug-iphonesimulator/AIPlanner.app
xcrun simctl launch "$planner_simulator_id" com.arinpace.aiplanner
open -a Simulator

#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
planner_screen_device="${1:?Pass the iOS 18.5 simulator UDID}"
planner_screen_tests=(
  -only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeEmptySelectionValidation
  -only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeRealSystemPicker
  -only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeSessionPersistenceAndEarlyStop
)
if [[ "${PLANNER_VERIFY_PICKER_DIAGNOSTICS:-0}" == 1 ]]; then
  planner_screen_tests+=(-only-testing:AIPlannerUITests/PlannerUITests/testStandaloneScreenTimePickerDiagnostics)
fi
if [[ "${PLANNER_VERIFY_BACKGROUND_EXPIRY:-0}" == 1 ]]; then
  export TEST_RUNNER_PLANNER_VERIFY_BACKGROUND_EXPIRY=1
  planner_screen_tests+=(-only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeBackgroundExpiry)
fi
if [[ "${PLANNER_VERIFY_CATEGORY_SHIELDS:-0}" == 1 ]]; then
  planner_screen_tests+=(-only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeSelectedCategoryEnforcement)
fi
if [[ "${PLANNER_VERIFY_OS_SHIELDS:-0}" == 1 ]]; then
  export TEST_RUNNER_PLANNER_VERIFY_OS_SHIELDS=1
  planner_screen_tests+=(-only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeHomeScreenEnforcement)
fi
xcodebuild -project ios/AIPlanner.xcodeproj -scheme AIPlanner \
  -destination "platform=iOS Simulator,id=$planner_screen_device" \
  -derivedDataPath ios/build "${planner_screen_tests[@]}" \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGN_IDENTITY=- \
  CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO DEVELOPMENT_TEAM= test

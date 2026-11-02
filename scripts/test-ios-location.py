#!/usr/bin/env python3
"""Test real region/GPS-driven shields on a dedicated iOS simulator, using sample NYC coordinates.

Usage: python3 scripts/test-ios-location.py SIMULATOR_UDID [--low-power]
Requires the frontend fixture server on 127.0.0.1:5174.
Grants simulator location permission; this does not test Apple's permission prompts.
"""
import argparse
import os
import pathlib
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('simulator_udid')
parser.add_argument('--low-power', action='store_true')
args = parser.parse_args()
os.chdir(pathlib.Path(__file__).resolve().parent.parent)
sid = args.simulator_udid
for command in [
    ['xcrun', 'simctl', 'privacy', sid, 'grant', 'location-always', 'com.arinpace.aiplanner'],
    ['xcrun', 'simctl', 'location', sid, 'set', '40.7295,-73.9965'],
]:
    subprocess.run(command, check=True)
env = os.environ.copy()
env['TEST_RUNNER_PLANNER_VERIFY_LOCATION_BLOCK'] = '1'
if args.low_power:
    env['TEST_RUNNER_PLANNER_VERIFY_LOW_POWER'] = '1'
command = [
    'xcodebuild', '-project', 'ios/AIPlanner.xcodeproj', '-scheme', 'AIPlanner',
    '-destination', 'platform=iOS Simulator,id=' + sid, '-derivedDataPath', 'ios/build',
    'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', 'CODE_SIGN_IDENTITY=-',
    'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGNING_REQUIRED=NO', 'DEVELOPMENT_TEAM=',
    '-only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeLocationBoundaryEnforcement',
    '-only-testing:AIPlannerUITests/PlannerUITests/testScreenTimeLocationPreferencePersistence', 'test',
]
process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env, bufsize=1)
log_path = pathlib.Path('/tmp/planner-location-integration.log')
print('Testing location boundaries; build and test output:', log_path, flush=True)
try:
    with log_path.open('w') as log:
        for line in process.stdout:
            log.write(line)
            log.flush()
            if line.strip() == 'LOCATION_TEST_MOVE_OUTSIDE':
                subprocess.run(['xcrun', 'simctl', 'location', sid, 'set', '40.7505,-73.9800'], check=True)
                print('Moved simulated phone outside the selected place.', flush=True)
            elif line.strip() == 'LOCATION_TEST_MOVE_INSIDE':
                subprocess.run(['xcrun', 'simctl', 'location', sid, 'set', '40.7295,-73.9965'], check=True)
                print('Moved simulated phone back inside the selected place.', flush=True)
    status = process.wait()
except BaseException:
    process.terminate()
    process.wait()
    raise
print('PASS' if status == 0 else 'FAIL — see ' + str(log_path), flush=True)
raise SystemExit(status)

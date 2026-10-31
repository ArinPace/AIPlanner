#!/bin/zsh
set -eu
export BH_RECORD=0 BH_TAB_MARKER=0
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
harness="$HOME/.local/bin/browser-harness"
[[ -x "$harness" ]] || exit 0
if "$harness" doctor --json --require-existing-daemon >/dev/null 2>&1; then exit 0; fi
# One attempt per login; no reconnect or approval-prompt loop.
pgrep -x "Google Chrome" >/dev/null || exit 0
printf '%s\n' "print('AI Planner Chrome debugging connected')" | "$harness"

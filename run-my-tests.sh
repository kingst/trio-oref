#!/usr/bin/env bash
# Runs the tests/*.test.js files added or modified on this branch relative
# to `dev`, excluding any with "replay" in the filename.
#
# Extra args are forwarded to mocha, e.g.:
#   ./run-my-tests.sh --grep 'splitTimespan'
#   ./run-my-tests.sh --reporter min

set -euo pipefail

cd "$(dirname "$0")"

TESTS=(
    tests/autosens-debug.test.js
    tests/autosens.test.js
    tests/cob-bucket.test.js
    tests/cob.test.js
    tests/determine-basal-aggressive-dosing.test.js
    tests/determine-basal-delta.test.js
    tests/determine-basal-early-exit.test.js
    tests/determine-basal-eventual-or-forecast-glucose-less-than-max.test.js
    tests/determine-basal-glucose-falling-faster-than-expected.test.js
    tests/determine-basal-high-temp.test.js
    tests/determine-basal-iob-greater-than-max.test.js
    tests/determine-basal-low-eventual-glucose.test.js
    tests/determine-basal-smb-delivery.test.js
    tests/dynamic-isf.test.js
    tests/iob-calc.test.js
    tests/iob-consecutive-events.test.js
    tests/iob-history.test.js
    tests/iob-suspend-split.test.js
    tests/iob-suspend.test.js
    tests/iob-total.test.js
    tests/iob.test.js
    tests/meal.test.js
    tests/profile-basal.test.js
    tests/profile-carbs.test.js
    tests/profile-isf.test.js
    tests/profile-targets.test.js
)

echo "Running ${#TESTS[@]} test files:"
printf '  %s\n' "${TESTS[@]}"
echo

exec ./node_modules/.bin/mocha "${TESTS[@]}" "$@"

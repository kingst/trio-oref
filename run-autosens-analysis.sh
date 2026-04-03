#!/bin/bash
#
# Runs the autosens replay test across all input files for each bug fix branch.
# Outputs a CSV with: input_file, branch, ratio
#
# Usage:
#   ./run-autosens-analysis.sh <input_dir>
#
# <input_dir> should contain converted autosens JSON files (with _timezone field).

set -e

INPUT_DIR="${1:-}"
OUTPUT_FILE="autosens-analysis-results.csv"
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
MOCHA="./node_modules/.bin/mocha"
TEST_FILE="tests/autosens-replay.test.js"

BRANCHES=(
    "iob-baseline"
    "iob-fix-1-splitTimespan-flag"
    "iob-fix-2-missing-timestamp-resume"
    "iob-fix-3-double-count-suspends"
    "iob-fix-4-filter-future-events"
    "iob-fix-5-zero-temp-outside-loop"
    "iob-fix-6-8h-dia-to-36h"
    "iob-fix-7-basal-rate-lookup"
    "iob-fix-8-float-precision"
)

BRANCH_LABELS=(
    "baseline"
    "fix1-splitTimespan-flag"
    "fix2-missing-timestamp-resume"
    "fix3-double-count-suspends"
    "fix4-filter-future-events"
    "fix5-zero-temp-outside-loop"
    "fix6-8h-dia-to-36h"
    "fix7-basal-rate-lookup"
    "fix8-float-precision"
)

# Build list of input files
if [ -n "$INPUT_DIR" ]; then
    INPUT_FILES=("$INPUT_DIR"/*.json)
else
    echo "Usage: $0 <input_dir>"
    exit 1
fi

echo "input,branch,ratio" > "$OUTPUT_FILE"

TOTAL_INPUTS=${#INPUT_FILES[@]}
TOTAL_BRANCHES=${#BRANCHES[@]}
echo "Running $TOTAL_INPUTS inputs x $TOTAL_BRANCHES branches = $(( TOTAL_INPUTS * TOTAL_BRANCHES )) test runs"

for input_file in "${INPUT_FILES[@]}"; do
    input_name=$(basename "$input_file" .json)
    echo ""
    echo "=== Input: $input_name ==="

    # Extract timezone from converted input (falls back to UTC)
    input_tz=$(python3 -c "import json; d=json.load(open('$input_file')); print(d.get('_timezone','UTC'))")

    for i in "${!BRANCHES[@]}"; do
        branch="${BRANCHES[$i]}"
        label="${BRANCH_LABELS[$i]}"

        # Swap in the IOB files from this branch (autosens calls into IOB internally)
        git checkout "$branch" -- lib/iob/history.js lib/iob/index.js 2>/dev/null

        # Run the test and extract the lowestRatio ratio value
        ratio=$(TZ="$input_tz" AUTOSENS_INPUT="$input_file" "$MOCHA" --reporter min "$TEST_FILE" 2>&1 \
            | grep 'lowestRatio = ' \
            | sed 's/.*"ratio":\([0-9.]*\).*/\1/')

        echo "  $label: $ratio"
        echo "$input_name,$label,$ratio" >> "$OUTPUT_FILE"
    done
done

# Restore original branch files
git checkout "$ORIGINAL_BRANCH" -- lib/iob/history.js lib/iob/index.js 2>/dev/null

echo ""
echo "Results written to $OUTPUT_FILE"

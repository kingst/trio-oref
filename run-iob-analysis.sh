#!/bin/bash
#
# Runs the IOB replay test across all input files for each bug fix branch.
# Outputs a CSV with: input_file, branch, iob
#
# Usage:
#   ./run-iob-analysis.sh <input_dir>
#
# <input_dir> should contain JSON files in the same format as tests/js_iob_input_error.json
# If no input_dir is given, defaults to running just the single existing test input.

set -e

INPUT_DIR="${1:-}"
OUTPUT_FILE="iob-analysis-results.csv"
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
MOCHA="./node_modules/.bin/mocha"
TEST_FILE="tests/iob-replay.test.js"

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
    INPUT_FILES=("tests/js_iob_input_error.json")
fi

echo "input,branch,iob" > "$OUTPUT_FILE"

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

        # Swap in the IOB files from this branch
        git checkout "$branch" -- lib/iob/history.js lib/iob/index.js 2>/dev/null

        # Run the test and extract IOB from first result object
        iob=$(TZ="$input_tz" IOB_INPUT="$input_file" "$MOCHA" --reporter min "$TEST_FILE" 2>&1 \
            | grep -m1 "iob:" \
            | awk '{print $2}' \
            | tr -d ',')

        echo "  $label: $iob"
        echo "$input_name,$label,$iob" >> "$OUTPUT_FILE"
    done
done

# Restore original branch files
git checkout "$ORIGINAL_BRANCH" -- lib/iob/history.js lib/iob/index.js 2>/dev/null

echo ""
echo "Results written to $OUTPUT_FILE"

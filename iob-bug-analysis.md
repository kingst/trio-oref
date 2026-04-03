# IOB Bug Fix Analysis

## Goal

Trio ported the oref IOB calculation from JavaScript to Swift. During the port, we identified several bugs in the original JS code (tracked in nightscout/Trio-dev#357). Some bugs were ported to Swift intentionally; others were fixed only in a testing copy of the JS. We need to understand which JS bug fixes account for the IOB differences between Swift and JS across real-world inputs, so we can confirm the Swift implementation is correct.

## Approach

We have 8 bug fixes in `lib/iob/history.js` on the `dev-fixes-for-swift-comparison` branch. To isolate the impact of each fix, we created a set of git branches — one baseline (dev code, no fixes) and one per fix (baseline + that single fix). A test runner swaps in the IOB files from each branch, runs the IOB calculation, and records the result.

### Bug fixes under test

| # | Branch | Description |
|---|--------|-------------|
| 1 | `iob-fix-1-splitTimespan-flag` | `splitTimespan` shared flag drops events after a successful split |
| 2 | `iob-fix-2-missing-timestamp-resume` | Missing `timestamp` when splitting a temp basal around a resume event |
| 3 | `iob-fix-3-double-count-suspends` | Double-counting consecutive pump suspends |
| 4 | `iob-fix-4-filter-future-events` | Future suspend/resume events included in IOB calculation |
| 5 | `iob-fix-5-zero-temp-outside-loop` | Zero temp cancel event only added when pumpHistory is non-empty |
| 6 | `iob-fix-6-8h-dia-to-36h` | Hard-coded 8h DIA lookback changed to 36h for full pump history |
| 7 | `iob-fix-7-basal-rate-lookup` | Suspend-to-temp-basal conversion uses wrong timestamp for basal rate lookup |
| 8 | `iob-fix-8-float-precision` | Floating-point imprecision in netBasalAmount / tempBolusCount |

## How to run

### 1. Convert semantic inputs

The inputs from Trio are in a wrapper format. Convert them to the JS-compatible format:

```bash
./convert-inputs.py <input_dir> <output_dir>
```

This auto-detects the input type (`iobInput`, `autosensInput`, or `mealInput`), extracts the inner object, and preserves the timezone as `_timezone` in the output JSON.

### 2. Run the analysis

```bash
./run-iob-analysis.sh <converted_input_dir>
```

This runs each converted input against the baseline and all 8 fix branches, setting the `TZ` environment variable from each input's timezone. Results are written to `iob-analysis-results.csv` with columns: `input, branch, iob`.

### 3. Analyze results

The CSV can be analyzed with any tool. The runner also prints a summary to stdout as it goes.


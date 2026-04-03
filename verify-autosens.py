#!/usr/bin/env python3

import json
import os
import re
import subprocess
import sys


def load_expected_results(json_path):
    with open(json_path) as f:
        data = json.load(f)

    expected = {}
    for entry in data["entries"]:
        filename = os.path.basename(entry["filePath"])
        # Extract the expected JS ratio from the fields list
        for field in entry["fields"]:
            if field["field"] == "ratio":
                expected[filename] = field["js"]
                break
    return expected


def extract_ratio(output):
    # The test prints: lowestRatio = {"ratio":1.04,"newisf":45}
    match = re.search(r'lowestRatio\s*=\s*\{["\']ratio["\']:\s*(-?[\d.]+)', output)
    if match:
        return float(match.group(1))
    return None


def run_test(input_path, timezone):
    env = os.environ.copy()
    env["AUTOSENS_INPUT"] = input_path
    env["TZ"] = timezone
    result = subprocess.run(
        ["./node_modules/.bin/mocha", "-c", "tests/autosens-replay.test.js"],
        capture_output=True,
        text=True,
        env=env,
    )
    return result.stdout + result.stderr


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input_dir> <expected_results.json>")
        sys.exit(1)

    input_dir = sys.argv[1]
    expected_path = sys.argv[2]

    expected = load_expected_results(expected_path)
    input_files = sorted(f for f in os.listdir(input_dir) if f.endswith(".json"))

    passed = 0
    failed = 0
    skipped = 0
    errors = 0

    for filename in input_files:
        input_path = os.path.join(input_dir, filename)

        with open(input_path) as f:
            data = json.load(f)
        timezone = data.get("_timezone", "UTC")

        if filename not in expected:
            print(f"SKIP {filename} (no expected result)")
            skipped += 1
            continue

        expected_ratio = expected[filename]
        output = run_test(input_path, timezone)
        actual_ratio = extract_ratio(output)

        if actual_ratio is None:
            print(f"ERROR {filename} (could not parse ratio from output)")
            errors += 1
            continue

        if abs(actual_ratio - expected_ratio) < 0.0005:
            print(f"PASS {filename} (ratio={actual_ratio})")
            passed += 1
        else:
            print(f"FAIL {filename} (expected={expected_ratio}, actual={actual_ratio})")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed, {skipped} skipped, {errors} errors out of {len(input_files)} files")
    if failed > 0 or errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

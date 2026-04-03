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
    for entry in data["iob"]["entries"]:
        # filePath looks like "/files/uuid.N.json", extract just the filename
        filename = os.path.basename(entry["filePath"])
        expected[filename] = entry["jsIob"]
    return expected


def extract_first_iob(output):
    # The test prints a JS array via console.log. Find the first iob value.
    match = re.search(r'\{\s*iob:\s*(-?[\d.]+)', output)
    if match:
        return float(match.group(1))
    return None


def run_test(input_path, timezone):
    env = os.environ.copy()
    env["IOB_INPUT"] = input_path
    env["TZ"] = timezone
    result = subprocess.run(
        ["./node_modules/.bin/mocha", "-c", "tests/iob-replay.test.js"],
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

        expected_iob = expected[filename]
        output = run_test(input_path, timezone)
        actual_iob = extract_first_iob(output)

        if actual_iob is None:
            print(f"ERROR {filename} (could not parse iob from output)")
            errors += 1
            continue

        if abs(actual_iob - expected_iob) < 0.0005:
            print(f"PASS {filename} (iob={actual_iob})")
            passed += 1
        else:
            print(f"FAIL {filename} (expected={expected_iob}, actual={actual_iob})")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed, {skipped} skipped, {errors} errors out of {len(input_files)} files")
    if failed > 0 or errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

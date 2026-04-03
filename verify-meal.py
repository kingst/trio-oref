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
        fields = {}
        for field in entry["fields"]:
            fields[field["field"]] = field["js"]
        expected[filename] = fields
    return expected


def extract_result(output):
    # The test prints the meal result as JSON via console.log
    match = re.search(r'\{["\']carbs["\']:\s*\d.*\}', output)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def run_test(input_path, timezone):
    env = os.environ.copy()
    env["MEAL_INPUT"] = input_path
    env["TZ"] = timezone
    result = subprocess.run(
        ["./node_modules/.bin/mocha", "-c", "tests/meal-replay.test.js"],
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

        expected_fields = expected[filename]
        output = run_test(input_path, timezone)
        result = extract_result(output)

        if result is None:
            print(f"ERROR {filename} (could not parse meal result from output)")
            errors += 1
            continue

        all_match = True
        mismatches = []
        for field, expected_val in expected_fields.items():
            actual_val = result.get(field)
            if actual_val is None:
                mismatches.append(f"{field}: missing")
                all_match = False
            elif abs(actual_val - expected_val) >= 0.5:
                mismatches.append(f"{field}: expected={expected_val}, actual={actual_val}")
                all_match = False

        if all_match:
            print(f"PASS {filename} ({', '.join(f'{f}={result.get(f)}' for f in expected_fields)})")
            passed += 1
        else:
            print(f"FAIL {filename} ({'; '.join(mismatches)})")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed, {skipped} skipped, {errors} errors out of {len(input_files)} files")
    if failed > 0 or errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

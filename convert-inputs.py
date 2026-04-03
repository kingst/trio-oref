#!/usr/bin/env python3
"""
Converts semantic input files (iob, autosens, meal) to the format expected by the JS replay tests.

Usage:
    ./convert-inputs.py <input_dir> <output_dir>

Auto-detects the input type by looking for an '<type>Input' key in each wrapper
(e.g. iobInput, autosensInput, mealInput). Extracts that object and preserves
the timezone as _timezone.
"""

import json
import os
import sys

INPUT_KEYS = ['iobInput', 'autosensInput', 'mealInput']


def find_input_key(data):
    """Find the first matching *Input key in the wrapper."""
    for key in INPUT_KEYS:
        if key in data:
            return key
    return None


def convert_file(input_path, output_path):
    with open(input_path) as f:
        data = json.load(f)

    input_key = find_input_key(data)
    if input_key is None:
        raise ValueError(f'No recognized input key ({", ".join(INPUT_KEYS)}) found')

    inp = data[input_key]

    # Preserve timezone from the wrapper for use by the test runner
    if 'timezone' in data:
        inp['_timezone'] = data['timezone']

    with open(output_path, 'w') as f:
        json.dump(inp, f, indent=2)

    return input_key


def main():
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} <input_dir> <output_dir>')
        sys.exit(1)

    input_dir = sys.argv[1]
    output_dir = sys.argv[2]

    os.makedirs(output_dir, exist_ok=True)

    files = sorted(f for f in os.listdir(input_dir) if f.endswith('.json'))
    print(f'Converting {len(files)} files from {input_dir} to {output_dir}')

    counts = {}
    for filename in files:
        input_path = os.path.join(input_dir, filename)
        output_path = os.path.join(output_dir, filename)
        try:
            key = convert_file(input_path, output_path)
            counts[key] = counts.get(key, 0) + 1
        except Exception as e:
            print(f'  ERROR {filename}: {e}')
            continue

    for key, count in sorted(counts.items()):
        print(f'  {key}: {count} files')
    print('Done.')


if __name__ == '__main__':
    main()

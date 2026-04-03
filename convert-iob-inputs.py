#!/usr/bin/env python3
"""
Converts semantic IOB input files to the format expected by the JS IOB replay test.

Usage:
    ./convert-iob-inputs.py <input_dir> <output_dir>

Conversions:
    - Extracts the iobInput object from the wrapper
"""

import json
import os
import sys
from datetime import datetime, timezone


def convert_file(input_path, output_path):
    with open(input_path) as f:
        data = json.load(f)

    inp = data['iobInput']

    # Preserve timezone from the wrapper for use by the test runner
    if 'timezone' in data:
        inp['_timezone'] = data['timezone']

    with open(output_path, 'w') as f:
        json.dump(inp, f, indent=2)


def main():
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} <input_dir> <output_dir>')
        sys.exit(1)

    input_dir = sys.argv[1]
    output_dir = sys.argv[2]

    os.makedirs(output_dir, exist_ok=True)

    files = sorted(f for f in os.listdir(input_dir) if f.endswith('.json'))
    print(f'Converting {len(files)} files from {input_dir} to {output_dir}')

    for filename in files:
        input_path = os.path.join(input_dir, filename)
        output_path = os.path.join(output_dir, filename)
        try:
            convert_file(input_path, output_path)
        except Exception as e:
            print(f'  ERROR {filename}: {e}')
            continue

    print('Done.')


if __name__ == '__main__':
    main()

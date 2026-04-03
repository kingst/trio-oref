# Verify IoB Results

This python script is designed to serve as a sanity check on our IoB
replay system. It is meant to run on the `dev-replay-support` branch,
which has only support to replay JS and NOT any of the bug fixes.

To use it:

python3 verify-iob.py converted_inputs/ semantic_differences.json

To check the results, the script takes two arguments: a directory that
contains a set of inputs and a JSON file that contains the expected
results. The inputs are ready to be consumed by the
`iob-replay.test.js` test, but include one extra field: a
`_timezone`. The script should set the timezone by setting the `TZ`
environement variable for the `iob-replay.test.js` invocation.

The semantic differences JSON file contains an object, where the
`iob.entries` property contains an array of objects. Of these objects,
the `filePath` property has a file where the file name should match
the name of the input file name and the `jsIob` property has the `iob`
result from the first entry returned by the IoB JS function.

To run the unit test, on the command line, you use something like
this:

IOB_INPUT=converted_inputs/ff522742-ad66-4bc9-a52c-91748750ae96.4.json TZ=America/Los_Angeles ./node_modules/.bin/mocha -c tests/iob-replay.test.js

And the script should parse the output of this unit test, which
includes the full IoB result and compare it to what it found in the
expected results JSON file for this input.
'use strict';

require('should');

var moment = require('moment');
var iob = require('../lib/iob');

describe('IOB replay', function() {
    it('should calculate IOB using a real pump history', function() {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, 'js_iob_input_error.json');
        const jsonString = fs.readFileSync(filePath, 'utf8');
        const iobInputs = JSON.parse(jsonString);

        var now = new Date(iobInputs.clock),
            timestamp = new Date(now).toISOString(),
            inputs = {
                clock: timestamp,
                history: iobInputs.history,
                profile: iobInputs.profile

            };

        var iobResult = iob(inputs);
	console.log(iobResult);
    });
});

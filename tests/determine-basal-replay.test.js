'use strict';

require('should');

var determine_basal = require('../lib/determine-basal/determine-basal');
var tempBasalFunctions = require('../lib/basal-set-temp');
var glucoseGetLast = require('../lib/glucose-get-last');

describe('Determine basal replay', function() {
    it('should calculate determine basal using a real inputs', function() {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, 'determine_basal_error_inputs.json');
        const jsonString = fs.readFileSync(filePath, 'utf8');
        const input = JSON.parse(jsonString);

        var glucoseStatus = glucoseGetLast(input.glucose);

        var result = determine_basal(glucoseStatus, input.currentTemp, input.iob,
            input.profile, input.autosens, input.meal, tempBasalFunctions,
            input.microBolusAllowed, input.reservoir, input.clock, input.pumpHistory,
            input.preferences, input.basalProfile, input.trioCustomOrefVariables, "Nothing changed")
        console.log(result);
    });
});

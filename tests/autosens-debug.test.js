'use strict';

require('should');

var moment = require('moment');
const calcTempTreatments = require('../lib/iob/history').calcTempTreatments;
var get_iob = require('../lib/iob');

const { getActiveResourcesInfo } = require('process');

describe('autosens', function() {

    function readjson(file) {
        const fs = require('fs');
	const path = require('path');
        const filePath = path.join(__dirname, "autosens_logs/" + file);
        const jsonString = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(jsonString);
    }

    it("Should replay autosens iob error", function() {
        const iobInputs = readjson("as_error_iob_inputs.json");
        const history = iobInputs.history;
        const profile = iobInputs.profile;
        const clock = iobInputs.clock;

        var inputs = {
            history: history,
            profile: profile,
    	    clock: clock
        };
	
        const treatments = calcTempTreatments(inputs);

        const path = require('path');
        const fs = require('fs');
        const outFilePath = path.join(__dirname, 'js_treatments.json');
        fs.writeFileSync(outFilePath, JSON.stringify(treatments, null, 2), 'utf8');

    	inputs.profile.currentBasal = 0.55;
	    inputs.profile.temptargetSet = false;
    	inputs.clock = new Date("2025-06-27T13:56:54.596Z");
	
    	const iob = get_iob(inputs, true, treatments)[0];
    	console.log(iob);

    });
});

'use strict';

require('should');

var find_insulin = require('../lib/iob/history').calcTempTreatments;
var iobTotal = require('../lib/iob/total');
var calculate = require('../lib/iob/calculate');
var basal = require('../lib/profile/basal');

describe('Autosens IOB replay', function() {

    function readjson(file) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, file);
        const jsonString = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(jsonString);
    }

    it('Should calculate IoB at specific time', function() {
        // Hard-code the time to investigate (matches Swift test)
        const targetClock = new Date("2025-09-20T11:10:57.259Z");

        const autosensInputs = readjson("autosens_error_inputs.json");
        const history = autosensInputs.history;
        const basalprofile = autosensInputs.basalProfile;
        const profile = autosensInputs.profile;
        const clock = autosensInputs.clock;

        // Set up iob_inputs the same way autosens does
        var iob_inputs = {
            history: history,
            profile: profile,
            clock: clock
        };

        // Calculate treatments (same as autosens)
        var treatments = find_insulin(iob_inputs);

        // Set up currentBasal for the target time (same as autosens)
        profile.current_basal = basal.basalLookup(basalprofile, targetClock);

        // Set up opts for iobTotal
        var opts = {
            treatments: treatments,
            profile: profile,
            calculate: calculate
        };

        // Calculate IoB at the target time
        var iob = iobTotal(opts, targetClock);

        console.log("JS IoB at " + targetClock.toISOString() + ":");
        console.log("  iob: " + iob.iob);
        console.log("  activity: " + iob.activity);
        console.log("  basaliob: " + iob.basaliob);
        console.log("  bolusiob: " + iob.bolusiob);
        console.log("  netbasalinsulin: " + iob.netbasalinsulin);
        console.log("  bolusinsulin: " + iob.bolusinsulin);
        //console.log("");
        //console.log("Full IoB result: " + JSON.stringify(iob));
    });
});

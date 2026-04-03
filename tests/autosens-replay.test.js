'use strict';

require('should');

var moment = require('moment');
var autosens = require('../lib/determine-basal/autosens');
const { getActiveResourcesInfo } = require('process');

describe('autosens', function() {

    it("Should replay autosens inconsistency", function() {
        const fs = require('fs');
        const path = require('path');
        const filePath = process.env.AUTOSENS_INPUT || path.join(__dirname, 'autosens_logs/autosens_inputs.json');
        const jsonString = fs.readFileSync(filePath, 'utf8');
        const autosensInputs = JSON.parse(jsonString);
        const history = autosensInputs.history;
        const basal = autosensInputs.basalProfile;
        const profile = autosensInputs.profile;
        const tempTargets = autosensInputs.tempTargets;
        const glucose = autosensInputs.glucose;
        const carbs = autosensInputs.carbs;
        const clock = autosensInputs.clock;

        var iob_inputs = {
            history: history,
            profile: profile
        };

        var detection_inputs = {
            iob_inputs: iob_inputs,
            carbs: carbs,
            glucose_data: glucose,
            basalprofile: basal,
            temptargets: tempTargets
        };
        detection_inputs.deviations = 96;
        var ratio8h = autosens(detection_inputs, new Date(clock));
        detection_inputs.deviations = 288;
        var ratio24h = autosens(detection_inputs, new Date(clock));
        var lowestRatio = ratio8h.ratio < ratio24h.ratio ? ratio8h : ratio24h;
        console.log("ratio8h     = " + JSON.stringify(ratio8h));
        console.log("ratio24h    = " + JSON.stringify(ratio24h));
        console.log("lowestRatio = " + JSON.stringify(lowestRatio));

    });
});

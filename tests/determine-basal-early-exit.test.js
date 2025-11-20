'use strict';

var should = require('should');

describe('determine-basal-early-exit', function() {
    const determine_basal = require('../lib/determine-basal/determine-basal');
    const tempBasalFunctions = require('../lib/basal-set-temp');
    const glucoseGetLast = require('../lib/glucose-get-last');

    // Helper function to create a default set of inputs
    function getDefaultInputs() {
        return {
            glucose_status: {"delta":0,"glucose":115,"long_avgdelta":0.1,"short_avgdelta":0},
            currenttemp: {"duration":0,"rate":0,"temp":"absolute"},
            iob_data: {"iob":0,"activity":0,"bolussnooze":0, lastTemp: {}},
            profile: {"max_iob":2.5,"dia":3,"type":"current","current_basal":0.9,"max_daily_basal":1.3,"max_basal":3.5,"max_bg":120,"min_bg":110,"sens":40,"carb_ratio":10, "threshold_setting": 80, "temptargetSet": false, "offline_hotspot": false, "bolus_increment": 0.1, "useCustomPeakTime": false, "curve": "rapid-acting"},
            autosens_data: {"ratio":1.0},
            meal_data: {"carbs":0,"nsCarbs":0,"bwCarbs":0,"journalCarbs":0,"mealCOB":0,"currentDeviation":0,"maxDeviation":0,"minDeviation":0,"slopeFromMaxDeviation":0,"slopeFromMinDeviation":0,"allDeviations":[0,0,0,0,0],"bwFound":false},
            microBolusAllowed: false,
            reservoir_data: 100,
            currentTime: new Date(),
            pumphistory: [],
            preferences: { "useNewFormula": false, "sigmoid": false, "adjustmentFactor": 0.8, "adjustmentFactorSigmoid": 0.5, "curve": "rapid-acting", "useCustomPeakTime": false },
            basalprofile: [],
            trio_custom_variables: { "overrideTarget": 0, "useOverride": false, "smbIsOff": false, "advancedSettings": false, "isfAndCr": false, "isf": false, "cr_": false, "smbMinutes": 30, "uamMinutes": 30, "currentTDD": 0, "average_total_data": 0, "weightedAverage": 0, "smbIsScheduledOff": false, "start": 0, "end": 0, "shouldProtectDueToHIGH": false },
            middleWare: "Nothing changed"
        };
    }

    it('should return an error if profile.current_basal is undefined', function() {
        const inputs = getDefaultInputs();
        delete inputs.profile.current_basal;
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('error', 'Error: could not get current basal rate');
    });

    it('should cancel high temp if BG is 38', function() {
        const inputs = getDefaultInputs();
        inputs.glucose_status.glucose = 38;
        inputs.currenttemp = {"duration":30,"rate":1.5,"temp":"absolute"};
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('duration', 30);
        result.should.have.property('rate', 0.9);
        result.reason.should.containEql('Replacing high temp basal');
    });

    it('should shorten long zero temp if BG data is too old', function() {
        const inputs = getDefaultInputs();
        inputs.glucose_status.date = new Date(inputs.currentTime.getTime() - 15 * 60 * 1000); // 15 minutes old
        inputs.currenttemp = {"duration":60,"rate":0,"temp":"absolute"};
        const result = determine_basal(glucoseGetLast([inputs.glucose_status]), inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('duration', 30);
        result.should.have.property('rate', 0);
        result.reason.should.containEql('Shortening');
    });

    it('should do nothing if BG is too old and temp is not a high temp', function() {
        const inputs = getDefaultInputs();
        inputs.glucose_status.date = new Date(inputs.currentTime.getTime() - 15 * 60 * 1000); // 15 minutes old
        inputs.currenttemp = {"duration":30,"rate":0.5,"temp":"absolute"};
        const result = determine_basal(glucoseGetLast([inputs.glucose_status]), inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.reason.should.containEql('doing nothing');
    });

    it('should return an error if target_bg cannot be determined', function() {
        const inputs = getDefaultInputs();
        delete inputs.profile.min_bg;
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('error', 'Error: could not determine target_bg. ');
    });

    it('should cancel temp if currenttemp and lastTemp from pumphistory do not match', function() {
        const inputs = getDefaultInputs();
        inputs.microBolusAllowed = true;
        inputs.currenttemp = {"duration":30,"rate":1.5,"temp":"absolute"};
        inputs.iob_data.lastTemp = {"duration":30,"rate":1.0,"temp":"absolute", "date": new Date(inputs.currentTime.getTime() - 15 * 60 * 1000).getTime()};
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('duration', 0);
        result.should.have.property('rate', 0);
        result.reason.should.containEql('from pumphistory; canceling temp');
    });

    it('should cancel temp if lastTemp from pumphistory ended long ago', function() {
        const inputs = getDefaultInputs();
        inputs.currenttemp = {"duration":30,"rate":1.5,"temp":"absolute"};
        inputs.iob_data.lastTemp = {"duration":30,"rate":1.5,"temp":"absolute", "date": new Date(inputs.currentTime.getTime() - 40 * 60 * 1000).getTime()};
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('duration', 0);
        result.should.have.property('rate', 0);
        result.reason.should.containEql('m ago; canceling temp');
    });

    it('should return an error if eventualBG cannot be calculated', function() {
        const inputs = getDefaultInputs();
        inputs.profile.sens = NaN;
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('error');
        result.error.should.containEql('could not calculate eventualBG');
    });

    it('should low-temp if BG is below threshold', function() {
        const inputs = getDefaultInputs();
        inputs.glucose_status.glucose = 70;
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('rate', 0);
        result.duration.should.be.aboveOrEqual(30);
        result.reason.should.containEql('minGuardBG');
    });

    it('should cancel temp before the hour if not doing SMB', function() {
        const inputs = getDefaultInputs();
        inputs.profile.skip_neutral_temps = true;
        inputs.currentTime = new Date('2024-01-01T12:56:00Z');
        const result = determine_basal(inputs.glucose_status, inputs.currenttemp, inputs.iob_data, inputs.profile, inputs.autosens_data, inputs.meal_data, tempBasalFunctions, inputs.microBolusAllowed, inputs.reservoir_data, inputs.currentTime, inputs.pumphistory, inputs.preferences, inputs.basalprofile, inputs.trio_custom_variables, inputs.middleWare);
        result.should.have.property('duration', 0);
        result.should.have.property('rate', 0);
        result.reason.should.containEql('Canceling temp');
    });
});

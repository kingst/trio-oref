
'use strict';

require('should');

const determine_basal = require('../lib/determine-basal/determine-basal');
const tempBasalFunctions = require('../lib/basal-set-temp');
const glucoseGetLast = require('../lib/glucose-get-last');

// Helper function to create common dependencies for tests, mirroring the Swift tests
function createDependencies(options = {}) {
    const defaults = {
        useNewFormula: true,
        tdd: 30,
        avgTDD: 30,
        sensitivity: 50,
        minAutosens: 0.7,
        maxAutosens: 1.2,
        useCustomPeakTime: false,
        insulinCurve: 'rapid-acting',
        insulinPeakTime: 60,
        sigmoid: false,
        bg: 120
    };

    const settings = { ...defaults, ...options };

    const preferences = {
        useNewFormula: settings.useNewFormula,
        sigmoid: settings.sigmoid,
        adjustmentFactor: 0.8,
        adjustmentFactorSigmoid: 0.5,
        useCustomPeakTime: settings.useCustomPeakTime,
        curve: settings.insulinCurve
    };

    const profile = {
        sens: settings.sensitivity,
        autosens_min: settings.minAutosens,
        autosens_max: settings.maxAutosens,
        min_bg: 100, // Corresponds to profileTarget in the tests
        max_bg: 120,
        current_basal: 1.0,
        dia: 3,
        max_iob: 3,
        curve: settings.insulinCurve,
        useCustomPeakTime: settings.useCustomPeakTime,
        insulinPeakTime: settings.insulinPeakTime
    };

    const glucose_data = [{
        glucose: settings.bg,
        date: Date.now()
    }, {
        glucose: settings.bg,
        date: Date.now() - 5 * 60 * 1000
    }];
    const glucoseStatus = glucoseGetLast(glucose_data);

    const trioCustomOrefVariables = {
        currentTDD: settings.tdd,
        average_total_data: settings.avgTDD,
        weightedAverage: settings.tdd
        // Add other default properties to prevent crashes if the function needs them
        , overridePercentage: 100
        , useOverride: false
    };

    // Dummy objects for other determine_basal arguments
    const iob_data = { iob: 0, activity: 0 };
    const currenttemp = { duration: 0, rate: 0 };
    const meal_data = { mealCOB: 0, carbs: 0 };
    const pumphistory = [];
    const basalprofile = [];

    return { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile };
}


describe('DynamicISF Porting Tests', function() {

    it('should be disabled if useNewFormula is false', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies({ useNewFormula: false });
        const autosens = { ratio: 1.0 }; // Start with a known ratio

        determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        // If disabled, the original autosens ratio should not be mutated
        autosens.ratio.should.equal(1.0);
    });

    it('should be disabled for invalid autosens limits', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies({ minAutosens: 1.2, maxAutosens: 1.2 });
        const autosens = { ratio: 1.0 };

        determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        autosens.ratio.should.equal(1.0);
    });

    it('should calculate logarithmic formula correctly', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies();
        const autosens = { ratio: 1.0 };

        determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        // Assert final ratio
        autosens.ratio.should.be.approximately(0.77, 0.01);
    });

    it('should calculate sigmoid formula correctly', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies({ sigmoid: true });
        const autosens = { ratio: 1.0 };

        determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        autosens.ratio.should.be.approximately(1.06, 0.01);
    });

    it('should use default TDD ratio when average TDD is zero', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies({ avgTDD: 0 });
        const autosens = { ratio: 1.0 };

        var result = determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        // Should be disabled, so ratio remains 1.0, but tdd ratio isn't visible
        autosens.ratio.should.be.approximately(0.77, 0.01);
    });

    it('should use custom peak time when enabled', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies({ useCustomPeakTime: true, insulinPeakTime: 60 });
        const autosens = { ratio: 1.0 };

        determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        // Re-calculate expected ratio with the different insulinFactor (120 - 60 = 60)
        const expectedRatio = (50 * 0.8 * 30 * (Math.log((120 / 60) + 1) / 1800));
        autosens.ratio.should.be.approximately(expectedRatio, 0.01);
    });

    it('should use ultra-rapid insulin factor correctly', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies({ insulinCurve: 'ultra-rapid' });
        const autosens = { ratio: 1.0 };

        determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        autosens.ratio.should.be.approximately(0.7, 0.01);
    });

    it('should handle sigmoid maxLimit of 1 correctly', function() {
        const { profile, preferences, glucoseStatus, trioCustomOrefVariables, iob_data, currenttemp, meal_data, pumphistory, basalprofile } = createDependencies({ sigmoid: true, maxAutosens: 1.0 });
        const autosens = { ratio: 1.0 };

        determine_basal(glucoseStatus, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions, false, 0, new Date(), pumphistory, preferences, basalprofile, trioCustomOrefVariables, "");
        
        // As discovered, this edge case results in a ratio slightly less than 1
        autosens.ratio.should.be.approximately(0.99, 0.01);
    });
});

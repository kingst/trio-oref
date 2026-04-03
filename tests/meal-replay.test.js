'use strict';

var should = require('should');

describe('meal replay', function () {
    it('should calculate meal using real inputs', function () {
        const fs = require('fs');
        const path = require('path');
        const filePath = process.env.MEAL_INPUT || path.join(__dirname, 'meal_error_inputs.json');
        const rawData = fs.readFileSync(filePath, 'utf8');
        const inputs = JSON.parse(rawData);

        var generate = require('../lib/meal/index');

        var mealInputs = {
            history: inputs.pumpHistory
          , profile: inputs.profile
          , basalprofile: inputs.basalProfile
          , clock: inputs.clock
          , carbs: inputs.carbs
          , glucose: inputs.glucose
        };

        const result = generate(mealInputs);
        console.log(JSON.stringify(result));
    });
});

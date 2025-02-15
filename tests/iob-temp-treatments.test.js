'use strict';

require('should');

var moment = require('moment');
var calcTempTreatments = require('../lib/iob/history').calcTempTreatments;

describe('Calculate Temp Treatments', function() {
    // Test default temp basal
    it('should calculate temp basals with defaults', function() {
        var basalprofile = [{
            'i': 0,
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }];
    
        var now = Date.now(),
            timestamp = new Date(now).toISOString(),
            timestamp30mAgo = new Date(now - (30 * 60 * 1000));
    
        var inputs = {
            clock: timestamp,
            history: [{
                _type: 'TempBasal',
                rate: 2,
                date: timestamp30mAgo.getTime(),
                timestamp: timestamp30mAgo.toISOString()
            }, {
                _type: 'TempBasalDuration',
                'duration (min)': 30,
                date: timestamp30mAgo.getTime(),
                timestamp: timestamp30mAgo.toISOString()
            }],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile
            }
        };
    
        var treatments = calcTempTreatments(inputs);
        treatments.should.be.an.Array();
        treatments.length.should.be.greaterThan(0);
        
        var tempBasals = treatments.filter(t => t.rate !== undefined);
        tempBasals.should.be.an.Array();
        tempBasals.length.should.equal(3); // The actual temp plus the split zero temps
        
        // First entry should be our actual temp basal
        tempBasals[0].rate.should.equal(2);
        tempBasals[0].duration.should.equal(30);
        
        // The following entries should be the zero temps that get
        // added. One for the tempbasal and one for the tempbasalduration
        tempBasals[1].rate.should.equal(0);
        tempBasals[1].duration.should.equal(0);
        tempBasals[2].rate.should.equal(0);
        tempBasals[2].duration.should.equal(0);
    
        // Check TempBolus entries
        var tempBoluses = treatments.filter(t => t.insulin !== undefined);
        var totalInsulin = tempBoluses.reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(0.5, 0.001); // (2 U/hr - 1 U/hr) * 0.5 hr = 0.5U
    });

    // Test handling overlapping temp basals
    it('should handle overlapping temp basals', function() {
        var basalprofile = [{
            'i': 0,
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }];

        var now = Date.now(),
            timestamp = new Date(now).toISOString(),
            timestamp30mAgo = new Date(now - (30 * 60 * 1000)),
            timestamp15mAgo = new Date(now - (15 * 60 * 1000));

        var inputs = {
            clock: timestamp,
            history: [{
                _type: 'TempBasal',
                rate: 2,
                date: timestamp30mAgo.getTime(),
                timestamp: timestamp30mAgo.toISOString()
            }, {
                _type: 'TempBasalDuration',
                'duration (min)': 30,
                date: timestamp30mAgo.getTime(),
                timestamp: timestamp30mAgo.toISOString()
            }, {
                _type: 'TempBasal',
                rate: 3,
                date: timestamp15mAgo.getTime(),
                timestamp: timestamp15mAgo.toISOString()
            }, {
                _type: 'TempBasalDuration',
                'duration (min)': 30,
                date: timestamp15mAgo.getTime(),
                timestamp: timestamp15mAgo.toISOString()
            }],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile
            }
        };

        var treatments = calcTempTreatments(inputs);

        // Get only the temp basals (excluding any zero temps or other entries)
        var tempBasals = treatments.filter(t => t.rate && t.rate > 0 && t.duration && t.duration > 0);
        tempBasals.should.be.an.Array();

        // The treatments array should include the temp basals
        tempBasals.length.should.equal(1);
        
        // The remaining temp should be the first one, the logic
        // drops the later one if they overlap
        tempBasals[0].rate.should.equal(2);
        tempBasals[0].duration.should.equal(30);

        // Check TempBolus entries
        var tempBoluses = treatments.filter(t => t.insulin !== undefined);
        var totalInsulin = tempBoluses.reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(0.5, 0.001); // (2 U/hr - 1 U/hr) * 0.5 hr = 0.5U
    });

    // Test suspend/resume handling
    it('should handle pump suspends and resumes', function() {
        var basalprofile = [{
            'i': 0,
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }];

        var now = Date.now(),
            timestamp = new Date(now).toISOString(),
            timestamp30mAgo = new Date(now - (30 * 60 * 1000)),
            timestamp15mAgo = new Date(now - (15 * 60 * 1000));

        var inputs = {
            clock: timestamp,
            history: [{
                _type: 'TempBasal',
                rate: 2,
                date: timestamp30mAgo.getTime(),
                timestamp: timestamp30mAgo.toISOString()
            }, {
                _type: 'TempBasalDuration',
                'duration (min)': 30,
                date: timestamp30mAgo.getTime(),
                timestamp: timestamp30mAgo.toISOString()
            }, {
                _type: 'PumpSuspend',
                date: timestamp15mAgo.getTime(),
                timestamp: timestamp15mAgo.toISOString()
            }, {
                _type: 'PumpResume',
                date: now,
                timestamp: timestamp
            }],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                suspend_zeros_iob: true,
                basalprofile: basalprofile
            }
        };

        var treatments = calcTempTreatments(inputs);
        
        // Original temp should exist but be shortened
        var origTemp = treatments.find(t => t.rate === 2);
        should.exist(origTemp);
        origTemp.duration.should.equal(15);
    });

    // Test basal profile changes
    it('should handle basal profile changes', function() {
        var basalprofile = [{
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }, {
            'start': '00:30:00',
            'rate': 2,
            'minutes': 30
        }];

        var startingPoint = moment('2016-06-13 00:00:00.000').toDate();
        var endingPoint = moment('2016-06-13 00:45:00.000').toDate();

        var inputs = {
            clock: endingPoint.toISOString(),
            history: [{
                _type: 'TempBasal',
                rate: 3,
                date: startingPoint.getTime(),
                timestamp: startingPoint.toISOString()
            }, {
                _type: 'TempBasalDuration',
                'duration (min)': 60,
                date: startingPoint.getTime(),
                timestamp: startingPoint.toISOString()
            }],
            profile: {
                current_basal: 1,
                max_daily_basal: 2,
                dia: 3,
                basalprofile: basalprofile
            }
        };

        var treatments = calcTempTreatments(inputs);
        var tempBasals = treatments.filter(t => t.rate !== undefined && t.duration > 0);
        tempBasals.should.be.an.Array();
        tempBasals.length.should.be.greaterThan(0);
        
        // Should split the temp basal at profile change
        tempBasals[0].rate.should.equal(3);
        tempBasals[0].duration.should.equal(46); // 1m after current time
    });

    // Test bolus handling
    it('should properly record boluses', function() {
        var basalprofile = [{
            'i': 0,
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }];

        var now = Date.now();

        var inputs = {
            clock: new Date(now).toISOString(),
            history: [{
                _type: 'Bolus',
                amount: 2,
                date: now,
                timestamp: new Date(now).toISOString()
            }],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile
            }
        };

        var treatments = calcTempTreatments(inputs);
        var boluses = treatments.filter(t => t.insulin !== undefined);
        boluses.should.be.an.Array();
        boluses.length.should.equal(1);
        boluses[0].insulin.should.equal(2);
    });
});

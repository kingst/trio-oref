'use strict';

require('should');
const moment = require('moment');
const calcTempTreatments = require('../lib/iob/history').calcTempTreatments;
const splitTimespan = require('../lib/iob/history').splitTimespan;

describe('Suspend Logic Tests with suspendZerosIob=true', function() {
    // Helper function to create a basic basal profile
    function createBasicBasalProfile() {
        return [{
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }];
    }

    // Helper function to create a multi-rate basal profile
    function createMultiRateBasalProfile() {
        return [{
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }, {
            'start': '00:30:00',
            'rate': 2,
            'minutes': 30
        }];
    }

    it('should handle basic suspend and resume', function() {
        const basalprofile = createBasicBasalProfile();
        
        const now = moment().startOf('day').add(30, 'minutes').toDate();
        const timestamp = new Date(now).toISOString();
        const timestamp30mAgo = new Date(now - (30 * 60 * 1000));
        const timestamp15mAgo = new Date(now - (15 * 60 * 1000));

        const inputs = {
            clock: timestamp,
            history: [
                {
                    _type: 'TempBasal',
                    rate: 2,
                    date: timestamp30mAgo.getTime(),
                    timestamp: timestamp30mAgo.toISOString()
                }, 
                {
                    _type: 'TempBasalDuration',
                    'duration (min)': 30,
                    date: timestamp30mAgo.getTime(),
                    timestamp: timestamp30mAgo.toISOString()
                },
                {
                    _type: 'PumpSuspend',
                    date: timestamp15mAgo.getTime(),
                    timestamp: timestamp15mAgo.toISOString()
                },
                {
                    _type: 'PumpResume',
                    date: now.getTime(),
                    timestamp: timestamp
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);
        
        // Original temp should exist but be shortened
        const origTemp = treatments.find(t => t.rate === 2);
        should.exist(origTemp, "Original temp basal should exist");
        origTemp.duration.should.equal(15, "Original temp should be shortened to 15 minutes");

        // Check for negative boluses during suspension
        const suspendBoluses = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date >= timestamp15mAgo.getTime() && 
            t.date <= now.getTime()
        );
        
        suspendBoluses.should.not.be.empty("Should have negative boluses during suspend period");
        
        // Total insulin effect should be approximately 0
        const tempBoluses = treatments.filter(t => t.insulin !== undefined);
        const totalInsulin = tempBoluses.reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(0.0, 0.01);
    });

    it('should handle suspend prior to history window', function() {
        const basalprofile = createBasicBasalProfile();
        
        const now = moment().startOf('day').add(60, 'minutes').toDate();
        const timestamp = new Date(now).toISOString();
        const resumeTime = new Date(now - (45 * 60 * 1000));
        const tempStartTime = new Date(now - (30 * 60 * 1000));

        const inputs = {
            clock: timestamp,
            history: [
                {
                    _type: 'PumpResume',
                    date: resumeTime.getTime(),
                    timestamp: resumeTime.toISOString()
                },
                {
                    _type: 'TempBasal',
                    rate: 2,
                    date: tempStartTime.getTime(),
                    timestamp: tempStartTime.toISOString()
                },
                {
                    _type: 'TempBasalDuration',
                    'duration (min)': 30,
                    date: tempStartTime.getTime(),
                    timestamp: tempStartTime.toISOString()
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);
        
        // Should have negative boluses before resumeTime
        const priorSuspendBoluses = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date < resumeTime.getTime()
        );
        
        priorSuspendBoluses.should.not.be.empty("Should have negative boluses for prior suspension");
    });

    it('should handle current suspension', function() {
        const basalprofile = createBasicBasalProfile();
        
        const now = moment().startOf('day').add(60, 'minutes').toDate();
        const timestamp = new Date(now).toISOString();
        const suspendTime = new Date(now - (30 * 60 * 1000));
        const tempStartTime = new Date(now - (45 * 60 * 1000));

        const inputs = {
            clock: timestamp,
            history: [
                {
                    _type: 'TempBasal',
                    rate: 2,
                    date: tempStartTime.getTime(),
                    timestamp: tempStartTime.toISOString()
                },
                {
                    _type: 'TempBasalDuration',
                    'duration (min)': 30,
                    date: tempStartTime.getTime(),
                    timestamp: tempStartTime.toISOString()
                },
                {
                    _type: 'PumpSuspend',
                    date: suspendTime.getTime(),
                    timestamp: suspendTime.toISOString()
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);
        
        // Verify the temp basal was shortened
        const tempBasal = treatments.find(t => t.rate === 2);
        should.exist(tempBasal, "Temp basal should exist");
        tempBasal.duration.should.be.lessThan(30, "Temp basal should be shortened");
        
        // Calculate expected duration: min of (temp end time, suspend time) - temp start time
        const tempEndTime = new Date(tempStartTime.getTime() + 30 * 60 * 1000);
        const expectedEndTime = tempEndTime < suspendTime ? tempEndTime : suspendTime;
        const expectedDuration = (expectedEndTime.getTime() - tempStartTime.getTime()) / 60 / 1000;
        
        tempBasal.duration.should.be.approximately(expectedDuration, 1, "Temp duration should match expected value");
        
        // Should have negative boluses after suspendTime
        const suspendBoluses = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date >= suspendTime.getTime()
        );
        
        suspendBoluses.should.not.be.empty("Should have negative boluses after suspend time");
    });

    it('should handle multiple suspend-resume cycles', function() {
        const basalprofile = createBasicBasalProfile();
        
        const now = moment().startOf('day').add(90, 'minutes').toDate();
        const timestamp = new Date(now).toISOString();
        
        // Create history with 2 suspend-resume cycles
        const suspend1 = new Date(now - (80 * 60 * 1000));
        const resume1 = new Date(now - (70 * 60 * 1000));
        const suspend2 = new Date(now - (40 * 60 * 1000));
        const resume2 = new Date(now - (30 * 60 * 1000));
        const tempStart = new Date(now - (60 * 60 * 1000));

        const inputs = {
            clock: timestamp,
            history: [
                {
                    _type: 'PumpSuspend',
                    date: suspend1.getTime(),
                    timestamp: suspend1.toISOString()
                },
                {
                    _type: 'PumpResume',
                    date: resume1.getTime(),
                    timestamp: resume1.toISOString()
                },
                {
                    _type: 'TempBasal',
                    rate: 2,
                    date: tempStart.getTime(),
                    timestamp: tempStart.toISOString()
                },
                {
                    _type: 'TempBasalDuration',
                    'duration (min)': 45,
                    date: tempStart.getTime(),
                    timestamp: tempStart.toISOString()
                },
                {
                    _type: 'PumpSuspend',
                    date: suspend2.getTime(),
                    timestamp: suspend2.toISOString()
                },
                {
                    _type: 'PumpResume',
                    date: resume2.getTime(),
                    timestamp: resume2.toISOString()
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);
        
        // Check for negative boluses during first suspend
        const suspendBoluses1 = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date >= suspend1.getTime() && 
            t.date <= resume1.getTime()
        );
        
        suspendBoluses1.should.not.be.empty("Should have negative boluses during first suspend");
        
        // Check for negative boluses during second suspend
        const suspendBoluses2 = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date >= suspend2.getTime() && 
            t.date <= resume2.getTime()
        );
        
        suspendBoluses2.should.not.be.empty("Should have negative boluses during second suspend");
    });

    it('should handle suspend with basal profile changes', function() {
        const basalprofile = createMultiRateBasalProfile();
        
        // Start at 00:15, suspend at 00:30, resume at 00:45
        const startTime = moment('2016-06-13 00:15:00').toDate();
        const suspendTime = moment('2016-06-13 00:30:00').toDate();
        const resumeTime = moment('2016-06-13 00:45:00').toDate();
        const endTime = moment('2016-06-13 01:00:00').toDate();

        const inputs = {
            clock: endTime.toISOString(),
            history: [
                {
                    _type: 'TempBasal',
                    rate: 3,
                    date: startTime.getTime(),
                    timestamp: startTime.toISOString()
                },
                {
                    _type: 'TempBasalDuration',
                    'duration (min)': 45,
                    date: startTime.getTime(),
                    timestamp: startTime.toISOString()
                },
                {
                    _type: 'PumpSuspend',
                    date: suspendTime.getTime(),
                    timestamp: suspendTime.toISOString()
                },
                {
                    _type: 'PumpResume',
                    date: resumeTime.getTime(),
                    timestamp: resumeTime.toISOString()
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 2,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);

        // Check temp basal is shortened
        const tempBasals = treatments.filter(t => t.rate === 3);
        tempBasals.should.not.be.empty("Should have original temp basals");
        
        // Check for negative boluses during suspend with rate -2 
        // (because basal rate after 00:30 is 2.0)
        const suspendBoluses = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date >= suspendTime.getTime() && 
            t.date <= resumeTime.getTime()
        );
        
        suspendBoluses.should.not.be.empty("Should have negative boluses during suspend");
        
        // Calculate expected insulin impact:
        // 15m at 3 U/h - 1 U/h = 0.5U (from start to basal change)
        // 15m at 0 U/h - 2 U/h = -0.5U (from basal change and suspend)
        // 15m at 3 U/h - 2 U/h = 0.25U (resume to finish)
        // Total: 0.25U
        const tempBoluses = treatments.filter(t => t.insulin !== undefined);
        const totalInsulin = tempBoluses.reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(0.25, 0.05);
    });

    it('should handle case where temp basal extends past suspend and resume', function() {
        const basalprofile = createBasicBasalProfile();
        
        const now = moment().startOf('day').add(60, 'minutes').toDate();
        const timestamp = new Date(now).toISOString();
        const tempStartTime = new Date(now - (50 * 60 * 1000));
        const suspendTime = new Date(now - (40 * 60 * 1000));
        const resumeTime = new Date(now - (20 * 60 * 1000));

        const inputs = {
            clock: timestamp,
            history: [
                {
                    _type: 'TempBasal',
                    rate: 2,
                    date: tempStartTime.getTime(),
                    timestamp: tempStartTime.toISOString()
                },
                {
                    _type: 'TempBasalDuration',
                    'duration (min)': 45,
                    date: tempStartTime.getTime(),
                    timestamp: tempStartTime.toISOString()
                },
                {
                    _type: 'PumpSuspend',
                    date: suspendTime.getTime(),
                    timestamp: suspendTime.toISOString()
                },
                {
                    _type: 'PumpResume',
                    date: resumeTime.getTime(),
                    timestamp: resumeTime.toISOString()
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);
        
        // Temp should be shortened to end at suspend time
        const origTemp = treatments.find(t => t.rate === 2);
        should.exist(origTemp, "Original temp should exist");
        
        // Expected duration: suspend - temp start = 10 minutes
        const expectedDuration = (suspendTime.getTime() - tempStartTime.getTime()) / 60 / 1000;
        origTemp.duration.should.be.approximately(expectedDuration, 1);
        
        // Check for negative boluses during suspend
        const suspendBoluses = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date >= suspendTime.getTime() && 
            t.date <= resumeTime.getTime()
        );
        
        suspendBoluses.should.not.be.empty("Should have negative boluses during suspend");
        
        // There should be a temp after resume if original temp extended past resume
        const tempAfterResume = treatments.filter(t => 
            t.rate !== undefined && 
            t.rate > 0 && 
            new Date(t.timestamp || t.started_at).getTime() >= resumeTime.getTime()
        );
        
        // Original temp would have ended at tempStartTime + 45 min
        const originalTempEndTime = new Date(tempStartTime.getTime() + 45 * 60 * 1000);
        
        // Only expect a temp after resume if original would have still been active
        if (originalTempEndTime > resumeTime) {
            tempAfterResume.should.not.be.empty("Should have temp after resume");
            
            // The resumed temp duration should be the remaining time
            const resumedTempDuration = (originalTempEndTime.getTime() - resumeTime.getTime()) / 60 / 1000;
            tempAfterResume[0].duration.should.be.approximately(resumedTempDuration, 1);
        }
    });

    it('should handle suspend beyond DIA', function() {
        // This tests the case where we have a suspend older than DIA
        const basalprofile = createBasicBasalProfile();
        
        const now = moment().startOf('day').add(10, 'hours').toDate();
        const timestamp = new Date(now).toISOString();
        
        // Create history with a suspend beyond DIA
        const suspend = new Date(now - (9 * 60 * 60 * 1000)); // 9 hours ago (beyond 8h DIA)
        const resume = new Date(now - (8.5 * 60 * 60 * 1000));

        const inputs = {
            clock: timestamp,
            history: [
                {
                    _type: 'PumpSuspend',
                    date: suspend.getTime(),
                    timestamp: suspend.toISOString()
                },
                {
                    _type: 'PumpResume',
                    date: resume.getTime(),
                    timestamp: resume.toISOString()
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 8, // 8 hour DIA
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);
        
        // Calculate max DIA ago time
        const maxDiaAgo = new Date(now.getTime() - (8 * 60 * 60 * 1000));
        
        // Check for negative boluses starting at maxDiaAgo and ending at resume
        const diaLimitedSuspendBoluses = treatments.filter(t => 
            t.insulin !== undefined && 
            t.insulin < 0 && 
            t.date >= maxDiaAgo.getTime() && 
            t.date <= resume.getTime()
        );
        
        diaLimitedSuspendBoluses.should.not.be.empty("Should have negative boluses from DIA limit to resume");
        
        // Should not have boluses before maxDiaAgo
        const preDiaBoluses = treatments.filter(t => 
            t.insulin !== undefined && 
            t.date < maxDiaAgo.getTime()
        );
        
        // Either there are no boluses or they start very close to maxDiaAgo
        if (preDiaBoluses.length > 0) {
            const earliestBolusTime = Math.min(...preDiaBoluses.map(b => b.date));
            const diffFromDiaLimit = Math.abs(earliestBolusTime - maxDiaAgo.getTime());
            diffFromDiaLimit.should.be.lessThan(60 * 1000, "Earliest bolus should not be more than 1 minute before DIA limit");
        }
    });

    it('should properly handle IOB impact with suspends', function() {
        const basalprofile = createBasicBasalProfile();
        
        const now = moment().startOf('day').add(90, 'minutes').toDate();
        const timestamp = new Date(now).toISOString();
        
        // Create a 30m temp at 2x basal, then suspend for 30m, then resume
        const tempStart = new Date(now - (60 * 60 * 1000));
        const suspendTime = new Date(now - (30 * 60 * 1000));
        const resumeTime = new Date(now);

        const inputs = {
            clock: timestamp,
            history: [
                {
                    _type: 'TempBasal',
                    rate: 2,
                    date: tempStart.getTime(),
                    timestamp: tempStart.toISOString()
                },
                {
                    _type: 'TempBasalDuration',
                    'duration (min)': 30,
                    date: tempStart.getTime(),
                    timestamp: tempStart.toISOString()
                },
                {
                    _type: 'PumpSuspend',
                    date: suspendTime.getTime(),
                    timestamp: suspendTime.toISOString()
                },
                {
                    _type: 'PumpResume',
                    date: resumeTime.getTime(),
                    timestamp: resumeTime.toISOString()
                }
            ],
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);
        
        // Calculate expected insulin impact:
        // 30m at 2 U/h - 1 U/h = 0.5U (from temp start to temp end)
        // 30m at 0 U/h - 1 U/h = -0.5U (from suspend to resume)
        // Total: 0U
        const tempBoluses = treatments.filter(t => t.insulin !== undefined);
        const totalInsulin = tempBoluses.reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(0.0, 0.05);
    });

    it('should correctly split a 45-minute temp basal across basal change', function() {
        const startTime = moment('2016-06-13 00:15:00').toDate();

        const tempBasal = {
            _type: 'TempBasal',
            rate: 3,
            date: startTime.getTime(),
            timestamp: startTime.toISOString(),
            started_at: startTime,
            duration: 45            
        };

        const moments = [
            {
                type: 'recurring',
                minutes: 0
            },
            {
                type: 'recurring',
                minutes: 30
            }
        ];

        const splitHistory = splitTimespan(tempBasal, moments);
        console.log(splitHistory);
    });
});

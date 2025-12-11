'use strict';

require('should');
const moment = require('moment');
const calcTempTreatments = require('../lib/iob/history').calcTempTreatments;

/**
 * These test cases test the JS handling for multiple consecutive suspend
 * or resume events. Conceptually the oref algorithm will drop subsequent
 * events after the first when experiencing a suspend/resume chain.
 * But the original implementation had a bug where it would double count
 * suspends, which we fixed in iob-history.js
 */

describe('Consecutive Pump Suspend/Resume Events', function() {
    function createBasicBasalProfile() {
        return [{
            'start': '00:00:00',
            'rate': 1,
            'minutes': 0
        }];
    }

    it('should treat two consecutive PumpSuspend events as a single, longer suspend from the first event', function() {
        const basalprofile = createBasicBasalProfile();
        const now = moment().startOf('day').add(60, 'minutes').toDate(); // Current time 01:00
        const suspendTime1 = new Date(now.getTime() - (45 * 60 * 1000)); // Suspend 1 at 00:15
        const suspendTime2 = new Date(now.getTime() - (30 * 60 * 1000)); // Suspend 2 at 00:30
        const resumeTime = new Date(now.getTime() - (15 * 60 * 1000));   // Resume at 00:45

        const inputs = {
            clock: now.toISOString(),
            history: [
                { _type: 'PumpResume', date: resumeTime.getTime(), timestamp: resumeTime.toISOString() },
                { _type: 'PumpSuspend', date: suspendTime2.getTime(), timestamp: suspendTime2.toISOString() },
                { _type: 'PumpSuspend', date: suspendTime1.getTime(), timestamp: suspendTime1.toISOString() },
            ].reverse(), // Reverse for chronological order after sorting
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);

        // Check total insulin impact for the period:
        // It should produce -0.5U being suspended for 30m total
        const totalInsulin = treatments.filter(t => t.insulin !== undefined).reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(-0.5, 0.05);
    });

    it('should consider only the first PumpResume after a suspend event, ignoring subsequent consecutive resumes', function() {
        const basalprofile = createBasicBasalProfile();
        const now = moment().startOf('day').add(60, 'minutes').toDate(); // Current time 01:00
        const suspendTime = new Date(now.getTime() - (45 * 60 * 1000));  // Suspend at 00:15
        const resumeTime1 = new Date(now.getTime() - (30 * 60 * 1000)); // Resume 1 at 00:30
        const resumeTime2 = new Date(now.getTime() - (15 * 60 * 1000)); // Resume 2 at 00:45

        const inputs = {
            clock: now.toISOString(),
            history: [
                { _type: 'PumpResume', date: resumeTime2.getTime(), timestamp: resumeTime2.toISOString() },
                { _type: 'PumpResume', date: resumeTime1.getTime(), timestamp: resumeTime1.toISOString() },
                { _type: 'PumpSuspend', date: suspendTime.getTime(), timestamp: suspendTime.toISOString() },
            ].reverse(), // Reverse for chronological order after sorting
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);

        // Check total insulin impact for the period:
        // suspended for 15m, should be -0.25U
        const totalInsulin = treatments.filter(t => t.insulin !== undefined).reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(-0.25, 0.05);
    });

    it('should correctly process a complex sequence of suspend, suspend, resume, resume, suspend, resume events', function() {
        const basalprofile = createBasicBasalProfile();
        const now = moment().startOf('day').add(90, 'minutes').toDate(); // Current time 01:30

        const suspend1 = new Date(now.getTime() - (75 * 60 * 1000)); // Suspend 1 at 00:15
        const suspend2 = new Date(now.getTime() - (60 * 60 * 1000)); // Suspend 2 at 00:30
        const resume1 = new Date(now.getTime() - (45 * 60 * 1000));  // Resume 1 at 00:45
        const resume2 = new Date(now.getTime() - (30 * 60 * 1000));  // Resume 2 at 01:00
        const suspend3 = new Date(now.getTime() - (15 * 60 * 1000));  // Suspend 3 at 01:15
        const resume3 = now; // Resume 3 at 01:30 (current time)

        const inputs = {
            clock: now.toISOString(),
            history: [
                { _type: 'PumpResume', date: resume3.getTime(), timestamp: resume3.toISOString() },
                { _type: 'PumpSuspend', date: suspend3.getTime(), timestamp: suspend3.toISOString() },
                { _type: 'PumpResume', date: resume2.getTime(), timestamp: resume2.toISOString() },
                { _type: 'PumpResume', date: resume1.getTime(), timestamp: resume1.toISOString() },
                { _type: 'PumpSuspend', date: suspend2.getTime(), timestamp: suspend2.toISOString() },
                { _type: 'PumpSuspend', date: suspend1.getTime(), timestamp: suspend1.toISOString() },
            ].reverse(), // Reverse for chronological order after sorting
            profile: {
                current_basal: 1,
                max_daily_basal: 1,
                dia: 3,
                basalprofile: basalprofile,
                suspend_zeros_iob: true
            }
        };

        const treatments = calcTempTreatments(inputs);

        // Total insulin calculation:
        // Suspended for 45m total, should produce -0.75U
        const totalInsulin = treatments.filter(t => t.insulin !== undefined).reduce((sum, bolus) => sum + bolus.insulin, 0);
        totalInsulin.should.be.approximately(-0.75, 0.05);
    });
});

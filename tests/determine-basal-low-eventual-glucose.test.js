'use strict';

var should = require('should');
const tempBasalFunctions = require('../lib/basal-set-temp');
const round_basal = require('../lib/round-basal');

// Extracted logic from determine-basal.js. This must remain identical to the original.
function convert_bg(value, profile)
{
    if (profile.out_units === "mmol/L")
    {
        return round(value * 0.0555,1);
    }
    else
    {
        return Math.round(value);
    }
}

// User-specified round function for added precision
function round(value, digits) {
    if (! digits) { digits = 0; }
    var scale = Math.pow(10, digits);
    return Math.round(Math.round(value * scale * 10000000)/10000000) / scale;
}

function handleLowEventualGlucoseJS(
    eventualBG,
    min_bg,
    target_bg,
    minDelta,
    expectedDelta,
    carbsReq,
    naive_eventualBG,
    glucose_status,
    currenttemp,
    basal,
    profile,
    rT,
    sens,
    overrideFactor
) {
    // This block is an identical copy of the logic from determine-basal.js
    // starting from the `if (eventualBG < min_bg)` check.

    if (eventualBG >= min_bg) {
        return null; // Match Swift behavior of returning nothing when condition is not met
    }

    rT.reason += "Eventual BG " + convert_bg(eventualBG, profile) + " < " + convert_bg(min_bg, profile);

    // Logic to define 'tick' must be replicated from the original file for the reason string to be correct.
    var tick;
    if (glucose_status.delta > -0.5) {
        tick = "+" + round(glucose_status.delta,0);
    } else {
        tick = round(glucose_status.delta,0);
    }

    // if 5m or 30m avg BG is rising faster than expected delta
    if ( minDelta > expectedDelta && minDelta > 0 && !carbsReq ) {
        // if naive_eventualBG < 40, set a 30m zero temp (oref0-pump-loop will let any longer SMB zero temp run)
        if (naive_eventualBG < 40) {
            rT.reason += ", naive_eventualBG < 40. ";
            return tempBasalFunctions.setTempBasal(0, 30, profile, rT, currenttemp);
        }
        if (glucose_status.delta > minDelta) {
            rT.reason += ", but Delta " + convert_bg(tick, profile) + " > expectedDelta " + convert_bg(expectedDelta, profile);
        } else {
            rT.reason += ", but Min. Delta " + minDelta.toFixed(2) + " > Exp. Delta " + convert_bg(expectedDelta, profile);
        }
        if (currenttemp.duration > 15 && (round_basal(basal, profile) === round_basal(currenttemp.rate, profile))) {
            rT.reason += ", temp " + currenttemp.rate + " ~ req " + basal + "U/hr. ";
            return rT;
        } else {
            rT.reason += "; setting current basal of " + basal + " as temp. ";
            return tempBasalFunctions.setTempBasal(basal, 30, profile, rT, currenttemp);
        }
    }

    // calculate 30m low-temp required to get projected BG up to target
    // multiply by 2 to low-temp faster for increased hypo safety
    var insulinReq = 2 * Math.min(0, (eventualBG - target_bg) / sens);
    insulinReq = round( insulinReq , 2);
    // calculate naiveInsulinReq based on naive_eventualBG
    var naiveInsulinReq = Math.min(0, (naive_eventualBG - target_bg) / sens);
    naiveInsulinReq = round( naiveInsulinReq , 2);
    if (minDelta < 0 && minDelta > expectedDelta) {
        // if we're barely falling, newinsulinReq should be barely negative
        var newinsulinReq = round(( insulinReq * (minDelta / expectedDelta) ), 2);
        insulinReq = newinsulinReq;
    }
    // rate required to deliver insulinReq less insulin over 30m:
    var rate = basal + (2 * insulinReq);
    rate = round_basal(rate, profile);

    // if required temp < existing temp basal
    var insulinScheduled = currenttemp.duration * (currenttemp.rate - basal) / 60;
    // if current temp would deliver a lot (30% of basal) less than the required insulin,
    // by both normal and naive calculations, then raise the rate
    var minInsulinReq = Math.min(insulinReq,naiveInsulinReq);

    if (insulinScheduled < minInsulinReq - basal*0.3) {
        rT.reason += ", " + currenttemp.duration + "m@" + (currenttemp.rate).toFixed(2) + " is a lot less than needed. ";
        return tempBasalFunctions.setTempBasal(rate, 30, profile, rT, currenttemp);
    }
    if (typeof currenttemp.rate !== 'undefined' && (currenttemp.duration > 5 && rate >= currenttemp.rate * 0.8)) {
        rT.reason += ", temp " + currenttemp.rate + " ~< req " + rate + "U/hr. ";
        return rT;
    }

    else {
        // calculate a long enough zero temp to eventually correct back up to target
        if ( rate <=0 ) {
            // These variables must be declared to avoid a ReferenceError in strict mode.
            var bgUndershoot, worstCaseInsulinReq, durationReq;
            bgUndershoot = target_bg - naive_eventualBG;
            worstCaseInsulinReq = bgUndershoot / sens;
            durationReq = round(60*worstCaseInsulinReq / profile.current_basal * overrideFactor);
            if (durationReq < 0) {
                durationReq = 0;
            // don't set a temp longer than 120 minutes
            } else {
                durationReq = round(durationReq/30)*30;
                durationReq = Math.min(120,Math.max(0,durationReq));
            }
            if (durationReq > 0) {
                rT.reason += ", setting " + durationReq + "m zero temp. ";
                return tempBasalFunctions.setTempBasal(rate, durationReq, profile, rT, currenttemp);
            }
        }

        else {
            rT.reason += ", setting " + rate + "U/hr. ";
        }
        return tempBasalFunctions.setTempBasal(rate, 30, profile, rT, currenttemp);
    }
}

describe('DosingEngine.handleLowEventualGlucose', function() {

    function defaultProfile() {
        return {
            min_bg: 100,
            target_bg: 100,
            current_basal: 1.0,
            max_daily_basal: 1.3,
            max_basal: 3.5,
            sens: 50,
            bolus_increment: 0.1
        };
    }

    function callHandleLowEventualGlucose(inputs) {
        const p = inputs.profile || defaultProfile();
        const determination = inputs.determination || { reason: "" };

        return handleLowEventualGlucoseJS(
            inputs.eventualGlucose || 90,
            inputs.minGlucose || p.min_bg,
            inputs.targetGlucose || p.target_bg,
            inputs.minDelta || 0,
            inputs.expectedDelta || 0,
            inputs.carbsRequired || 0,
            inputs.naiveEventualGlucose || 90,
            inputs.glucoseStatus || { delta: 0, glucose: 100, noise: 1, short_avgdelta: 0, long_avgdelta: 0, date: new Date().getTime(), device: "test" },
            inputs.currentTemp || { duration: 0, rate: 0, temp: 'absolute' },
            inputs.basal || p.current_basal,
            p,
            determination,
            inputs.adjustedSensitivity || p.sens,
            inputs.overrideFactor || 1
        );
    }

    it('Guard: eventual glucose is not low', function() {
        const determination = callHandleLowEventualGlucose({ eventualGlucose: 100, minGlucose: 100 });
        should.not.exist(determination);
    });

    it('Naive eventual glucose below 40', function() {
        const determination = callHandleLowEventualGlucose({
            minDelta: 1,
            expectedDelta: 0,
            carbsRequired: 0,
            naiveEventualGlucose: 39
        });
        should.exist(determination);
        determination.rate.should.equal(0);
        determination.duration.should.equal(30);
        determination.reason.should.containEql("naive_eventualBG < 40");
    });

    it('Min delta > expected, but no carbs required', function() {
        const determination = callHandleLowEventualGlucose({ minDelta: 1, expectedDelta: 0, carbsRequired: 0 });
        should.exist(determination);
    });

    it('Min delta < 0', function() {
        const determination = callHandleLowEventualGlucose({ minDelta: -1, expectedDelta: -2, carbsRequired: 0 });
        should.exist(determination);
        determination.rate.should.equal(0.6);
    });

    it('Current temp rate matches basal', function() {
        const p = defaultProfile();
        const currentTemp = { duration: 20, rate: p.current_basal, temp: 'absolute' };
        const determination = callHandleLowEventualGlucose({
            minDelta: 1,
            expectedDelta: 0,
            carbsRequired: 0,
            currentTemp: currentTemp,
            profile: p
        });
        should.exist(determination);
        should.not.exist(determination.rate); // No change
        determination.reason.should.containEql("temp " + currentTemp.rate + " ~ req " + p.current_basal + "U/hr.");
    });

    it('Set basal as temp', function() {
        const p = defaultProfile();
        const determination = callHandleLowEventualGlucose({
            minDelta: 1,
            expectedDelta: 0,
            carbsRequired: 0,
            profile: p
        });
        should.exist(determination);
        determination.rate.should.equal(p.current_basal);
        determination.duration.should.equal(30);
        determination.reason.should.containEql("setting current basal of " + p.current_basal + " as temp.");
    });

    it('Insulin scheduled less than required', function() {
        const determination = callHandleLowEventualGlucose({
            eventualGlucose: 80,
            naiveEventualGlucose: 70,
            currentTemp: { duration: 120, rate: 0, temp: 'absolute' }
        });
        should.exist(determination);
        should.not.exist(determination.rate);
        should.not.exist(determination.duration);
        determination.reason.should.containEql("is a lot less than needed");
    });

    it('Rate similar to current temp', function() {
        const currentTemp = { duration: 10, rate: 0.1, temp: 'absolute' };
        const determination = callHandleLowEventualGlucose({
            eventualGlucose: 99,
            targetGlucose: 110,
            currentTemp: currentTemp,
            adjustedSensitivity: 50
        });

        should.exist(determination);
        should.not.exist(determination.rate); // No change
        determination.reason.should.containEql("temp " + currentTemp.rate + " ~< req");
    });

    it('Set zero temp', function() {
        const determination = callHandleLowEventualGlucose({ eventualGlucose: 70, naiveEventualGlucose: 60 });
        should.exist(determination);
        determination.rate.should.equal(0);
        determination.duration.should.be.above(0);
        determination.reason.should.containEql("setting " + determination.duration + "m zero temp.");
    });
});

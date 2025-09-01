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

// Round function from testing JS for added precision
function round(value, digits) {
    if (! digits) { digits = 0; }
    var scale = Math.pow(10, digits);
    return Math.round(Math.round(value * scale * 10000000)/10000000) / scale;
}

function glucoseFallingFasterThanExpected(
    eventualBG,
    min_bg,
    minDelta,
    expectedDelta,
    glucose_status,
    currenttemp,
    basal,
    microBolusAllowed,
    enableSMB,
    profile,
    rT
) {
    // This block is an identical copy of the logic from determine-basal.js
    // starting from the `if (minDelta < expectedDelta)` check.

    if (minDelta >= expectedDelta) {
        return null; // Match Swift behavior of returning nothing when condition is not met
    }

    rT.minDelta = minDelta;
    rT.expectedDelta = expectedDelta;

    // remove manualBolusErrorString and insulinForManualBolus since we don't use them in Trio

    // if in SMB mode, don't cancel SMB zero temp
    if (! (microBolusAllowed && enableSMB)) {
        if (glucose_status.delta < minDelta) {
            rT.reason += "Eventual BG " + convert_bg(eventualBG, profile) + " > " + convert_bg(min_bg, profile) + " but Delta " + convert_bg(tick, profile) + " < Exp. Delta " + convert_bg(expectedDelta, profile);
        } else {
            rT.reason += "Eventual BG " + convert_bg(eventualBG, profile) + " > " + convert_bg(min_bg, profile) + " but Min. Delta " + minDelta.toFixed(2) + " < Exp. Delta " + convert_bg(expectedDelta, profile);
        }
        if (currenttemp.duration > 15 && (round_basal(basal, profile) === round_basal(currenttemp.rate, profile))) {
            rT.reason += ", temp " + currenttemp.rate + " ~ req " + basal + "U/hr. ";
            return rT;
        } else {
            rT.reason += "; setting current basal of " + basal + " as temp. ";
            return tempBasalFunctions.setTempBasal(basal, 30, profile, rT, currenttemp);
        }
    }
    return null;
}

describe('DosingEngine.glucoseFallingFasterThanExpected', function() {
    const baseProfile = {
        out_units: 'mg/dL',
    };
    const baseCurrentTemp = {
        duration: 0,
        rate: 0,
    };
    const baseGlucoseStatus = {
        delta: 5,
    };
    let rT;
    let setTempBasalSpy;

    beforeEach(() => {
        rT = { reason: '' };
        setTempBasalSpy = {
            called: false,
            args: null,
            returnValue: { a: 'return value' },
        };
        tempBasalFunctions.setTempBasal = (...args) => {
            setTempBasalSpy.called = true;
            setTempBasalSpy.args = args;
            return setTempBasalSpy.returnValue;
        };
    });

    it('should return null if minDelta is not less than expectedDelta', () => {
        const result = glucoseFallingFasterThanExpected(100, 90, 5, 5, {}, {}, 0, false, false, baseProfile, rT);
        should(result).be.null();
    });

    it('should return null if SMB is enabled', () => {
        const result = glucoseFallingFasterThanExpected(100, 90, 4, 5, {}, {}, 0, true, true, baseProfile, rT);
        should(result).be.null();
    });

    it('should return rT when conditions to continue temp are met', () => {
        const currenttemp = { ...baseCurrentTemp, duration: 20, rate: 1.0 };
        const result = glucoseFallingFasterThanExpected(100, 90, 4, 5, baseGlucoseStatus, currenttemp, 1.0, false, false, baseProfile, rT);
        result.should.equal(rT);
        rT.reason.should.containEql('temp 1 ~ req 1U/hr');
    });

    it('should call setTempBasal when conditions to set a new temp are met', () => {
        const currenttemp = { ...baseCurrentTemp, duration: 10, rate: 1.0 }; // duration <= 15
        const result = glucoseFallingFasterThanExpected(100, 90, 4, 5, baseGlucoseStatus, currenttemp, 1.2, false, false, baseProfile, rT);

        setTempBasalSpy.called.should.be.true();
        setTempBasalSpy.args[0].should.equal(1.2); // basal
        setTempBasalSpy.args[1].should.equal(30); // duration
        result.should.equal(setTempBasalSpy.returnValue);
        rT.reason.should.containEql('setting current basal of 1.2 as temp');
    });
});

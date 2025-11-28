'use strict';

var should = require('should');
var round_basal = require('../lib/round-basal');
var tempBasalFunctions = require('../lib/basal-set-temp');

// Extracted logic from determine-basal.js corresponding to determineHighTempBasal
function determineHighTempBasal(
    insulinReq,
    basal,
    profile,
    currenttemp,
    rT
) {
    // Reference lines 1494+: Rate calculation logic happens before this block in JS
    // rate = basal + (2 * insulinReq)
    var rate = basal + (2 * insulinReq);
    rate = round_basal(rate, profile);

    // Reference lines 1604+
    var maxSafeBasal = tempBasalFunctions.getMaxSafeBasal(profile);

    if (rate > maxSafeBasal) {
        rT.reason += "adj. req. rate: " + rate + " to maxSafeBasal: " + round(maxSafeBasal,2) + ", ";
        rate = round_basal(maxSafeBasal, profile);
    }

    var insulinScheduled = currenttemp.duration * (currenttemp.rate - basal) / 60;
    if (insulinScheduled >= insulinReq * 2) { 
        rT.reason += currenttemp.duration + "m@" + (currenttemp.rate).toFixed(2) + " > 2 * insulinReq. Setting temp basal of " + rate + "U/hr. ";
        return tempBasalFunctions.setTempBasal(rate, 30, profile, rT, currenttemp);
    }

    if (typeof currenttemp.duration === 'undefined' || currenttemp.duration === 0) { 
        rT.reason += "no temp, setting " + rate + "U/hr. ";
        return tempBasalFunctions.setTempBasal(rate, 30, profile, rT, currenttemp);
    }

    if (currenttemp.duration > 5 && (round_basal(rate, profile) <= round_basal(currenttemp.rate, profile))) { 
        rT.reason += "temp " + currenttemp.rate + " >~ req " + rate + "U/hr. ";
        return rT;
    }

    rT.reason += "temp " + currenttemp.rate + "<" + rate + "U/hr. ";
    return tempBasalFunctions.setTempBasal(rate, 30, profile, rT, currenttemp);
}

function round(value, digits) {
    if (! digits) { digits = 0; }
    var scale = Math.pow(10, digits);
    return Math.round(value * scale) / scale;
}

describe('Aggressive Dosing: determineHighTempBasal', function() {
    
    let rT, profile, currenttemp;
    let setTempBasalSpy;
    const originalSetTempBasal = tempBasalFunctions.setTempBasal;

    beforeEach(() => {
        rT = { reason: '' };
        profile = {
            max_basal: 5.0,
            max_daily_basal: 5.0,
            current_basal_safety_multiplier: 4,
            max_daily_safety_multiplier: 3,
            current_basal: 1.0 // Base basal
        };
        currenttemp = {
            duration: 0,
            rate: 0,
            temp: 'absolute'
        };
        
        // Mock setTempBasal to verify outputs
        setTempBasalSpy = {
            called: false,
            args: null,
            returnValue: { rate: 0, duration: 0 }
        };
        tempBasalFunctions.setTempBasal = (rate, duration, profile, rT, currenttemp) => {
            setTempBasalSpy.called = true;
            setTempBasalSpy.args = { rate, duration };
            return { rate, duration };
        };
    });

    afterEach(() => {
        tempBasalFunctions.setTempBasal = originalSetTempBasal;
    });

    it('should set high temp if no temp is running', () => {
        // insulinReq = 1.0. basal = 1.0. rate = 1.0 + 2*1.0 = 3.0.
        const result = determineHighTempBasal(1.0, 1.0, profile, currenttemp, rT);
        
        setTempBasalSpy.called.should.be.true();
        setTempBasalSpy.args.rate.should.equal(3.0);
        setTempBasalSpy.args.duration.should.equal(30);
        rT.reason.should.containEql("no temp, setting 3U/hr");
    });

    it('should cap rate at maxSafeBasal', () => {
        profile.max_basal = 2.0; // Restrict max basal
        // insulinReq = 1.0. basal = 1.0. rate = 3.0. Max = 2.0.
        
        const result = determineHighTempBasal(1.0, 1.0, profile, currenttemp, rT);
        
        setTempBasalSpy.called.should.be.true();
        setTempBasalSpy.args.rate.should.equal(2.0); // Capped
        rT.reason.should.containEql("adj. req. rate: 3");
        rT.reason.should.containEql("maxSafeBasal: 2");
    });

    it('should reduce temp if current temp delivers >2x required insulin', () => {
        // insulinReq = 0.5. 2x = 1.0 U.
        // basal = 1.0. rate = 1.0 + 1.0 = 2.0.
        
        // Current temp: rate 4.0, duration 30m.
        // insulinScheduled = 30 * (4.0 - 1.0) / 60 = 1.5 U.
        // 1.5 U >= 1.0 U.
        
        currenttemp = { duration: 30, rate: 4.0, temp: 'absolute' };
        
        const result = determineHighTempBasal(0.5, 1.0, profile, currenttemp, rT);
        
        setTempBasalSpy.called.should.be.true();
        setTempBasalSpy.args.rate.should.equal(2.0); // Reset to calculated rate
        rT.reason.should.containEql("> 2 * insulinReq");
    });

    it('should do nothing if current temp is sufficient', () => {
        // insulinReq = 1.0. rate = 3.0.
        // Current temp: rate 3.0, duration 30m.
        
        currenttemp = { duration: 30, rate: 3.0, temp: 'absolute' };
        
        const result = determineHighTempBasal(1.0, 1.0, profile, currenttemp, rT);
        
        // Should return rT (modified) but NOT call setTempBasal
        // Wait, helper function calls setTempBasal if conditions are met, otherwise returns rT.
        // In the "sufficient" block: return rT;
        // setTempBasalSpy should NOT be called.
        
        // Wait, I mocked setTempBasal but the function returns `rT` directly in this case.
        setTempBasalSpy.called.should.be.false();
        result.should.equal(rT);
        rT.reason.should.containEql("temp 3 >~ req 3U/hr");
    });

    it('should set new temp if current temp is insufficient (rate lower)', () => {
        // insulinReq = 1.0. rate = 3.0.
        // Current temp: rate 2.0.
        
        currenttemp = { duration: 30, rate: 2.0, temp: 'absolute' };
        
        const result = determineHighTempBasal(1.0, 1.0, profile, currenttemp, rT);
        
        setTempBasalSpy.called.should.be.true();
        setTempBasalSpy.args.rate.should.equal(3.0);
        rT.reason.should.containEql("temp 2<3U/hr");
    });
});

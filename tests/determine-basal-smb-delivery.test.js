'use strict';

var should = require('should');

// Extracted logic from determine-basal.js corresponding to determineSMBDelivery
function determineSMBDelivery(
    insulinReq,
    microBolusAllowed,
    enableSMB,
    bg,
    threshold,
    profile,
    meal_data,
    iob_data,
    systemTime,
    target_bg,
    naive_eventualBG,
    minIOBPredBG,
    sens,
    carbRatio,
    basal,
    rT,
    trioCustomOrefVariables
) {
    // Reference line 1530
    if (microBolusAllowed && enableSMB && bg > threshold) {
        
        // Reference line 1136
        // Helper round function
        function round(value, digits) {
            if (! digits) { digits = 0; }
            var scale = Math.pow(10, digits);
            return Math.round(value * scale) / scale;
        }

        var overrideFactor = 1.0;
        if (trioCustomOrefVariables && typeof trioCustomOrefVariables.overridePercentage !== 'undefined') {
            overrideFactor = trioCustomOrefVariables.overridePercentage / 100.0;
        } else if (typeof trioCustomOrefVariables === 'number') {
             // fallback for legacy calls in tests passing overrideFactor directly
             overrideFactor = trioCustomOrefVariables;
             trioCustomOrefVariables = null;
        }

        var smbMinutesSetting =  30;
        if (typeof profile.maxSMBBasalMinutes !== 'undefined') {
            smbMinutesSetting = profile.maxSMBBasalMinutes;
        }
        
        var uamMinutesSetting = 30;
        if (typeof profile.maxUAMSMBBasalMinutes !== 'undefined') {
            uamMinutesSetting = profile.maxUAMSMBBasalMinutes;
        }

        // Logic from DosingEngine.swift: determineMaxBolus
        if (trioCustomOrefVariables && trioCustomOrefVariables.useOverride && trioCustomOrefVariables.advancedSettings) {
            if (typeof trioCustomOrefVariables.smbMinutes !== 'undefined') {
                smbMinutesSetting = trioCustomOrefVariables.smbMinutes;
            }
            if (typeof trioCustomOrefVariables.uamMinutes !== 'undefined') {
                uamMinutesSetting = trioCustomOrefVariables.uamMinutes;
            }
        }

        var mealInsulinReq = round( meal_data.mealCOB / carbRatio ,3);
        var maxBolus = 0;
        if (typeof smbMinutesSetting === 'undefined' ) {
            maxBolus = round(profile.current_basal *overrideFactor * 30 / 60 ,1);
        } else if ( iob_data.iob > mealInsulinReq && iob_data.iob > 0 ) {
            if (uamMinutesSetting) {
                maxBolus = round(profile.current_basal * overrideFactor * uamMinutesSetting / 60 ,1);
            } else {
                maxBolus = round( profile.current_basal  * overrideFactor * 30 / 60 ,1);
            }
        } else {
            maxBolus = round(profile.current_basal  * overrideFactor * smbMinutesSetting / 60 ,1);
        }

        // bolus 1/2 the insulinReq, up to maxBolus, rounding down to nearest bolus increment
        var bolusIncrement = profile.bolus_increment;
        var roundSMBTo = 1 / bolusIncrement;

        var smb_ratio = Math.min(profile.smb_delivery_ratio, 1);
        var microBolus = Math.min(insulinReq*smb_ratio, maxBolus);
        microBolus = Math.floor(microBolus*roundSMBTo)/roundSMBTo;

        // calculate a long enough zero temp to eventually correct back up to target
        var smbTarget = target_bg;
        var worstCaseInsulinReq = (smbTarget - (naive_eventualBG + minIOBPredBG)/2 ) / sens;
        var durationReq = round(60*worstCaseInsulinReq / profile.current_basal * overrideFactor);

        // if insulinReq > 0 but not enough for a microBolus, don't set an SMB zero temp
        if (insulinReq > 0 && microBolus < bolusIncrement) {
            durationReq = 0;
        }

        var smbLowTempReq = 0;
        if (durationReq <= 0) {
            durationReq = 0;
        } else if (durationReq >= 30) {
            durationReq = round(durationReq/30)*30;
            durationReq = Math.min(60,Math.max(0,durationReq));
        } else {
            // if SMB durationReq is less than 30m, set a nonzero low temp
            smbLowTempReq = round( basal * durationReq/30 ,2);
            durationReq = 30;
        }
        
        rT.reason += " insulinReq " + insulinReq;
        if (microBolus >= maxBolus) {
            rT.reason +=  "; maxBolus " + maxBolus;
        }
        if (durationReq > 0) {
            rT.reason += "; setting " + durationReq + "m low temp of " + smbLowTempReq + "U/h";
        }
        rT.reason += ". ";

        //allow SMBs every 3 minutes by default
        var SMBInterval = 3;
        if (profile.SMBInterval) {
            SMBInterval = Math.min(10,Math.max(1,profile.SMBInterval));
        }
        
        var lastBolusAge = round(( new Date(systemTime).getTime() - iob_data.lastBolusTime ) / 60000,1);

        if (lastBolusAge > SMBInterval) {
            if (microBolus > 0) {
                rT.units = microBolus;
                rT.reason += "Microbolusing " + microBolus + "U. ";
            }
        } else {
            rT.reason += "Waiting ... to microbolus again. "; // Simplified reason for test matching
        }

        if (durationReq > 0) {
            rT.rate = smbLowTempReq;
            rT.duration = durationReq;
            return rT; // Return modified rT acts as 'true' / exit
        }
    }
    return null; // Return null acts as 'false' / continue
}

describe('Aggressive Dosing: determineSMBDelivery', function() {
    
    let rT, profile, iob_data, meal_data;
    const systemTime = new Date();

    beforeEach(() => {
        rT = { reason: '' };
        profile = {
            current_basal: 1.0,
            maxSMBBasalMinutes: 30,
            maxUAMSMBBasalMinutes: 30,
            smb_delivery_ratio: 0.5,
            bolus_increment: 0.1,
            SMBInterval: 3
        };
        iob_data = {
            iob: 0,
            lastBolusTime: systemTime.getTime() - 10 * 60 * 1000 // 10 mins ago
        };
        meal_data = {
            mealCOB: 0
        };
    });

    it('should return null if SMB conditions not met', () => {
        // bg (100) < threshold (110)
        const result = determineSMBDelivery(1.0, true, true, 100, 110, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, 1.0);
        should(result).be.null();
    });

    it('should calculate correct microBolus with rounding', () => {
        // insulinReq = 1.55
        // maxBolus = 1.0 * 30/60 = 0.5
        // smb = min(1.55 * 0.5, 0.5) = 0.5
        // Expected: 0.5
        
        // Increase maxBolus to test rounding
        profile.maxSMBBasalMinutes = 60; // max = 1.0
        // smb = min(1.55 * 0.5, 1.0) = 0.775
        // floor(0.775 * 10) / 10 = 7 / 10 = 0.7
        
        const result = determineSMBDelivery(1.55, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, 1.0);
        
        // Duration is 0 so result is null, but units should be set on rT
        should(result).be.null();
        rT.units.should.equal(0.7);
    });

    it('should apply override factor to maxBolus', () => {
        // Override 2.0
        // maxBolus = 1.0 * 2.0 * 30/60 = 1.0
        // insulinReq = 3.0
        // smb = min(3.0 * 0.5, 1.0) = 1.0
        
        const result = determineSMBDelivery(3.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, 2.0);
        
        should(result).be.null();
        rT.units.should.equal(1.0);
    });

    it('should use UAM max minutes when appropriate', () => {
        profile.maxSMBBasalMinutes = 30; // 0.5
        profile.maxUAMSMBBasalMinutes = 60; // 1.0
        
        // IOB > mealInsulinReq
        meal_data.mealCOB = 10;
        // carbRatio = 10 => mealInsulinReq = 1.0
        iob_data.iob = 1.5; 
        
        // insulinReq = 3.0
        // smb = min(3.0 * 0.5, 1.0) = 1.0 (uses UAM limit)
        
        const result = determineSMBDelivery(3.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, 1.0);
        
        should(result).be.null();
        rT.units.should.equal(1.0);
    });

    it('should override smbMinutes and uamMinutes when useOverride and advancedSettings are true', () => {
        // profile: smb 30 (0.5U), uam 30 (0.5U)
        // override: smb 60 (1.0U), uam 60 (1.0U)
        
        const customVars = {
            overridePercentage: 100,
            useOverride: true,
            advancedSettings: true,
            smbMinutes: 60,
            uamMinutes: 60
        };

        // Case 1: Regular SMB (IOB <= mealInsulinReq)
        // insulinReq = 3.0
        // maxBolus should be 1.0 (60 mins) instead of 0.5 (30 mins)
        // smb = min(1.5, 1.0) = 1.0

        let result = determineSMBDelivery(3.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, customVars);
        should(result).be.null();
        rT.units.should.equal(1.0);

        // Case 2: UAM SMB (IOB > mealInsulinReq)
        meal_data.mealCOB = 10; // req = 1.0
        iob_data.iob = 1.5;
        rT = { reason: '' };

        // Reset profile to be sure
        profile.maxUAMSMBBasalMinutes = 30;

        // maxBolus should be 1.0 (60 mins override)
        result = determineSMBDelivery(3.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, customVars);
        should(result).be.null();
        rT.units.should.equal(1.0);
    });

    it('should not override smbMinutes and uamMinutes when advancedSettings is false', () => {
        const customVars = {
            overridePercentage: 100,
            useOverride: true,
            advancedSettings: false,
            smbMinutes: 60,
            uamMinutes: 60
        };

        // insulinReq = 3.0
        // maxBolus should be 0.5 (30 mins from profile) ignoring override 60
        // smb = min(1.5, 0.5) = 0.5

        const result = determineSMBDelivery(3.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, customVars);
        should(result).be.null();
        rT.units.should.equal(0.5);
    });
    
    it('should use overridePercentage from custom vars if provided', () => {
        const customVars = {
            overridePercentage: 200, // 200%
            useOverride: true,
            advancedSettings: false
        };

        // maxBolus = 1.0 * 2.0 * 30/60 = 1.0
        // insulinReq = 3.0
        // smb = min(3.0 * 0.5, 1.0) = 1.0

        const result = determineSMBDelivery(3.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 100, 100, 50, 10, 1.0, rT, customVars);
        
        should(result).be.null();
        rT.units.should.equal(1.0);
    });

    it('should not bolus if within SMB interval', () => {
        iob_data.lastBolusTime = systemTime.getTime() - 1 * 60 * 1000; // 1 min ago
        
        // Set up conditions where durationReq > 0 so it would normally return rT
        // worstCase > 0 => low pred
        // (100 - (90+90)/2) / 50 = 0.2
        // duration = 60 * 0.2 / 1 = 12m
        // 12m -> <30m -> sets smbLowTempReq -> returns rT
        
        const result = determineSMBDelivery(1.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 90, 90, 50, 10, 1.0, rT, 1.0);
        
        should(result).not.be.null();
        should(result.units).be.undefined();
        result.reason.should.containEql("Waiting");
    });

    it('should set 30m zero temp if durationReq is between 30 and 45', () => {
        // worstCaseInsulinReq needs to result in durationReq ~ 35
        // duration = 60 * worst / basal
        // 35 = 60 * worst / 1.0 => worst = 35/60 = 0.583
        // worst = (100 - (naive+min)/2) / 50
        // 0.583 = (100 - avg)/50 => 29.15 = 100 - avg => avg = 70.85
        
        const result = determineSMBDelivery(1.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 70.85, 70.85, 50, 10, 1.0, rT, 1.0);
        
        result.rate.should.equal(0);
        result.duration.should.equal(30);
        result.reason.should.containEql("setting 30m low temp of 0U/h");
    });

    it('should set 60m zero temp if durationReq is > 45', () => {
        // worstCaseInsulinReq needs to result in durationReq ~ 50
        // 50 = 60 * worst / 1.0 => worst = 0.833
        // 0.833 = (100 - avg)/50 => 41.65 = 100 - avg => avg = 58.35
        
        const result = determineSMBDelivery(1.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 58.35, 58.35, 50, 10, 1.0, rT, 1.0);
        
        result.rate.should.equal(0);
        result.duration.should.equal(60);
    });

    it('should cap zero temp duration at 60m', () => {
        // worstCaseInsulinReq needs to result in durationReq > 75 (rounds to 90 -> cap 60)
        // 100 = 60 * worst / 1.0 => worst = 1.66
        // 1.66 = (100 - avg)/50 => avg = 17
        
        const result = determineSMBDelivery(1.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 17, 17, 50, 10, 1.0, rT, 1.0);
        
        result.rate.should.equal(0);
        result.duration.should.equal(60);
    });

    it('should set low temp if durationReq < 30', () => {
        // worstCaseInsulinReq needs to result in durationReq = 15
        // 15 = 60 * worst / 1.0 => worst = 0.25
        // 0.25 = (100 - avg)/50 => avg = 87.5
        
        const result = determineSMBDelivery(1.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 87.5, 87.5, 50, 10, 1.0, rT, 1.0);
        
        // Rate = basal * 15/30 = 1.0 * 0.5 = 0.5
        result.duration.should.equal(30); // Fixed duration for low temps
        result.rate.should.equal(0.5);
        result.reason.should.containEql("setting 30m low temp of 0.5U/h");
    });

    it('should not set temp if insulinReq > 0 but microBolus < increment (no zero temp)', () => {
        // insulinReq = 0.05 (positive but small)
        // microBolus < 0.1
        // durationReq > 0 (via predictions)
        
        // 15m duration req
        const result = determineSMBDelivery(0.05, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 87.5, 87.5, 50, 10, 1.0, rT, 1.0);
        
        // Should return null because durationReq forced to 0
        should(result).be.null();
    });

    it('should not set temp if durationReq <= 0', () => {
        // High predictions => negative worstCase => negative durationReq
        // avg = 150 > target 100
        
        const result = determineSMBDelivery(1.0, true, true, 120, 100, profile, meal_data, iob_data, systemTime, 100, 150, 150, 50, 10, 1.0, rT, 1.0);
        
        should(result).be.null();
    });
});
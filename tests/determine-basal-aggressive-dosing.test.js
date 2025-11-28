'use strict';

var should = require('should');

// Extracted logic from determine-basal.js that corresponds to DosingEngine.calculateInsulinRequired
// This logic starts around line 1476 in the original file.
function calculateInsulinRequired(
    minPredBG,
    eventualBG,
    target_bg,
    sens,
    max_iob,
    current_iob,
    rT
) {
    // Reference line 1500: insulinReq = round( (Math.min(minPredBG,eventualBG) - target_bg) / sens, 2);
    function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale;
    }

    var insulinReq = round( (Math.min(minPredBG,eventualBG) - target_bg) / sens, 2);

    // Reference line 1503: if (insulinReq > max_iob-iob_data.iob)
    if (insulinReq > max_iob - current_iob) {
        rT.reason += "max_iob " + max_iob + ", ";
        insulinReq = round(max_iob - current_iob, 2);
    }

    rT.insulinReq = insulinReq;
    return insulinReq;
}

describe('Aggressive Dosing: calculateInsulinRequired', function() {

    let rT;

    beforeEach(() => {
        rT = { reason: '' };
    });

    it('should calculate insulin required based on minPredBG when it is lower', () => {
        // minPredBG (150) < eventualBG (180)
        // (150 - 100) / 50 = 1.0 U
        const result = calculateInsulinRequired(150, 180, 100, 50, 5, 0, rT);
        result.should.equal(1.0);
        rT.insulinReq.should.equal(1.0);
    });

    it('should calculate insulin required based on eventualBG when it is lower', () => {
        // eventualBG (140) < minPredBG (160)
        // (140 - 100) / 40 = 1.0 U
        const result = calculateInsulinRequired(160, 140, 100, 40, 5, 0, rT);
        result.should.equal(1.0);
        rT.insulinReq.should.equal(1.0);
    });

    it('should cap insulinReq at max_iob - current_iob', () => {
        // (200 - 100) / 20 = 5.0 U required
        // max_iob (3) - current_iob (1) = 2.0 U available space
        const result = calculateInsulinRequired(200, 200, 100, 20, 3, 1, rT);
        result.should.equal(2.0);
        rT.reason.should.containEql("max_iob 3");
    });

    it('should not cap if insulinReq is within max_iob limits', () => {
        // (140 - 100) / 20 = 2.0 U required
        // max_iob (5) - current_iob (1) = 4.0 U available space
        const result = calculateInsulinRequired(140, 140, 100, 20, 5, 1, rT);
        result.should.equal(2.0);
        rT.reason.should.not.containEql("max_iob");
    });

    it('should handle negative IOB increasing available space', () => {
        // (200 - 100) / 20 = 5.0 U required
        // max_iob (3) - current_iob (-1) = 4.0 U available space
        const result = calculateInsulinRequired(200, 200, 100, 20, 3, -1, rT);
        result.should.equal(4.0);
        rT.reason.should.containEql("max_iob 3");
    });
    
    it('should handle negative insulinReq correctly', () => {
        // (90 - 100) / 50 = -0.2 U
        const result = calculateInsulinRequired(90, 95, 100, 50, 5, 0, rT);
        result.should.equal(-0.2);
    });

    it('should round calculations to 2 decimal places', () => {
        // (133 - 100) / 30 = 1.1
        const result = calculateInsulinRequired(133, 133, 100, 30, 5, 0, rT);
        result.should.equal(1.1);
    });
});

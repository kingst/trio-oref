'use strict';

require('should');

// Function under test
function round(value, digits) {
    if (!digits) { digits = 0; }
    var scale = Math.pow(10, digits);
    return Math.round(value * scale) / scale;
}

function calculate_expected_delta(target_bg, eventual_bg, bgi) {
    // (hours * mins_per_hour) / 5 = how many 5 minute periods in 2h = 24
    var five_min_blocks = (2 * 60) / 5;
    var target_delta = target_bg - eventual_bg;
    return round(bgi + (target_delta / five_min_blocks), 1);
}

describe('determine-basal-delta', function () {
    it('should return glucoseImpact when delta is smaller than one 5-min block', function () {
        const result = calculate_expected_delta(120, 100, 2);
        result.should.be.approximately(2.8, 0.0001);
    });

    it('should add 1 to glucoseImpact when delta spans exactly one block', function () {
        const result = calculate_expected_delta(124, 100, 1.5);
        result.should.equal(2.5);
    });

    it('should use integer division when delta spans multiple blocks', function () {
        const result = calculate_expected_delta(140, 100, 0);
        result.should.be.approximately(1.7, 0.0001);
    });

    it('should yield negative adjustment when blocks exceed delta', function () {
        const result = calculate_expected_delta(80, 100, 0);
        result.should.be.approximately(-0.8, 0.0001);
    });

    it('should handle fractional eventual glucose', function () {
        const result = calculate_expected_delta(125.5, 100, 0);
        result.should.be.approximately(1.1, 0.0001);
    });

    it('should handle fractional glucose impact', function () {
        const result = calculate_expected_delta(124, 100, 1.27);
        result.should.equal(2.3);
    });

    it('should handle extreme high eventual glucose', function () {
        const result = calculate_expected_delta(120, 350, 0);
        result.should.be.approximately(-9.6, 0.0001);
    });

    it('should handle extreme low eventual glucose', function () {
        const result = calculate_expected_delta(120, 39, 0);
        result.should.be.approximately(3.4, 0.0001);
    });

    it('should handle low-unit inputs', function () {
        const result = calculate_expected_delta(5, 3, 1.7);
        result.should.be.approximately(1.8, 0.0001);
    });
});
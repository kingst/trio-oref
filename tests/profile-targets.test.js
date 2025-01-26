'use strict';

var should = require('should');
var _ = require('lodash');
var targets = require('../lib/profile/targets');

describe('Target Profile', function() {
    function target_input() {
	return _.cloneDeep({
            targets: [
		{ offset: 0, high: 120, low: 100, start: '00:00:00' },
		{ offset: 180, high: 110, low: 90, start: '03:00:00' },
		{ offset: 360, high: 130, low: 110, start: '06:00:00' }
            ]
	});
    }

    function temptargets_input() {
	return _.cloneDeep([
            {
		targetTop: 100,
		targetBottom: 80,
		duration: 120,
		created_at: new Date('2025-01-26T02:00:00')
            }
	]);
    }

    var profile = {};

    it('should return correct target from schedule', function() {
        var now = new Date('2025-01-26T01:00:00');
        var result = targets.lookup({targets: target_input(), temptargets: temptargets_input()}, profile, now);
        result.high.should.equal(100);
        result.low.should.equal(100);
    });

    it('should use the profile override', function() {
        var now = new Date('2025-01-26T01:00:00');
        var result = targets.lookup({targets: target_input(), temptargets: temptargets_input()}, {target_bg: 110}, now);
        result.high.should.equal(110);
        result.low.should.equal(110);
    });

    it('should handle target schedule changes', function() {
        var now = new Date('2025-01-26T04:00:00');
        var result = targets.lookup({targets: target_input(), temptargets: temptargets_input()}, profile, now);
        result.high.should.equal(90);
        result.low.should.equal(90);
    });

    it('should handle temp targets', function() {
        var now = new Date('2025-01-26T02:30:00'); // Within temp target duration
        var result = targets.lookup({targets: target_input(), temptargets: temptargets_input()}, profile, now);
        result.high.should.equal(100);
        result.low.should.equal(80);
        result.temptargetSet.should.equal(true);
    });

    it('should handle temp target cancellation', function() {
        var cancel_temptarget = [{
            targetTop: 0,
            targetBottom: 0,
            duration: 0,
            created_at: new Date('2025-01-26T02:30:00')
        }];
        var now = new Date('2025-01-26T02:45:00');
        var result = targets.lookup({targets: target_input(), temptargets: cancel_temptarget}, profile, now);
        result.high.should.equal(100);
        result.low.should.equal(100);
    });

    it('should bound target range for mmol/L input', function() {
        var mmol_targets = {
            targets: [
                { offset: 0, high: 4, low: 3, start: '00:00:00' }
            ]
        };
        var result = targets.bound_target_range(targets.lookup({targets: mmol_targets, temptargets: []}, profile));
        result.max_bg.should.equal(80);
        result.min_bg.should.equal(80);
    });

    it('should enforce hard limits on target range', function() {
        var extreme_targets = {
            targets: [
                { offset: 0, high: 250, low: 40, start: '00:00:00' }
            ]
        };
        var result = targets.bound_target_range(targets.lookup({targets: extreme_targets, temptargets: []}, profile));
        result.max_bg.should.equal(80);
        result.min_bg.should.equal(80);
    });
});

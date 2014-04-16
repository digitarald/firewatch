'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var exec = require('child_process').exec;

var Snapshot = require('./snapshot');

function B2GInfo(options) {
	this.device = null;
	this.throttle = 0;
	this.lag = 0;
	this.options = options || {};
}

util.inherits(B2GInfo, EventEmitter);

B2GInfo.prototype.resume = function() {
	if (this.running) {
		return;
	}
	this.running = true;
	this.nextPoll();
	this.emit('start');
}

B2GInfo.prototype.nextPoll = function(err) {
	if (!this.running) {
		return this.emit('end');
	}
	if (err && this.device) {
		this.emit('disconnected', err);
		this.device = null;
	}
	var bound = this.poll.bind(this, this.nextPoll.bind(this));
	if (!this.throttle) {
		process.nextTick(bound);
	} else {
		setTimeout(bound, Math.max(0, this.throttle - this.lag));
	}
};

B2GInfo.prototype.poll = function(done) {
	if (!this.device) {
		return this.pollDevice(done);
	}
	return this.pollInfo(done)
};

B2GInfo.prototype.pollDevice = function(done) {
	exec('adb devices', function(err, stdout, strerr) {
		var devices = stdout.split('\n').slice(1).filter(function(line, idx) {
			return line.trim() != '' && /\w+\t\w+/.test(line);
		}).map(function(line) {
			return line.split(/[\s]+/);
		});
		if (!devices.length) {
			done();
			return;
		}
		this.device = devices[0][0];
		this.emit('connected', this.device);
		done();
	}.bind(this));
};

B2GInfo.prototype.pollInfo = function(done) {
	var started = Date.now();
	exec('adb shell b2g-info', function(err, stdout, strerr) {
		if (err) {
			return done('adb shell failed');
		}
		if (stdout.toString().indexOf('b2g-info: not found') > -1) {
			this.emit('not-supported', 'no b2g info');
			return done();
		}

		var lag = Date.now() - started;
		this.lag = lag;
		var snapshot = new Snapshot(stdout, lag, this.options);

		if (Object.keys(snapshot.apps).length == 0) {
			done('empty snapshot ' + stdout);
			return;
		}

		this.emit('data', snapshot);

		done();
	}.bind(this));
};

module.exports = B2GInfo;

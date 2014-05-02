'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var exec = require('child_process').exec;

var Snapshot = require('./snapshot');

function B2GInfo(options) {
	this.device = null;
	this.throttle = 0;
	this.lag = 0;
	this.confirmed = false;
	this.notSupported = false;
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
	if (err && this.device && !this.notSupported) {
		this.emit('disconnected', this.device, err);
		this.notSupported = err;
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
			if (this.device) {
				console.log('[B2GInfo.pollDevice] remove device %s', this.device);
				this.device = null;
				this.notSupported = false;
			}
			done();
			return;
		}
		var device = devices[0][0];
		if (this.notSupported && this.device == device) {
			console.log('[B2GInfo.pollDevice] notSupported %s', device);
			return done();
		}
		console.log('[B2GInfo.pollDevice] %s', device);
		this.device = device;
		this.confirmed = false;
		this.notSupported = false;
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
			return done('b2g-info not found');
		}
		if (stdout.toString().indexOf('B2G main process not found') > -1) {
			return done('B2G main process not found');
		}
		if (stdout.toString().indexOf('Fatal error') > -1) {
			return done(stdout);
		}

		var lag = Date.now() - started;
		this.lag = lag;
		var snapshot = new Snapshot(stdout, lag, this.options);

		if (Object.keys(snapshot.apps).length == 0) {
			return done(stdout);
		}

		if (!this.confirmed) {
			this.emit('connected', this.device);
		}
		this.confirmed = true;

		this.emit('data', snapshot);

		done();
	}.bind(this));
};

module.exports = B2GInfo;

'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var winston = require('winston');
var exec = require('child_process').exec;

var Snapshot = require('./snapshot');

function B2GInfo(paths) {
	this.paths = paths;
	this.device = null;
	this.throttle = 0;
	this.lag = 0;
	this.confirmed = false;
	this.notSupported = false;
	this.snapshot = null;
	exec(this.paths.adb + ' version', {
		cwd: this.paths.tmp
	}, function(err, stdout, strerr) {
		var version = (stdout || strerr).match(/version\s+([\d.]+)/i);
		if (!version) {
			winston.error('[b2ginfo] adb not found at %s', this.paths.adb);
		} else {
			winston.info('[b2ginfo] Using adb %s', version[1]);
		}
	});
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
		winston.error('[b2ginfo] b2g-info failed', err);
		this.notSupported = err;
	}
	var bound = this.poll.bind(this, this.nextPoll.bind(this));
	if (!this.throttle) {
		process.nextTick(bound);
	} else {
		setTimeout(bound, Math.max(0, this.throttle - this.lag));
	}
};

B2GInfo.prototype.poll = function(done) {
	if (!this.device || this.notSupported) {
		return this.pollDevice(done);
	}
	return this.pollInfo(done)
};

B2GInfo.prototype.pollDevice = function(done) {
	exec(this.paths.adb + ' devices', function(err, stdout, strerr) {
		var devices = stdout.split('\n').slice(1).filter(function(line, idx) {
			return line.trim() != '' && /\w+\t\w+/.test(line);
		}).map(function(line) {
			return line.split(/[\s]+/);
		});
		if (!devices.length) {
			if (this.device) {
				winston.info('[b2ginfo] disconnected device %s', this.device);
				this.device = null;
				this.notSupported = false;
			}
			done();
			return;
		}
		var device = devices[0][0];
		if (this.notSupported && this.device == device) {
			return done();
		}
		this.device = device;
		this.confirmed = false;
		this.notSupported = false;
		done();
	}.bind(this));
};

B2GInfo.prototype.pollInfo = function(done) {
	var started = Date.now();
	exec(this.paths.adb + ' shell b2g-info', {
		cwd: this.paths.tmp
	}, function(err, stdout, strerr) {
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
			return done('Fatal error ' + stdout);
		}

		var lag = Date.now() - started;
		this.lag = lag;
		var snapshot = new Snapshot(stdout, lag, this.device, this.snapshot);
		this.snapshot = snapshot;

		if (Object.keys(snapshot.apps).length == 0) {
			return done('Snapshot parse error ' + stdout);
		}

		if (!this.confirmed) {
			winston.info('[b2ginfo] connected device `%s`', this.device);
			this.emit('connected', this.device);
		}
		this.confirmed = true;

		this.emit('data', snapshot);

		done();
	}.bind(this));
};

module.exports = B2GInfo;

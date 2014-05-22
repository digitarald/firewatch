'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var path = require('path');
var fs = require('fs');
var winston = require('winston');
var exec = require('child_process').exec;

function Profiler(paths) {
	this.paths = paths;
	this.reset();
}

util.inherits(Profiler, EventEmitter);

Profiler.prototype.exec = function(args, next) {
	var bin = path.join(this.paths.b2g, 'profile.sh');
	if (!fs.existsSync(bin)) {
		winston.error('[profiler] Binary missing: %s', bin);
		return next('Binary missing: ' + bin);
	}
	var profiler = this;
	winston.info('[profiler] Exec `%s`', bin + ' ' + args.join(' '));
	exec(bin + ' ' + args.join(' '), {
		killSignal: 'SIGINT',
		cwd: this.paths.tmp
	}, next.bind(profiler));
}

Profiler.prototype.connect = function(device) {
	this.device = device;
	this.reset();
	this.exec(['ps'], function(err, stdout) {
		if (err) {
			return;
		}
		var re = /^\s*(\d+).+?\sprofiler\s(not)?/gm;
		var bits = null;
		while (bits = re.exec(stdout)) {
			if (!bits[2]) {
				var pid = Number(bits[1]);
				this.started.push(pid);
				this.emit('didStart', pid);
			}
		}
		if (this.started.length) {
			this.startedSys = true;
		}
	});
};

Profiler.prototype.disconnect = function() {
	this.device = null;
};

Profiler.prototype.reset = function() {
	this.started = [];
	this.startedSys = false;
};

Profiler.prototype.start = function(pid, done) {
	if (!this.startedSys) {
		this.startedSys = true;
		this.start('b2g', this.start.bind(this, pid, done));
	}
	if (this.started.indexOf(pid) != -1) {
		winston.info('[profiler] %s already started', pid);
		this.emit('didStart', null, pid);
		if (done) {
			done();
		}
		return;
	}
	this.exec(['start', '-p', pid], function(err, stdout, strerr) {
		if (err || strerr) {
			this.emit('didStart', err || strerr);
			if (done) {
				done();
			}
			return;
		}
		this.started.push(pid);
		winston.info('[profiler] %s started', pid);
		this.emit('didStart', null, pid);
		if (done) {
			done();
		}
	});
};

Profiler.prototype.capture = function(pid) {
	var time = Date.now();
	this.emit('willCapture', null, pid);
	this.exec(['capture', pid], function(err, stdout, strerr) {
		winston.info(stdout);
		var bits = (stdout || strerr).match(/\sinto\s(profile_[^.]+\.txt)/);
		if (!bits || !fs.existsSync(path.join(this.paths.tmp, bits[1]))) {
			winston.error('[profiler]', err || strerr || stdout);
			return this.emit('didCapture', err || strerr || stdout, pid);
		}
		var name = bits[1];
		var fromPath = path.join(this.paths.tmp, name);

		var targetName = name.replace(/\./, '_' + Date.now() + '.');
		var targetPath = path.join(this.paths.output, targetName);

		try {
			fs.writeFileSync(targetPath, fs.readFileSync(fromPath));
		} catch (e) {
			return this.emit('didCapture', 'Could not write profile to ' + targetPath, pid);
		}

		fs.unlinkSync(fromPath);
		winston.info('[profiler] captured %s into `%s`', pid, targetPath);

		this.emit('didCapture', null, pid, time, targetName);
	});
};

module.exports = Profiler;
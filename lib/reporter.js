'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var path = require('path');
var fs = require('fs');
var rimraf = require('rimraf');
var winston = require('winston');
var exec = require('child_process').exec;

function Reporter(paths) {
	this.paths = paths;
	exec('python --version', {
		cwd: this.paths.tmp
	}, function(err, stdout, strerr) {
		var version = (stdout || strerr).match(/python\s+([\d.]+)/i);
		if (!version) {
			winston.error('[reporter] python not found');
		} else {
			winston.info('[reporter] Using python %s', version[1]);
		}
	});
}

util.inherits(Reporter, EventEmitter);

Reporter.prototype.measure = function(noGCCC, minimize) {
	var time = Date.now();

	// Build paths
	var bin = path.join(this.paths.b2g, 'tools', 'get_about_memory.py');
	if (!fs.existsSync(bin)) {
		return this.emit('willMeasure', 'Missing binary: ' + bin);
	}
	this.emit('willMeasure');
	var cmd = ['MOZ_IGNORE_NUWA_PROCESS=1', bin];
	if (noGCCC) {
		cmd.push('--no-gc-cc-log');
	}
	if (minimize) {
		cmd.push('--minimize');
	}
	winston.info('[profiler] Exec `%s`', cmd.join(' '));
	exec(cmd.join(' '), {
		cwd: this.paths.tmp
	}, this.didMeasure.bind(this, time));
};

Reporter.prototype.didMeasure = function(time, err, stdout, strerr) {
	var bits = (stdout || strerr || '').match(/about:memory\?file=([^\s$]+)/);
	if (!bits || !fs.existsSync(bits[1])) {
		winston.error('[profiler] %s', err || strerr || stdout);
		return this.emit('didMeasure', err || strerr || stdout);
	}
	var file = bits[1];

	// Build paths
	var targetName = path.basename(file) + '_' + Date.now();
	var targetPath = path.join(this.paths.output, targetName);

	// Move file
	try {
		fs.writeFileSync(targetPath, fs.readFileSync(file));
	} catch (e) {
		return this.emit('didMeasure', 'Could not write report to ' + targetPath);
	}
	rimraf.sync(path.dirname(file));
	winston.info('[reporter] captured `%s`', targetPath);

	this.emit('didMeasure', null, time, targetName);
};

module.exports = Reporter;
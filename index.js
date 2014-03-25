var clivas = require('clivas');

var exec = require('child_process').exec;

var device = null;
var timeout = 0;

var apps = {};
var mem = {};

function watch(done) {
	if (!device) {
		exec('adb devices', function(err, stdout, strerr) {
			var devices = stdout.split('\n').slice(1).filter(function(line, idx) {
				return line.trim() != '' && /\w+\t\w+/.test(line);
			}).map(function(line) {
				return line.split(/[\s]+/);
			});
			if (!devices.length) {
				done(new Error('No device'));
				return;
			}
			device = devices[0][0];
			done();
		});
		return;
	}
	exec('adb shell b2g-info', function(err, stdout, strerr) {
		if (err) {
			done(err);
			return;
		}
		var section = 0;
		var headers = [];

		var result = stdout.split(/\r?\n/).slice(1).reduce(function(result, line) {
			if (line == '') {
				section++;
				return result;
			}
			switch (section) {
				case 0: // Apps header
					headers = line.match(/\s+[^\s]+/g);
					// console.log(headers);
					section++;
					break;
				case 1: // Apps
					var from = 0;
					var app = headers.reduce(function(app, header) {
						var len = header.length;
						app[header.trim().toLowerCase()] = line.substr(from, len).trim();
						from += len;
						return app;
					}, {});
					result.apps[app.pid] = app;
				case 2:
					break;
				case 3:
					var parts = line.trim().match(/([\w\s+()-]+[\w)])\s+([\d.]+)/);
					if (!parts.length) {
						section++;
						break;
					}
					result.mem[parts[1].toLowerCase()] = parts[2];
					break;
			}
			return result;
		}, {apps: [], mem: {}});

		clivas.clear();
		clivas.line(device);
		clivas.line('{yellow:{20:free:}} {bold:{8:' + (result.mem.free || '-') + '}}');
		clivas.line('{yellow:{20:cache:}} {bold:{8:' + (result.mem.cache || '-') + '}}');
		clivas.line('{yellow:{4:pid} {15:app} {8:uss} {8:pss}}');

		result.apps.forEach(function(app) {
			if (app.name.charAt(0) == '(') {
				return;
			}
			clivas.line('{4:' + app.pid + '} {15:' + app.name + '} {bold:{8:' + app.uss + '} {8:' + app.pss + '}}');
		});

		done();
	});
};

function nextWatch(err) {
	if (err) {
		device = null;
		clivas.clear();
		clivas.line('waiting for device');
	}
	var bound = watch.bind(null, nextWatch);
	if (!timeout) {
		process.nextTick(bound);
	} else {
		setTimeout(bound, timeout);
	}
};

watch(nextWatch);
#!/usr/bin/env node

var http = require('http');
var path = require('path');
var fs = require('fs');
var express = require('express');
var portfinder = require('portfinder');
var opener = require('opener');
var stylus = require('stylus');
var nib = require('nib');
var temp = require('temp');
var mkdirp = require('mkdirp');
var browserify = require('browserify-middleware');
var exec = require('child_process').exec;
var winston = require('winston');

var opts = require('nomnom')
	.option('port', {
		abbr: 'p',
		default: '8080',
		help: 'Port to use'
	})
	.option('address', {
		abbr: 'a',
		default: '0.0.0.0',
		help: 'Address to use'
	})
	.option('open', {
		abbr: 'o',
		default: false,
		flag: true,
		help: 'Open browser after starting the server'
	})
	.option('verbose', {
		abbr: 'v',
		default: false,
		flag: true,
		help: 'Verbose logging'
	})
	.option('adb-path', {
		abbr: 'a',
		help: 'ADB executable [adb in $PATH]'
	})
	.option('b2g-path', {
		abbr: 'b',
		default: path.normalize(path.join(__dirname, '..', 'tools/b2g')),
		help: 'B2G checkout (https://github.com/mozilla-b2g/B2G/)'
	})
	.option('output-path', {
		abbr: 'p',
		help: 'Directory for dumping logs, profiles, memory reports, etc. [tmp folder]'
	})
	.option('develop', {
		abbr: 'd',
		default: false,
		flag: true,
		help: 'For developing on Firewatch'
	})
	.parse();

winston.remove(winston.transports.Console)
	.add(winston.transports.Console, {
		level: opts.verbose ? 'info' : 'error'
	});

temp.track();

var sharedPaths = {
	tmp: temp.mkdirSync('firewatch'),
	b2g: path.resolve(opts['b2g-path']),
	adb: (opts['adb-path']) ? path.resolve(opts['adb-path']) : 'adb'
};
if (opts['output-path']) {
	sharedPaths.output = path.resolve(opts['output-path']);
} else {
	sharedPaths.output = path.join(sharedPaths.tmp, 'output');
}
if (!fs.existsSync(sharedPaths.output)) {
	mkdirp.sync(sharedPaths.output);
}
sharedPaths.output += path.sep;

var staticFolder = path.join(__dirname, '..', 'static');

/**
 * Server setup
 */
var app = express();
if (opts.verbose) {
	app.use(express.logger('dev'));
}

// CORS
app.use(function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
	if (req.method == 'OPTIONS') {
		res.send(200);
	}
	next();
});
app.use(stylus.middleware({
	src: staticFolder,
	force: true,
	compile: function(str, path) {
		return stylus(str)
			.set('filename', path)
			.use(nib())
			.import('nib');
	}
}));
app.get('/build.js', browserify(path.join(staticFolder, 'index.js'), {
	transform: ['reactify'],
	watch: opts.develop,
	debug: opts.verbose
}));
app.use(express.static(staticFolder));
app.use('/output', express.static(sharedPaths.output));
var server = http.createServer(app);

function started() {
	console.log('✓ Firewatch served on http://localhost:%d', opts.port);
	if (opts.open) {
		winston.info('Opening browser');
		opener('http://127.0.0.1:' + opts.port);
	}
}

if (!opts.port) {
	portfinder.basePort = 8080;
	portfinder.getPort(function(err, port) {
		if (err) {
			throw err;
		}
		opts.port = port;
		server.listen(port, started);
	});
} else {
	server.listen(opts.port, started);
}

/**
 * Device code
 */

var B2GInfo = require('./b2g_info');
var Profiler = require('./profiler');
var Reporter = require('./reporter');
var Snapshot = require('./snapshot');

var b2ginfo = new B2GInfo(sharedPaths);
var profiler = new Profiler(sharedPaths);
var reporter = new Reporter(sharedPaths);

var state = {
	device: null,
	snapshots: [],
	profiles: {},
	reports: [],
	options: sharedPaths,
	prefs: {
		throttle: 500,
		autoProfile: false,
		maxSnapshots: 0
	},
	killed: []
};
b2ginfo.throttle = state.prefs.throttle;

/**
 * Websocket protocol
 */
var io = require('socket.io').listen(server, {
	logger: {
		debug: winston.debug,
		info: winston.info,
		error: winston.error,
		warn: winston.warn
	}
});
io.set('log level', opts.verbose ? 2 : 1);
io.set('transports', ['websocket']);
io.sockets.on('connection', function(socket) {
	if (opts.verbose) {
		winston.info('[server] initialize for %s with %d snapshots',
			state.device, state.snapshots.length);
	}

	var previous = null;

	socket.emit('initialize', {
		device: state.device,
		snapshots: state.snapshots.map(function(snapshot) {
			var snap = Snapshot.reduce(snapshot, previous);
			previous = snapshot;
			return snap;
		}),
		didStartProfile: profiler.started,
		profiles: state.profiles,
		reports: state.reports,
		killed: state.killed,
		paths: sharedPaths,
		prefs: {
			throttle: b2ginfo.throttle,
			autoProfile: state.prefs.autoProfile
		}
	});

	socket.on('profile.start', function(pid) {
		profiler.start(pid);
	});
	socket.on('profile.capture', function(pid) {
		profiler.capture(pid);
	});
	socket.on('report', function() {
		reporter.measure();
	});
	socket.on('prefs', function(prefs) {
		state.prefs.throttle = b2ginfo.throttle = prefs.throttle;
		state.prefs.autoProfile = prefs.autoProfile;
	});
});

profiler.on('didStart', function(err, pid) {
	io.sockets.emit('profile.didStart', err, pid);
});
profiler.on('willCapture', function(err, pid) {
	io.sockets.emit('profile.willCapture', err, pid);
});
profiler.on('didCapture', function(err, pid, time, file) {
	if (err) {
		winston.error('profile.didCapture', err);
		return io.sockets.emit('profile.didCapture', err, pid);
	}
	var profile = {
		pid: pid,
		time: time,
		device: state.device,
		file: file
	};
	(state.profiles[pid] || (state.profiles[pid] = [])).push(profile);
	io.sockets.emit('profile.didCapture', err, pid, profile);
});

reporter.on('willMeasure', function(err) {
	io.sockets.emit('reporter.willMeasure', err);
});
reporter.on('didMeasure', function(err, time, file) {
	if (err) {
		winston.error('reporter.didMeasure', err);
		return io.sockets.emit('reporter.didMeasure', err);
	}
	var report = {
		time: time,
		device: state.device,
		file: file
	};
	state.reports.push(report);
	io.sockets.emit('reporter.didMeasure', null, report);
});

b2ginfo.on('data', function(newSnapshot) {
	var full = newSnapshot.toObject();
	var previous = state.snapshots[0];
	var snapshot = Snapshot.reduce(full, previous);
	state.snapshots.unshift(full);
	// Apply max length
	if (state.prefs.maxSnapshots && state.snapshots.length > state.prefs.maxSnapshots) {
		state.snapshots.length = state.prefs.maxSnapshots;
	}
	io.sockets.emit('snapshot', snapshot);

	if (snapshot.opened.length && state.prefs.autoProfile) {
		snapshot.opened.forEach(function(pid) {
			winston.info('[server] Auto profile %d', pid);
			profiler.start(pid);
		});
	}

	if (snapshot.closed.length) {
		exec('adb shell dmesg -c', function(err, stdout, strerr) {
			var killed = [];
			var killedIds = [];
			var lmkRe = /send\ssigkill\sto\s(\d+).+?size\s(\d+)/ig;
			var bits = [];
			while ((bits = lmkRe.exec(stdout))) {
				var pid = Number(bits[1]);
				winston.info('[server] LMK %d', pid);
				if (killedIds.indexOf(pid) == -1) {
					killedIds.push(pid);
					killed.push({
						type: 'lmk',
						pid: pid,
						time: snapshot.time,
						// size is number of 4kb compartment; converted to Mb here
						mem: Number(bits[2]) * 4 / 1024
					});
				}
			}
			var ommRe = /kill(?:ed)?\sprocess\s(\d+)/i;
			while ((bits = ommRe.exec(stdout))) {
				var pid = Number(bits[1]);
				winston.info('[server] OOM %d', pid);
				if (killedIds.indexOf(pid) == -1) {
					killedIds.push(pid);
					killed.push({
						type: 'oom',
						pid: pid
					});
				}
			}
			if (killed.length) {
				io.sockets.emit('killed', killed);
				state.killed = state.killed.concat(killed);
				var name = 'dmsg_' + Date.now() + '_' + killedIds.join('-') + '.log';
				fs.writeFileSync(path.join(sharedPaths.output, name), stdout);
			}
		});
	}
});
b2ginfo.on('connected', function(device) {
	state.device = device;
	profiler.connect();
	io.sockets.emit('connected', device);
});
b2ginfo.on('disconnected', function(err) {
	state.device = null;
	profiler.disconnect();
	io.sockets.emit('disconnected', String(err));
});

b2ginfo.resume();
#!/usr/bin/env node

var http = require('http');
var path = require('path');
var express = require('express');
var portfinder = require('portfinder');
var opener = require('opener');
var browserify = require('browserify-middleware');

var opts = require('nomnom')
	.option('port', {
		abbr: 'p',
		help: 'Port to use [8080]'
	})
	.option('address', {
		abbr: 'a',
		default: '0.0.0.0',
		help: 'Address to use [0.0.0.0]'
	})
	.option('open', {
		abbr: 'o',
		flag: true,
		help: 'Open browser window after staring the server'
	})
	.option('verbose', {
		abbr: 'v',
		flag: true,
		help: 'Verbose server logging'
	})
	.option('develop', {
		abbr: 'd',
		flag: true,
		help: 'Developer server, watch /static for changes'
	})
	.parse();

var B2GInfo = require('./b2g_info');

var staticFolder = path.normalize(path.join(__dirname, '..', 'static'));

var app = express();
if (opts.verbose) {
	app.use(express.logger('dev'));
}
app.get('/build.js', browserify(path.join(staticFolder, 'index.js'), {
	transform: ['reactify'],
	watch: opts.develop,
	debug: opts.verbose
}));
app.use(express.static(staticFolder));
var server = http.createServer(app);

function started(arg) {
	console.log('✓ Firewatch served on http://localhost:' + opts.port);
	if (opts.open) {
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

var b2ginfo = new B2GInfo();
b2ginfo.throttle = 500;

var snapshots = [];
var maxSnapshots = 1000;

var io = require('socket.io').listen(server, {
	log: opts.verbose
});
io.set('log level', opts.verbose ? 2 : 1);
io.sockets.on('connection', function(socket) {
	if (opts.verbose) {
		console.log('[server] initialize for %s with %d snapshots',
			b2ginfo.device, snapshots.length);
	}
	socket.emit('initialize', {
		device: b2ginfo.device,
		snapshots: snapshots,
		throttle: b2ginfo.throttle
	});
});

b2ginfo.on('data', function(newSnapshot) {
	var snapshot = newSnapshot.toObject(true);
	snapshots.unshift(snapshot);
	if (snapshots.length > maxSnapshots) {
		snapshots.length = maxSnapshots;
	}
	io.sockets.emit('snapshot', snapshot);
});
b2ginfo.on('connected', function(device) {
	if (opts.verbose) {
		console.log('[server] connected %s', device);
	}
	io.sockets.emit('connected', device);
});
b2ginfo.on('not-supported', function(err) {
	if (opts.verbose) {
		console.log('[server] disconnected %s', err);
	}
	io.sockets.emit('disconnected', String(err));
});
b2ginfo.on('disconnected', function(err) {
	if (opts.verbose) {
		console.log('[server] disconnected %s', err);
	}
	io.sockets.emit('disconnected', String(err));
});

b2ginfo.resume();
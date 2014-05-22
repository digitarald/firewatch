'use strict';

Snapshot.sysMatch = /\(Prealloc/;

function Snapshot(stdout, lag, device, compare) {
	this.apps = [];
	this.pids = [];
	this.mem = {};
	var time = this.time = Date.now();
	this.lag = lag;
	this.device = device;
	this.closed = [];
	this.opened = [];
	this.interval = 0;

	if (stdout == null) {
		return;
	}
	var section = 0;
	var headers = [];
	var pids = this.pids;

	stdout.split(/\r?\n/).some(function(line) {
		if (section > 0 && line.trim() == '') {
			section++;
			return;
		}
		switch (section) {
			case 0: // Apps header
				headers = line.match(/\s*[^\s]+/g);
				// Skip error lines (Failed to match, etc)
				if (!headers || headers[0].trim().toLowerCase() != 'name') {
					return;
				}
				section++;
				return;
			case 1: // Apps
				var from = 0;
				var app = headers.reduce(function(app, header) {
					var len = header.length;
					var key = sluggify(header);
					var value = line.substr(from, len).trim();
					if (/^\d+(\.\d+)?$/.test(value)) {
						value = Number(value);
					}
					app[key] = value;
					from += len;
					return app;
				}, {});
				if (!app.name) { // Buggy output
					return;
				}
				pids.push(app.pid);
				app.id = app.pid; // + '-' + sluggify(app.name);
				app.time = time;
				app.sys = (app.user == 'root') || Snapshot.sysMatch.test(app.name);
				this.apps.push(app);
			case 2: // Empty lines
				return;
			case 3: // Memory
				var parts = line.trim().match(/([\w\s+()-]+[\w)])\s+([\d.]+)/);
				if (!parts) {
					return;
				}
				var key = sluggify(parts[1]);
				this.mem[key] = Number(parts[2]);
				return;
			default: // Done
				return true;
		}
	}, this);

	if (compare && compare.device == device) {
		this.interval = time - compare.time;
		var comparePids = compare.apps.map(function(app) {
			return app.pid;
		});
		this.opened = pids.filter(function(id) {
			return comparePids.indexOf(id) == -1;
		});
		this.closed = comparePids.filter(function(id) {
			return pids.indexOf(id) == -1;
		});
	}

}

Snapshot.reduce = function(snapshot) {
	return {
		apps: snapshot.apps.map(function(app) {
			return {
				id: app.id,
				pid: app.pid,
				oomadj: app['oom_adj'],
				nice: app['nice'],
				name: app.name,
				mem: app.uss,
				time: app.time,
				sys: app.sys
			};
		}),
		mem: {
			total: snapshot.mem.total,
			free: snapshot.mem.free,
			cache: snapshot.mem.cache
		},
		time: snapshot.time,
		lag: snapshot.lag,
		interval: snapshot.interval,
		closed: snapshot.closed,
		opened: snapshot.opened
	};
};

Snapshot.prototype.toObject = function() {
	return {
		apps: this.apps,
		mem: this.mem,
		time: this.time,
		device: this.device,
		lag: this.lag,
		interval: this.interval,
		opened: this.opened,
		closed: this.closed
	};
};

function sluggify(str) {
	return str.toLowerCase().replace(/[^\w]+/g, ' ')
		.trim().replace(/\s+/g, '-');
}

module.exports = Snapshot;
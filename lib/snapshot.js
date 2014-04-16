
function Snapshot(stdout, lag, options) {
	this.apps = {};
	this.mem = {};
	var time = this.time = Date.now();
	this.lag = lag;

	options = options || {};

	if (stdout == null) {
		return;
	}
	var section = 0;
	var headers = [];

	stdout.split(/\r?\n/).slice(1).some(function(line) {
		if (line.trim() == '') {
			section++;
			return;
		}
		switch (section) {
			case 0: // Apps header
				headers = line.match(/\s+[^\s]+/g);
				section++;
				return;
			case 1: // Apps
				var from = 0;
				var app = headers.reduce(function(app, header) {
					var len = header.length;
					var key = header.trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/\-{2,}|\-$/, '');
					var value = line.substr(from, len).trim();
					if (/^\d+(\.\d+)?$/.test(value)) {
						value = Number(value);
					}
					app[key] = value;
					from += len;
					return app;
				}, {});
				if (!app.name) {
					return;
				}
				app.time = time;
				this.apps[app.pid] = app;
			case 2: // Empty lines
				return;
			case 3: // Memory
				var parts = line.trim().match(/([\w\s+()-]+[\w)])\s+([\d.]+)/);
				if (!parts) {
					return;
				}
				var key = parts[1].toLowerCase().replace(/[^\w]+/g, '-').replace(/\-{2,}|\-$/, '');
				this.mem[key] = Number(parts[2]);
				return;
			default: // Done
				return true;
		}
	}, this);
}

Snapshot.prototype.toObject = function() {
	return {
		apps: this.apps,
		mem: this.mem,
		time: this.time,
		lag: this.lag
	};
};

module.exports = Snapshot;
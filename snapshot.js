
function Snapshot(stdout) {
	this.apps = {};
	this.mem = {};

	if (stdout != null) {
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
					break;
				case 1: // Apps
					var from = 0;
					var app = headers.reduce(function(app, header) {
						var len = header.length;
						var key = header.trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/\-{2,}|\-$/, '');
						app[key] = line.substr(from, len).trim();
						from += len;
						return app;
					}, {});
					this.apps[app.pid] = app;
				case 2: // Empty lines
					break;
				case 3: // Memory
					var parts = line.trim().match(/([\w\s+()-]+[\w)])\s+([\d.]+)/);
					if (!parts) {
						break;
					}
					var key = parts[1].toLowerCase().replace(/[^\w]+/g, '-').replace(/\-{2,}|\-$/, '');
					this.mem[key] = parts[2];
					break;
				default: // Done
					return true;
			}
		}, this);
	}
}

module.exports = Snapshot;
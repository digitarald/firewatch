var assert = require('assert');
var fs = require('fs');

var Snapshot = require('./../snapshot');

describe('Snapshot', function() {

	describe('#constructor()', function() {
		it('should parse a 1.3 b2g-info format', function() {
			var file = fs.readFileSync(__dirname + '/b2g-info-1-3.txt');
			var snapshot = new Snapshot(file.toString());

			snapshot.apps.should.be.an.Object;
			snapshot.apps.should.have.keys('111', '370', '397', '425', '1109', '1230', '1521');
			snapshot.apps['111'].should.keys('name', 'pid', 'ppid', 'cpu-s', 'nice', 'uss', 'pss', 'rss', 'vsize', 'oom_adj', 'user');

			snapshot.mem.should.be.an.Object;
			snapshot.mem.should.keys('total', 'used-cache', 'b2g-procs-pss', 'non-b2g-procs', 'free-cache', 'free', 'cache');
		})
	});

});

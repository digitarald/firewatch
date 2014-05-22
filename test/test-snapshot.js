var assert = require('assert');
var fs = require('fs');

var Snapshot = require('./../lib/snapshot');

describe('Snapshot', function() {

	describe('#constructor()', function() {
		it('should parse a 1.3 b2g-info format', function() {
			var file = fs.readFileSync(__dirname + '/b2g-info-1-3.txt');
			var snapshot = new Snapshot(file.toString());

			snapshot.apps.should.be.an.Object;
			snapshot.pids.should.eql([111, 370, 397, 425, 1109, 1230, 1521]);
			snapshot.apps[0].should.have.keys('id', 'time', 'sys', 'name', 'pid', 'ppid', 'cpu-s', 'nice', 'uss', 'pss', 'rss', 'vsize', 'oom_adj', 'user');

			snapshot.mem.should.be.an.Object;
			snapshot.mem.should.have.keys('total', 'used-cache', 'b2g-procs-pss', 'non-b2g-procs', 'free-cache', 'free', 'cache');
		});

		it('should parse a startup b2g-info format', function() {
			var file = fs.readFileSync(__dirname + '/b2g-startup.txt');
			var snapshot = new Snapshot(file.toString());

			snapshot.apps.should.be.an.Object;
			snapshot.pids.should.eql([287]);
			snapshot.apps[0].should.have.keys('id', 'time', 'sys', 'name', 'pid', 'ppid', 'cpu-s', 'nice', 'uss', 'pss', 'rss', 'vsize', 'oom_adj', 'user');

			snapshot.mem.should.be.an.Object;
			snapshot.mem.should.keys('total', 'used-cache', 'b2g-procs-pss', 'non-b2g-procs', 'free-cache', 'free', 'cache');
		})
	});

});

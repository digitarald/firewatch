/** @jsx React.DOM */

var cx = React.addons.classSet;

var Apps = React.createClass({
	getInitialState: function() {
		return {
			connected: false,
			device: null,
			lastDevice: null,
			snapshots: [],
			hidden: [],
			hideSystem: true,
			hideDead: false,
			deviceInit: false,
			size: {width: 640, height: 480},
			didStartProfile: [],
			willProfile: [],
			profiles: {},
			reports: [],
			killed: [],
			willMeasure: false,
			graphSpan: 120000,
			meanSpan: 10000,
			paths: null,
			prefs: null
		};
	},

	updatePref: function(key, value) {
		var prefs = _.clone(this.state.prefs || {});
		prefs[key] = (value != null) ? value : !prefs[key];
		this.socket.emit('prefs', prefs);
		this.setState({
			prefs: prefs
		});
	},

	handleAppInitialize: function(data) {
		this.setState({
			connected: true,
			snapshots: data.snapshots,
			didStartProfile: data.didStartProfile,
			profiles: data.profiles,
			reports: data.reports,
			device: data.device,
			killed: data.killed,
			paths: data.paths,
			prefs: data.prefs
		});
	},

	handleDisconnect: function() {
		this.setState({
			connected: false
		});
	},

	handleAppSnapshot: function(snapshot) {
		this.setState({
			snapshots: [snapshot].concat(this.state.snapshots)
		});
	},

	handleDeviceConnected: function(device) {
		document.title = 'Firewatch: ' + device;
		this.setState({device: device, lastDevice: null});
	},

	handleDeviceDisconnected: function(error) {
		document.title = 'Firewatch';
		this.setState({
			device: null,
			lastDevice: this.state.lastDevice,
			deviceError: error
		});
	},

	handleKilled: function(killed) {
		this.setState({
			killed: this.state.killed.concat(killed)
		});
	},

	componentDidMount: function(root) {
		var socket = io.connect(location.origin, {
			'max reconnection attempts': 999,
			'try multiple transports': false
		});
		this.socket = socket;
		socket.on('disconnect', this.handleDisconnect);
		socket.on('initialize', this.handleAppInitialize);
		socket.on('snapshot', this.handleAppSnapshot);
		socket.on('connected', this.handleDeviceConnected);
		socket.on('disconnected', this.handleDeviceDisconnected);
		socket.on('killed', this.handleKilled);
		socket.on('profile.didStart', this.handleProfileDidStart);
		socket.on('profile.willCapture', this.handleProfileWillCapture);
		socket.on('profile.didCapture', this.handleProfileDidCapture);
		socket.on('reporter.willMeasure', this.handleReportWillMeasure);
		socket.on('reporter.didMeasure', this.handleReportDidMeasure);
		window.addEventListener('resize', this.handleResize);
		this.handleResize();
	},

	componentDidUpdate: function() {
		var side = this.refs.sidebar.getDOMNode();
		var size = [side.offsetWidth, side.offsetHeight];
		if (!this.pastSize || !_.isEqual(size, this.pastSize)) {
			this.pastSize = size;
			this.handleResize();
		}
	},

	handleResize: function() {
		if (!this.refs.graph) {
			return;
		}
		var element = this.refs.graph.getDOMNode();
		this.setState({
			size: {
				width: element.offsetWidth,
				height: element.offsetHeight
			}
		});
	},

	handleAppToggle: function(id, state, sys, dead) {
		if (dead && this.state.hideDead) {
			this.setState({
				hideDead: false
			});
			return;
		}
		if (sys && this.state.hideSystem) {
			this.setState({
				hideSystem: false
			});
			return;
		}
		var hidden = this.state.hidden.slice();
		if (!state) {
			hidden.push(id);
		} else {
			_.pull(hidden, id);
		}
		this.setState({
			hidden: hidden
		});
	},

	handleToggleDead: function() {
		this.setState({
			hideDead: !this.state.hideDead
		});
	},

	handleToggleSystem: function() {
		this.setState({
			hideSystem: !this.state.hideSystem
		});
	},

	handleToggleAutoProfile: function() {
		this.updatePref('autoProfile');
	},

	handleChangeThrottle: function(evt) {
		var throttle = parseInt(evt.target.value) || 0;
		if (!isNaN(throttle) && throttle > 0) {
			this.updatePref('throttle', parseInt(evt.target.value));
		}
	},

	handleProfileStart: function(pid) {
		// FIXME: Hack
		this.socket.emit('profile.start', pid);
	},

	handleProfileDidStart: function(err, pid) {
		this.setState({
			didStartProfile: this.state.didStartProfile.concat(pid)
		});
	},

	handleProfileCapture: function(pid, disabled, evt) {
		evt.preventDefault();
		if (disabled) {
			return;
		}
		if (this.state.didStartProfile.indexOf(pid) == -1) {
			return this.handleProfileStart(pid);
		}
		if (this.state.willProfile.indexOf(pid) != -1) {
			return;
		}
		this.socket.emit('profile.capture', pid);
		this.setState({
			willProfile: this.state.willProfile.concat(pid)
		});
	},

	handleProfileWillCapture: function(err, pid) {
		if (err) {
			this.handleProfileDidCapture(err, pid);
		}
	},

	handleProfileDidCapture: function(err, pid, profile) {
		this.setState({
			willProfile: _.without(this.state.willProfile, pid)
		});
		if (err) {
			return alert('Capturing profile for ' + pid + ' failed:\n' + err);
		}
		var profiles = _.clone(this.state.profiles);
		var list = (profiles[profile.pid] || []).slice();
		list.push(profile);
		profiles[profile.pid] = list;
		this.setState({
			profiles: profiles
		});
	},

	handleReport: function() {
		this.setState({
			willMeasure: true
		});
		this.socket.emit('report');
	},

	handleReportWillMeasure: function(err) {
		if (err) {
			this.handleReportDidMeasure(err);
		}
	},

	handleReportDidMeasure: function(err, report) {
		this.setState({
			willMeasure: false
		});
		if (err) {
			return alert('Memory report failed\n' + err);
		}
		this.setState({
			reports: this.state.reports.concat(report)
		});
	},

	render: function () {
		if (!this.state.prefs) {
			return <main>Connecting …</main>
		}
		var snapshots = this.state.snapshots.slice(0, 500);
		if (this.state.snapshots.length > 500) {
			snapshots.push(this.state.snapshots.slice(-1)[0]);
			// console.log(this.state.snapshots.slice(-1));
		}
		var last = snapshots[0] || {
			apps: [],
			mem: {
				free: 0,
				cache: 0,
				total: 0
			}
		};
		var colorScale = d3.scale.category20();

		var hidden = this.state.hidden;
		var meanSpan = this.state.meanSpan;
		var hideSystem = this.state.hideSystem;
		var hideDead = this.state.hideDead;

		var avgs = {
			lag: new Avg(),
			interval: new Avg(),
			free: new Avg(),
			cache: new Avg()
		}

		var activeApps = _.pluck(last.apps, 'id');
		var appsByPid = {};

		var device = null;
		var startTime = 0;
		var flattened = snapshots.reduce(function(apps, snapshot, i) {
			if (device == null) {
				device = snapshot.device;
				startTime = snapshot.time;
			}
			if (!startTime || startTime - meanSpan < snapshot.time) {
				avgs.lag.add(snapshot.lag);
				if (snapshot.interval) {
					avgs.interval.add(snapshot.interval);
				}
				avgs.free.add(snapshot.mem.free);
				avgs.cache.add(snapshot.mem.cache);
			}

			return apps.concat(snapshot.apps.filter(function(app) {
				var record = appsByPid[app.id];
				var dead = activeApps.indexOf(app.id) == -1;
				if (!record) {
					if (!app.sys || !dead) {
						record = appsByPid[app.id] = {
							meta: app,
							created: app.time,
							mem: (new Avg().add(app.mem)),
							sys: app.sys,
							dead: dead
						};
					}

				} else {
					record.created = app.time;
					if (record.meta.time - meanSpan < app.time) {
						record.mem.add(app.mem);
					}
				}
				return !((hideSystem && app.sys) || (hideDead && record.dead) || _.contains(hidden, app.id));
			}));
		}, []);
		var groupedSnapshots = _.groupBy(flattened, 'pid');

		var timeRange = [
			_.min(flattened, 'time').time,
			_.max(flattened, 'time').time
		];
		var timeDrawRange = [timeRange[1] - this.state.graphSpan, timeRange[1]];

		var filtered = _.filter(flattened, function(snapshot) {
			return snapshot.time >= timeDrawRange[0] && snapshot.time <= timeDrawRange[1]
		});

		var memDrawRange = [
			_.min(filtered, 'mem').mem,
			_.max(filtered, 'mem').mem
		];

		var allApps = _.toArray(appsByPid);

		var colors = this.colors || (this.colors = {});
		_.sortBy(allApps, ['created']).forEach(function(entry, i) {
			if (!colors[entry.meta.pid]) {
				colors[entry.meta.pid] = null;
			}
		});
		_.forEach(colors, function(color, pid) {
			colors[pid] = colorScale(pid);
		})

		var header = false;

		var apps = [];
		_.sortBy(allApps, ['dead', 'sys', 'created']).forEach(function(entry) {
			var app = entry.meta;
			var key = 'row-' + app.id;
			var style = {
				color: colors[app.pid]
			};
			var backgroundStyle = {
				backgroundColor: colors[app.pid]
			};
			var checked = hidden.indexOf(app.id) < 0;
			var rowCls = {};
			var iconCls = {
				'fa': true,
				'fa-fw': true
			};
			var disabled = false;
			var hide = false;
			var status = '';

			if (entry.dead) {
				var killed = this.state.killed.filter(function(details) {
					return details.pid == app.pid;
				})[0] || null;
				if (killed) {
					status += killed.type.toUpperCase();
					if (killed.mem) {
						status += ' (' + round(killed.mem) + ' MB)';
					}
				}

				if (header != 'dead') {
					header = 'dead';
					var deadIconCls = {
						'fa': true,
						'fa-fw': true,
						'fa-eye-slash': hideDead,
						'fa-eye': !hideDead
					};
					apps.push(
						<tr className='split' key='split-dead' onClick={this.handleToggleDead}>
							<td><i className={cx(deadIconCls)}></i></td>
							<th colSpan='6'>
								Killed
							</th>
						</tr>
					);
				}
				rowCls.dead = true;
				disabled = true;
				if (hideDead) {
					hide = true;
				}
			}
			if (hidden.indexOf(app.id) != -1) {
				hide = true;
			}
			if (app.sys) {
				if (header != 'sys') {
					header = 'sys';
					var sysIconCls = {
						'fa': true,
						'fa-fw': true,
						'fa-eye-slash': hideSystem,
						'fa-eye': !hideSystem
					};
					apps.push(
						<tr className='split' key='split-sys' onClick={this.handleToggleSystem}>
							<td><i className={cx(sysIconCls)}></i></td>
							<th colSpan='6'>
								System
							</th>
						</tr>
					);
				}
				rowCls.system = true;
				if (hideSystem) {
					hide = true;
				}
			}

			var name = (app.name.substr(0, 2) == '(P') ? '(Preallocated)' : app.name;

			var profileStarted = this.state.didStartProfile.indexOf(app.pid) != -1;
			var profileDisabled = !profileStarted
				|| this.state.willProfile.indexOf(app.pid) != -1;

			var profiles = (this.state.profiles[app.pid] || []).map(function(profile, idx) {
				var file = location.origin + '/output/'
					+ encodeURIComponent(profile.file);
				var url = 'http://people.mozilla.org/~bgirard/cleopatra/?customProfile=' + file;
				return (
					<li>
						<a href={url} target='_new'>
							{Math.round((profile.time - startTime) / 1000)}s
						</a>
					</li>
				);
			}, this).reverse();

			if (this.state.willProfile.indexOf(app.pid) != -1) {
				profiles.unshift((
					<li>
						<i className='fa fa-fw fa-spinner fa-spin'></i>
					</li>
				));
			}

			iconCls[(hide ? 'fa-eye-slash' : 'fa-eye')] = true;
			if (hide) {
				rowCls.hidden = true;
			}

			var title = '#' + app.pid + ', nice: ' + app.nice + ' oom_adj: ' + app.oomadj;

			apps.push(
				<tr key={key} className={cx(rowCls)}>
					<td onClick={this.handleAppToggle.bind(this, app.id, hidden.indexOf(app.id) != -1, app.sys, entry.dead)}>
						<i className={cx(iconCls)} style={style}></i>
					</td>
					<th>
						<span style={style} className='name' title={title}>{name}</span>
						<small>{status}</small>
					</th>
					<td className='small'>
						<span title={entry.mem.toString()}>{round(app.mem, 1)}</span> <small>MB</small></td>
					<td className='buttons'>
						<label onClick={this.handleProfileCapture.bind(this, app.pid, disabled)}>
							<input type='checkbox' checked={profileStarted} disabled={disabled || profileStarted} />
							<button disabled={disabled || profileDisabled}>Profile</button>
						</label>
						<ul className='linklist'>{profiles}</ul>
					</td>
				</tr>
			);
		}, this);

		var reports = (this.state.reports || []).map(function(report, idx) {
			var file = this.state.paths.output + '/' + report.file;
			var url = 'about:memory?file=' + encodeURIComponent(file);
			return (
				<li>
					<a href={url} title='For security reasons force opening in a new tab by pressing the meta key'>
						{Math.round((report.time - startTime) / 1000)}s
					</a>
				</li>
			);
		}, this);

		var measureDisabled = this.state.willMeasure;
		if (measureDisabled) {
			reports.unshift((
				<li>
					<i className='fa fa-fw fa-spinner fa-spin'></i>
				</li>
			));
		}

		var connectionClass = 'fa fa-fw '
			+ (this.state.connected ? 'fa-chain' : 'fa-chain-broken');
		if (!this.state.device) {
			connectionClass += ' fa-spin';
		}

		return (
			<main>
				<header>
					<h1>
						<i className={connectionClass}></i>&nbsp;
						<span title='Device identifier'>
							{this.state.device ? (this.state.device) : 'Waiting for device'}
						</span>
						<small>{round(last.mem.total, 1)} <small>MB</small></small>
					</h1>
					<table>
						<tr>
							<th>Free:</th>
							<td>
								<span title={avgs.free.toString()}>{round(last.mem.free, 1)}</span> <small>MB</small>
							</td>
							<th>Sampling:</th>
							<td>
								<span title={avgs.interval.toString()}>{Math.round(avgs.interval.first)}</span> <small>ms</small>
								</td>
						</tr>
						<tr>
							<th>Swap:</th>
							<td>
								<span title={avgs.cache.toString()}>{round(avgs.cache.first, 1)}</span> <small>MB</small>
							</td>
							<th>ADB Lag:</th>
							<td>
								<span title={avgs.lag.toString()}>{Math.round(avgs.lag.first)}</span> <small>ms</small>
							</td>
						</tr>
					</table>
				</header>
				<article>
					<div ref='graph' className='graph'>
						<LineChart colors={colors} size={this.state.size} timeRange={timeRange} timeDrawRange={timeDrawRange} memDrawRange={memDrawRange} groupedSnapshots={groupedSnapshots} />
					</div>
					<aside ref='sidebar'>
						<section>
							<table className='apps-table'>
								<tbody>
									{apps}
								</tbody>
							</table>
						</section>
						<section>
							<div>
								<button onClick={this.handleReport} disabled={measureDisabled}>Report Memory</button>
								<ul className='linklist'>{reports}</ul>
							</div>
							<div className='prefs'>
								<label>
									<small>
										<span title='Lower sample rate = less performance impact'>Sampling (ms)</span>
									</small>
									<input type='number' defaultValue={this.state.prefs.throttle} onChange={this.handleChangeThrottle} />
								</label>
								<label>
									<small>
										<span title='Attach profiler to every new process'>Auto Profile</span>
									</small>
									<input type='checkbox' onChange={this.handleToggleAutoProfile} checked={this.state.prefs.autoProfile} />
								</label>
							</div>
						</section>
					</aside>
				</article>
			</main>
		)
	}
});

var Chart = React.createClass({
	render: function() {
		return (
			<svg width={this.props.width} height={this.props.height}>
				{this.props.children}
			</svg>
		);
	}
});

var DataSeries = React.createClass({
	getDefaultProps: function() {
		return {
			title: '',
			data: [],
			interpolate: 'linear'
		}
	},

	render: function() {
		var props = this.props;
		var yScale = props.yScale;
		var xScale = props.xScale;

		var path = d3.svg.line()
			.x(function(d) {
				return xScale(d.x);
			})
			.y(function(d) {
				return yScale(d.y);
			})
			.interpolate(props.interpolate);

		return (
			<path d={path(props.data)} stroke={props.color} strokeWidth='2' fill='none' />
		)
	}
});

var LineChart = React.createClass({
	render: function() {
		var groupedSnapshots = this.props.groupedSnapshots;
		var timeRange = this.props.timeRange;
		var timeDrawRange = this.props.timeDrawRange;
		var memDrawRange = this.props.memDrawRange;
		var size = this.props.size;

		var xScale = d3.scale.linear()
			.domain([
				timeDrawRange[0] - timeRange[0],
				timeDrawRange[1] - timeRange[0]
			])
			.range([0, size.width]);
		var yScale = d3.scale.linear()
			.domain([Math.max(memDrawRange[0] - 0.1, 0), memDrawRange[1] + 0.1])
			.nice()
			.range([size.height, 0]);
		var colors = this.props.colors;

		var dataSeries = _.mapValues(groupedSnapshots, function(snapshots, pid) {
			var series = snapshots.map(function(snapshot) {
				return {
					x: snapshot.time - timeRange[0],
					y: snapshot.mem
				};
			});
			pid = Number(pid);
			var key = 'series' + pid;
			var color = colors[pid];
			return (
				<DataSeries key={key} data={series} size={size} xScale={xScale} yScale={yScale} color={color} />
			);
		});

		var xTicks = xScale.copy().ticks((size.width > 650) ? 10 : 5).map(function(tick) {
			var left = xScale(tick);
			var label = Math.round(tick / 1000) + 's';
			var key = 'xtick' + String(tick);
			return (
				<g key={key} className='tick'>
					<text x={left + 3} y={size.height - 4}>{label}</text>
					<line x1={left} y1={0} x2={left} y2={size.height} />
				</g>
			);
		});

		var yTicks = yScale.ticks((size.height > 400) ? 10 : 5).map(function(tick) {
			var top = yScale(tick);
			var key = 'ytick' + String(tick);
			return (
				<g key={key} className='tick'>
					<line x1='0' y1={top} x2={size.width} y2={top} />
					<text x='2' y={top + 11}>{tick}</text>
				</g>
			);
		});

		return (
			<Chart width={this.props.size.width} height={this.props.size.height}>
				<g className="ticks yticks">{yTicks}</g>
				<g className="ticks xticks">{xTicks}</g>
				{dataSeries}
			</Chart>
		);
	}
});

function round(number, decimals) {
	return parseFloat(number).toFixed(1);
}

function Avg() {
	this.size = 0;
	this.sum = 0.0;
	this.sq = 0.0;
	this.max = Number.NEGATIVE_INFINITY;
	this.min = Number.POSITIVE_INFINITY;
	this.first = null;
	this.value = null;
}

Avg.prototype = {
	add: function(value) {
		this.size++;
		this.sum += value;
		this.sq += value * value;
		if (this.first == null) {
			this.first = value;
		}
		this.value = value;
		if (this.max < value) {
			this.max = value;
		}
		if (this.min > value) {
			this.min = value;
		}
		return this;
	},

	get mean() {
		if (!this.size) {
			return 0;
		}
		return this.sum / this.size;
	},

	get sd() {
		if (this.size < 2) {
			return 0;
		}
		return Math.sqrt(
			(this.sq - (this.sum * this.sum / this.size)) /
			(this.size - 1)
		);
	},

	toString: function() {
		return 'min/max ' + round(this.min) + '/' + round(this.max)
			+ ', ~' + round(this.mean) + ' ±' + round(this.sd);
	}
};

window.addEventListener('load', function () {
	React.renderComponent(
		<Apps/>,
		document.getElementById('content')
	);
});

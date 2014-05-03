/** @jsx React.DOM */

var _ = require('lodash');
var d3 = require('d3');
var React = require('react');

var Apps = React.createClass({
	getInitialState: function() {
		return {
			device: null,
			snapshots: [],
			hidden: [],
			hideSystem: true,
			hideDead: true,
			deviceInit: false,
			size: {width: 640, height: 480},
			resized: false,
			timeSpan: 60000,
			avgSpan: 10000
		};
	},

	handleAppInitialize: function(data) {
		this.setState({
			snapshots: data.snapshots,
			device: data.device
		});
	},

	handleAppUpdate: function(snapshot) {
		var snapshots = this.state.snapshots.slice();
		snapshots.unshift(snapshot);
		this.setState({
			snapshots: snapshots
		});
	},

	handleAppConnected: function(device) {
		this.setState({device: device, deviceInit: true});
	},

	handleAppDisconnected: function(error) {
		this.setState({device: null, deviceError: error});
	},

	componentDidMount: function(root) {
		var socket = io.connect(location.origin);
		socket.on('initialize', this.handleAppInitialize);
		socket.on('snapshot', this.handleAppUpdate);
		socket.on('connected', this.handleAppConnected);
		socket.on('disconnected', this.handleAppDisconnected);
		window.addEventListener('resize', this.handleResize);
		document.body.addEventListener('scroll', this.handleResize);
		this.handleResize();
	},

	componentDidUpdate: function() {
		if (this.state.resized || !this.state.snapshots.length) {
			return;
		}
		this.state.resized = true;
		this.handleResize();
	},

	handleResize: function(evt) {
		var element = this.refs.graph.getDOMNode();
		this.setState({
			size: {
				width: element.offsetWidth,
				height: element.offsetHeight
			}
		});
	},

	handleAppCheckbox: function(evt) {
		var appId = evt.target.name;
		var hidden = this.state.hidden.slice();
		if (evt.target.checked) {
			hidden.push(appId);
		} else {
			_.pull(hidden, appId);
		}
		this.setState({
			hidden: hidden
		});
	},

	render: function () {
		var snapshots = this.state.snapshots.slice(0, 250);
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
		var avgSpan = this.state.avgSpan;
		var hideSystem = this.state.hideSystem;
		var hideDead = this.state.hideDead;

		var activeApps = _.pluck(last.apps, 'id');
		var appsByPid = {};
		var flattened = _.reduce(snapshots, function(apps, snapshot) {
			return apps.concat(_.reject(snapshot.apps, function(app) {
				var record = appsByPid[app.id];
				var dead = !_.contains(activeApps, app.id)
				if (!record) {
					if (!app.sys || !dead) {
						appsByPid[app.id] = {
							meta: app,
							created: app.time,
							memSum: app.mem,
							memSq: app.mem * app.mem,
							snapshots: 1,
							memMin: app.mem,
							memMax: app.mem,
							sys: app.sys,
							dead: dead
						};
					}

				} else {
					record.created = app.time;
					if (record.meta.time - avgSpan < app.time) {
						record.memSum += app.mem;
						record.memSq += app.mem * app.mem;
						record.snapshots++;
						if (record.memMin > app.mem) {
							record.memMin = app.mem;
						}
						if (record.memMax < app.mem) {
							record.memMax = app.mem;
						}
					}
				}
				return (hideSystem && app.sys) || (hideDead && app.dead) || _.contains(hidden, app.id);
			}));
		}, []);
		var groupedSnapshots = _.groupBy(flattened, 'pid');

		var timeRange = [
			_.min(flattened, 'time').time,
			_.max(flattened, 'time').time
		];
		var timeDrawRange = [timeRange[1] - this.state.timeSpan, timeRange[1]];

		var filtered = _.filter(flattened, function(snapshot) {
			return snapshot.time >= timeDrawRange[0] && snapshot.time <= timeDrawRange[1]
		});

		var memDrawRange = [
			_.min(filtered, 'mem').mem,
			_.max(filtered, 'mem').mem
		];

		var allApps = _.toArray(appsByPid);
		_.forEach(_.sortBy(allApps, ['created']), function(entry) {
			entry.color = colorScale(entry.meta.pid);
		});

		var apps = _.map(_.sortBy(allApps, ['dead', 'sys', 'created']), function(entry) {
			var app = entry.meta;
			var key = 'row-' + app.id;
			var style = {
				color: entry.color
			};
			var backgroundStyle = {
				backgroundColor: entry.color
			};
			var checked = hidden.indexOf(app.id) > -1;
			var clsName = [];
			var disabled = false;
			if (entry.dead) {
				clsName.push('dead');
				if (hideDead) {
					clsName.push('hidden');
					disabled = true;
				}
			}
			if (hidden.indexOf(app.id) > -1) {
				clsName.push('hidden');
			}
			if (app.sys) {
				clsName.push('system');
				if (hideSystem) {
					clsName.push('hidden');
					disabled = true;
				}
			}

			var mean = entry.memSum / entry.snapshots;
			var sd = Math.sqrt(
				(entry.memSq - (entry.memSum * entry.memSum / entry.snapshots)) / (entry.snapshots - 1));
			var name = (app.name.substr(0, 2) == '(P') ? '(Preallocated)' : app.name;
			return (
				<tr key={key} className={clsName.join(' ')}>
					<th style={style} title={app.pid}>
						<label>
							<span className='icon' style={backgroundStyle} />
							<input type='checkbox' name={app.id} checked={checked} onChange={this.handleAppCheckbox} disabled={disabled} />&nbsp;
							<span className='name'>{name}</span>
						</label>
					</th>
					<td>{round(app.mem, 1)} <small>Mb</small></td>
					<td>
						<div>+ {round(entry.memMax, 1)}</div>
						<div>- {round(entry.memMin, 1)}</div>
					</td>
					<td>
						<div>~ {isNaN(mean) ? '0.0' : round(mean, 1)}</div>
						<div>± {isNaN(sd) ? '0.0' : round(sd, 1)}</div>
					</td>
				</tr>
			);
		}, this);

		return (
			<main>
				<header>
					<h1>
						{this.state.device || '(no device)'}
					</h1>
					<table>
						<tr>
							<th>Total:</th>
							<td>{d3.round(last.mem.total, 1)} <small>Mb</small></td>
							<th>Free:</th>
							<td>{d3.round(last.mem.free, 1)} <small>Mb</small></td>
							<th>Swap:</th>
							<td>{d3.round(last.mem.cache, 1)} <small>Mb</small></td>
						</tr>
					</table>
				</header>
				<article>
					<div ref='graph' className='graph'>
						<LineChart colorScale={colorScale} size={this.state.size} timeRange={timeRange} timeDrawRange={timeDrawRange} memDrawRange={memDrawRange} groupedSnapshots={groupedSnapshots} />
					</div>
					<aside>
						<table className='apps-table'>
							<tbody>
								{apps}
							</tbody>
							<tfoot>
								<tr>
									<td colSpan='2'>
										<small>Lag: {last ? last.lag : 0} ms</small>
									</td>
								</tr>
							</tfoot>
						</table>
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
				timeDrawRange[0],
				timeDrawRange[1]
			])
			.range([0, size.width]);
		var yScale = d3.scale.linear()
			.domain([Math.max(memDrawRange[0] - 0.1, 0), memDrawRange[1] + 0.1])
			.nice()
			.range([size.height, 0]);
		var colorScale = this.props.colorScale;

		var dataSeries = _.mapValues(groupedSnapshots, function(snapshots, pid) {
			var series = _.map(snapshots, function(snapshot) {
				return {
					x: snapshot.time,
					y: snapshot.mem
				};
			});
			pid = Number(pid);
			var key = 'series' + pid;
			var color = colorScale(pid);
			return (
				<DataSeries key={key} data={series} size={size} xScale={xScale} yScale={yScale} color={color} />
			);
		});

		var xTicks = _.map(xScale.copy().ticks(5), function(tick) {
			var left = xScale(tick);
			var label = d3.time.format('%M:%S')(new Date(tick)); // d3.round(tick / 1000, 1) + 's';
			var key = 'xtick' + String(tick);
			return (
				<g key={key} className='tick'>
					<text x={left + 3} y={size.height - 4}>{label}</text>
					<line x1={left} y1={0} x2={left} y2={size.height} />
				</g>
			);
		});

		var yTicks = _.map(yScale.ticks(10), function(tick) {
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
	return String(d3.round(number, 1)).replace(/^(\d+)$/, '$1.0');
}

document.addEventListener('DOMContentLoaded', function () {
	React.renderComponent(
		<Apps/>,
		document.getElementById('content')
	);
});

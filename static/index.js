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
			deviceInit: false,
			size: {width: 640, height: 480},
			resized: false
		};
	},

	handleAppInitialize: function(data) {
		if (data.snapshots.length) {
			this.initHiddenApps(data.snapshots[data.snapshots.length - 1]);
		}
		this.setState({
			snapshots: data.snapshots,
			device: data.device
		});
	},

	handleAppUpdate: function(snapshot) {
		if (this.state.deviceInit) {
			this.initHiddenApps(snapshot);
		}
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

	initHiddenApps: function(snapshot) {
		var hidden = [];
		_.forEach(snapshot.apps, function(app) {
			if (app.name == 'b2g' || app.name == '(Nuwa)') {
				hidden.push(app.id);
			}
		});
		this.setState({hidden: hidden, deviceInit: false});
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
				cache: 0
			}
		};
		var colorScale = d3.scale.category20();

		/*
		_.sortBy(last.apps, function(app) {
			return this.state.hidden.indexOf(app.id) > -1;
		}, this),
		 */

		var apps = _.map(last.apps, function (app) {
			var key = 'row-' + app.id;
			var style = {
				color: colorScale(app.pid)
			};
			var checked = this.state.hidden.indexOf(app.id) > -1;
			var clsName = checked ? 'hidden' : '';
			var name = (app.name.substr(0, 2) == '(P') ? '(Preallocated)' : app.name;
			return (
				<tr key={key} className={clsName}>
					<th style={style} title={app.pid}>
						<label>
							<input type='checkbox' name={app.id} checked={checked} onChange={this.handleAppCheckbox} />&nbsp;
							<span className='name'>{name}</span>
						</label>
					</th>
					<td>{app.uss} <small>Mb</small></td>
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
							<th>Physical:</th>
							<td>{Math.round(last.mem.total + last.mem.free)} <small>Mb</small></td>
							<th>Used:</th>
							<td>{round(last.mem.total - last.mem.free, 1)} <small>Mb</small></td>
						</tr>
						<tr>
							<th>Virtual:</th>
							<td>{round(last.mem['used-cache'] + last.mem.cache, 1)} <small>Mb</small></td>
							<th>Used:</th>
							<td>{last.mem['used-cache']} <small>Mb</small></td>
						</tr>
					</table>
				</header>
				<article>
					<div ref='graph' className='graph'>
						<LineChart colorScale={colorScale} size={this.state.size} snapshots={snapshots} hidden={this.state.hidden} />
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
	getDefaultProps: function() {
		return {
			timeSpan: 30000
		}
	},

	render: function() {
		var snapshots = this.props.snapshots;
		var size = this.props.size;
		var hidden = this.props.hidden;

		var flattened = _.reduce(snapshots, function(apps, snapshot) {
			return apps.concat(_.reject(_.values(snapshot.apps), function(app) {
				return _.contains(hidden, app.id);
			}));
		}, []);

		var minDataTime = _.min(flattened, 'time').time;
		var maxDataTime = _.max(flattened, 'time').time;
		var minDrawTime = maxDataTime - this.props.timeSpan; // Math.max(, minDataTime);
		var maxDrawTime = maxDataTime;

		var filtered = _.filter(flattened, function(snapshot) {
			return snapshot.time >= minDrawTime && snapshot.time <= maxDrawTime
		});

		var maxDataMem = _.max(filtered, 'uss').uss;
		var minDataMem = _.min(filtered, 'uss').uss;

		var apps = _.groupBy(flattened, 'pid');

		var xScale = d3.scale.linear()
			.domain([
				0,
				maxDrawTime - minDrawTime
			])
			.range([size.width, 0]);
		var yScale = d3.scale.linear()
			.domain([Math.max(minDataMem - 0.1, 0), maxDataMem + 0.1])
			.nice()
			.range([size.height, 0]);
		var colorScale = this.props.colorScale;

		var appIndex = 0;
		var dataSeries = _.mapValues(apps, function(snapshots, pid) {
			var series = _.map(snapshots, function(snapshot) {
				return {
					x: maxDataTime - snapshot.time,
					y: snapshot.uss
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
			var label = d3.format('.0f')(tick / 1000) + 's';
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
					<text x='2' y={top + 11}>{d3.format('.0f')(tick)}</text>
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
	return d3.format('.0f');
}

document.addEventListener('DOMContentLoaded', function () {
	React.renderComponent(
		<Apps/>,
		document.getElementById('content')
	);
});

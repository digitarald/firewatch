/** @jsx React.DOM */

var _ = require('lodash');
var d3 = require('d3');
var React = require('react');

var Apps = React.createClass({
	getInitialState: function() {
		return {
			device: null,
			snapshots: [],
			hidden: []
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
		this.setState({device: device});
	},

	handleAppDisconnected: function() {
		this.setState({device: null});
	},

	componentDidMount: function(root) {
		var socket = io.connect(location.origin);
		socket.on('initialize', this.handleAppInitialize);
		socket.on('snapshot', this.handleAppUpdate);
		socket.on('connected', this.handleAppConnected);
		socket.on('disconnected', this.handleAppDisconnected);
	},

	handleAppCheckbox: function(evt) {
		var pid = Number(evt.target.name);
		var hidden = this.state.hidden.slice();
		if (evt.target.checked) {
			hidden.push(pid);
		} else {
			_.pull(hidden, pid);
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

		var apps = _.mapValues(last.apps, function (app) {
			var key = 'row-' + app.pid;
			var style = {
				color: colorScale(app.pid)
			};
			var checked = this.state.hidden.indexOf(app.pid) > -1;
			return (
				<tr key={key}>
					<th style={style} title={app.pid}>
						{app.name}
						&nbsp;<input type='checkbox' name={app.pid} checked={checked} onChange={this.handleAppCheckbox} />
					</th>
					<td>{app.uss} <small>Mb</small></td>
				</tr>
			);
		}, this);

		return (
			<div>
				<h1>
					{this.state.device || '(no device connected)'}
					<div>
						<small>{last.mem.free} + {last.mem.cache} = </small>
						<strong>{Math.round(last.mem.free + last.mem.cache)}</strong> Mb
					</div>
				</h1>
				<LineChart colorScale={colorScale} snapshots={snapshots} hidden={this.state.hidden} />
				<table>
					<tbody>
						{apps}
					</tbody>
					<tfoot>
						<tr>
							<td colSpan='2'>
								<small>{last ? last.lag : 0} ms</small>
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
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
			width: 960,
			height: 367
		}
	},

	render: function() {
		var snapshots = this.props.snapshots;
		var size = {
			width: this.props.width,
			height: this.props.height
		};
		var hidden = this.props.hidden;

		var flattened = _.reduce(snapshots, function(apps, snapshot) {
			return apps.concat(_.reject(_.values(snapshot.apps), function(app) {
				return _.contains(hidden, app.pid);
			}));
		}, []);
		var maxDataMem = _.max(flattened, 'uss').uss;
		var minDataMem = _.min(flattened, 'uss').uss;
		var minDataTime = _.min(flattened, 'time').time;
		var maxDataTime = _.max(flattened, 'time').time;

		var apps = _.groupBy(flattened, 'pid');

		var xScale = d3.scale.linear()
			.domain([Math.min(minDataTime, maxDataTime - 10000), maxDataTime])
			.range([0, size.width]);
		var yScale = d3.scale.linear()
			.domain([Math.max(minDataMem, 0) - 0.1, maxDataMem + 0.1])
			.nice()
			.range([size.height, 0]);
		var colorScale = this.props.colorScale;

		var appIndex = 0;
		var dataSeries = _.mapValues(apps, function(snapshots, pid) {
			var series = _.map(snapshots, function(snapshot) {
				return {
					x: snapshot.time,
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

		/*
		var xTicks = _.map(xScale.ticks(10), function(tick) {
			var left = yScale(tick);
			var label = (maxDataTime - tick) / 1000;
			var key = 'xtick' + tick;
			return (
				<g key={key} className='tick'>
					<text x={left} y={size.height - 15}>{tick}</text>
				</g>
			);
		});
		*/

		var yTicks = _.map(yScale.ticks(10), function(tick) {
			var top = yScale(tick);
			var key = 'ytick' + tick;
			return (
				<g key={key} className='tick'>
					<line x1='0' y1={top} x2={size.width} y2={top} stroke='#eee' strokeWidth='1' fill='none' />
					<text x='2' y={top + 11}>{tick}</text>
				</g>
			);
		});

		return (
			<Chart width={this.props.width} height={this.props.height}>
				<g className="ticks yticks">{yTicks}</g>
				{dataSeries}
			</Chart>
		);
	}
});


document.addEventListener('DOMContentLoaded', function () {
	React.renderComponent(
		<Apps/>,
		document.getElementById('content')
	);
});

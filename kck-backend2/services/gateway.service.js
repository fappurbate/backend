'use strict';

const ApiGateway = require('moleculer-web');
const SocketIOService = require('@kothique/moleculer-io');
const { MoleculerError } = require('moleculer').Errors;

module.exports = {
	name: 'gateway',
	mixins: [ApiGateway, SocketIOService],
	settings: {
		port: process.env.PORT || 3000,

		routes: [{
			path: '/api',
			mappingPolicy: 'restrict',
			aliases: {
				'GET broadcasters':                          'broadcasters.list',
				'GET broadcaster/:broadcaster/tippers':      'tippers.forBroadcaster',
				'GET broadcaster/:broadcaster/translations': 'translationRequests.forBroadcaster'
			},
			whitelist: [/.*/]
		}],

		io: {
			namespaces: {
				'/ext': {
					events: {
						'request': {
							mappingPolicy: 'restrict',
							aliases: {
								'tipper': 'tippers.oneForBroadcaster',
								'is-broadcasting': 'broadcasters.isBroadcasting'
							},
							onBeforeCall: function (ctx, socket, action, params, callOptions) {
								ctx.meta.socket = socket;
							}
						},
						'event': {
							mappingPolicy: 'restrict',
							aliases: {
								'request-translation': 'translationRequests.request',
								'request-cancel-translation': 'translationRequests.cancel',
								'message': 'messages.handle',
								'account-activity': 'accountActivity.handle',
								'broadcast-start': 'broadcasters.onBroadcastStart',
								'broadcast-stop': 'broadcasters.onBroadcastStop'
							},
							onBeforeCall: function (ctx, socket, action, params, callOptions) {
								ctx.meta.socket = socket;
							}
						}
					}
				},
				'/app': {
					events: {
						'request': {
							mappingPolicy: 'restrict',
							aliases: {
								'tipper': 'tippers.oneForBroadcaster',
								'is-broadcasting': 'broadcasters.isBroadcasting'
							},
							onBeforeCall: async function (ctx, socket, action, params, callOptions) {
								ctx.meta.socket = socket;
							}
						},
						'event': {
							mappingPolicy: 'restrict',
							aliases: {
								'translation': 'translationRequests.resolve'
							},
							onBeforeCall: async function (ctx, socket, action, params, callOptions) {
								ctx.meta.socket = socket;
							}
						}
					}
				}
			}
		}
	},
	actions: {
		'ext.broadcast': {
			params: {
				subject: 'string',
				data: 'any'
			},
			visibility: 'public',
			handler(ctx) {
				const { subject, data } = ctx.params;
				this.io.of('ext').emit(subject, data);
			}
		},
		'ext.emit': {
			params: {
				socketId: 'string',
				subject: 'string',
				data: 'any'
			},
			visibility: 'public',
			handler(ctx) {
				const { socketId,subject, data } = ctx.params;

				const socket = this.ext.clients[socketId];
				if (!socketId) {
					throw new MoleculerError('Socket not found', 404, 'ERR_SOCKET_NOT_FOUND', { socketId });
				}

				socket.emit(subject, data);
			}
		},
		'app.broadcast': {
			params: {
				subject: 'string',
				data: 'any'
			},
			visibility: 'public',
			handler(ctx) {
				const { subject, data } = ctx.params;
				this.io.of('app').emit(subject, data);
			}
		},
		'app.emit': {
			params: {
				socketId: 'string',
				subject: 'string',
				data: 'any'
			},
			visibility: 'public',
			handler(ctx) {
				const { socketId, subject, data } = ctx.params;

				const socket = this.app.clients[socketId];
				if (!socketId) {
					throw new MoleculerError('Socket not found', 404, 'ERR_SOCKET_NOT_FOUND', { socketId });
				}

				socket.emit(subject, data);
			}
		}
	},
	created() {
		this.ext = {
			clients: {},
			connectionListener: null
		};
		this.app = {
			clients: {},
			connectionListener: null
		};
	},
	async started() {
		['ext', 'app'].forEach(ns =>
			this.io.of(ns).on('connect', this[ns].connectionListener = socket => {
				this[ns].clients[socket.id] = socket;

				this.emit('$connect', { socket });

				socket.on('disconnect', () => {
					this.emit('$disconnect', { socket });
					delete this[ns].clients[socket.id];
				});
		}));
	},
	async stopped() {
		['ext', 'app'].forEach(ns =>
			this.io.of(ns).off('connection', this[ns].connectionListener));
	}
};

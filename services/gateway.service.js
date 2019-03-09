'use strict';

const ApiGateway = require('moleculer-web');
const SocketIOService = require('@kothique/moleculer-io');
const { MoleculerError } = require('moleculer').Errors;
const asyncBusboy = require('async-busboy');
const { Range, ContentRange } = require('http-range');

module.exports = {
	name: 'gateway',
	mixins: [ApiGateway, SocketIOService],
	settings: {
		port: process.env.PORT || 3000,

		use: [
			async (req, res, next) => {
				try {
					const { files, fields } = await asyncBusboy(req);
					Object.assign(req.body, fields);
					files.forEach(file => req.body[file.fieldname] = file);
				} catch (error) {
					// ignore
				} finally {
					next();
				}
			}
		],

		routes: [{
			path: '/api',
			mappingPolicy: 'restrict',
			aliases: {
				'GET    broadcasters':                                               'broadcasters.list',
				'GET    broadcaster/:broadcaster/tippers':                           'tippers.forBroadcaster',
				'GET    broadcaster/:broadcaster/translations':                      'translationRequests.forBroadcaster',
				'GET    broadcaster/:broadcaster/extensions':                        'extensions.forBroadcaster',
				'GET    broadcaster/:broadcaster/extension/:extensionId':            'extensions.oneForBroadcaster',
				'POST   extensions':                                                 'extensions.install',
				'DELETE extension/:extensionId':                                     'extensions.uninstall',
				'POST   broadcaster/:broadcaster/extension/:extensionId/start':      'extensions.start',
				'POST   broadcaster/:broadcaster/extension/:extensionId/stop':       'extensions.stop',
				'GET    broadcaster/:broadcaster/extension/:extensionId/logs':       'extensions.getLogs',
				'GET    broadcaster/:broadcaster/extension/:extensionId/page/:page': 'extensions.getPage',
				'GET    broadcaster/:broadcaster/extensions/stream':                 'extensions.getStreamInfo',
				'GET    broadcaster/:broadcaster/extension/:extensionId/stream':     'extensions.getStream',
				'POST   gallery':                                                    'gallery.addFile',
				'DELETE gallery/:fileId':                                            'gallery.removeFile',
				'GET    gallery/images':                                             'gallery.getImages',
				'GET    gallery/audio':                                              'gallery.getAudio',
				'GET    gallery/:fileId':                                            'gallery.getFile',
				'GET    gallery/:fileId/metadata':                                   'gallery.getMetadata',
				'GET    gallery/:fileId/thumbnail':                                  'gallery.getThumbnail',
				'GET    gallery/:fileId/preview':                                    'gallery.getPreview'
			},
			whitelist: [/.*/],
			onBeforeCall(ctx, route, req, res) {
				if (req.headers.range) {
					const range = Range.prototype.parse(req.headers.range);
					if (range.unit !== 'bytes') {
						throw new MoleculerClientError('Unit for \'range\' header must be \'bytes\'.');
					}

					ctx.meta.range = {
						start: range.ranges[0].low,
						end: range.ranges[0].high
					};
				}
			},
			onAfterCall(ctx, route, req, res, data) {
				if (ctx.meta.range) {
					res.status = 206;
					res.setHeader('Accept-Ranges', 'bytes');
					if (ctx.meta.contentLength) {
						res.setHeader('Content-Length', ctx.meta.contentLength);
					}

					const range = !ctx.meta.range.start && !ctx.meta.range.end
						? '*'
						: `${ctx.meta.range.start || ''}-${ctx.meta.range.end || ''}`;
					res.setHeader('Content-Range', `bytes ${range}/${ctx.meta.contentLength || '*'}`);
				}

				if (ctx.meta.contentType) {
					res.setHeader('Content-Type', ctx.meta.contentType);
				}

				if (Buffer.isBuffer(data)) {
					res.end(data);
				} else {
					res.end(JSON.stringify(data));
				}
			}
		}],

		io: {
			namespaces: {
				'/ext': {
					events: {
						'event': {
							mappingPolicy: 'restrict',
							aliases: {
								'request-translation':        'translationRequests.request',
								'request-cancel-translation': 'translationRequests.cancel',
								'account-activity':           'accountActivity.handle',
								'broadcast-start':            'broadcasters.onBroadcastStart',
								'broadcast-stop':             'broadcasters.onBroadcastStop'
							},
							onBeforeCall: function (ctx, socket, action, params, callOptions) {
								ctx.meta.socket = socket;
							}
						},
						'request': {
							mappingPolicy: 'restrict',
							aliases: {
								'tipper':                         'tippers.oneForBroadcaster',
								'is-broadcasting':                'broadcasters.isBroadcasting',
								'is-extracting-account-activity': 'broadcasters.isExtractingAccountActivity',
								'message':                        'extensions.handleMessage'
							},
							onBeforeCall: function (ctx, socket, action, params, callOptions) {
								ctx.meta.socket = socket;
							}
						}
					}
				},
				'/app': {
					events: {
						'event': {
							mappingPolicy: 'restrict',
							aliases: {
								'translation':     'translationRequests.resolve',
								'extension-event': 'extensions.onEvent'
							},
							onBeforeCall: async function (ctx, socket, action, params, callOptions) {
								ctx.meta.socket = socket;
							}
						},
						'request': {
							mappingPolicy: 'restrict',
							aliases: {
								'tipper':                         'tippers.oneForBroadcaster',
								'is-broadcasting':                'broadcasters.isBroadcasting',
								'is-extracting-account-activity': 'broadcasters.isExtractingAccountActivity',
								'extension-request':              'extensions.onRequest'
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
				this.io.of('ext').emit('event', subject, data);
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

				socket.emit('event', subject, data);
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
				this.io.of('app').emit('event', subject, data);
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

				socket.emit('event', subject, data);
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

				this.broker.emit(`socket.${ns}.connect`, { socket });

				socket.on('disconnect', () => {
					this.broker.emit(`socket.${ns}.disconnect`, { socket });
					delete this[ns].clients[socket.id];
				});
		}));
	},
	async stopped() {
		['ext', 'app'].forEach(ns =>
			this.io.of(ns).off('connection', this[ns].connectionListener));
	}
};

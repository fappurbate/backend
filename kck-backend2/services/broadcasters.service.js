'use strict';

const DbService = require('moleculer-db');

module.exports = {
	name: 'broadcasters',
  mixins: [DbService],
	settings: {
    fields: ['_id', 'username'],
    pageSize: 50,
    maxPageSize: 200,
    maxLimit: -1
	},
	created() {
		this.online = {};
	},
	events: {
		'gateway.$connect'({ socket }) {
			this.online[socket.id] = {};
		},
		'gateway.$disconnect'({ socket }) {
			Object.keys(this.online[socket.id]).forEach(broadcaster => {
				this.broker.call('gateway.app.broadcast', {
					subject: 'broadcast-stop',
					data: { broadcaster }
				});
				this.emit('broadcast.stop', { broadcaster });
			});
			delete this.online[socket.id];
		}
	},
	actions: {
		onBroadcastStart: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				ctx.call('gateway.app.broadcast', {
					subject: 'broadcast-start',
					data: { broadcaster }
				});
				ctx.emit('broadcast.start', { broadcaster });

				const socketId = ctx.meta.socket.id;
				if (broadcaster in this.online[socketId]) {
					this.online[socketId][broadcaster]++;
				} else {
					this.online[socketId][broadcaster] = 1;
				}
			}
		},
		onBroadcastStop: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				ctx.call('gateway.app.broadcast', {
					subject: 'broadcast-stop',
					data: { broadcaster }
				});
				ctx.emit('broadcast.stop', { broadcaster });

				const socketId = ctx.meta.socket.id;
				if (!this.online[socketId][broadcaster]) { return; }

				if (--this.online[socketId][broadcaster] === 0) {
					delete this.online[socketId][broadcaster];
				}
			}
		},
		isBroadcasting: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				let count = 0;

				Object.values(this.online).forEach(obj =>
					Object.entries(obj).forEach(([b, c]) => {
						if (b === broadcaster) {
							count += c;
						}
					}));

				return count;
			}
		},
		sendMessage: {
			params: {
				broadcaster: 'string',
				message: 'string'
			},
			visibility: 'public',
			async handler(ctx) {
				const { broadcaster, message } = ctx.params;

				Object.entries(this.online).forEach(([socketId, broadcasters]) => {
					if (broadcaster in broadcasters) {
						ctx.call('gateway.ext.broadcast', {
							subject: 'send-message',
							data: {
								broadcaster,
								message
							}
						});
					}
				});
			}
		}
	}
};

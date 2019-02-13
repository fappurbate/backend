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
		this.extracting = {};
	},
	events: {
		'socket.ext.connect'({ socket }) {
			this.online[socket.id] = {};
			this.extracting[socket.id] = {};
		},
		async 'socket.ext.disconnect'({ socket }) {
			await Promise.all(Object.keys(this.online[socket.id]).map(async broadcaster => {
				await this.broker.call('gateway.app.broadcast', {
					subject: 'broadcast-stop',
					data: { broadcaster }
				});
				await this.broker.emit('broadcast.stop', { broadcaster });
			}));
			delete this.online[socket.id];

			await Promise.all(Object.keys(this.extracting[socket.id]).map(async username => {
				await this.broker.call('gateway.app.broadcast', {
					subject: 'extract-account-activity-stop',
					data: { username }
				});
				await this.broker.emit('extract-account-activity.stop', { username });
			}));
			delete this.extracting[socket.id];
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

				await ctx.call('gateway.app.broadcast', {
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

				await ctx.call('gateway.app.broadcast', {
					subject: 'broadcast-stop',
					data: { broadcaster }
				});
				ctx.emit('broadcast.stop', { broadcaster });

				const socketId = ctx.meta.socket.id;
				if (!this.online[socketId][broadcaster]) { return; }

				if (--this.online[socketId][broadcaster] === 0) {
					delete this.online[socketId][broadcaster];
				}
			},
		},
		onExtractAccountActivityStart: {
			params: {
				username: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { username } = ctx.params;

				await ctx.call('gateway.app.broadcast', {
					subject: 'extract-account-activity-start',
					data: { username }
				});
				ctx.emit('extract-account-activity.start', { username });

				const socketId = ctx.meta.socket.id;
				if (username in this.extracting[socketId]) {
					this.extracting[socketId][username]++;
				} else {
					this.extracting[socketId][username] = 1;
				}
			}
		},
		onExtractAccountActivityStop: {
			params: {
				username: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { username } = ctx.params;

				await ctx.call('gateway.app.broadcast', {
					subject: 'extract-account-activity-stop',
					data: { username }
				});
				ctx.emit('extract-account-activity.stop', { username });

				const socketId = ctx.meta.socket.id;
				if (!this.extracting[socketId][username]) { return; }

				if (--this.extracting[socketId][username] === 0) {
					delete this.extracting[socketId][username];
				}
			},
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
		isExtractingAccountActivity: {
			params: {
				username: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { username } = ctx.params;

				let count = 0;

				Object.values(this.extracting).forEach(obj =>
					Object.entries(obj).forEach(([u, c]) => {
						if (u === username) {
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

				await Promise.all(Object.entries(this.online).map(([socketId, broadcasters]) =>
					(broadcaster in broadcasters) && ctx.call('gateway.ext.broadcast', {
						subject: 'send-message',
						data: {
							broadcaster,
							message
						}
					})
				));
			}
		},
		ensureExists: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'public',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				await this.adapter.db.update(
					{ username: broadcaster },
					{ $set: { username: broadcaster } },
					{ upsert: true }
				);
			}
		}
	}
};
'use strict';

const { MoleculerClientError } = require('moleculer').Errors;
const RService = require('@kothique/moleculer-rethinkdbdash');

module.exports = {
	name: 'broadcasters',
  mixins: [RService],
	rOptions: {
		db: 'fappurbate'
	},
	rInitial: {
		fappurbate: {
			broadcasters: {
				$default: true,
				$options: { primaryKey: 'username' }
			}
		}
	},
	async rOnReady() {
		const cursor = await this.rTable.changes({
			includeTypes: true
		});
		cursor.each(async (error, change) => {
			if (error) {
				this.logger.warn(`Error while listening to changes in the 'broadcasters' table`, { error });
				return;
			}

			if (change.type === 'add') {
				const data = { username: change.new_val.username };
				await this.broker.call('gateway.app.broadcast', { subject: 'broadcasters-add', data });
				this.broker.emit('broadcasters.add', data);
			} else if (change.type === 'remove') {
				const data = { username: change.old_val.username };
				await this.broker.call('gateway.app.broadcast', { subject: 'broadcasters-remove', data });
				this.broker.emit('broadcasters.remove', data);
			}
		});
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
				const socketId = ctx.meta.socket.id;

				await ctx.call('broadcasters.ensureExists', { broadcaster });

				await ctx.call('gateway.app.broadcast', {
					subject: 'broadcast-start',
					data: { broadcaster }
				});
				ctx.emit('broadcast.start', { broadcaster, socketId });

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
				const socketId = ctx.meta.socket.id;

				await ctx.call('gateway.app.broadcast', {
					subject: 'broadcast-stop',
					data: { broadcaster }
				});
				ctx.emit('broadcast.stop', { broadcaster, socketId });

				if (this.online[socketId][broadcaster] &&
						--this.online[socketId][broadcaster] === 0) {
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
				const socketId = ctx.meta.socket.id;

				await ctx.call('gateway.app.broadcast', {
					subject: 'extract-account-activity-start',
					data: { username }
				});
				ctx.emit('extract-account-activity.start', { username, socketId });

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
				const socketId = ctx.meta.socket.id;

				await ctx.call('gateway.app.broadcast', {
					subject: 'extract-account-activity-stop',
					data: { username }
				});
				ctx.emit('extract-account-activity.stop', { username, socketId });

				if (this.extracting[socketId][username] &&
						--this.extracting[socketId][username] === 0) {
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
		getAll: {
			visibility: 'published',
			async handler(ctx) {
				return await this.rTable.orderBy(this.r.asc('username'));
			}
		},
		add: {
			params: {
				username: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { username } = ctx.params;

				if (await this.rTable.get(username)) {
					throw new MoleculerClientError('Broadcaster already exists.', 422, 'ERR_ALREADY_EXISTS');
				}

				await this.rTable.insert({ username });
			}
		},
		remove: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				const { deleted } = await this.rTable.get(broadcaster).delete();
				if (deleted === 0) {
					throw new MoleculerClientError('Broadcaster does not exist.', 404, 'ERR_NOT_FOUND');
				}
			}
		},
		ensureExists: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'public',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				await this.rTable.get(broadcaster).replace({
					username: broadcaster
				});
			}
		}
	}
};

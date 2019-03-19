'use strict';

const RService = require('@kothique/moleculer-rethinkdbdash');

module.exports = {
	name: 'translationRequests',
  mixins: [RService],
	rOptions: {
		db: 'fappurbate'
	},
	rInitial: r => ({
		fappurbate: {
			translation_requests: {
				$default: true,
				tabid_msgid: { $function: [r.row('tabId'), r.row('msgId')] },
				createdAt: true
			}
		}
	}),
	async rOnReady() {
		this.lastId = await this.getLastId();

		const cursor = await this.rTable.changes({ includeTypes: true });
		cursor.each(async (error, change) => {
			if (error) {
				this.logger.warn(`Error while listening to changes in the 'translation_requests' table.`, { error });
				return;
			}

			if (change.type === 'add' && this.lastId === null) {
				this.lastId = change.new_val.createdAt;
			} else if (change.type === 'remove') {
				if (this.lastId && change.old_val.createdAt.valueOf() === this.lastId.valueOf()) {
					this.lastId = await this.getLastId();
				}
			}
		});
	},
	methods: {
		getLastId() {
			return this.rTable
				.orderBy({ index: this.r.asc('createdAt') })
				.limit(1).getField('createdAt').nth(0).default(null);
		}
	},
  actions: {
    forBroadcaster: {
      params: {
        broadcaster: 'string',
				lastId: { type: 'string', optional: true },
				limit: { type: 'number', optional: true, integer: true, convert: true }
      },
      visibility: 'published',
      async handler(ctx) {
				const { broadcaster } = ctx.params;
				const lastId = ctx.params.lastId && new Date(ctx.params.lastId);
				const limit = typeof ctx.params.limit !== 'undefined' ? Number(ctx.params.limit) : undefined;

				let query = this.rTable
					.between(this.r.minval, lastId || this.r.maxval, {
						index: 'createdAt',
						rightBound: 'open'
					})
					.orderBy(this.r.desc('createdAt'))
					.filter(this.r.row('broadcaster').eq(broadcaster));

				if (typeof limit !== 'undefined') {
					query = query.limit(limit);
				}

				const items = await query;
				if (items.length === 0 || items[items.length - 1].createdAt.valueOf() === this.lastId.valueOf()) {
					return { items, all: true };
				} else {
					return { items, all: false };
				}
      }
    },
		request: {
			params: {
				broadcaster: 'string',
				tabId: 'number',
				msgId: 'number',
				content: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { broadcaster, tabId, msgId, content } = ctx.params;

				const createdAt = new Date;

				await this.rTable.insert({
					broadcaster,
					tabId,
					msgId,
					content,
					createdAt
				});

				await ctx.call('gateway.app.broadcast', {
					subject: 'request-translation',
					data: { broadcaster, tabId, msgId, content, createdAt }
				});
			}
		},
		cancel: {
			params: {
				tabId: 'number',
				msgId: 'number'
			},
			visibility: 'published',
			async handler(ctx) {
				const { tabId, msgId } = ctx.params;

				await this.rTable.getAll([tabId, msgId], { index: 'tabid_msgid' }).delete();

				await ctx.call('gateway.app.broadcast', {
					subject: 'request-cancel-translation',
					data: { tabId, msgId }
				});
			}
		},
		resolve: {
			params: {
				tabId: 'number',
				msgId: 'number',
				content: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { tabId, msgId, content } = ctx.params;

				await this.rTable.getAll([tabId, msgId], { index: 'tabid_msgid' }).delete();

				await ctx.call('gateway.ext.broadcast', {
					subject: 'translation',
					data: { tabId, msgId, content }
				});
			}
		}
  }
};

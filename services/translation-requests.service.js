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
				tabid_msgid: {
					$function: [r.row('tabId'), r.row('msgId')]
				}
			}
		}
	}),
  actions: {
    forBroadcaster: {
      params: {
        broadcaster: 'string',
				lastId: { type: 'string', optional: true },
				limit: { type: 'number', optional: true, integer: true, convert: true }
      },
      visibility: 'published',
      async handler(ctx) {
				const { broadcaster, lastId } = ctx.params;
				const limit = typeof ctx.params.limit !== 'undefined' ? Number(ctx.params.limit) : undefined;

				let query = this.rTable
					.between(this.r.minval, lastId || this.r.maxval)
					.orderBy(this.r.desc('id'))
					.filter(this.r.row('broadcaster').eq(broadcaster));

				if (typeof limit !== 'undefined') {
					query = query.limit(limit);
				}

				return await query;
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

				this.logger.debug(`translaton request from ${broadcaster}: ${content}`);

				await ctx.call('gateway.app.broadcast', {
					subject: 'request-translation',
					data: { broadcaster, tabId, msgId, content }
				});

				await this.rTable.insert({
					broadcaster,
					tabId,
					msgId,
					content,
					createdAt: new Date
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

				this.logger.debug(`cancel translation request`);

				await ctx.call('gateway.app.broadcast', {
					subject: 'request-cancel-translation',
					data: { tabId, msgId }
				});

				await this.rTable.getAll([tabId, msgId], { index: 'tabid_msgid' }).delete();
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

				this.logger.debug(`translation request resolved: ${content}`);

				await ctx.call('gateway.ext.broadcast', {
					subject: 'translation',
					data: { tabId, msgId, content }
				});

				await this.rTable.getAll([tabId, msgId], { index: 'tabid_msgid' }).delete();
			}
		}
  }
};

'use strict';

const DbService = require('moleculer-db');

module.exports = {
	name: 'translationRequests',
  mixins: [DbService],
	settings: {
    fields: ['_id', 'broadcaster', 'tabId', 'msgId', 'content', 'createdAt'],
    pageSize: 50,
    maxPageSize: 200,
    maxLimit: -1
	},
  actions: {
    forBroadcaster: {
      params: {
        broadcaster: 'string'
      },
      visibility: 'published',
      async handler(ctx) {
        const { broadcaster } = ctx.params;

        return ctx.call('translationRequests.list', {
          ...ctx.params,
          query: { broadcaster }
        });
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

				ctx.call('gateway.app.broadcast', {
					subject: 'request-translation',
					data: { broadcaster, tabId, msgId, content }
				});

				await this.adapter.db.insert({
					broadcaster,
					tabId,
					msgId,
					content,
					createdAt: new Date()
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

				ctx.call('gateway.app.broadcast', {
					subject: 'request-cancel-translation',
					data: { tabId, msgId }
				});

				await this.adapter.db.remove({ tabId, msgId }, { multi: true });
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

				ctx.call('gateway.ext.broadcast', {
					subject: 'translation',
					data: { tabId, msgId, content }
				});

				await this.adapter.db.remove({ tabId, msgId }, { multi: true });
			}
		}
  }
};

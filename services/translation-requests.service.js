'use strict';

const DbService = require('moleculer-db');
const MongoDBAdapter = require('moleculer-db-adapter-mongo');

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/fappurbate';

module.exports = {
	name: 'translationRequests',
  mixins: [DbService],
	adapter: new MongoDBAdapter(mongoUrl, { useNewUrlParser: true }),
	collection: 'translationRequests',
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

				await ctx.call('gateway.app.broadcast', {
					subject: 'request-translation',
					data: { broadcaster, tabId, msgId, content }
				});

				await this.adapter.collection.insertOne({
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

				await ctx.call('gateway.app.broadcast', {
					subject: 'request-cancel-translation',
					data: { tabId, msgId }
				});

				await this.adapter.collection.deleteMany({ tabId, msgId });
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

				await this.adapter.collection.deleteMany({ tabId, msgId });
			}
		}
  }
};

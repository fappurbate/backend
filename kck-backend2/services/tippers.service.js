'use strict';

const DbService = require('moleculer-db');

module.exports = {
	name: 'tippers',
  mixins: [DbService],
	settings: {
    fields: ['_id', 'username', 'tipInfo'],
    pageSize: 50,
    maxPageSize: 200,
    maxLimit: -1
	},
  actions: {
    addTip: {
      params: {
        username: 'string',
        broadcaster: 'string',
        amount: 'number'
      },
      visibility: 'public',
      async handler(ctx) {
        const { username, broadcaster, amount } = ctx.params;

				this.logger.debug(`${username} tipped ${amount}tkn to ${broadcaster}`);

				await ctx.call('broadcasters.ensureExists', { broadcaster });

        await this.adapter.db.update({ username }, {
          $inc: { [`tipInfo.${broadcaster}`]: amount }
        }, { upsert: true });
      }
    },
    forBroadcaster: {
      params: {
        broadcaster: 'string'
      },
      visibility: 'published',
      async handler(ctx) {
        const { broadcaster } = ctx.params;

        const result = await ctx.call('tippers.list', {
					...ctx.params,
					query: {
	          [`tipInfo.${broadcaster}`]: { $exists: true }
					}
        });
console.log(result);
        result.rows.forEach(tipper => {
          tipper.amount = tipper.tipInfo[broadcaster];
          delete tipper.tipInfo;
        });

        return result;
      }
    },
		oneForBroadcaster: {
			params: {
				username: 'string',
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { username, broadcaster } = ctx.params;

				const tipper = await this.adapter.findOne({ username });
				if (tipper) {
					tipper.amount = tipper.tipInfo[broadcaster] || 0;
					delete tipper.tipInfo;

					return tipper;
				} else {
					return {
						username,
						amount: 0
					};
				}
			}
		}
  }
};

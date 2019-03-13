'use strict';

const RService = require('@kothique/moleculer-rethinkdbdash');

module.exports = {
	name: 'tippers',
  mixins: [RService],
	rOptions: {
		db: 'fappurbate'
	},
	rInitial: {
		fappurbate: {
			tippers: {
				$default: true,
				$options: {
					primaryKey: 'username'
				}
			}
		}
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

				await this.rTable.insert({
					username,
					tipInfo: {
						[broadcaster]: amount
					}
				}, {
					conflict: (username, oldDoc, newDoc) => {
						const tipInfo = oldDoc('tipInfo');
						return oldDoc.merge({
							tipInfo: tipInfo.merge({
								[broadcaster]: this.r.branch(tipInfo.hasFields(broadcaster), tipInfo(broadcaster), 0).add(amount)
							})
						});
					}
				});
      }
    },
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
					.between(lastId || this.r.minval, this.r.maxval, { leftBound: 'open' })
					.orderBy(this.r.asc('username'))
					.filter(this.r.row('tipInfo').hasFields(broadcaster));

				if (typeof limit !== 'undefined') {
					query = query.limit(limit);
				}

				query = query.map(tipper =>
					tipper.merge({
						amount: tipper('tipInfo')(broadcaster)
					}).without('tipInfo')
				);

				return await query;
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

				return await this.rTable.get(username).do(tipper => {
					if (tipper && tipper('tipInfo')(broadcaster)) {
						return {
							username,
							amount: tipper('tipInfo')(broadcaster)
						};
					}

					return { username, amount: 0 };
				});
			}
		}
  }
};

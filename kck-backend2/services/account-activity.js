'use strict';

module.exports = {
  name: 'accountActivity',
  actions: {
    handle: {
      params: {
        username: 'string',
        type: 'string',
        timestamp: 'string',
        data: 'object'
      },
      async handler(ctx) {
        const { username, type, timestamp, data } = ctx.params;

        await ctx.call('gateway.app.broadcast', {
          subject: 'account-activity',
          data: ctx.params
        });

        ctx.emit('chaturbate.accountActivity', { username, type, timestamp, data });
      }
    }
  }
};

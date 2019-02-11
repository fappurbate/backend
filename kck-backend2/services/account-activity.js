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
        const { info, type, timestamp, data } = ctx.params;

        ctx.call('gateway.app.broadcast', {
          subject: 'account-activity',
          data: ctx.params
        });
      }
    }
  }
};

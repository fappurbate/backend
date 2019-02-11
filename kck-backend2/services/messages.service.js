'use strict';

module.exports = {
  name: 'messages',
  actions: {
    handle: {
      params: {
        info: 'object',
        type: 'string',
        timestamp: 'string',
        data: 'object'
      },
      async handler(ctx) {
        const { info, type, timestamp, data } = ctx.params;

        ctx.call('gateway.app.broadcast', {
          subject: 'message',
          data: ctx.params
        });

        const isBroadcasting = await ctx.call('broadcasters.isBroadcasting', {
          broadcaster: info.chat.owner
        });
        if (!isBroadcasting) { return; }

        if (type === 'tip') {
          const { username, amount } = data;

          ctx.call('tippers.addTip', {
            username,
            broadcaster: info.chat.owner,
            amount
          });
        }
      }
    }
  }
};

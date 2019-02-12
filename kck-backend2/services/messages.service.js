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

        await ctx.call('gateway.app.broadcast', {
          subject: 'message',
          data: ctx.params
        });

        ctx.emit('broadcast.message', { info, type, timestamp, data });

        const isBroadcasting = await ctx.call('broadcasters.isBroadcasting', {
          broadcaster: info.chat.owner
        });

        if (type === 'tip' && isBroadcasting) {
          const { username, amount } = data;

          await ctx.call('tippers.addTip', {
            username,
            broadcaster: info.chat.owner,
            amount
          });
        }
      }
    }
  }
};
